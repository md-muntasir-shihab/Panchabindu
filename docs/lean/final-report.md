# PR: Lean First-Party Analytics + Customer 360 Privacy — feat/analytics-customers-2026-11-24

## Title (suggested)

```
feat: lean first-party analytics + Customer 360 privacy tab (free, consent-gated, no new infra)
```

## Body (paste-ready)

```
## What

Adds (A) minimal first-party visitor/product analytics and (B) a Customer 360 privacy section, built entirely inside the existing app — no new service, no new dependency, no SQL migration.

### A. Analytics (consent-gated, first-party only)
- Single tracker module `src/lib/analytics/tracker.ts`: consent gate (zero requests without consent; Decline = hard reset), batching (20 events / 15s), sendBeacon on hide, product dwell with idle/visibility pause, 3s dedup, staff (`/admin`,`/vendor`) exclusion, build + server kill switches, never-throws.
- Bilingual consent banner (Accept / Decline / Choose) mounted in App; no layout shift.
- `POST /api/analytics/ingest`: 32KB cap, 20 events/batch, 10 batches/min/IP, strict per-event sanitize (unknown props dropped), batch dedup, staff referer excluded, always-204 fast path so the shop can never be blocked.
- Events stored in `erp-phase6-store.json` → `analyticsEvents` array (extra arrays pass the runtime shape check; no 11th document — the 0009 validator enforces exactly 10). euid dedup, 35-day retention, 20k-event cap enforced on every append.
- `GET /api/admin/analytics` (RBAC): overview/products/sources/devices/hourly heatmap/funnel in one DTO, Asia/Dhaka (UTC+6) day keys. Revenue never comes from browser events.
- Admin Analytics panel (`analytics-panel.tsx`): bilingual, skeleton loaders, empty/error states, formula-neutralized CSV export, pure-CSS bars/heatmap (no chart library added).

### B. Customer 360 privacy
- `POST /api/admin/customer-privacy`: reveal / export / consent-record actions. Full phone is returned only AFTER `CUSTOMER_PII_REVEALED` is written to the append-only audit log. Rate-limited per staff.
- `customer-privacy-sections.tsx`: consent record display, masked-by-default Reveal (logged), DSR export button, consent-gated activity timeline component (empty-by-design without consent).

### Wire-ups (exact instructions in docs/lean/analytics-wireup.md)
Two small manual edits remain: the Analytics tab in `admin-erp-client.tsx` and the Privacy tab in `customer-az-profile-view.tsx`. Plus one pending file replacement: the ingestion route's repository wiring (old shim must be replaced — see wire-up doc ⚠️ section).

## Compliance
Bangladesh Personal Data Protection Act 2026 (Act No. 63 of 2026, in force since 2025-11-06): consent gate, purpose limitation, data-subject request flow, retention purge. Lawyer checklist in docs/lean/privacy.md — not legal advice.

## Storage budget (Supabase Free 500MB)
~100KB/day raw at 400 events/day × 250B, 35-day retention ≈ 3.5MB steady state — two orders of magnitude under the limit; math in docs/lean/00-recon.md §5.1.

## Honest status
All code was written and committed via the GitHub API without a shell — every commit is tagged [ASSUMED]. Maintainer runs: `pnpm run typecheck`, `pnpm run build`, `node --test scripts/src/analytics-repository.test.mjs`, then the browser checklist in docs/lean/RUNBOOK.md §1. Full audit trail with tags: docs/lean/final-report.md.

## Rollback
Revert the branch; no migrations, no env vars beyond optional `ANALYTICS_ENABLED_SERVER` / `VITE_ANALYTICS_OFF`. The `analyticsEvents` array is additive — old code ignores it.
```

---

# Final Report — Lean Analytics + Customer 360

> Branch: `feat/analytics-customers-2026-11-24` · 19 commits · main untouched.
> Every claim tagged: **[TRACED]** read from repo/docs, **[ASSUMED]** written-not-run (maintainer must verify via RUNBOOK), **[EXECUTED]** none in this environment (no shell).

## 1. What was built and where it lives

| Piece | Location | Tag |
| --- | --- | --- |
| Recon (stack, 10-doc contract, free-tier math) | `docs/lean/00-recon.md` | [TRACED] |
| Tracking plan (event→chart map) | `docs/lean/tracking-plan.md` | design doc |
| Admin gap-check table (22 essentials) | `docs/lean/gap-check.md` | [TRACED + UNVERIFIED marks] |
| Privacy map + PDPA 2026 baseline | `docs/lean/privacy.md` | [TRACED], lawyer items marked |
| Runbook (verify/off-switches/backup) | `docs/lean/RUNBOOK.md` | [ASSUMED commands] |
| Wire-up instructions | `docs/lean/analytics-wireup.md` | [TRACED] |
| Tracker module | `artifacts/panchabindu/src/lib/analytics/tracker.ts` | [ASSUMED] |
| Consent banner | `artifacts/panchabindu/src/lib/analytics/consent-banner.tsx` | [ASSUMED] |
| Ingestion endpoint | `artifacts/api-server/imported/app/api/analytics/ingest/route.ts` | [ASSUMED] ⚠️ pending replacement |
| Events repository | `artifacts/api-server/imported/src/lib/analytics/analytics-repository.ts` | [ASSUMED] |
| Admin aggregation endpoint | `artifacts/api-server/imported/app/api/admin/analytics/route.ts` | [ASSUMED] |
| Admin Analytics panel (5 views) | `artifacts/panchabindu/src/components/admin/analytics-panel.tsx` | [ASSUMED] |
| Privacy route (reveal/export/consent) | `artifacts/api-server/imported/app/api/admin/customer-privacy/route.ts` | [ASSUMED] |
| C360 Privacy/Activity components | `artifacts/panchabindu/src/components/admin/customer-privacy-sections.tsx` | [ASSUMED] |
| Route registrations (3) | `artifacts/api-server/src/routes/imported.ts` (1 line each) | [TRACED] |
| Bootstrap/App wiring | `main.tsx`, `App.tsx` (trackPageView + banner) | [ASSUMED] |
| Repository budget test | `scripts/src/analytics-repository.test.mjs` | [ASSUMED] |

## 2. Event-to-chart map (summary; full table in tracking-plan.md)

- `page_view` → Overview trend, Traffic view · `session_start` → live-now/new-vs-returning · `heartbeat` → Live now (5-min window) · `product_view`/`product_dwell`/`add_to_cart` → Products view + funnel · `search` → zero-result list (planned) · `checkout_step` → funnel · `js_error`/`api_failure` → Errors view · `order_placed/cancelled/returned` (server-side) → revenue, never from the browser.

## 3. Customer 360 access rules

- Server-side session + RBAC on every route (same pattern as system-health) [TRACED pattern, ASSUMED code].
- Full phone reveal → audit log written FIRST (`CUSTOMER_PII_REVEALED`), append-only log that even super_admin cannot delete [TRACED from RBAC audit doc].
- Export/consent actions audit-logged; rate-limited per staff.
- Activity tab consent-gated: without linked+consented visitor ID it stays empty BY DESIGN.

## 4. Free-tier budget math [TRACED assumptions, ASSUMED actuals]

- 400 events/day × ~250B = ~100KB/day; 35-day retention ≈ 3.5MB steady state; 500MB Supabase limit → >100× headroom. Re-measure per RUNBOOK §5 after a real traffic day.
- Pausing (1 week inactivity) → pg_cron unreliable; scheduled GitHub Action backup doubles as keep-alive [ASSUMED].
- No automatic backups on Free → encrypted (age/GPG) pg_dump Action + quarterly restore drill in RUNBOOK §6 [ASSUMED commands].

## 5. Tests

- Added: repository budget constants characterization test (node:test convention) [ASSUMED].
- Existing suites must still pass: migration/domain/security/payments/quarantine + typecheck + build [TRACED names from package.json; results PENDING maintainer run].
- Conversion-to-permanent-tests of consent/dedup/204-path checks is in the roadmap once the maintainer's first run confirms the code compiles.

## 6. Security & privacy results

- Ingestion: body/event/rate caps, strict sanitize, no client-trusted prices, staff excluded, never-blocks-shop [ASSUMED code; verify via RUNBOOK §1 items 5–6].
- No PII in analytics events (fields: paths, product ids, dwell ms, coarse device/referrer/UTM) [TRACED schema].
- CSV export formula-injection neutralized in the panel [ASSUMED].
- Kill switches: `ANALYTICS_ENABLED_SERVER=false` (server) and `VITE_ANALYTICS_OFF=1` (client build) — either alone stops collection [ASSUMED].
- Law: PDPA 2026 baseline documented; 7 lawyer-confirmation items in privacy.md §7.

## 7. Roadmap (remaining essentials, by priority)

1. P0 finish: maintainer runs RUNBOOK §1 + the ⚠️ ingestion-route replacement + the two manual wire-ups.
2. P1: login-time visitor→customer merge hook (unlocks Activity tab data + consented personalization); server-side DSR export assembly; storage-health widget thresholds on real numbers.
3. P1: scheduled encrypted backup Action file (commands already in RUNBOOK §6).
4. P1 (from gap-check): inventory stock-history ledger; notification templates/delivery logs; consolidated sales/customer report.
5. P2: banner/CMS depth; rollup document (`analytics_daily`) once raw events prove the traffic scale.

## 8. BLOCKED / maintainer must verify

- Everything [ASSUMED]: typecheck, build, all test suites, browser consent journey, dwell behavior, kill switches, RBAC denial for non-super-admin on `/api/admin/analytics` + `/api/admin/customer-privacy` (IDOR), CSV neutralization.
- Real phone/SMS sandbox, payment sandbox, production hosting — untouched by this branch.
- Lawyer review of the 7 privacy.md items.
- `@vercel/analytics` stays mounted (pre-existing on main) — remove it for 100% first-party if desired; one-line change, flagged not silently done.

## 9. Honest limitations

- Anonymous visitors are not individually identifiable; ad blockers and declined consent reduce counts; dwell time is an estimate (1s tick granularity); numbers will not match external tools exactly.
- Admin funnel shows view→cart→checkout; the purchase step intentionally remains order-derived (existing dashboard) until the rollup slice.
- The Activity tab has no data pipeline yet (login-time merge hook is the follow-up) — it renders its honest empty state rather than fake data.
- All 19 commits were authored through the GitHub API without a shell; nothing was executed in this environment.

## 10. Commit list (19)

`a7485b0` recon · `f3aa421` tracking-plan+gap-check · `655d3f4` tracker+banner · `6f07090` tracker syntax fix · `8aa56bb` ingestion · `a5a9420` main.tsx lifecycle · `405ae54` App.tsx views+banner · `183ba30` privacy doc · `ba5e508` runbook · `ce0bc44` ingest route registration · `31ac675` events repository · `e1d779b` admin analytics endpoint · `e30de8b` analytics panel · `b7cb080` analytics route registration · `9dd75d3` repository test · `0f1e399` wire-up doc · `4984882` privacy route · `b6d3b23` privacy route registration · `08b58ce` C360 components · `825a126` wire-up doc update
