# RUNBOOK — Lean Analytics + Customer 360 branch

> Everything on `feat/analytics-customers-2026-11-24` is `[ASSUMED]` until these commands are run by the maintainer. Fix any failure at the root cause, re-run, and update `docs/audit/PROGRESS.md` with `[EXECUTED]` evidence.

## 1. Verify the branch (in order)

```bash
git fetch && git checkout feat/analytics-customers-2026-11-24
pnpm install --frozen-lockfile
pnpm run typecheck          # root: all workspaces
pnpm --filter @workspace/scripts run test:domain
pnpm --filter @workspace/scripts run test:security
pnpm --filter @workspace/scripts run test:payments
pnpm --filter @workspace/scripts run test:shopping   # needs Chromium
pnpm run build
```

Expected new behavior to confirm by hand (dev preview, JSON fixture mode):
1. Open `/` — consent banner shows (Bangla+English). Before choosing: check DevTools Network → **no** POST to `/api/analytics/ingest`.
2. Accept → browse `/shop`, a product page, wait 70s → Network shows batched POSTs; dwell sent on tab hide.
3. Decline → banner gone, no further POSTs, `pb_analytics_consent` = decline.
4. `/admin` and `/vendor` pages → no POSTs at all.
5. Kill switch: `ANALYTICS_ENABLED_SERVER=false` + `VITE_ANALYTICS_OFF=1` rebuild → no POSTs even after Accept.
6. Oversized/garbage POST to the endpoint directly (script) → still 204, nothing stored.

## 2. Add a new analytics event in under 5 steps

1. Add the event to the catalog table in `docs/lean/tracking-plan.md`.
2. If it needs a caller: call `trackEvent('name', {...})` (or the specific `track*` helper) at exactly one place in the UI.
3. Allow-list any new properties in `sanitizeEvent()` in `artifacts/api-server/imported/app/api/analytics/ingest/route.ts` (cap lengths).
4. Re-run `pnpm run typecheck` and the endpoint test.
5. Ship. No DB migration needed (document store).

## 3. Turn analytics off instantly

- Server: set `ANALYTICS_ENABLED_SERVER=false` (endpoint accepts nothing).
- Client: rebuild with `VITE_ANALYTICS_OFF=1` (tracker buffers nothing).
- Both are independent kill switches; either one alone stops collection.

## 4. Rotate secrets / disable analytics in production

- Secrets live in the workspace config flow; never in Git. To rotate Supabase/service keys follow `docs/runbooks/deployment.md`; also preserve `CREDENTIALS_ENCRYPTION_KEY` for existing credentials.
- Analytics adds no secrets.

## 5. Free-tier health (500 MB budget)

- Raw events: 35-day retention (default), hard document cap 2 MB — oldest dropped first.
- After one day of real traffic, measure: `psql $DATABASE_URL -c "SELECT pg_column_size(t) FROM runtime_state t"` `[ASSUMED table name — verify against artifacts/api-server/supabase migrations first]` and recompute the budget in `docs/lean/00-recon.md` §5.1 with real bytes/day.
- Storage-health widget (Analytics → Errors & Storage health) warns at 70% of cap.

## 6. Backup + restore (Free tier has no automatic backups)

- Nightly scheduled GitHub Action (secret `BACKUP_DATABASE_URL`, never in the repo):
  1. `pg_dump --no-owner --format=custom $BACKUP_DATABASE_URL > dump.pg`
  2. Encrypt: `age -r <RECIPIENT> dump.pg > dump.pg.age` (private key stays offline; GPG alternative: `gpg --symmetric --cipher-algo AES256`).
  3. Upload to PRIVATE storage (private repo release asset / private S3-compatible bucket). Never commit plaintext dumps.
  4. Rotate: keep last 14, delete older.
- Restore drill (test once per quarter):
  1. `age -d -i key.txt -o dump.pg dump.pg.age`
  2. `pg_restore --clean --if-exists -d <STAGING_DB> dump.pg`
  3. Spot-check: order counts + a known customer record match production.
- Because free projects pause after 1 week inactivity, the backup Action doubles as the keep-alive for the DB — but a paused project still cannot be backed up; prefer an external uptime ping or the Action's own connection as the activity source. `[ASSUMED pausing behavior — verify on supabase.com/docs/guides/platform/free-project-pausing]`

## 7. Rollback

- Analytics client: revert commits touching `main.tsx`, `App.tsx`, `lib/analytics/`.
- Ingestion: remove the route entry (added in a later commit) — the imported router change is the single registration point.
- No database migration was added on this branch, so there is nothing to roll back in SQL. If a later commit adds the `analytics_events` document to the runtime store, rolling back = ignoring the document (additive, non-breaking).

## 8. Deploy

- Follow `docs/runbooks/deployment.md`. This branch adds no new env vars beyond optional `ANALYTICS_ENABLED_SERVER` and `VITE_ANALYTICS_OFF`.
