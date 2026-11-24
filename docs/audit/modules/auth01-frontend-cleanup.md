# AUTH-01 Frontend Cleanup — exact patch instructions

Part of audit/admin-panel-2026-11-24 (PR #32). The server-side fix is already committed (36b95b2 — login body no longer echoes the full session token) and is runtime-safe on its own, because every admin API route reads the session cookie-first and same-origin fetch sends cookies automatically [TRACED]. This cleanup removes the now-dead client-side token storage so the XSS surface shrinks to zero.

## Why

sessionStorage key bg_admin_session_token plus the x-admin-session-token header were the fallback path while the token was still echoed in login bodies. With the body echo gone, the stored token is either absent (fresh login) or stale (pre-fix session), and the header can only ever send an enrollment token or a revoked one. Removing storage and header injection makes the HttpOnly cookie the single carrier — nothing script-readable ever holds a full admin session.

KEEP: bg_admin_csrf_token (double-submit CSRF needs a readable token) and the first-login enrollment flow (the requiresFirstLoginGate branch stores the 600-second enrollment token so complete_first_login can authenticate; every other admin route rejects enrollment-purpose tokens anyway, and the existing removeItem calls clear it after gate completion/logout).

## Edits

### 1. artifacts/panchabindu/src/lib/admin/admin-fetch.ts

- Delete the line: const storedToken = window.sessionStorage.getItem('bg_admin_session_token');
- Delete the two-line header injection: if (storedToken && !headers.has('x-admin-session-token')) { headers.set('x-admin-session-token', storedToken); }
- KEEP the storedCsrf read and the x-csrf-token injection.
- Update the top-of-file comment to mention only x-csrf-token.

### 2. artifacts/panchabindu/src/components/admin/admin-erp-client.tsx

a) Full-login response handler (branch where requiresFirstLoginGate is false): it currently stores data.sessionToken when both sessionToken and csrfToken exist. Change the condition to store only the csrf token, because the server no longer sends sessionToken in this response.

b) Enrollment (first-login gate) handler: KEEP as-is — it stores the 600s enrollment token that the complete_first_login fetch needs.

c) Two raw-fetch sites read sessionStorage.getItem('bg_admin_session_token') and assign headers['x-admin-session-token'] = storedToken; delete both the read and the assignment — the cookie carries auth on same-origin requests.

d) Logout / gate-completion already call removeItem('bg_admin_session_token'); they can stay (harmless). Keep at least the csrf removal.

### 3. Byte-identical copies

artifacts/api-server/imported/src/lib/admin/admin-fetch.ts — apply the identical edits. Check for any identical admin-erp-client.tsx copy under artifacts/api-server/imported and mirror the edits there too.

### 4. Tests to update

- artifacts/api-server/imported/src/lib/admin/admin-fetch-origin.test.ts: currently asserts x-admin-session-token is sent on same-origin admin requests. Change it to assert the header is ABSENT (cookie-only auth) while x-csrf-token is still sent. Keep the cross-origin and non-admin-path assertions unchanged.
- scripts/src/home-audit-api.test.mjs already asserts sessionToken must not appear in public page payloads — no change needed.

## Verify

- npm run typecheck
- node --test artifacts/api-server/imported/src/lib/admin/admin-fetch-origin.test.ts
- node --test artifacts/api-server/imported/src/lib/security/self-service-security.test.ts
- npm run test:orders:api && npm run test:print:api && npm run test:catalog:api
- git grep -n bg_admin_session_token -- artifacts | grep -v test   (expect: no hits outside tests)

Then manually: admin login (dev sandbox), workspace loads, complete a first-login gate for a fresh staff account, and log out — all three flows now rely on cookie auth only.
