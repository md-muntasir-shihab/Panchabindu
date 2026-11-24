# Lean Store Analytics + Customer 360 — 00 Recon

> Scope: first-party, free, minimal analytics + Customer 360 + admin gap check for Panchabindu.
> All facts in this file are `[TRACED]` from repository code/docs unless marked `[ASSUMED]`.
> Recon performed via GitHub read API on 2026-11-24; shell was BLOCKED (no terminal in this environment), so nothing has been executed. Every later change on this branch will be `[ASSUMED]` until the commands in `RUNBOOK.md` are run by the maintainer.

## 1. Framework and runtime

| Layer | Technology | Notes |
| --- | --- | --- |
| Frontend | React 19.1 + Vite 7.3 SPA | `artifacts/panchabindu` (workspaces: `artifacts/*`, `lib/*`, `scripts`) |
| Client routing | Wouter | Routes in `artifacts/panchabindu/src/App.tsx` |
| State | TanStack Query + Zustand (localStorage-persisted cart/wishlist/locale) | `src/lib/storefront/*` |
| Styling | Tailwind CSS v4 + design tokens | `src/styles/tokens.css` |
| Backend | Express 5.3 + Pino logger, adapted Next-style handlers | `artifacts/api-server` |
| Build/deploy | Vercel serverless (`vercel.json`, `api/[...route].mjs`), Node 22, pnpm workspaces | root `package.json`, `replit.md` |
| Language/currency | Bangla default / English, BDT stored as integer poisha | `docs/audit/00-system-map.md` |

SPA route-change page views are natural because every route remounts `PageDataRoute` (`App.tsx` `KeyedPage` keyed by location), so a tiny mount-effect is the single page-view hook. No React Router, no Next.js runtime (explicitly noted in `replit.md`).

## 2. Persistence and hosting (critical)

- **Dual-mode runtime store**: local JSON fixtures in dev preview; production requires `PANCHABINDU_PERSISTENCE=postgres` + `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and fails closed otherwise (`replit.md`). `[TRACED]`
- **The active persistence is a compatibility adapter, not relational**: ten named JSON documents stored in Postgres/Supabase JSONB rows with optimistic revision transactions (`docs/ai/PROJECT_STATE.md`). A finished relational migration is explicitly BLOCKED/NOT_DONE in `docs/ai/PHASE_STATUS.md`. `[TRACED]`
- Consequence for this task: adding analytics tables as *new relational tables* is out of scope for a minimal first step. The contract "ten named JSON documents" must be preserved. Design decision for this branch (documented, then implemented in later steps):
  1. **Analytics events**: new document `analytics_events` inside the same ten-document contract (additive, schema-checked, size-capped, 30–45 day retention) — one document, no new tables, keeps parity with existing vendor/product/CRM stores that all live in documents. `[DECIDED]` (needs maintainer review of the PR)
  2. **Daily rollups**: new document `analytics_daily` built by a purge/rollup routine from `analytics_events`. `[DECIDED]`
  3. **Supabase SQL migrations** exist under `artifacts/api-server/supabase/` but live production SQL/writes require separate authorization per `docs/ai/PROJECT_STATE.md`; none will be touched on this branch. `[TRACED]`

## 3. Auth, roles, and existing admin surface

- Signed admin session cookie shared by admin and vendor; super admin, marketing manager, packaging manager, vendor roles; 18 permission modules; `audit_logs` module is append-only even for super_admin; users created with first-login gate; per-module hidden fields (vendor: phone/street masked; marketing: cost/margin hidden). `[TRACED]` `docs/audit/pages/users-rbac-audit-2026-11-24.md`, `docs/planning/panchabindu/03-identity-data-boundary.md`
- RLS is enabled on all 56 public tables (live metadata report, adversarial RLS NOT_TESTED) per `docs/ai/PHASE_STATUS.md`. `[TRACED]`
- Admin SPA is a single huge client: `admin-erp-client.tsx` (241 KB), plus panels: orders grid, order details/dispatch sheets, print engine, product studio, courier/escrow, vendor hubs, **crm-contacts-panel.tsx (48 KB)** and **customer-az-profile-view.tsx (85 KB)**, messaging hub, phase4c/6/7 panels, sync-health. Dashboard: `admin-command-dashboard.tsx` with built-in SVG TrendChart. `[TRACED]`
- Existing analytics surface: `@vercel/analytics` is mounted in `App.tsx` (`<Analytics />` after the router; comment: "no PII, no cookies"). The repo's own requirements matrix (docs/planning/panchabindu/02-requirements-matrix.md X3/X6) bans GA/GTM/pixels and paid analytics platforms; Vercel Web Analytics is a free external SaaS. Master prompt hard rule: "first-party only; no paid or external analytics service". **Decision for PR discussion, not silently changed: either (a) keep it as-is (it is free and already shipped), or (b) replace with the first-party tracker to be 100% compliant with the prompt. Default of this branch: add the first-party tracker alongside; removing `@vercel/analytics` is a one-line change flagged to the maintainer.** `[TRACED]`
- No consent banner, no `sendBeacon`/dwell/visibility tracking, no `pg_cron`, no rollups, no storage-health widget exists today. `grep` over the repository: `consent` only appears in a UI message and a paste artifact; `dwell`/`sendBeacon`/`pagehide`/`pg_cron`/`rollup` have zero code matches. `[TRACED]`

## 4. Existing customer features that Customer 360 must NOT rebuild

- Customers are immutable-ID based; account delivery info derives from the latest owned order; guest orders are not claimed by phone (`docs/ai/PROJECT_STATE.md`). `[TRACED]`
- Local saved addresses are browser-only, not synced. `[TRACED]` (gap; not this branch's job to fix without asking)
- Abandoned-cart recovery queue already exists: `POST /api/cart/abandoned` endpoint + admin "Abandoned cart recovery" panel (reminders, consent language: "Record customer consent before creating an order on their behalf"), recovery engine listed in planning docs. `[TRACED]`
- Customer notes/consents tables appear only as names inside an import artifact (`customer_consents`, `customer_notes` etc. in `public/assets/aistudio/Paste_November_08__2026...`), not as implemented relational tables; CRM panel already covers contact list + note/tag surfaces as documents. `[TRACED]`
- Customer 360 approach for this branch: extend the existing `crm-contacts-panel` / `customer-az-profile-view` (Activity + Privacy tabs) rather than building a new page. Exact integration points to be traced before writing code in Step 4. `[DECIDED]`

## 5. Free-tier limits (applied to design)

Source: supabase.com/pricing, retrieved 2026-11-24. `[TRACED]`

| Limit | Free plan value | Design impact |
| --- | --- | --- |
| Database size | 500 MB per project | Raw analytics events must be short-retention; rollup to small daily document entries; row/byte budget below |
| Pausing | Paused after 1 week of inactivity; max 2 active projects | `pg_cron` is unreliable here; simplest free option: scheduled GitHub Action for backup/purge, plus app-side purge on request (documented in RUNBOOK) |
| Automatic backups | Not included on Free | Encrypted (`age`/GPG) `pg_dump` via scheduled GitHub Action to private storage; restore test required |
| Egress / file storage | 5 GB / 1 GB | Analytics payload stays tiny (< 32 KB batches) |

### 5.1 Size budget math (to validate on real traffic)

- Assumed average event size (compact JSONB): ~250 bytes `[ASSUMED]`. Real measurement: after 1 day of simulated traffic, compute average via the verification command in RUNBOOK.
- Assumed traffic: 50 sessions/day × 8 events/session ≈ 400 events/day `[ASSUMED]` — maintainer must replace with real numbers.
- Raw events at 400/day × 250 B ≈ 100 KB/day → 30-day retention ≈ 3 MB; 45 days ≈ 4.5 MB. Two orders of magnitude below the 500 MB limit even with 100× traffic growth (10× sessions and 10× events → ~450 MB at 45 days is the ceiling where retention must drop — flagged in the Storage health widget at 70%).
- Rollups (`analytics_daily`): ~1 KB/day aggregate entries; years of retention is negligible.
- Purge: raw events older than `ANALYTICS_RAW_RETENTION_DAYS` (default 35) deleted by a scheduled routine; document size guarded by `ANALYTICS_MAX_DOCUMENT_BYTES` (default 2 MB hard cap) `[DECIDED]`.

## 6. Environment truth for this run

- Shell: BLOCKED (no terminal). Install/run/browser/DB access: BLOCKED. Git via GitHub API only. Web search: available. `[TRACED]`
- Therefore every change on this branch is `[ASSUMED]` until the maintainer runs the exact verification commands listed in `docs/lean/RUNBOOK.md` (typecheck, lint, existing test suites, browser checks).
- Production is fail-closed and was never touched. No `.env` values were read or needed; no secrets in this branch.

## 7. Notice, not touched

- `admin-erp-client.tsx` is 241 KB — any addition must be a separate panel/component file, not more inline code.
- Existing 13-group admin architecture and every route are not fully audited (`docs/audit/functional-inventory.md`); gap-check table (Section 4 of the master prompt) is produced from traced facts only, with UNVERIFIED marks where the audit docs themselves are partial.
- Courier/SMS adapters fail closed and are NOT_CONNECTED (`docs/ai/PHASE_STATUS.md`); scheduled courier tracking exists but no live provider is confirmed — abandoned-cart SMS reminders depend on this.
- Saved addresses remain browser-only; 2FA existing-account migration incomplete; deployment BLOCKED pending separate authorization. All are out of scope here. `[TRACED]`
