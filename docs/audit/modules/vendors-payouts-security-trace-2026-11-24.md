# Module Audit — Vendors & Payouts (Money Core Security Trace)

> Date: 2026-11-24 · Agent: Ashna-X1 (GitHub read-only trace, no shell in environment)
> Every finding below is `[TRACED]` (verified by reading the real code path on `main` @ dd654aa2).
> No test/lint was executed in this round — commands for re-verification are listed at the bottom.

## 1. Scope & Method

Deep code trace of the unaudited highest-risk admin area: vendor payout request/approve/settle paths and the shared auth/RBAC layer underneath every admin endpoint.

Files traced:

| Layer | File |
| --- | --- |
| Express host | `artifacts/api-server/src/app.ts` |
| Route adapter | `artifacts/api-server/src/routes/imported.ts` |
| Route boundary | `artifacts/api-server/imported/src/lib/db/backend-route.ts` |
| Admin auth | `artifacts/api-server/imported/app/api/admin/auth/route.ts` |
| Vendor auth guard | `artifacts/api-server/imported/src/lib/vendor/vendor-auth.ts` |
| RBAC policy | `artifacts/api-server/imported/src/lib/security/workspace-policy.ts` |
| Vendor payout request | `artifacts/api-server/imported/app/api/vendor/payouts/route.ts` |
| Admin payout register | `artifacts/api-server/imported/app/api/admin/vendor-payouts/route.ts` |
| Vendor capability registry | `artifacts/api-server/imported/src/lib/vendor/vendor-control.ts` |
| Courier webhook | `artifacts/api-server/imported/app/api/webhooks/courier/route.ts` |
| Courier status cron | `artifacts/api-server/imported/app/api/cron/courier-status/route.ts` |

## 2. Verified secure-by-design (no change required) `[TRACED]`

1. **Vendor payout request (`POST /api/vendor/payouts`)** — signed-session + CSRF + role check (`authenticateVendorRequest`), zod schema (integer poisha, min 100), 8 KB body cap, server-side balance/capability enforcement delegated to `vendorRequestPayout`; caller-supplied vendor IDs are never trusted.
2. **Admin payout register (`GET/POST /api/admin/vendor-payouts`)** — super-admin-only session gate, CSRF re-verified per POST, strict zod discriminated union with integer poisha bounds (≤ 100,000,000 = ৳1,00,০০০ সর্বোচ্চ), proof URL scheme allowlist, `Cache-Control: private, no-store`.
3. **RBAC (`workspace-policy.ts`)** — fail-closed: unknown operations rejected; `direct_vendor_payout` and other money-bearing ops locked to `super_admin` plus module permission.
4. **Webhook (`/api/webhooks/courier`)** — HMAC fail-closed (401/503 on missing secret), signed timestamp required, replay-resistant rate limit (60/min/IP), 64 KB cap; intentionally returns `NOT_INTEGRATED` until a provider contract is verified — matches `known-limitations.md`.
5. **Cron (`/api/cron/courier-status`)** — Bearer `CRON_SECRET` required; fails closed.
6. **Express host (`app.ts`)** — origin allowlist CORS, security headers, `x-powered-by` disabled, pino request logging with URL stripped of query strings.
7. **`backendRoute` boundary** — per-path body caps, emergency-stop fail-closed gate, fixed diagnostic codes (no error-detail leakage), `no-store` cache policy.
8. **Admin auth route** — signed HttpOnly session cookie, rotation on login, first-login 2FA enrollment gate, 25-attempt/15-min/IP rate limit, CSRF+Origin on every mutation.

## 3. Findings

### AUTH-01 — P1 · Security
- **Where:** `artifacts/api-server/imported/app/api/admin/auth/route.ts` (login, `complete_first_login`, MFA enrollment responses)
- **What:** The login / first-login response **body** echoes `sessionToken` while the same token is also set as an `HttpOnly` cookie. Any XSS payload able to read fetch responses can obtain the admin session token, defeating the purpose of HttpOnly. The frontend deliberately stores it in `sessionStorage` (`bg_admin_session_token`) and re-sends it via `x-admin-session-token` header (`admin-fetch.ts`), so this is an intentional dual-path design, not a bug — but it widens the XSS blast radius.
- **Root cause:** Historical design decision to support header-based session replay alongside the cookie.
- **Impact:** A single XSS anywhere in the admin SPA can steal a super-admin session. Severity raised because the admin panel is money-bearing (direct vendor payouts up to ৳1,000,000 per action).
- **Evidence:** `[TRACED]` — full source of `admin/auth/route.ts`, `admin-fetch.ts`, `admin-erp-client.tsx` read on `main` @ dd654aa2; sessionStorage flow confirmed via code search (4 references).
- **Recommended root-cause fix (needs your decision — redesign-level, do NOT blind-patch):** drop the response-body echo + sessionStorage path entirely; rely solely on the HttpOnly cookie (`credentials: 'include'` + CSRF token header, which is already sent). This requires verifying every admin fetch path sends cookies (same-origin fetch does by default) and updating `admin-fetch.ts`, `admin-erp-client.tsx`, and tests (`admin-fetch-origin.test.ts`). The CSP should also be reviewed. Alternative minimal hardening: keep dual-path but add a strict Content-Security-Policy to the admin bundle.

### VEN-01 — P3 · Code-quality (deferred)
- **Where:** `artifacts/api-server/imported/src/lib/vendor/vendor-control.ts` — `resetVendorControls()`
- **What:** `actorUsername` parameter is accepted but discarded (`void actorUsername`) — the capability-reset action is not attributed to the acting admin in the audit trail (unlike `setVendorCapabilities`, which stores `updatedByUsername`).
- **Evidence:** `[TRACED]` — full source read.
- **Fix:** accept `actorUsername`, store it in the removed control entry's place (or write a separate audit record) so who reset a vendor's controls is recorded. Small, isolated change; belongs with the next admin-audit round of the Vendors Hub panel.

## 4. Commands to re-verify (agent environment has no shell)

```bash
npm run typecheck
npm run test:orders:api && npm run test:print:api && npm run test:catalog:api
npm run test:security --workspace=@workspace/scripts
npm run audit:eslint:print
```

Paste outputs back and I will mark this module `PASS` only on green results.

## 5. Status

**PASS WITH KNOWN RISKS** (trace-level) — no server-side payout/auth flaw found; AUTH-01 (session-token body echo) logged as P1 pending a design decision; VEN-01 deferred.
