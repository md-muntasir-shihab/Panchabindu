# Audit Progress

- **Current Phase**: AUTH-01 frontend cleanup — `admin-fetch.ts` (both copies) + regression test committed on `audit/account-2026-11-24`; remaining: `admin-erp-client.tsx` 241KB targeted edits (2 read-sites of `bg_admin_session_token`) — needs shell/Cursor, exact edits in `modules/auth01-frontend-cleanup.md` §2.
- **Active Branch**: `audit/account-2026-11-24`, base `main` @ 23522b8 (post PR #38)
- **Environment note (2026-11-24)**: audit agent has repo read/write via GitHub connector but **no shell** — no `npm`/lint/test executed. Findings tagged `[TRACED]`; user must run the verification commands before `PASS` is claimed.

## AUTH-01 fix state (Option A — cookie-only admin session)

Committed on `audit/account-2026-11-24`:

1. `36b95b2` (main, prior session) — server: login body no longer echoes `sessionToken`.
2. `7cf87e6` — `admin-fetch.ts` (×2 byte-identical copies): sessionStorage `bg_admin_session_token` read + `x-admin-session-token` header injection removed; `bg_admin_csrf_token` double-submit kept. Top-of-file comment updated.
3. `8f09ebc` — `admin-fetch-origin.test.ts`: flipped to assert `x-admin-session-token` is **never sent** (stale-token scenario), CSRF header still same-origin scoped.

**Runtime safety `[TRACED]`:** every admin/vendor/media/print/catalog route reads the session token cookie-first, and same-origin `fetch` sends cookies by default — dropping the header path does not break any authenticated flow.

**Still to do (needs shell or Cursor — 241 KB file exceeds this agent's whole-file write limit):** follow `docs/audit/modules/auth01-frontend-cleanup.md` §2 (exact edits for `admin-erp-client.tsx` + its byte-identical copy under `api-server/imported` if present). After edit, `git grep -n bg_admin_session_token -- artifacts | grep -v test` must return no code hits.

**Verification commands (must be run before merge):**
```bash
npm run typecheck
node --test artifacts/api-server/imported/src/lib/admin/admin-fetch-origin.test.ts
node --test artifacts/api-server/imported/src/lib/security/self-service-security.test.ts
node --test artifacts/api-server/imported/src/lib/security/phase1-reconciliation.test.ts
node --test artifacts/api-server/imported/src/lib/security/phase1-security.test.ts
npm run audit:eslint && npm run audit:eslint:orders && npm run audit:eslint:print && npm run audit:eslint:catalog
```

## Storefront shared pages pass (this branch)

| Page | File | Fixes | Status |
|---|---|---|---|
| Loading | `pages/loading.tsx` | hardcoded hex → semantic tokens (LOAD-01) | COMMITTED `3a0e446` |
| 404 | `pages/not-found.tsx` | hardcoded palette → tokens, locale-aware, 44px CTA (NF-01) | COMMITTED `3aaee02`+`dc0e176` |
| Error | `pages/error-page.tsx` | locale-aware text (ERR-01) | COMMITTED `3aaee02` |

**Branch commits:** `3a0e446`, `3aaee02`, `dc0e176`, `7cf87e6`, `8f09ebc` — Conventional Commits, none on `main`.

## Completed Pages
1. `/` — Homepage (`audit/home-2026-11-21`)
2. `/admin` — Orders Grid & 4 Attached Sheets (`audit/admin-orders-2026-11-21`)
3. `/` — Print Engine & Invoice Studio (`audit/admin-print-engine-2026-11-21`)
4. `/admin` — Product & Category Studio (`audit/admin-product-studio-2026-11-21`)
5. `/admin` — Vendors & Payouts money-core security trace (`audit/admin-panel-2026-11-24`, `[TRACED]`) — doc: `modules/vendors-payouts-security-trace-2026-11-24.md`
6. Storefront shared pages (loading/404/error) + AUTH-01 frontend cleanup phase 1 (`audit/account-2026-11-24`)

## Open findings
- **AUTH-01 (P1)**: `admin-fetch.ts` + test committed (this branch); `admin-erp-client.tsx` cleanup pending (needs shell/Cursor). → RESOLVED after frontend edits + green tests.
- **ACCT-BLOCK (P1, meta)**: `account-client.tsx` is 107 KB — exceeds this agent's whole-file read/write limit; Account page core redesign requires the file attached to the chat, browser-extension pairing, or a shell. Backend auth chain verified `[TRACED]` in its place.
- **VEN-01 (P3)**: `resetVendorControls()` discards `actorUsername` — deferred.

## Next
After user runs verification commands and applies the `admin-erp-client.tsx` patch: open the Account page core redesign (`account-client.tsx` login/signup/profile UX), then Checkout responsive pass.
