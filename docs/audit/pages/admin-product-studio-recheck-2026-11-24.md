# Product & Category Studio — Re-Audit Round 2 (2026-11-24)

> Branch: `audit/product-studio-recheck-2026-11-24` (from `main`)
> Scope: independent code-level re-verification of the 2026-11-21 audit claims (`docs/audit/pages/admin-product-studio-threats.md`) against current `main`.
> Environment: no shell this session (sandbox service failing); dynamic tests were executed by the repo owner on their machine and pasted back. All agent findings tagged `[TRACED]`; owner-run outputs tagged `[EXECUTED]` (see transcript below).

## 1. Prior-fix verification (against current main)

| Prior ID | Claim | Re-verification | Verdict |
|---|---|---|---|
| T-PS-01 | `deleteAdminProduct` always soft-archives | Both repository.ts copies return `status: 'archived'` + `isFeatured: false`; regression test asserts `archived: true` with clean restore | **VERIFIED** `[TRACED]` |
| T-PS-02 | Input bounds / slug collision / control chars / `weightGrams 10..100000` | Zod `min(10).max(100_000)` confirmed in workspace route; BUT the CSV import path used a different (looser) bound → see CAT-02 | **VERIFIED with gap** |
| T-PS-03 | CSV import: hoisted lookups, control-char caps, rollback | All three present in `artifacts/api-server/imported/src/lib/media/catalog-import.ts` (read in full) | **VERIFIED** `[EXECUTED]` |
| T-PS-04 | `moderateProductReview` permission parity + stock read-only | Test asserts decision-enum 400 + stock-tamper 4xx; ledger confirms `hasModulePermission` + first-login gate | **VERIFIED** `[TRACED]` |
| T-PS-05 | A11y / responsive / localization | Not re-runnable this session — browser matrix requires Playwright Chromium (missing on owner machine this run) | **NOT RE-RUN** |

## 2. New findings

| ID | Severity | Category | Where | What | Fix commit | Status |
|---|---|---|---|---|---|---|
| CAT-01 | P4 | Duplicate / dead code | `artifacts/panchabindu/src/lib/media/catalog-import.ts` (entire file) | Stale frontend duplicate of server import logic (no caps, no rollback, imports node:crypto + server repo services). Zero importers found via searchCode ×2 and Knip unused-files list `[EXECUTED]` | — | **DEFERRED**: owner to `git rm` after confirming no local uncommitted imports (Knip's 138 unused-file list includes scaffolding noise; do not bulk-delete) |
| CAT-02 | P2 | Validation parity / silent data mutation (CWE-20) | `planCatalogImport` weight bound vs `upsertAdminProduct` clamp (repository.ts:2774) | CSV plan accepted `weight >= 1`; repository **silently clamps** to `100..100000`. A 5g product passed preview with 0 errors and stored as 100g — corrupting courier weight bands/delivery quotes. | `85e34d8` | **FIXED** `[TRACED]` — plan now rejects `weight < 100` with `INVALID_CATALOG_ROW` at preview; regression test added |
| CAT-03 | P4 | UX / error surfacing | `catalog-import-panel.tsx` catch block | Server 422 returns bilingual `errorBn`/`errorEn` + code, but panel discarded them and showed generic failure. | `414a983` | **FIXED** `[TRACED]` — panel now renders the server-provided bilingual reason under the generic message |

## 3. Commits on this branch

| Commit | Type | Summary |
|---|---|---|
| `414a983` | fix | Surface server rejection reason in CatalogImportPanel (CAT-03) |
| `85e34d8` | fix | Reject sub-100g CSV weights at preview instead of silent repo clamp (CAT-02) |
| `0f529f2` | test | CAT-02 regression: preview rejects 5g row with `INVALID_CATALOG_ROW`; 100g row still accepted |
| `877e416` | chore | Register `test:catalog:import-weight` npm script (introduced collateral corruption) |
| `e7a7526` | revert | Restore package.json fields corrupted by `877e416`; keep only the script addition |

## 4. Owner-run verification (2026-11-24, Windows/Git-Bash, `[EXECUTED]`)

| Command | Result |
|---|---|
| `grep -n "weightGrams" .../repository.ts` | Confirmed clamp `Math.max(100, Math.min(100_000, …))` at line 2774; **no weight-rejection branch anywhere** — CAT-02 root cause confirmed |
| `npx knip` | Confirmed frontend `catalog-import.ts` unused; also surfaced broad unused-files/deps lists (mockup-sandbox scaffolding, shadcn ui kit) — logged as workspace-wide deferred cleanup |
| `npm run test:catalog:api` | 0/7 — **environment failure**: `ECONNREFUSED 127.0.0.1:3000` (no dev server running). Not a code regression |
| `npm run test:catalog:browser` | Failed: Playwright Chromium not installed on Windows (`/ms-playwright/chrome-headless-shell-linux64` Linux path baked into script expectations) |
| `npm run audit:eslint:catalog` | **PASS** — 0 issues |
| `npm run typecheck` | **PASS** — all 4 workspaces clean |

## 5. Remaining verification before merge (owner must run)

```bash
# 1. Start dev app first (panel + API on :3000), then:
npm run test:catalog:api              # all 7 prior cases
npm run test:catalog:import-weight    # NEW: CAT-02 regression (must PASS after 85e34d8)
npm run audit:eslint:catalog          # re-run after panel fix
npm run typecheck
npm run test:catalog:browser          # needs: npx playwright install chromium (Windows path)

# 2. Deferred cleanups (separate PR, workspace-wide):
#    - git rm artifacts/panchabindu/src/lib/media/catalog-import.ts  (CAT-01, after grep confirming no local imports)
#    - Knip config + mockup-sandbox scaffolding triage (do not bulk-delete from raw list)
```

## 6. Deferred Issues Log (additions)

| Item | Severity | Suggested fix | Page scope |
|---|---|---|---|
| CAT-01 dead frontend `catalog-import.ts` | P4 | `git rm` after import-check | This page |
| `bun.lock` + `pnpm-lock.yaml` dual lockfiles | P4 | Remove `bun.lock` (pnpm is the configured installer per `vercel.json`) | Workspace |
| Knip 138 unused files / 92 unused devDeps (mostly `mockup-sandbox` + shadcn `ui/` kit) | P4 | Add `knip.json`, triage per-workspace; never bulk-delete | Workspace |
| Playwright browser script assumes Linux binary path | P4 | Use `npx playwright install chromium` + `chromium.launch()` default resolution, or set `PLAYWRIGHT_BROWSERS_PATH` | Tooling |
| Vite/rollup Windows optional dep missing (`@rollup/rollup-win32-x64-msvc`) | P4 | `pnpm install` with `--config.optional=true` or remove `.npmrc` `auto-install-peers`/`strict-peer-dependencies` pins that block it | Tooling |
| Owner API tests can't run without dev server on :3000 | P4 | Add a `test:setup` script that boots the preview server before `node --test` | Tooling |
