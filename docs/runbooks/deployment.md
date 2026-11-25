# Deployment runbook — verification required

The actual app is Vite/React plus the bundled Express/API gateway, not a Next.js deployment. `vercel.json` builds from the workspace root. Development may use isolated disposable JSON fixtures; never use local JSON for production. Preview does not initialize production data and should not receive production service credentials or point to production data without a separate reviewed isolation plan.

Production requires reviewed Postgres runtime migrations and initialized ten-document compatibility state, `PANCHABINDU_PERSISTENCE=postgres`, server-only `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` or supported server URL, stable `CREDENTIALS_ENCRYPTION_KEY`, and exact `APP_URL` when configured. Consult `.env.example`; never paste real values into Git, logs or chat. Preserve the encryption key and existing data. Optional bootstrap passwords are only for controlled initial setup and must never replace existing users. Confirm actual production configuration securely; environment example is not proof of configuration.

Before any separately authorized production deployment: restore-test a verified backup; reconcile runtime revision and records; review migrations and rollback; verify real Postgres concurrency/RLS and tenant isolation; test safe credential recovery and MFA; validate storage policies, CSRF, account/session flows, integration fail-closed states, security headers, browser journeys and monitoring. No production SQL, secrets, deployment or money actions are authorized merely by this document. Do not claim relational migration or Supabase Auth is complete.

## Build quota and branch policy

`vercel.json` pins `git.deploymentEnabled` to `{ "*": false, "main": true }`. Vercel's documented semantics: an unspecified branch defaults to `true`, and a branch that matches several rules deploys if **any** matching rule is `true`. So the only automatic build is a push or merge to `main` (production); feature, agent and Dependabot branches no longer start one.

Why: the project is on the Hobby plan, capped at 100 deployments per rolling 24 hours (`api-deployments-free-per-day`). Every push to every branch of every linked project used to spend one build; the cap ran out and Vercel then refused even production, answering `402 Payment Required` to any deploy attempt.

To see a branch on a preview URL on purpose:

1. trigger a deployment by hand from the dashboard (Deploy → pick the branch) or through the deployment API, or
2. add that branch (or a minimatch pattern such as `"release-*": true`) to `git.deploymentEnabled` in `vercel.json`, push, and remove it afterwards.

This does not reduce verification: the `Typecheck, tests and builds` workflow runs on every pull request and on `main`, and it covers typecheck, the API bundle, the storefront bundle and the test suites.
