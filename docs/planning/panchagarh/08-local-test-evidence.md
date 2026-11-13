# Phase B — Isolated local security and payment evidence

## Commands and scope

Run from the workspace root:

```sh
pnpm --filter @workspace/scripts run test:security
pnpm --filter @workspace/scripts run test:payments
```

The matching `security` and `payments` console workflows run these commands.
Any failed assertion, timeout or child-process error makes the command fail.
No tests are skipped or marked TODO.

Verified locally on 2026-11-13: `security` passed **38 tests in 8 files**;
`payments` passed **11 tests in 4 files**. Both registered validation workflows
passed without snapshot-update mode. The scripts package TypeScript check and
`git diff --check` also passed. The snapshot contains **59 operations × 7
principals**. The existing `sandbox` validation was deliberately not run: it
reads private development login material and signs into a real local account,
which would violate this task's dedicated-fixtures-only boundary.

| Suite | Imported test file | Local evidence |
|---|---|---|
| security | security/phase1-security | Password hashing, encrypted secrets, signed/revoked sessions, TOTP/replay, OTP lockout, tracking privacy, manual-bKash submit/review and maker/checker, webhook HMAC/replay |
| security | security/customer-route-guards | Anonymous checkout/cancel/return/payment rejected; sequential tracking references rejected |
| security | security/backend-endpoints | Anonymous media/import/print denied; vendor finance-print/import and cross-vendor upload denied |
| security | security/phase1-reconciliation | Origin/CSRF, workspace policy coverage, customer ownership, public DTO allowlist, enrollment and security reset regressions |
| security | admin/phase4a | First-login/MFA fixture gates, role field stripping, cross-vendor 404, duplicate-order guard, immutable audit |
| security | admin/phase4b | Three-copy print field isolation and reprint behavior, pickup/returns, remittance and payout guards |
| security | security/workspace-rbac-snapshot | All workspace schema operations × anon, customer, vendor A/B, marketing, packaging, super_admin; unknown operations denied |
| security | security/unit-test-isolation | Disposable JSON location, no inherited secrets or sandbox overrides, unchanged fixture MFA default, blocked external network clients |
| payments | advance-courier-mfs | Manual-MFS input validation and advance/delivery calculations |
| payments | inventory/phase3-integrity | Stock/QC, last-unit concurrent checkout, multi-vendor fulfillment, cancellation/returns and idempotency |
| payments | finance/phase4-ledger | Balanced integer-poisha journals, immutable/closed postings, idempotency, manual-bKash approval accounting, reconciliation |
| payments | courier/phase5-courier-notification | Locked live adapters, signed/replayed webhook handling, retry/DLQ, OTP redaction and provider-failure isolation |

Paths in this table are relative to `artifacts/api-server/imported/src/lib/`.

## Fixture safety

`scripts/src/isolated-domain-tests.mjs` starts a **separate process and working
directory for every test file**, before importing any domain modules. This is
important because several imported stores capture `process.cwd()` at import
time. Tests seed only their own temporary `.data/*.json` using the existing
`NODE_ENV=test` fixtures; they do not copy, open, log or overwrite development
accounts. A read-only-by-convention source symlink supports a legacy route-schema
assertion; no `.data` directory is symlinked.

Child environments use an explicit allowlist, not an inherited environment:
test mode, local JSON mode, TypeScript configuration and a public synthetic
encryption key for disposable test identities. No workspace credential is read
or rotated. Sandbox usernames/passwords and 2FA-disable overrides are not passed.
The fixture's MFA gate is exercised without changing the app's defaults.
The preload rejects fetch and standard HTTP/TCP/TLS client calls, so an
accidental provider request fails the test instead of reaching a live service.
Temporary directories are deleted on success and failure.

## RBAC snapshot

[`workspace-rbac-snapshot.md`](workspace-rbac-snapshot.md) is checked verbatim
by the suite. New workspace operations must appear in the route schema, policy
and table together. ALLOW means the workspace mutation policy allows the role;
operation-specific validation and ownership checks still apply.

Both vendors are denied on this particular endpoint by design. Vendor-specific
domain operations and cross-vendor isolation have separate tests. Customers
have no staff security context, and customer route/identity guards are tested
separately. Seven principals are listed explicitly, including both vendors.

After an intentional policy change, regenerate and inspect the diff:

```sh
pnpm --filter @workspace/scripts run test:security --update-rbac
```

Normal test runs never rewrite the snapshot.

## Evidence limits

These are local application-layer and route-handler tests, not authenticated
browser tests, real-money tests, live courier/SMS tests, Supabase RLS evidence
or multi-instance database concurrency evidence. Manual-MFS schema acceptance
does not enable any provider. Existing simulation-based domain checks do not
prove that disabled HTTP operations or integrations are available.

No credential, username, 2FA default, development account, production migration,
provider activation or persistence architecture was changed. The remaining
identity remediation plan (shared rate limiter and vendor page UX gate) is
outside this test-wiring task.
