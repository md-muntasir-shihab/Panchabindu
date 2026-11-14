# Integration and test evidence — 2026-11-13

## Changes
- Courier 360 connection status no longer interprets an environment credential as an established connection: actual courier booking/tracking adapters remain unavailable and the status says not integrated.
- The placeholder security OTP notification no longer returns `dispatched: true` when it did not contact a provider. No live SMS was sent. Existing provider-placeholder log status remains explicitly labeled as a placeholder.
- An isolated Playwright fixture logs in using generated temporary credentials and JSON data, creates a vendor support ticket and opens the statement summary at 375px and 1280px, checks page-level overflow and JavaScript errors. External requests are blocked. These checks are narrow and are not a full responsive/accessibility audit.

## Results
- Isolated suites: audit 16/16 files, payments 4/4, checkout 1/1, quarantine 2/2, contacts 1/1, login 1/1, security 12/12.
- Vercel handler/gateway/page-data: 3/3 tests passed using local fixtures; no deployed gateway tested.
- Sandbox: 4/4 tests passed, including browser checks. A temporary Chromium 143 binary and libraries were obtained from the npm `@sparticuz/chromium` package, outside the committed tree; reproduce by providing `CHROMIUM_PATH` to a compatible local executable. This is not proof of browser behavior against live Supabase or production.

## Not verified / not connected
No live provider call, real payment, courier booking, SMS, storage upload, production database write, deployment, account linking, secret rotation, or migration was performed. Pathao, Steadfast and Bangladesh Post require approved provider-specific integrations and test accounts; credentials alone do not prove a connection. No shared distributed rate limiting, real Postgres concurrent write verification, adversarial RLS testing, or comprehensive browser/accessibility tests were performed. The user's existing production authorization restrictions continue to apply.
