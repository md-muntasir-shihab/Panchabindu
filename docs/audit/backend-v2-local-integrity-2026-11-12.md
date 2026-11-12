# Backend/Admin ERP V2 — local integrity audit, November 12, 2026

## Scope and gate

**Result: local containment implemented and verified; backend acceptance PARTIAL / BLOCKED.** This was not a read-only Phase A: the user requested direct local edits in the preceding interaction. This continuation inspected the completed verification, reviewed placement/limits of those edits, ran additional synthetic checks, and documented the outcome. No additional application code was changed in this continuation.

Latest explicit user scope is the local backend/Admin ERP audit and confirmed integrity repairs. Historical Phase 1-only and broader Phase 2–12 notes are not authorization to advance this audit automatically. No production access/write, SQL migration, dependency upgrade, deployment, real payment/refund/payout, courier booking, or provider/account connection was performed. Stop here for approval of a narrowly scoped follow-up.

Authority: supplied user context, `f:\CODE\Panchagarh\docs\00_CUSTOM_INSTRUCTION.md`, `f:\CODE\Panchagarh\docs\01_FRONTEND_MASTER_PROMPT.md`, `f:\CODE\Panchagarh\docs\02_BACKEND_MASTER_PROMPT.md`, and `f:\CODE\Panchagarh\docs\schema.md`, reconciled with current restrictions. The backend document's V2 addendum contains candidate providers/“National”; these remain **VERIFY_REQUIRED**, not permission to enable them. Baseline remains COD/manual bKash, four internal roles, Pathao/Steadfast/Bangladesh Post, integer Poisha, balanced append-only accounting and public zero-leak DTOs. Existing UI/tokens were not changed in this integrity work.

## Verification evidence

Primary evidence directory: `f:\CODE\.panchagarh-local-checks\backend-v2-Uq6c1J`.

| Check in disposable source copy | Actual result | Evidence |
| --- | --- | --- |
| Bun full suite: `bun test` | **138 pass / 0 fail**, 28 files; exit **0** | `f:\CODE\.panchagarh-local-checks\backend-v2-Uq6c1J\logs\unit.result.json` and `unit.err` |
| Standalone TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false` | exit **0**; no diagnostics | `f:\CODE\.panchagarh-local-checks\backend-v2-Uq6c1J\logs\typecheck.result.json` |
| Full ESLint: `node node_modules/eslint/bin/eslint.js .` | exit **0**; **0 errors / 3 warnings** | `f:\CODE\.panchagarh-local-checks\backend-v2-Uq6c1J\logs\lint.result.json` and `lint.out` |
| Production-mode Next build: `node node_modules/next/dist/bin/next build` | exit **1**; compiled, then **PRODUCTION_PERSISTENCE_GUARD** at `/manifest.webmanifest` prerender | `f:\CODE\.panchagarh-local-checks\backend-v2-Uq6c1J\logs\build.result.json`, `build.err`, `build-summary.json` |
| Application/configuration/script source identity | **163 allowlisted entries match** the verified source; no difference during checks | `f:\CODE\.panchagarh-local-checks\backend-v2-Uq6c1J\source-review.json` and `summary.json` |

Full checks ran November 12, 2026, 03:14:22–03:15:02 UTC; build ran 03:16:12–03:17:10 UTC. Earlier passing builds belong to older source and do not override this failed build. No guard bypass, static fallback brand, or fake PostgreSQL connection was introduced to make it pass. `f:\CODE\Panchagarh\app\manifest.ts:5-8` reads business settings, so prerender currently reaches the guard.

Lint warnings are existing `<img>` warnings at `f:\CODE\Panchagarh\src\components\admin\courier-and-escrow-panel.tsx:1673` and `f:\CODE\Panchagarh\src\components\admin\product-studio-panel.tsx:594,1496`; no UI redesign or dependency change was made to suppress them.

Supplemental evidence: `f:\CODE\.panchagarh-local-checks\backend-v2-review-latest.json` points to retained per-run summaries/logs. First review copy `f:\CODE\.panchagarh-local-checks\backend-v2-review-hv8dnQ` completed with **14/14 integrity tests**, **10/10 Node tooling tests**, both exit **0**, and an exit-0 synthetic defect demonstration. The last demonstration is evidence of **open defects**, not passing acceptance. A subsequent run adds missing/unknown/suspended/active vendor-registry probes; inspect its referenced summary/logs for the final result.

### Evidence limits

- Terminal integration repeatedly reports an unobserved completion or stale exit 1. Assertions above use captured child-process `*.result.json` and actual logs, not terminal-host messages or empty output.
- Checks use fresh code copies, synthetic fixtures and a credential-allowlisted environment; source `.env`/`.data` are excluded. The lightweight external runner **junctions dependencies** to the existing `node_modules`; it does not independently copy or fingerprint dependencies and is not an OS/network sandbox.
- Source root `.data` **exists** at this inspection. Its contents/provenance were not inspected; it was not deleted, reset, migrated or used for these checks. Older “source .data absent” notes are historical. No assurance about its prior state is inferred.
- Root `.git` is absent and Git is unavailable on PATH. This is not a Git diff or whole-repository preservation claim. Docs, secrets, private state, dependencies and excluded build artifacts are outside the 163-entry comparison.
- SQL string counts and JavaScript allow/deny simulations in existing tests are **not actual PostgreSQL RLS results**. Legacy tests still exercise quarantined provider/flash/simulation logic. A green suite does not establish business-policy compliance or production readiness.
- No real DB/RLS/storage, provider sandbox/live integration, backup restore, multi-process contention, browser/responsive/physical-print acceptance or production HTTP smoke was established here. Docker availability was not newly established by the unreliable shell attempt; prior handoff records its engine unavailable.

## Architecture and persistence inventory

Current runtime: Next.js routes/pages → repository/Admin services → multiple local JSON stores. Supabase client creation, database types, SQL migrations and a migration-planning module exist, but do not replace those stores with a transactional PostgreSQL source of truth.

| Runtime store | Owner / content | Current protection and remaining boundary |
| --- | --- | --- |
| `f:\CODE\Panchagarh\.data\erp-store.json` | Repository: settings, catalog, reviews, orders, line snapshots, idempotency and manual-bKash submissions | Shared read/write helper; snapshot checks; no cross-store transaction |
| `f:\CODE\Panchagarh\.data\erp-phase4b-store.json` | Vendors, vendor ledger, courier remittance, payouts, return resolutions and print settings/counts | Shared helper; ledger semantics remain separate from GL |
| `f:\CODE\Panchagarh\.data\erp-phase4c-store.json` | Expenses, message/automation logs, vault, sync/job records | Shared helper; integrations not proved |
| `f:\CODE\Panchagarh\.data\erp-phase6-store.json` | Cart recovery, webhook events, moderation and backup metadata | Shared helper; backup metadata is not a verified restorable backup |
| `f:\CODE\Panchagarh\.data\erp-phase7-store.json` | Consignment/proposals, maturity and optional offers/splits/reversals/refunds | Shared helper; optional missing arrays are empty, not fabricated history |
| `f:\CODE\Panchagarh\.data\erp-phase3-store.json` | Inventory movements, reservations, transitions, returns and split state | Shared helper; process-local mutex is not a DB/multi-worker lock |
| `f:\CODE\Panchagarh\.data\erp-phase4-gl-store.json` | Periods, journals, dispute holds and reconciliation | Shared helper; whole-file writer does not enforce append-only posting |
| `f:\CODE\Panchagarh\.data\erp-phase5-courier-notif-store.json` | Shipment bookings, webhook events and notifications | Shared helper; actual provider response/acceptance absent |
| `f:\CODE\Panchagarh\.data\erp-admin-store.json` | Identity, roles, order metadata and audit history | Existing read restrictions/errors remain; writer still direct `writeFileSync`, not atomic replacement |
| `f:\CODE\Panchagarh\.data\erp-security-sessions.json` | Customer principals, sessions and OTP challenges | Existing session controls; writer still direct `writeFileSync`, not the shared helper |

These are source-declared paths, not inspected datasets. The eight business-store reader/writer pairs are covered by fresh-child regression tests. Missing files may still initialize demo state **in non-production**; corrupt/unreadable or incomplete existing files now fail rather than being silently reseeded. Top-level collection validation is not full row-level schema, referential or accounting validation.

`f:\CODE\Panchagarh\src\lib\supabase\admin.ts:47-70` accurately labels production JSON as blocked even if Supabase credentials exist. `f:\CODE\Panchagarh\src\lib\db\json-to-supabase-migrator.ts:1818-1856` never reports live execution; even its dry-run reads runtime repositories, so do not invoke it against a real dataset as a side-effect-free export.

## Implemented local containment

1. `readLocalJsonStore` distinguishes ENOENT from unreadable/corrupt/incomplete existing stores; no silent catch-and-reseed on those paths. Shape errors propagate without rewriting the original.
2. `writeLocalJsonStore` serializes first, creates an exclusive same-directory temporary file, writes/fsyncs/closes it, then renames it over the target. Failed writes propagate, preserve the prior target in tested cases, and clean their temporary file. This is **single-file replacement only**: no lock, compare-and-swap, multi-store rollback or proven power-loss recovery.
3. ERP reads no longer recalculate historical contracted price snapshots or mint replacement tracking credentials. Safe-integer/formula-inconsistent line snapshots raise `ORDER_PRICE_SNAPSHOT_INVALID` without repair. This does not validate aggregate order/payment/ledger consistency, discount allocations, all negative-money cases or relationships.
4. Full-order editing is Super-Admin-only at the service as well as the existing HTTP boundary. Existing line supplier cost/profit/payable/vendor remain contracted values when catalog terms change; chosen unit sale and platform margin reconcile, and unknown variants, non-safe-integer positive quantities/prices, below-payable unit prices and multiplication overflow are rejected in the tested paths.
5. Optional legacy phase-7 collections default to empty rather than fabricated offers, split groups, refunds or reversals.
6. Product upsert requires an existing active vendor registry row. It no longer invents a vendor identity when the registry is missing or the vendor is absent/inactive. This is not tenant authorization or complete product-price/stock validation.
7. Isolated-copy tooling includes `f:\CODE\Panchagarh\run-local.cmd`; its test now expects the launcher. The TypeScript test environment assignment uses an explicit mutable environment view; no dependency/type-package addition was made.

### High-fuzz patch review

Compared with the first retained isolated copy `f:\CODE\.panchagarh-local-checks\backend-v2-7kCds5\workspace`, the prefix and suffix of `f:\CODE\Panchagarh\src\lib\admin\phase4a-service.ts` outside `updateFullOrderDetails` are byte-identical. The new role check is at line 1826, supplier preservation at 1902 and safe item validation at 1908. Other existing Super-Admin checks belong to user/security operations and were not moved by this patch. See `f:\CODE\.panchagarh-local-checks\backend-v2-Uq6c1J\source-review.json`. This comparison verifies placement since the first copy, not a pre-session Git baseline. The first copy lacks the launcher because the old copier omitted it; that is not evidence the launcher itself was newly edited.

## Confirmed incorrect/incomplete behavior — not repaired here

| ID / priority | Finding and evidence | Required follow-up boundary |
| --- | --- | --- |
| INT-01 / P1 | Full editor directly assigns payment method/status, advance and order status (`f:\CODE\Panchagarh\src\lib\admin\phase4a-service.ts:2031-2039`) with no lifecycle/posting/settlement freeze. Synthetic service call sets delivered/remitted without a verified payment journal. HTTP allows these enum values and calls a delivery/return side effect only **after** persistence (`f:\CODE\Panchagarh\app\api\admin\workspace\route.ts:1025-1033`), ignoring its result. | Separate metadata edits from workflow commands. Owner-approved pre-fulfillment/amendment policy; posted/paid/shipped/settled changes via explicit reconciliation/reversal, not arbitrary assignment. |
| INT-02 / P1 | Item replacement changes quantity/lines without matching stock reservation/movement or fulfillment reconciliation. Synthetic quantity change leaves catalog stock unchanged; duplicate variant IDs produce two lines. Existing/new line data is rebuilt from current catalog labels, so not all descriptive snapshots remain historical. | Atomic reservation deltas, unique line identity, duplicate validation and approved substitution/amendment rules. |
| INT-03 / P1 | Unit sale below supplier payable is rejected, but **order discount can exceed platform margin**. Synthetic edit with discount equal to item subtotal succeeds while supplier liability exceeds net item revenue. Line discounts reset to zero. | Enforce approved discount funding/allocation and invariant at every writer, with boundary/overflow tests. |
| INT-04 / P1 | ERP then Admin/audit writes are separate (`f:\CODE\Panchagarh\src\lib\admin\phase4a-service.ts:2105-2106`). Audit lacks item-level before/after and full new payment evidence. Admin/session writes remain non-atomic. All stores permit lost updates across workers; helper shape check is shallow. | Transactional persistence with immutable event/audit consistency; fault injection between stores, conflict handling and multi-process tests. Do not claim current audit storage is physically immutable. |
| INT-05 / P2 | Service silently skips quantities below 1 (`f:\CODE\Panchagarh\src\lib\admin\phase4a-service.ts:1888`) and rounds header money. Probes demonstrate quantity 0.5 skipped and discount 0.5 rounded. HTTP Zod rejects these inputs, so this is a **service-boundary** validation defect, not demonstrated remote bypass. | One validated command boundary: reject rather than round/skip invalid money/quantities; safe-integer totals and order consistency tests. |
| INT-06 / P1 | Legacy maturity code filters out ledger records and appends available credit without locked offset (`f:\CODE\Panchagarh\src\lib\admin\phase7-service.ts:1065-1107`); balance calculation already counts matured locked entries as available (`f:\CODE\Panchagarh\src\lib\money.ts:362-371`). Delivery promotion deduplicates by order/vendor, not item (`f:\CODE\Panchagarh\src\lib\admin\phase4b-service.ts:1664-1707`). | Append-only reversal/transfer repair and per-item reconciliation. Static risk remains; maturity HTTP command is quarantined in workspace policy. No existing ledger was altered. |
| INT-07 / P1 | Product upsert can clamp margin to zero when payable exceeds sale, resets stock reservations/counters and defaults stock (`f:\CODE\Panchagarh\src\lib\db\repository.ts:2210-2251`). Admin order read path fabricates an in-memory fallback line when historical lines are missing (`f:\CODE\Panchagarh\src\lib\admin\phase4a-service.ts:1050-1080`). | Validate product three-tier equation and non-resetting stock updates; report missing historical evidence rather than inventing line items. Current snapshot fix is not blanket pricing correctness. |
| DB-01 / P1 | SQL customer helper trusts JWT `user_metadata.phone` fallback (`f:\CODE\Panchagarh\supabase\migrations\0008_phase2_schema_rls_and_gl_completion.sql:488-499`). Vendor view has no explicit tenant predicate (`f:\CODE\Panchagarh\supabase\migrations\0007_rls_policies.sql:181-213`) and is granted to authenticated users. | Server-controlled principal mapping, reviewed owners/grants/policies and real anonymous/customer/staff/cross-vendor DB tests. Deployed exposure NOT_TESTED. |
| DB-02 / P1 | SQL balances journal header debit/credit and blocks UPDATE/DELETE, but reviewed definitions do not seal line insertion or enforce aggregate line sums against header (`f:\CODE\Panchagarh\supabase\migrations\0008_phase2_schema_rls_and_gl_completion.sql:237-280`). JSON GL writers likewise replace entire stores. | Reviewed transactional/sealed posting with line-sum constraints and append-only/reversal tests; not a migration in this pass. |
| DB-03 / P1 | Product-image metadata public read is `USING (TRUE)` (`f:\CODE\Panchagarh\supabase\migrations\0008_phase2_schema_rls_and_gl_completion.sql:719-723`); no `storage.objects` policies located in reviewed migrations. Header precheck is not safe decoding/upload. | Private staging, authorization, bounded decode/re-encode, approval promotion and object-level tenant-denial tests. |
| QA-01 / blocked | Production build fails at guarded JSON read; no PostgreSQL repository, DB isolation, backup restore, external adapter, browser or physical-print acceptance established. | Keep production blocked. Resolve the source-of-truth boundary before build/deployment acceptance; never disable containment for a green build. |

Synthetic probe evidence is retained under the supplemental run's `logs\open-defect-probes.out`. Those calls execute only in a fresh disposable working directory and do not exercise the HTTP route or real provider. They confirm service behavior, not end-to-end exploitability or successful finance operations.

## Implemented / incomplete / VERIFY_REQUIRED inventory

| Area | Classification | Exact interpretation |
| --- | --- | --- |
| Local persistence corruption/write-failure containment | IMPLEMENTED, local regression PASS | Eight business stores; not every identity/session writer or row-level invariant |
| Contracted supplier snapshots and full-editor role boundary | IMPLEMENTED, partial financial containment | Existing supplier terms preserved; lifecycle/inventory/discount/transaction defects above remain |
| Identity/tenant/public DTO controls | EXISTING PARTIAL | Local server-session/allowlist/vendor denial tests pass; real Auth/RLS/storage and serialized/browser acceptance not established |
| PostgreSQL source of truth, concurrency, balanced posting | INCOMPLETE / BLOCKED | SQL/client presence and synthetic counts are not runtime enforcement |
| Manual payment, refunds, settlements and reconciliation | EXISTING PARTIAL / INCORRECT PATHS | No real money/provider test; direct master editor can bypass intended workflow |
| Courier/notifications/backup/Sheets | CODE PRESENT / NOT_INTEGRATED OR QUARANTINED | Do not call simulation, checksum/count snapshot or API-key presence “connected/tested” |
| Print/product panels | EXISTING PARTIAL / NOT_TESTED acceptance | No redesign; copy-specific data safety, device media pipeline, responsive/browser/A4 PDF and physical output remain unaccepted |
| Candidate Nagad/Rocket/“National” and automatic provider verification | VERIFY_REQUIRED / NOT ENABLED | Owner clarification and official account/API/capability scope required; no provider claims inferred |
| Tax/VAT, refund/retention, legal invoice and legal escrow | VERIFY_REQUIRED | Owner and qualified Bangladesh legal/accounting review; internal holding liability is not legal escrow |

## Files and next decision

Previously edited/added application/test/tooling files reviewed in this audit:

- `f:\CODE\Panchagarh\src\lib\db\local-json-store.ts`
- `f:\CODE\Panchagarh\src\lib\db\local-store-integrity.test.ts`
- `f:\CODE\Panchagarh\src\lib\db\repository.ts`
- `f:\CODE\Panchagarh\src\lib\db\phase2-migration.test.ts`
- `f:\CODE\Panchagarh\src\lib\admin\phase4a-service.ts`
- `f:\CODE\Panchagarh\src\lib\admin\phase4b-service.ts`
- `f:\CODE\Panchagarh\src\lib\admin\phase4c-service.ts`
- `f:\CODE\Panchagarh\src\lib\admin\phase6-service.ts`
- `f:\CODE\Panchagarh\src\lib\admin\phase7-service.ts`
- `f:\CODE\Panchagarh\src\lib\finance\phase4-general-ledger-engine.ts`
- `f:\CODE\Panchagarh\src\lib\inventory\phase3-inventory-order-engine.ts`
- `f:\CODE\Panchagarh\src\lib\courier\phase5-courier-notification-engine.ts`
- `f:\CODE\Panchagarh\scripts\tooling\isolated-baseline.mjs`
- `f:\CODE\Panchagarh\scripts\tooling\isolated-baseline.test.mjs`

This continuation adds this report, updates AI state/status/decisions/changelog/questions, and retains review runners/evidence outside the source at `f:\CODE\.panchagarh-local-checks`. No new application fix or SQL/dependency/design edit was made during the continuation.

**Proposed next gated slice:** owner-approved full-order-amendment containment (INT-01–05) with a documented freeze policy, discount allocation, stock deltas, complete audit and failure behavior, followed by a separately reviewed PostgreSQL transaction/RLS/restore plan. Decide editable lifecycle stages, financial-change maker-checker/evidence rules, historic snapshot reconciliation process, and duplicate/substitution policy before implementation. No automatic advancement to V2 Phase B–J, migrations, providers or production.