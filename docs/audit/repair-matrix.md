# Repair matrix — 2026-11-13

| Item | Status | Notes |
|---|---|---|
| Vendor created active | PASS (local) | Both onboarding paths create pending; supplied active status is ignored during creation. Activation requires fifteen approved/present onboarding answers and an audited super-admin reason; this is not KYC verification. |
| Placeholder onboarding answers | PASS (local) | Admin draft creates an empty answer set rather than inventing completed answers. |
| Pending operational writes | PASS (local) | Product, stock, price and payout actions denied; onboarding and profile requests remain available. |
| Direct close bypass | PASS (local) | Vendor profile update cannot mark a non-closed account closed; dedicated closing audit remains required. |
| Vendor user link | PARTIAL | Workspace creation rejects unknown vendor profiles; edits to existing role/link are not implemented. |
| Admin CSRF after browser session restoration | PASS (local) | Workspace returns session CSRF token and frontend restores it. |
| Password reset | PARTIAL | UI calls existing short-lived temporary password reset; requires super-admin TOTP and does not work for an admin without enrolled 2FA. |
| Account delivery profile | PARTIAL | Derived from most recent owned order; no server-side saved-address CRUD or wishlist sync. |
| 7-day session | PASS (local) | New customer and admin sessions/cookies only; pre-existing expiry is unchanged. |
| Self-service optional MFA | PARTIAL | Setup, TOTP verification, recovery codes and safe disablement implemented with session revocation and isolated API test; existing-user migration, live DB and browser testing outstanding. |
| Global emergency switch | PARTIAL | Separate super-admin-only stop and recovery with audited reason; shared imported API guard tested locally. Real database and UI tests remain. |
| Comprehensive KYC, relational migration | BLOCKED | Not implemented in this milestone. |

Local commands: isolated `security`, `login`, `checkout`, `payments` suites; Vercel handler/gateway/page-data tests; library/API/frontend typechecks; `build:vercel`. Each passed. These do not establish production or browser acceptance.

## Additional verification — 2026-11-13

- Isolated audit 16/16, payments 4/4, checkout 1/1, quarantine 2/2 and contacts 1/1 test files passed. These suites use disposable JSON state and do not prove live SQL/RLS or concurrency.
- Sandbox first-login tests for both admin and vendor passed without TOTP; login code input is now available as an optional field even for sandbox users who enable MFA. Browser-specific test remains blocked because Chromium is unavailable. The sandbox test was updated to assert the optional field rather than its absence.
- Read-only live Postgres catalog inspection: all 56 public tables have RLS enabled and at least one policy; `erp_runtime_state` has RLS enabled and neither `anon` nor `authenticated` has SELECT privilege. This metadata is not a substitute for adversarial role-specific RLS or storage tests, transaction concurrency, or testing the branch code against a disposable Postgres instance.
- Read-only aggregate from production runtime state: 2 internal accounts, 0 require/enrolled MFA, 0 pending password rotation at the time checked. No account/secret data was copied and no production data changed. Branch changes are not deployed.
- A separate global emergency stop now blocks imported business writes and allows security/recovery locally; the automation-only switch remains a different control. Full KYC, comprehensive vendor portal and safe existing-account MFA preference migration are still incomplete.

- Emergency stop test: anonymous/vendor/CSRF-denied recovery, checkout/vendor/admin business write blocking, account registration blocking, security-login availability and audited recovery pass in isolated JSON fixtures. Browser and real-Postgres concurrency tests remain outstanding.

- Vendor onboarding: isolated API test covers incomplete/awaiting-review denial, approved answers, reason requirement, activation audit and prevention of status-change bypass. Admin request UI renders full answers rather than truncating the JSON. Private KYC upload and per-document review are implemented with mocked-storage tests; full identity verification policy remains unimplemented.

- Private KYC images: isolated tests cover scoped metadata, cross-vendor denial, super-admin/CSRF review, rejection reason, image validation, fail-closed missing storage, mocked private upload/download and audit. Live Storage, actual PostgreSQL conflict rollback and browser tests remain NOT_TESTED.
