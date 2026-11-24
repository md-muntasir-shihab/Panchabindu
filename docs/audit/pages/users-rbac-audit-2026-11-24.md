# Users & RBAC Security Matrix — Audit (2026-11-24)

> Page: `/admin` → `users_and_rbac` (rendered inline in `admin-erp-client.tsx`, System & Security group), super_admin only
> Branch: `audit/users-rbac-2026-11-24` (from `main` @ 7fe0a35)
> All claims `[TRACED]`. Core identity engine (`phase4a-service.ts`, 124 KB server copy) read function-by-function: auth, lockout, TOTP, first-login gate, user creation, security reset, role matrices, snapshot scoping, audit log.
> Scope: user CRUD + temporary passwords, reset password/2FA/toggle-active, custom role permission matrix editor, audit trail.

## 1. Findings

### RBAC-01 — P2 · CSRF bypass on the most sensitive operation (defense-in-depth gap)
- **Where:** `admin-erp-client.tsx` — `reset_user_security` button handler uses raw `fetch('/api/admin/workspace', …)` instead of the project's `adminFetch` wrapper.
- **What:** the request carries **no `Origin` header and no `x-csrf-token`**, while other workspace mutations on the same page use `adminFetch` with both. `update_inquiry_status` (far less sensitive) sends CSRF; password reset (which produces a one-time temp password and can lock out/take over ANY account) does not.
- **Server side:** the workspace POST route does enforce CSRF via `verifyOriginAndCsrf` (same route as `update_inquiry_status`) — so in the standard deployment this is mitigated server-side. But the client inconsistency means: (a) if any deployment/env variant relaxes CSRF, this call silently loses its protection; (b) the browser will NOT send same-origin credentials semantics the wrapper guarantees; (c) it contradicts the repo's own convention. Defense-in-depth violation on the single most privileged mutation.
- **Evidence:** `[TRACED]` — handler code read; `adminFetch` usage on sibling handlers read.
- **Fix:** one-line — replace `fetch('/api/admin/workspace', …)` with `adminFetch('/api/admin/workspace', …)` in the `reset_user_security` handler (import already present in the file).

### RBAC-02 — P3 · window.prompt for admin TOTP (UX/security smell)
- The password-reset flow collects the super admin's fresh TOTP via `window.prompt` — value lands in a plain string, clipboard-visible, no autocomplete-off, screen-reader hostile, and breaks the bilingual a11y pattern used elsewhere (44px fields, labels). Functional but sloppy for a banking-grade action.
- **Fix:** small inline input with masked field; low priority.

### RBAC-03 — observation: seeded demo identities hardened correctly `[TRACED]`
- `getInitialAdminStore` filters legacy demo accounts (marketing_lead, packing_lead, new_staff) out of non-test boots; only super_admin + vendor survive.
- Sandbox bootstrap **requires ≥24-char passwords** when not in bypass mode; plaintext cannot be auto-migrated in production (`throw`s); TOTP secrets AES-256-GCM encrypted at rest; temp passwords expire.
- `readAdminStore` throws when identity registry is malformed — fails closed.

### RBAC-04 — observation: auth engine verified strong `[TRACED]` (map to OWASP ASVS 2.x)
- 5-attempt lockout (30 min), per-user counter, audit-logged lock events (`AUTH_ACCOUNT_LOCKED_5_ATTEMPTS`).
- TOTP RFC 6238 with **replay guard** (`lastUsedTotpStep`), backup codes are hashed, single-use, removed on use.
- First-login gate: temp password must be rotated + (if required) TOTP enrolled before ANY workspace action — enforced server-side via `isFirstLoginGateCleared` on every mutation handler, not just UI.
- Session revocation on password rotation/2FA enrollment (`revokeAllUserSessions`).
- Username enumeration resistant (uniform "ইউজারনেম অথবা পাসওয়ার্ড সঠিক নয়।" for unknown user vs wrong password).
- `sanitizeUserAccount` DTO: no passwordHash, no TOTP secrets, no backup hashes ever leave the server; `users` in GET workspace scoped super_admin→all, others→self only; `auditLogs` super_admin only.
- Role matrices: 18 modules × 4 system roles with per-module CRUD + hiddenFields (vendor: platform margin/staff notes hidden, customerPhone/streetAddress masked; marketing: supplier cost/margin hidden). `canDelete` false for audit_logs & vendor_ledger even for super_admin — append-only integrity.
- `reset_user_security` requires the acting super admin's **own fresh TOTP code with replay guard** (`verifyAdminActorTotp(..., enforceReplayGuard: true)`) — a stolen session cookie alone cannot reset passwords. Strong design.
- `create_user`: zod username min 3, vendor role requires existing vendorId (server re-verifies against Phase4B store), first-login gate on, one-time temp password generated server-side, audit-logged (`USER_CREATED_WITH_FIRST_LOGIN_GATE`).

### RBAC-05 — AUTH-01 status check (the open global P1)
AUTH-01 (admin session token echoed in login response body) — the server-side fix (httpOnly cookie path) landed earlier; the **frontend cleanup** remains the open residual tracked in the ledger. This page's audit re-confirmed the auth flows are otherwise solid; AUTH-01 stays a global cross-page item, not specific to this page's handlers.

## 2. Threat Matrix (page-specific)

| Threat | Verdict |
|---|---|
| CSRF on password reset (client) | **GAP — RBAC-01 (P2)**: raw fetch w/o CSRF token; server enforcement mitigates, client must match convention |
| Session hijack → password reset takeover | SECURE [TRACED] — fresh admin TOTP + replay guard required server-side |
| Privilege escalation via role matrix edit | SECURE [TRACED] — super_admin only, zod enum roleSlug, audit-logged |
| Vendor-role user created with forged vendorId | SECURE [TRACED] — server re-verifies vendor existence in Phase4B store |
| TOTP replay (reused code) | SECURE [TRACED] — lastUsedStep guard, backup codes hashed + single-use |
| Password/TOTP hash leakage via DTO | SECURE [TRACED] — sanitizeUserAccount whitelist |
| Audit log tampering | SECURE [TRACED] — append-only, canDelete=false, super_admin-scoped reads |
| Lockout bypass | SECURE [TRACED] — 5 attempts/30 min, audit-logged |
| Demo/test identity leakage to prod | SECURE [TRACED] — filtered out of non-test boots, 24-char sandbox pw required |
| Brute-force TOTP | SECURE [TRACED] — failed TOTP counts toward the same 5-attempt lockout |

## 3. Patch (one line, both this branch and safe to cherry-pick)

```diff
- const res = await fetch('/api/admin/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' },
-   body: JSON.stringify({ operation: 'reset_user_security', targetUserId: u.userId, action: 'reset_password', adminTotpCode }) });
+ const res = await adminFetch('/api/admin/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' },
+   body: JSON.stringify({ operation: 'reset_user_security', targetUserId: u.userId, action: 'reset_password', adminTotpCode }) });
```

(Exact context: `admin-erp-client.tsx`, the `reset_user_security` button onClick. `adminFetch` is already imported in this file.)

Commit: `fix(rbac): route reset_user_security through adminFetch for CSRF token + Origin (RBAC-01)`

## 4. Verification

```powershell
npm run dev
# In the admin UI → Users & RBAC → any user → Reset password:
# DevTools Network → the reset POST must now carry x-csrf-token + Origin headers.
npm run typecheck
```

## 5. Status

**PASS WITH KNOWN RISKS** — no P0/P1 on this page's own surface; the identity engine is the strongest module audited so far. RBAC-01 (P2, one-line client fix) + RBAC-02 (P3 UX) logged. AUTH-01 residual remains a global item.
