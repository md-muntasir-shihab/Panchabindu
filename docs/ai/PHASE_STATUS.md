# Verified status (2026-11-13)

| Area | Status | Evidence / boundary |
|---|---|---|
| Customer account and checkout | PARTIAL | Password login, seven-day new sessions and owned last-order profile covered by isolated login tests; saved-address CRUD remains local to browser. |
| Admin and vendor authorization | PARTIAL | Isolated security and vendor API tests pass; real production authenticated journeys not tested. |
| Vendor onboarding | PARTIAL | New vendors are pending and business writes are gated; private image upload and per-document review are locally tested against a mock; real storage, KYC policy, expiry/retention and closure lifecycle are incomplete. |
| Optional MFA | PARTIAL | User self-service setup, verified activation, disablement and one-use recovery codes pass isolated API tests. Existing user migration, live DB and browser verification remain outstanding. |
| Relational migration, RLS, Supabase Auth | BLOCKED | Compatibility JSONB adapter remains the active runtime; actual relational/RLS end-to-end proof not performed. |
| Payments, inventory | PARTIAL | Isolated payment/inventory suites pass; not proof of concurrent real Postgres execution or real money operations. |
| Courier/SMS | NOT_CONNECTED | Scheduled courier tracking explicitly fails closed; no live provider delivery confirmed. |
| Global emergency off | PARTIAL | Separate audited super-admin stop and recovery; shared imported API guard blocks business writes, with security exceptions. Local API tests pass; production and browser verification outstanding. |
| Responsive/browser/a11y | NOT_TESTED | No comprehensive viewport, keyboard or browser journey run in this milestone. |
| Deployment | BLOCKED | Build succeeds locally; production migration/deployment needs separate authorization and real environment verification. |

Additional verification 2026-11-13: sandbox HTTP first-login for both admin and vendor passed; browser and responsive tests blocked (Chromium absent). Live read-only metadata reports RLS enabled on all 56 public tables and denies anon/authenticated SELECT on the runtime-state table; role-based adversarial RLS and real transaction tests remain NOT_TESTED. Live runtime aggregate reports both existing accounts MFA-off at that time, not proof that the branch's self-service MFA is deployed or tested in production.
