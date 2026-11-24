# Vendor Profile (front + back end) — A-to-Z Audit — 2026-11-24

> Page: **Vendor Portal → Profile tab**, route `/vendor` (profile tab), role: Vendor (RBAC).
> Branch: `audit/vendor-profile-2026-11-24` (from main @ ec54601).
> All claims `[TRACED]` (full code-path read) unless marked. Dynamic/browser/responsive tests BLOCKED in this session (no shell/browser) — owner commands in §7.
> Scope: profile read model, profile-change request flow, payout-account change flow, 15-question onboarding flow, KYC document upload/list/download, admin approval chain.

## 1. Page inventory (all `[TRACED]`)

**Frontend** (`vendor-client.tsx`, `vendor-tabs.tsx` → `ProfileTab`, `kyc-panel.tsx`):
- Profile summary card: businessNameBn/En, ownerNameBn, contactPhone, status badge, commission bp, escrow hold days, joinedAt, payoutMethod + **payoutAccountMasked** (masked only)
- Profile edit form (only when `canEditProfile`/`canEditPayoutProfile` capability enabled): businessNameBn/En, ownerNameBn, contactPhone, payoutMethodBn, payoutAccountNo → POST `/api/vendor/profile`
- Onboarding 15-question answers form (when `canSubmitOnboardingAnswers`): POST `/api/vendor/onboarding`
- Self-service request history list with status badges (pending/approved/rejected) + review notes
- KYC panel: category select, image file input (JPG/PNG/WebP ≤5MB), upload → POST `/api/vendor/kyc` (multipart), list, secure download link
- Account security section (login/2FA management — out of this tab's scope, previously audited chain)

**Backend routes:**

| Route | Method | Purpose |
|---|---|---|
| `/api/vendor/workspace` | GET | Full workspace DTO incl. profile, capabilities, rules, requests |
| `/api/vendor/profile` | POST | File a profile/payout change request (never self-applied) |
| `/api/vendor/onboarding` | POST | File onboarding answers request |
| `/api/vendor/kyc` | GET/POST | List own KYC docs / upload / download own doc by documentId |
| `/api/admin/vendors` | GET/POST | Super-admin directory + decide_vendor_request (approves and applies the change) |
| `/api/admin/vendor-kyc` | GET/POST | Super-admin KYC review (approve/reject with note) |

**Stores/tables:** `erp-phase4b-store.json` → `vendors`, `vendorRequests`, `vendorControls`, `kycDocuments`; admin store audit logs; Supabase private bucket `private-ops-evidence` for KYC images. Postgres runtime mirrors via migration (`fraud_cases`, `vendors` etc.).

## 2. Verified secure-by-design `[TRACED]`

1. **Payout takeover resistance (the killer feature of this page):** `vendorRequestProfileChange` never writes vendor fields directly — it appends a `profile_update` request with `status: 'pending_review'`; only `adminDecideVendorRequest` (super admin, `/api/admin/vendors` with `decide_vendor_request`) applies the payload to the vendor record. A stolen vendor session cannot redirect payouts. Matches the OWASP API8/Insecure-Design mitigation for vendor bank-change fraud.
2. **BOLA/IDOR:** every vendor route resolves identity from the signed session cookie only (`authenticateVendorRequest` — cookie or header token → `getActorSecurityContext(session.userId)` → `actor.vendorId`); caller-supplied vendorId is never trusted. Cross-vendor KYC access: `findOwnKycRecord` requires `doc.vendorId === actor.vendorId` (404 on mismatch). KYC download path is `vendor-kyc/sha256(vendorId)/uuid.webp` — not enumerable.
3. **Auth chain:** session verification → role must be `vendor` → `actor.roleSlug === session.roleSlug` (re-check, prevents cookie-role confusion) → first-login gate → CSRF on every mutation. Enrollment-purpose sessions rejected (401).
4. **Capability registry (defense in depth):** profile edits gated by `canEditProfile`/`canEditPayoutProfile`; onboarding by `canSubmitOnboardingAnswers`; defaults fail-closed (`false` for all except `canRequestPayout`).
5. **Sensitive field redaction:** vendor DTO exposes `payoutAccountMasked` only; admin snapshot (`AdminVendorRowDTO`) returns full `payoutAccountNo` but that route is super_admin-only with `no-store`.
6. **KYC upload hardening:** rate limit 10/min, ≤20 docs per vendor, category allowlist, image re-processed via `processProductImage` (format/content validation), storage path keyed by sha256 of vendorId, compensating rollback on upload failure, `onRuntimeRollback` cleanup, download audited (`VENDOR_KYC_VIEWED`), `Content-Disposition: attachment` + `nosniff` + `private, no-store`, private bucket verified (`public !== false` → error).
7. **Input validation:** zod schemas on all four vendor mutations; phone strictly `/^01[3-9]\d{8}$/` server-side; body size caps (16–32 KB); JSON parse failures → 400.
8. **One-pending-request guard:** duplicate profile/onboarding request while one is pending → rejected (no request-spam flood).
9. **Audit trail:** profile change request, admin decision, KYC submit/view/approve/reject — all `appendImmutableAuditLog` with actor attribution.

## 3. Findings

### VP-01 — P2 · Security / Information-leak (response envelope)
- **Where:** `vendor-client.tsx` `send()` + `ProfileTab`; `vendor-workspace-service.ts` request DTO.
- **What:** The pending profile-change request DTO (`VendorRequestDTO`, also returned to the admin panel via `AdminVendorRequestDTO.payload`) stores `payoutAccountNo` **in plaintext inside the request payload**, and the vendor's own `GET /api/vendor/workspace` returns `requests` including that payload. The vendor is the account owner so seeing their own account number is fine — BUT after an admin approves a payout change, the old payload (with account numbers) stays in the request history indefinitely, and `payoutAccountNo` plaintext also flows into admin UI logs (`vendor-control-panel.tsx` renders `request.payload` fields).
- **Impact:** plaintext bank/bKash account numbers accumulate in request history and are rendered in multiple admin surfaces; if any admin screenshot/log export includes them, that's PII sprawl. Not a takeover vector (change still needs super-admin approval), but a data-minimization gap (OWASP API3 excessive data exposure).
- **In scope? YES — fix below (mask in DTOs, keep plaintext only inside the approval write path).**
- **Evidence:** `[TRACED]` — payload `{ ...input }` includes `payoutAccountNo` (profile route schema allows it, vendorRequestProfileChange stores payload verbatim); admin DTO returns `payload: request.payload` unmasked.

### VP-02 — P2 · Security / Mass-assignment guard nuance (onboarding)
- **Where:** `/api/vendor/onboarding` schema: `answers15: z.record(z.string(), z.string().max(1000))`.
- **What:** The answers map is an open record — any key is accepted, not just the 15 question keys. `vendorSubmitOnboardingAnswers` stores the whole map into `payload.answers15` and on approval writes it into `vendor.onboardingAnswers15`. The profile DTO only *reads* the 15 known keys, so junk keys don't render — but they persist in the store and flow into the admin review UI.
- **Impact:** low security impact (display layer whitelists keys), but violates the project's own whitelist contract and bloats the store; a crafted key like `__proto__`-shaped strings would be stored as plain object keys (JSON round-trip safe in the doc store) — no prototype pollution found `[TRACED]` (store is JSON-serialized). Category: hygiene / API3.
- **In scope? YES — tighten schema to the 15 known keys.**

### VP-03 — P3 · UX / Connection (admin approve applies silently — no vendor notification)
- **Where:** `adminDecideVendorRequest` — updates request status and vendor fields; no message/notification/log entry is visible in the vendor's Support or request list beyond the status badge change on manual refresh.
- **What:** vendor must refresh to learn their payout change was approved/rejected; rejection note surfaces only via `reviewNoteBn` in request list.
- **Impact:** operational friction, not a security bug. Deferred unless the Messaging/Support page audit (NOT YET PROVIDED) covers notification triggers — logged to Deferred Issues.
- **In scope? NO (deferred — notification surface belongs to Messaging tab page).**

### VP-04 — P3 · Code-quality / Duplicate
- **Where:** `courier-and-escrow-panel.tsx` duplicates `VENDOR_ONBOARDING_15_QUESTIONS` locally instead of importing from `phase4b-service`; both copies exist in the repo mirror tree.
- **Impact:** question-set drift risk (admin panel could show different questions than the vendor form).
- **In scope? PARTIAL — consolidation touches the admin panel page (audited area, Courier 360) — recommend import fix in that page's next round. Deferred.**

### VP-05 — P4 · Auth-bypass footgun (documented, accepted)
- **Where:** `vendor-auth.ts` — `isAuthBypassEnabled()` short-circuits to `usr-vendor-001` when running non-production without a session.
- **What:** bypass is gated on `NODE_ENV !== 'production' && !== 'test'` and further env flag `[TRACED crypto-session.ts]`. Preview/dev convenience; production safe. No change; note for deployment checklist: verify `PANCHABINDU_ENABLE_SANDBOX_AUTH` is unset in production env.

### Stack advisories (page-reachable) `[TRACED + web, 2026-11-24]`
- **express 5.3.0**: no known advisories affect 5.3.0 (all 5 published GHSA affect <5.0.0 or 3.x/4.x) — npmscan.io (OSV data, checked 2026-11-19) + GitHub Advisory Database. Not reachable as a vulnerability from vendor routes.
- **body-parser (transitive)**: CVE-2026-111181 DoS (Express.js blog, 2026-10-28) — fix version in body-parser line; express 5.3.0's pinned body-parser version must be confirmed from lockfile by owner (`npm ls body-parser`) since I cannot read the full lock resolution here `[ASSUMED — verify with npm ls]`.
- Express ecosystem Sept/Oct 2026 releases patched cookies/multer/compression — none are runtime deps of the api-server package.json (cookie-parser 1.4.7 is used; `cookies` is not). `[TRACED package.json]`

## 4. Threat Matrix (page-specific)

| Threat | Applies? | How tested / traced | Source |
|---|---|---|---|
| Payout-account takeover via stolen vendor session | NO — request/approve separation `[TRACED]` | read full flow | OWASP API8; vendor bank-change fraud guidance (PTG 2026-10-12, cyberaware 2026-11-08) |
| BOLA: vendor reads another vendor's KYC/profile | NO — `findOwnKycRecord` vendorId match; identity from session only `[TRACED]` | trace | MDN IDOR; OWASP API1:2023 |
| Mass-assignment of role/vendorId fields | NO — zod schemas omit identity fields; actor from session `[TRACED]` | trace | OWASP API3:2023 |
| KYC upload abuse (oversize, MIME confusion, storage enumeration) | NO — rate limit, size cap, image re-encode, sha256 path prefix, private bucket assertion `[TRACED]` | trace | OWASP A04/A05 |
| Plaintext payout account sprawl (VP-01) | **YES — finding** | trace | OWASP API3:2023 |
| Open onboarding key set (VP-02) | **YES — finding** | trace | OWASP API3:2023 |
| Vendor calls admin decision API | NO — `/api/admin/vendors` rejects vendor role explicitly `[TRACED]` | trace | OWASP API5:2023 |

## 5. FIX PATCH — VP-01 + VP-02 (apply in editor; both mirrors where applicable)

### A) VP-01 — mask payout account in request DTOs — `vendor-workspace-service.ts` (api-server copy; frontend mirror has no logic copy, only types)

In the function that builds the vendor-visible request DTO (`toRequestDTO`) and in `AdminVendorRequestDTO` construction, mask the payout account inside the payload before returning. Keep the raw payload intact inside the stored record (the admin approval write path needs the plaintext — `adminDecideVendorRequest` reads `request.payload` to apply the change; it reads from the **store**, not the DTO, so masking the DTO does not break approval).

```ts
// Add near the top of vendor-workspace-service.ts (reuse maskAccount if it already
// exists in vendor-payout-register.ts — export it there first):
function maskPayoutAccountInPayload<T extends Record<string, unknown>>(payload: T): T {
  if (typeof payload.payoutAccountNo === 'string' && payload.payoutAccountNo.length > 4) {
    return { ...payload, payoutAccountNo: `•••••••${payload.payoutAccountNo.slice(-4)}` };
  }
  return payload;
}
```
- Apply in `toRequestDTO(...)` (vendor-facing) → `payload: maskPayoutAccountInPayload(request.payload as Record<string, unknown>)`.
- Apply in `toAdminRequestDTO(...)` in `vendor-admin-service.ts` (admin review UI) the same way.
- **Behavior contract:** admin still sees which account was requested via last-4 + full account on the vendor row's `payoutAccountNo` (super-admin-only field, already in the snapshot). Approval flow unchanged (store record untouched).

### B) VP-02 — onboarding key whitelist — `/api/vendor/onboarding/route.ts`

```ts
// BEFORE
const onboardingSchema = z.object({
  answers15: z.record(z.string(), z.string().max(1000)),
});

// AFTER — accept only the 15 known question keys
import { VENDOR_ONBOARDING_15_QUESTIONS } from '@/src/lib/admin/phase4b-service';
const onboardingKeys = VENDOR_ONBOARDING_15_QUESTIONS.map((q) => q.key);
const onboardingSchema = z.object({
  answers15: z.record(z.enum(onboardingKeys as [string, ...string[]]), z.string().max(1000)),
});
```
(zod 4 supports `z.enum` from an array; alternatively `z.record(z.string(), z.string()).refine(obj => Object.keys(obj).every(k => onboardingKeys.includes(k)), ...)` — use whichever matches the project's zod version idiom. Verify with `npm run typecheck`.)

### C) Regression test (new file) — `scripts/src/vendor-profile-guard.test.mjs`

Pattern-match `crm-blacklist-enforcement.test.mjs`: run against the dev preview; assert (1) vendor workspace `requests[].payload.payoutAccountNo` is masked for a pending payout change, (2) onboarding POST with an unknown key returns 400, (3) legit onboarding POST still 201. Register in `scripts/package.json`: `"test:vendor-profile": "node --test ./src/vendor-profile-guard.test.mjs"`.

## 6. Connection map

| Connected surface | Status |
|---|---|
| Admin Vendors Hub / Vendor Control panel (approval side) | AUDITED (vendors-payouts trace 2026-11-24) |
| Admin KYC review (`/api/admin/vendor-kyc`, KycPanel admin mode) | PROVIDED NOW (read; review flow traced) |
| Vendor payouts page (payoutAccountMasked consumer) | AUDITED (trace) |
| Messaging/notifications on approval | NOT YET PROVIDED (VP-03 deferred) |
| Courier-and-escrow panel (duplicate question list) | AUDITED area (VP-04 deferred) |
| Supabase private storage bucket `private-ops-evidence` | TRACED (config-dependent; owner must verify bucket is private in their Supabase project) |

## 7. Owner verification commands `[BLOCKED in this session — no shell/browser]`

```powershell
git switch audit/vendor-profile-2026-11-24
# apply §5 patches, then:
npm run typecheck
npm run dev
# Terminal 2 — abuse cases against dev (record request/response):
# 1. vendor session: GET /api/vendor/workspace → requests[].payload has masked account
# 2. vendor session: POST /api/vendor/profile {payoutAccountNo:'01712345678'} → 201; then GET workspace → payload masked
# 3. POST /api/vendor/onboarding {answers15: {hackKey:'x'}} → 400
# 4. cross-vendor KYC: vendor A GET /api/vendor/kyc?documentId=<vendor B doc id> → 404
# 5. admin approve via POST /api/admin/vendors decide_vendor_request → vendor record actually changes (approval write path intact)
npm run test:security    # vendor-routes.test.ts + vendor-kyc.test.ts consumers must stay green
```

## 8. Status

**PASS WITH KNOWN RISKS `[TRACED]`** — no P0/P1. Two P2 fixes specified (VP-01 masking, VP-02 schema tightening), both small and local; dynamic verification + responsive matrix pending owner shell access. Completion honesty: ~70% of the A-to-Z loop is code-trace complete; the executed-test portion is 0% until the owner runs §7.
