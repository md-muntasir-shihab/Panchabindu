# Runbook — error reporting, uptime and CI

Everything on this page is **optional infrastructure**: with no environment variables set, the API
and the storefront behave exactly as before. Nothing here needs a database migration.

## 1. Sentry (error reporting)

Why: on 2026-11-21 checkout, login and registration hung in production and there was no way to see
what the server was doing. Vercel build logs do not contain runtime errors, so the failure had to be
reproduced from code alone. Sentry removes that blind spot.

### Enable it

1. Create a project at sentry.io → platform **Node.js** for the API, and a second project →
   **React** for the storefront (or one project with two DSNs).
2. In Vercel → project → Settings → Environment Variables, add for **Production** (and Preview if
   you want it there):

   | key | value | notes |
   | --- | --- | --- |
   | `SENTRY_DSN` | `https://<key>@oXXXX.ingest.sentry.io/XXXX` | server, ingested at runtime |
   | `SENTRY_TRACES_SAMPLE_RATE` | `0` | errors only; set `0.1` to also trace requests |
   | `VITE_SENTRY_DSN` | the React project DSN | read at **build** time |
   | `VITE_SENTRY_ENVIRONMENT` | `production` | shown in the Sentry UI |

3. Redeploy. `GET /api/diagnostics` now reports
   `"observability": { "sentryConfigured": true, "sentryActive": true }`.

### What is captured

- API: unhandled exceptions, unhandled promise rejections, Express errors, exceptions thrown inside
  the imported route adapter, and any imported route that answers `>= 500`
  (`Imported route responded 503` + method/path context).
- Browser: uncaught errors and failed order/login flows that the UI already turned into a message.
- Never sent: cookies, `authorization` headers, request bodies. Do not add customer PII to
  `captureServerException` context — phone numbers and addresses stay in the database.

### Known limitation

Performance spans need the separate `@sentry/server-runtime-injection` package inside the function
bundle. Errors work without it; the SDK prints one warning at boot when a DSN is set. Keep
`SENTRY_TRACES_SAMPLE_RATE=0` unless that package is wired up.

## 2. Uptime monitor (replaces a separate Upptime repo)

Why: a shop owner should hear about an outage from monitoring, not from a customer.

`.github/workflows/uptime.yml` runs every 15 minutes and probes:

- `/` (storefront HTML)
- `/api/health`
- `/api/diagnostics` (also proves the database read path responds)

A failing probe opens a GitHub issue titled `[uptime] production is down` and comments on it while
it stays down; the next successful probe closes it automatically. `401/403` is treated as
“protected, not down” so a Vercel preview URL never pages.

**Configure the URL** — repository variable, not a secret:
Settings → Secrets and variables → Actions → Variables → `UPTIME_BASE_URL`
(e.g. `https://panchabindu.com`). Without it the workflow probes `https://panchabindu.com`.

Run it manually from the Actions tab (`Uptime` → Run workflow) after changing the variable.

If a public status page is ever wanted, the Upptime template
(<https://github.com/upptime/upptime>) can be created as a separate repository that watches the same
URLs — the in-repo workflow is enough for alerting and costs nothing extra.

## 3. CI, Dependabot and secret scanning

| File | What it does |
| --- | --- |
| `.github/workflows/ci.yml` | On every PR and on `main`: `pnpm install --frozen-lockfile`, `pnpm run typecheck`, API bundle build, serverless handler + request-body tests, domain logic tests (`money`, `validators`, `runtime-persistence`), admin dashboard render tests, storefront build. |
| `.github/workflows/ci.yml` (`secrets` job) | gitleaks scan with `.gitleaks.toml` — blocks commits containing a Supabase service-role JWT, session secret, courier or payment tokens. |
| `.github/dependabot.yml` | Weekly grouped npm and GitHub Actions updates (runtime, tooling, security). Tailwind and Radix **majors** are ignored on purpose; they need a design pass. |

Notes:

- The handler test imports `artifacts/api-server/dist`, so CI builds the API before running it —
  keep that order if you edit the workflow.
- Vercel still owns deployment; CI only proves the branch builds and the tests pass.
- gitleaks is free for personal accounts. If the repository moves to an organisation, add a
  `GITLEAKS_LICENSE` secret.

## Local commands

```bash
pnpm run typecheck                              # every workspace
node --test scripts/src/vercel-handler.test.mjs # POST body + handler contract (needs API build)
pnpm run test:dashboard                         # admin dashboard render checks
UPTIME_BASE_URL=https://panchabindu.com node scripts/uptime-check.mjs   # probe production now
```
