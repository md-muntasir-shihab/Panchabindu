# RBAC-01 Patch — Route reset_user_security through adminFetch (CSRF token + session header)

> Branch: `audit/users-rbac-2026-11-24`
> Severity: P2 (defense-in-depth; server CSRF enforcement mitigates, but the client must follow the repo convention on the most privileged mutation)
> Verified against `admin-fetch.ts`: `adminApiRequest === adminFetch` (alias), already imported in `admin-erp-client.tsx`. It injects `x-admin-session-token` + `x-csrf-token` from sessionStorage for `/api/admin/` paths.

## File (1 edit)

### `artifacts/panchabindu/src/components/admin/admin-erp-client.tsx` — reset_user_security button onClick

```diff
- const res = await fetch('/api/admin/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'reset_user_security', targetUserId: u.userId, action: 'reset_password', adminTotpCode }) });
+ const res = await adminApiRequest('/api/admin/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'reset_user_security', targetUserId: u.userId, action: 'reset_password', adminTotpCode }) });
```

Note: this file already imports `adminApiRequest` from `@/lib/admin/admin-fetch` and uses it elsewhere; the raw `fetch` in this one handler is the outlier (confirmed by search: only this `reset_user_security` call and its multiline `create_user` sibling use raw fetch — check the sibling too and convert both if present).

## Behavior contract

- After: the password-reset POST carries `x-admin-session-token` + `x-csrf-token` automatically, matching every other workspace mutation.
- No functional change: same endpoint, same body, same response shape; `adminApiRequest` is a drop-in wrapper.
- DevTools Network check: the `POST /api/admin/workspace` (reset_user_security) request must now show both custom headers.

## Verification

```powershell
npm run typecheck
npm run dev
# Admin UI → Users & RBAC → Reset password → DevTools Network:
# request headers must include x-admin-session-token and x-csrf-token.
```

Commit: `fix(rbac): route reset_user_security through adminApiRequest for CSRF token + session header (RBAC-01)`
