# Phase 0 re-audit — November 11, 2026

## Authority and evidence limits

Current authorization is **local tooling/bootstrap plus Phase 0 only**. Preserve the existing project, design, typography and color tokens. Historical Phase 1–4 requests and conflicting legacy phase numbering do not authorize further implementation. No application behavior, schema, production data, accounts, payments or courier operations were changed during this continuation. Stop at the Phase 0 gate.

**Superseding update:** The complete v3 A–P was supplied in conversation; the former missing-text blocker is resolved. No same-named local file is asserted. Current reconciliation, risks and Phase 1 proposal: `f:\CODE\Panchagarh\docs\audit\v3-phase-0-reconciliation.md`; requirements matrix: `f:\CODE\Panchagarh\docs\audit\v3-requirements-matrix.md`. This older report retains baseline evidence and is not the current requirement matrix.

Read alongside the four existing master/schema references, root governance and `f:\CODE\Panchagarh\docs\ai\PHASE_0_AUDIT.md`. The latter and the November 8 audit reports are historical snapshots; their findings and test counts must not be treated as current facts without reconciliation below. Static findings establish code patterns, not live exploitability or deployed configuration.

## Verified tooling work

- Added and hardened `f:\CODE\Panchagarh\scripts\tooling\isolated-baseline.mjs` and its regression tests. No dependency or lockfile changes.
- Original runner tests: **4 pass / 0 fail**. Hardened runner tests: **10 pass / 0 fail**, captured exit **0**, no stderr; see `f:\CODE\panchagarh-tooling-tests-v2.*`.
- Original full baseline: `f:\CODE\.panchagarh-audit\baseline-AcAxlB`. Lint exited **0**, with **0 errors / 3 warnings**; TypeScript exited **2** with three diagnostics. Bun's 23 file-loading errors and the build's module-resolution errors used a Windows `\\?\` cwd: these are **runner-contaminated evidence**, not 23 failed application assertions or a confirmed application build defect.
- Fixed ordinary Windows path handling, canonical separation/symlink checks, nested private-file exclusions, missing-executable result capture and nonzero CLI status for failed checks. Included existing scripts in the baseline copy/fingerprint. Documented network and timeout limitations.
- A replacement launch (`baseline-ZfYb89`) stopped during copying without a summary; it is **INTERRUPTED**, not a test result. The detached replacement `baseline-hMwJtQ` completed; execution evidence is below.
- All **41 staged Supabase review files** match their manifest SHA-256 and expected Git blob IDs at commit `c9be0e931b7930f7d02126d04774d904c381e7d7`; no unexpected executable files. MIT license reviewed. Evidence: `f:\CODE\panchagarh-skills-integrity-summary.json`; staged content: `f:\CODE\.panchagarh-audit\skills-review`.
- The two official skill packages remain **STAGED / NOT ENABLED**. Their SQL execution, MCP configuration/OAuth, and issue-submission suggestions are not authorization. Generic SQL snippets cannot substitute for server-derived identity, reviewed migrations, or the project's phase gates. No MCP, OAuth or new CLI connection was configured.
- Reviewed the staged feedback guide/template: it requests permission before drafting/submitting a public GitHub issue; no issue or conversation content was sent. The RLS basics reference includes a custom `current_setting` tenant example that is unsafe if an untrusted caller controls that setting; the performance reference's definer helper/EXECUTE revocations require role-specific testing, not blind adoption. The staged SKILL metadata versions are not necessarily the changelog's newest release; no automatic update was performed. Recorded hash matches are an integrity comparison with the captured manifest, not a publisher-signature or general security certification.
- Captured CLI review is metadata only: `supabase@3.1.0` declares a Node shim and platform-specific optional binaries. Transitive package/binary review and a successfully executed version check are not established, so no installation/readiness claim. The earlier `panchagarh-audit-review.txt` has blank formatted review sections; those sections were replaced as evidence by direct file inspection and `f:\CODE\panchagarh-staged-skills-content-review.json`, not interpreted as a clean review.

## Runtime baseline

Completed evidence: `f:\CODE\.panchagarh-audit\baseline-hMwJtQ\summary.json` and its `logs` directory. Checks ran November 11, 2026, **04:04:39–04:06:57 UTC / 10:04:39–10:06:57 UTC+06:00**. Runner process was no longer present in the post-run inventory. The shell integration still reports inconsistent completion; results below come from independent captured files.

| Check | Captured outcome | Interpretation |
|---|---|---|
| Node tooling tests | 10 pass / 0 fail, exit 0 | Verified separately, including a repeat at 10:05 UTC+06:00; supplemental post-correction verification recorded separately. |
| Full Bun discovery | 109 pass / 1 fail across 24 files, exit 1 | The one failure is the new tooling assertion expecting Node's `ENOENT` text; Bun reports `Executable not found`. Application assertions otherwise passed in this run. Runtime-compatible tooling assertion correction and fresh-state rerun are supplemental evidence, not a rewrite of this failed result. |
| Standalone TypeScript | FAIL, exit 2, three diagnostics | Missing `bun:test` declarations twice and an existing `Headers.get`/`never` test error. |
| ESLint | PASS with warnings, exit 0 | 0 errors / 3 unoptimized-image warnings, at courier panel line 1673 and product studio lines 594/1496. |
| Next.js production build | PASS, exit 0 | Compiled, generated 19 static outputs and collected traces. A Node `module.register()` deprecation warning remains. No browser/production validation implied. |
| Allowlisted source preservation | PASS | Completed-run before/after fingerprints match. Independent comparison to the original baseline verifies **146 original application/configuration files unchanged**; source `.data` and `.git` remain absent. Documentation and new tooling are outside that original 146-file comparison. |

The completed summary correctly remains `checksPassed: false`; successful build/lint do not erase the TypeScript or test result. Next's internal type-validation stage did not surface the standalone diagnostics, so it is not a substitute for `tsc --noEmit`. The build may use network font fetching; no OS/network isolation was claimed. Tests use synthetic local fixtures only and include forbidden-feature expectations and RLS simulations; passing them does not certify policy compliance, live RLS, balanced production accounting or phase acceptance.

Confirmed TypeScript diagnostics are missing `bun:test` declarations in `f:\CODE\Panchagarh\src\lib\admin\admin-fetch.test.ts:4` and `f:\CODE\Panchagarh\src\lib\advance-courier-mfs.test.ts:4`, plus `Headers.get` narrowed to `never` in the former file at line 40. These remain unfixed: application/test/dependency repairs require separately scoped approval.

### Final supplemental verification — 04:12:33–04:13:53 UTC

Evidence: `f:\CODE\panchagarh-final-verification.json` and `f:\CODE\.panchagarh-audit\baseline-hMwJtQ\verification-LDNIdl`. Only tooling runner/tests were refreshed in the disposable copy; prior synthetic `.data` was moved into the verification directory, not deleted or read from source. No application test expectations were changed. The first supplemental attempt (`verification-FKvyCR`) still failed because Bun emits an undefined close-event signal; its evidence is retained. The final runner normalizes absent exit/signal values to null and accepts both runtimes' missing-executable wording.

| Final check | Result |
|---|---|
| Node tooling regression suite | **10 pass / 0 fail; exit 0** |
| Bun tooling regression suite | **10 pass / 0 fail; exit 0** |
| Full Bun suite, fresh synthetic state | **110 pass / 0 fail across 24 files; exit 0**, including 10 tooling tests |
| ESLint after final tooling changes | **0 errors / 3 warnings; exit 0** |
| Source preservation during verification | **Unchanged**; 146 original application/configuration files match, source `.data` absent |

The prior successful build remains valid for unchanged application source/configuration; it was not repeated after tooling-only normalization. Standalone TypeScript remains FAIL. Raw baseline and first supplemental failures are not rewritten. This reconciled result is still **not an all-checks pass or Phase 0 acceptance**. Process and edited-file verification are recorded at `f:\CODE\panchagarh-final-process-check.json` and `f:\CODE\panchagarh-edited-files-verification.json`; no audit runner is intentionally left running.

## Current high-priority static findings

| ID | Priority / status | Evidence and significance |
|---|---|---|
| P0R-01 | P1 OPEN — persistence | JSON remains the runtime source for core business services. `f:\CODE\Panchagarh\src\lib\supabase\admin.ts:52-83` reports `supabase_production` based on configuration presence, but that does not switch repositories to SQL. Its guard is conditional on `ERP_STRICT_SUPABASE_PRODUCTION`. File writes and process-local locks do not establish multi-process ACID inventory/accounting integrity. |
| P0R-02 | P1 OPEN — customer ownership/RLS | `f:\CODE\Panchagarh\supabase\migrations\0008_phase2_schema_rls_and_gl_completion.sql:489-499` falls back to JWT `user_metadata.phone`; customer policies compare that phone (`:698-717`). Required server-linked customer identity is not established by this pattern. Effective grants, Auth settings and allow/deny behavior remain untested. |
| P0R-03 | P1 OPEN — view isolation | `f:\CODE\Panchagarh\supabase\migrations\0007_rls_policies.sql:181-213` defines `v_vendor_masked_orders` without an explicit vendor predicate or invoker option. No later replacement/invoker alteration was found in the reviewed migrations. Exposure depends on owner/grants and deployment; do not claim cross-vendor safety from the table policies alone. |
| P0R-04 | P1 OPEN — balanced posted journal | Migration `0008:237-280` checks header debit/credit equality and prevents UPDATE/DELETE, but no reviewed SQL validates aggregate line sums against the header at commit or closes a posted entry against additional inserts. TRUNCATE privilege/guard coverage is also unestablished. Presence of journal tables is not proof of balanced, immutable posting. |
| P0R-05 | P1 OPEN — append-only/maturity accounting | `f:\CODE\Panchagarh\src\lib\admin\phase7-service.ts:1080-1085,1105-1126` filters existing vendor-ledger records and then appends a positive matured amount without a locked-bucket offset. `f:\CODE\Panchagarh\src\lib\money.ts:357-375` already counts matured locked entries as available. Together these patterns indicate deletion/double-count risk; targeted synthetic reconciliation and an approved reversal-based remediation are required. No real ledger was read or modified. |
| P0R-06 | P1 OPEN — media/storage | `0008:719-723` permits all product-image metadata reads without active-product/publishing checks; `:843-847` creates bucket definitions but no `storage.objects` policies were found in the reviewed migrations. Current header precheck is not a decoder, metadata sanitizer, tenant-private staging/promotion or direct device-upload pipeline. Draft-media exposure and actual storage isolation are unverified. |
| P0R-07 | P1 OPEN — prohibited scope | Nagad/Rocket remain in storefront/admin UI and order validation; RedX remains in webhook/types; flash-campaign creation remains in `f:\CODE\Panchagarh\app\api\admin\workspace\route.ts:735,1343-1344`. SQL's COD/bKash check does not repair JSON runtime acceptance. Requires a compatibility/history-safe plan, not silent deletion. |
| P0R-08 | P1 OPEN — simulated courier success | `f:\CODE\Panchagarh\src\lib\admin\phase4a-service.ts:1596-1635` creates local consignment/tracking references and reports booking completed without an external adapter response in that branch. Do not interpret passing offline tests as an actual courier booking/integration. |
| P0R-09 | P1 OPEN — incomplete identity/vendor workspace | Checkout now requires a customer session, but ownership is legacy phone-based; production SMS OTP deliberately reports NOT_INTEGRATED. Shared admin workspace and shared print bundles deny vendors, but no dedicated `app/vendor` or vendor API route was found. Denial is an interim safeguard, not a completed vendor portal. |
| P0R-10 | P2 OPEN — browser/print/design evidence | No browser verification at 360/390/768/1024/1440 widths, accessible grid validation or physical three-copy print check. Existing print modes/CSS and redacted Part 3 tests cannot establish authorized Admin/Accounts copy semantics. Existing UI/token inconsistencies are recorded, not redesigned. |

## Reconciliation with older reports

- Old unsigned-cookie/default-super-admin claims are not representative of the inspected routes: server session verification and fail-closed anonymous rejection exist. This does **not** certify all auth/CSRF/security behavior.
- TOTP preview now returns 403 and the login route no longer generates a missing TOTP (`f:\CODE\Panchagarh\app\api\admin\auth\route.ts:98-102,121-126`). Historical bypass wording must not be repeated as the current route behavior. Demo/bootstrap credential UI and complete enrollment/session hardening still require review.
- Guest checkout and tracking-success-object issues documented in the earlier Phase 0 audit were subsequently guarded (`f:\CODE\Panchagarh\app\api\orders\route.ts:38-47,53-88`). Customer-ID ownership is still incomplete.
- `f:\CODE\Panchagarh\src\lib\security\crypto-session.ts:587-589,645-650` does not claim SMS integration from an API key. Production checkout remains blocked by the missing real identity workflow.
- Eight migrations (`0001`–`0008`), 14 API route files, 12 page files and one root layout are present. `/shop` and `/search` exist; no vendor route was enumerated. These are presence counts, not feature acceptance.
- Migration `0008` contains ledger tables, hardened helper search paths and a public site-settings projection; older claims that these entities are entirely absent are stale. Live policy/grants and sum-of-lines invariants remain unverified.
- Old test totals (58/99) and prior build root-cause guesses do not describe this baseline. JavaScript RLS simulations are not PostgreSQL authorization tests. Tests that expect forbidden payment/campaign behavior are not compliance evidence even when passing.

## Environment and blocked checks

- Installed metadata observed: Node 26.13.0; Bun 1.4.4 (absolute npm-cache path); Next.js 15.5.29; React 19.3.1; TypeScript 5.9.3; ESLint 9.39.1; eslint-config-next 16.0.8; Supabase JS 2.119.0 / SSR 0.12.7. Manifest ranges differ from resolved versions; no upgrade was made.
- Git executable not found on PATH and root `.git` absent. No branch/diff/commit claim; selected before/after hashes are the available preservation evidence.
- Docker Linux engine was unavailable in the captured inventory. No PostgreSQL/RLS/storage/concurrency/restore check or migration has run.
- Host: Windows 10 Pro, build 19045. Current official Playwright installation documentation lists Windows 11+, Server 2019+, or WSL. Browser tests were not installed/run on this unsupported native host. A supported isolated environment is needed; no host upgrade is authorized here.
- No production, OAuth, SMS/email delivery, courier, payment verification, refund, settlement or remote database tests. No legal, VAT, retention or accounting treatment is certified; **VERIFY_REQUIRED**.

Official references rechecked November 11: Playwright Installation (`https://playwright.dev/docs/intro`); Supabase Agent Skills (`https://supabase.com/docs/guides/ai-tools/ai-skills`) and Row Level Security (`https://supabase.com/docs/guides/database/postgres/row-level-security`); PostgreSQL CREATE VIEW (`https://www.postgresql.org/docs/current/sql-createview.html`) and Row Security Policies (`https://www.postgresql.org/docs/current/ddl-rowsecurity.html`). These support the platform, metadata, view-owner and TRUNCATE caveats; none is evidence of this application's actual deployed state.

## Gate and next inputs

Phase 0 reconciliation is documented; acceptance remains **PARTIAL / BLOCKED** by failed or unavailable checks and unresolved risks, not missing v3. Any application/dependency/security/finance repair requires a separately reviewed scope and explicit approval. Later phases are not marked complete by this audit. Preserve historical evidence and stop here.