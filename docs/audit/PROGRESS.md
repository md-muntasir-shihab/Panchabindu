# Audit Progress

- **Current Phase**: AUTH-01 fix in progress (Option A, user-approved) — server-side + test commits pushed; frontend cleanup pending (patch instructions in `modules/auth01-frontend-cleanup.md`)
- **Active Branch**: `audit/admin-panel-2026-11-24` (PR #32), base `main` @ dd654aa2
- **Environment note (2026-11-24)**: audit agent has repo read/write via GitHub connector but **no shell** — no `npm`/lint/test executed. Findings tagged `[TRACED]`; user must run the verification commands before `PASS` is claimed.

## AUTH-01 fix state (Option A — cookie-only admin session)

Committed on `audit/admin-panel-2026-11-24`:

1. `36b95b2` — `app/api/admin/auth/route.ts`: full-login and complete-first-login response bodies no longer include `sessionToken` (HttpOnly cookie is the only carrier; `csrfToken` stays in the body for double-submit CSRF). The 600s first-login **enrollment** response still returns its short-lived enrollment token — required by the client gate flow; enrollment-purpose tokens are rejected by every other admin route.
2. `5301a8a` — `self-service-security.test.ts`: reads the token from `set-cookie` instead of the JSON body and asserts the body no longer leaks it.

**Runtime safety `[TRACED]`:** every admin/vendor/media/print/catalog route reads the token **cookie-first** (`cookies.get(...) ?? extractAdminSessionTokenFromRequest`), and same-origin `fetch` sends cookies by default, so dropping the body echo does not break any authenticated flow even before the frontend cleanup.

**Still to do (needs shell or Cursor — 241 KB file exceeds this agent's whole-file write limit):** follow `docs/audit/modules/auth01-frontend-cleanup.md` (exact edits for `admin-erp-client.tsx` + `admin-fetch.ts` + their byte-identical copies under `api-server/imported`).

**Verification commands (must be run before merge):**
```bash
npm run typecheck
npm run test:security --workspace=@workspace/scripts
node --test artifacts/api-server/imported/src/lib/security/self-service-security.test.ts
node --test artifacts/api-server/imported/src/lib/security/phase1-reconciliation.test.ts
node --test artifacts/api-server/imported/src/lib/security/phase1-security.test.ts
npm run audit:eslint && npm run audit:eslint:orders && npm run audit:eslint:print && npm run audit:eslint:catalog
```

## Completed Pages
1. `/` — Homepage (`audit/home-2026-11-21`)
2. `/admin` — Orders Grid & 4 Attached Sheets (`audit/admin-orders-2026-11-21`)
3. `/admin` — Print Engine & Invoice Studio (`audit/admin-print-engine-2026-11-21`)
4. `/admin` — Product & Category Studio (`audit/admin-product-studio-2026-11-21`)
5. `/admin` — Vendors & Payouts money-core security trace (`audit/admin-panel-2026-11-24`, `[TRACED]`) — doc: `modules/vendors-payouts-security-trace-2026-11-24.md`

## Open findings
- **AUTH-01 (P1)**: server fix committed; frontend cleanup pending (see `modules/auth01-frontend-cleanup.md`). After cleanup + green tests → RESOLVED.
- **VEN-01 (P3)**: `resetVendorControls()` discards `actorUsername` — no audit attribution on capability reset. Deferred to next Vendors Hub round.

## Next
After user runs verification commands and (optionally) applies the frontend patch: continue module audit (Vendors Hub UI, Inventory/Stock, or Checkout).
