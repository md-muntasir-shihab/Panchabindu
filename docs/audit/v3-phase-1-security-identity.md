# Phase 1 — Security & Identity (স্থানীয় hardening)

তারিখ: **১১ নভেম্বর ২০২৬**। ব্যবহারকারীর স্পষ্ট নির্দেশ **“Phase 1”** অনুযায়ী অনুমোদিত স্থানীয় remediation। Phase 0-এর অসম্পূর্ণ acceptance মুছে দেওয়া হয়নি। **Phase 1 production acceptance: PARTIAL / BLOCKED; Phase 2+ শুরু হয়নি।**

## বাস্তবায়িত সীমানা

1. **Public ও SSR DTO:** `f:\CODE\Panchagarh\src\lib\db\repository.ts`-এর public catalog/PDP এখন settings allowlist ফেরত দেয়। Nested settings, category, review ও product spec projection unknown properties বাদ দেয়। Variant attributes শুধু configured public axes। Storefront client prop types public DTO-তে পরিবর্তিত। Anonymous admin page-এও internal settings পাঠানো হয় না; authenticated workspace আলাদাভাবে server role অনুযায়ী settings দেয়।
2. **Customer principal:** `f:\CODE\Panchagarh\src\lib\security\crypto-session.ts`-এ random server-issued customer ID, সক্রিয় principal lookup, session rotation/revocation। Sandbox proof `SANDBOX_TEST_ONLY`; production-এ তা প্রত্যাখ্যাত। নতুন customer orders session-derived ID-তে যুক্ত; idempotency key principal-scoped। Client customerId, phone metadata বা staff source/note/payment claim পরিচয়/paid status নির্ধারণ করে না।
3. **Ownership:** account history, sequential-reference authenticated tracking, cancellation, return এবং manual bKash submission customer-ID ownership ব্যবহার করে। অন্য customer ও unlinked legacy orders একইভাবে অনুপলব্ধ। Secure tracking token অন্য account-কে return mutation অনুমতি দেয় না। পুরোনো guest order ফোন মিলিয়ে auto-link বা rewrite করা হয়নি। Internal legacy phone helpers এখনো আছে, HTTP account handlers ব্যবহার করে না।
4. **Review integrity:** caller-supplied phone আর verified badge দেয় না। Server session principal-এর delivered order ও matching product line আবশ্যক। নতুন review session-bound; anonymous review 401। Historical review flags bulk edit হয়নি।
5. **Admin action policy:** `f:\CODE\Panchagarh\src\lib\security\workspace-policy.ts`-এ প্রতিটি বর্তমান workspace operation explicit mapping; unknown/new operation deny। Vendor shared workspace deny বজায়। Staff cost-bearing catalog write, finance/reset ও Part 3 shared bundle deny; full order/grid financial shortcuts সীমিত। Staff snapshots-এ recursive cost/profit/internal SKU redaction এবং sensitive vendor/finance/inquiry/integration aggregates অপ্রেরিত।
6. **Enrollment/reset/session:** login TOTP replay by default; ভুল TOTP-তে account lockout। First-login completion short-lived enrollment session + matching server user + CSRF-তে bound; workspace access নয়। Active enrolled user re-enrollment নিষিদ্ধ। Existing enrolled secret password reset-এ URI দিয়ে পুনঃপ্রকাশ হয় না। Temporary credentials crypto-random (২৪ random bytes), ৩০ মিনিট expiry, stored hash, forced rotation, reset TOTP replay guard এবং target session revocation। 2FA reset পুরোনো recovery hashes সরায়। Malformed identity registry/default-reseed ও persistence failure fail closed।
7. **Origin/rate/payload:** exact server-configured `APP_URL` origin; production-এ অনুপস্থিত হলে fail closed। Next-এর internal request URL external origin-এর authoritative source নয়। No forwarded-host/preview-suffix bypass; admin mutation CSRF token আবশ্যক। Proxy IP headers explicit trusted-proxy opt-in ছাড়া ignored। Customer mutation, review/cart, inquiry/promo-তে relevant payload/rate guards। Local in-memory throttling distributed protection নয়।
8. **Containment:** new flash campaign ও Nagad/Rocket/RedX selection, simulation-only Sheets/scheduler/tracking/webhook/metadata-backup/maturity operations HTTP boundary-তে blocked। Synthetic courier booking HTTP action 503 `NOT_INTEGRATED`; GET workspace automatic audit/lifecycle simulation চালায় না। Underlying historical module functions/types/data retained—পূর্ণ module remediation নয়।

## ব্যবহার ও আচরণগত প্রভাব

- **Production admin login 503 `NOT_INTEGRATED`**: real production identity adapter নেই; local demo registry আর production authentication নয়। Real SMS adapter-ও নেই, ফলে production OTP/checkout কার্যকর বলে দাবি করা হচ্ছে না।
- Local sandbox identity শুধুই `NODE_ENV=test` অথবা non-production explicit `PANCHAGARH_ENABLE_SANDBOX_AUTH=1`। কোনো exposed/real dataset-এ enable করবেন না। `CREDENTIALS_ENCRYPTION_KEY` private strong random secret আবশ্যক; deterministic/blank/zero/example fallback গ্রহণ করা হয় না। `.env.example`-এ কোনো actual secret নেই।
- `APP_URL` exact public origin (scheme + host + optional port), no wildcard/path/query। ভুল origin হলে valid request-ও reject হবে। `PANCHAGARH_TRUST_PROXY_HEADERS=1` কেবল reviewed trusted edge proxy-তে। Production rate limiting/session persistence এখনো implementation blocker।
- Part 3 shared bundle এখন শুধু Super Admin; প্যাকেজিং staff-এর copy-1/2-only workflow আলাদা করে তৈরি/পরীক্ষা হয়নি। Cost-safe staff product editor-ও gated; তাই আগে অনুমোদিত কিছু staff action ইচ্ছাকৃতভাবে বন্ধ। নতুন fifth Accounts role তৈরি করা হয়নি।
- Browser demo password, TOTP auto-fill ও prohibited checkout payment choices সরানো হয়েছে; layout, typography, brand ও `f:\CODE\Panchagarh\src\styles\tokens.css` redesign হয়নি। Browser visual equivalence NOT_TESTED।
- Existing local sessions missing a customer principal are rejected, not auto-upgraded. No legacy guest order ownership inference, account merge or financial bulk edit।

## Verification ও সীমা

**Final evidence:** `f:\CODE\.panchagarh-audit\phase1-verification-MOSXmS\summary.json`; checks ১০:০১:৩৬–১০:০৩:০৩ UTC, ১১ নভেম্বর ২০২৬। `checksPassed=true`, `sourceStableDuringVerification=true`, source `.data` absent। Exact child result JSON ও stdout/stderr একই directory-এর `logs`-এ। Intermediate failed attempts retained; terminal-host “exit 1” statusকে application exit ধরে নেওয়া হয়নি। Captured process result JSON authoritative। Disposable source/dependency copy existing isolated runner দিয়ে প্রস্তুত; `.env`, source `.data`, service credentials copied হয়নি। Existing synthetic data preserved by rename outside source before reruns। Network/OS sandbox নয়; build fonts fetch করতে পারে।

সব command-এর working directory: `f:\CODE\.panchagarh-audit\baseline-pW4lIR\workspace`।

| Check / exact command | Final actual result |
|---|---|
| `bun.exe test` | **121 pass / 0 fail**, 25 files, exit 0; 11 নতুন reconciliation tests; historical testsসহ, real RLS evidence নয় |
| `node.exe node_modules/typescript/bin/tsc --noEmit --incremental false` | **PASS**, exit 0; prior দুই Bun declaration ও Headers/never diagnostic existing Node test convention-এ ঠিক |
| `node.exe node_modules/eslint/bin/eslint.js .` | **PASS**, exit 0, **0 errors / 3 existing img warnings** |
| `node.exe node_modules/next/dist/bin/next build` | **PASS**, exit 0; actual installed Next **15.5.29**, manifest `^15.4.9`; এই pass-এ install/upgrade হয়নি |
| `node.exe --test scripts/tooling/isolated-baseline.test.mjs` | **10/10 pass**, exit 0; full Bun suite-এ tooling tests-ও অন্তর্ভুক্ত |
| `node.exe .next/standalone/server.js` + local fetch checks, synthetic env, loopback port 3187 | **6/6 PASS**, `f:\CODE\.panchagarh-audit\phase1-verification-MOSXmS\smoke.json`; storefront/admin response-এ selected forbidden markers অনুপস্থিত; anonymous workspace 401, no-origin checkout 403, same-origin anonymous checkout 401, production login 503; server stopped |

**Preservation ও inventory:** `f:\CODE\panchagarh-phase1-changes.json`-এ 150 initial allowlisted source/config/script entry থেকে **32 modified, 2 added, 118 unchanged, 0 missing**; current source final verified source-এর সঙ্গে মেলে; changed/new files-এ NUL/merge marker পাওয়া যায়নি। `f:\CODE\Panchagarh\.env.example` এবং governance documents ওই fingerprint allowlist-এর বাইরে; আলাদাভাবে পড়া/যাচাই করা হয়েছে। `f:\CODE\Panchagarh\package.json`, `f:\CODE\Panchagarh\bun.lock`, `f:\CODE\Panchagarh\src\styles\tokens.css` ও SQL entries বদলায়নি। `.git` নেই—Git diff/commit বা full repository preservation দাবি নয়। Master-document পূর্ববর্তী mismatch আলাদা unresolved finding।

### পরিবর্তিত file/module inventory

- নতুন policy ও tests: `f:\CODE\Panchagarh\src\lib\security\workspace-policy.ts`, `f:\CODE\Panchagarh\src\lib\security\phase1-reconciliation.test.ts`।
- Identity/data/types: `f:\CODE\Panchagarh\src\lib\security\crypto-session.ts`, `f:\CODE\Panchagarh\src\lib\db\repository.ts`, `f:\CODE\Panchagarh\src\lib\admin\phase4a-service.ts`, `f:\CODE\Panchagarh\src\lib\admin\phase4b-service.ts`, `f:\CODE\Panchagarh\src\types\domain.ts`, `f:\CODE\Panchagarh\src\types\permissions.ts`।
- API handlers: `f:\CODE\Panchagarh\app\api\account\orders\route.ts`, `f:\CODE\Panchagarh\app\api\admin\auth\route.ts`, `f:\CODE\Panchagarh\app\api\admin\workspace\route.ts`, `f:\CODE\Panchagarh\app\api\cart\abandoned\route.ts`, `f:\CODE\Panchagarh\app\api\orders\route.ts`, `f:\CODE\Panchagarh\app\api\orders\cancellation-request\route.ts`, `f:\CODE\Panchagarh\app\api\orders\return-request\route.ts`, `f:\CODE\Panchagarh\app\api\payments\manual-bkash\submissions\route.ts`, `f:\CODE\Panchagarh\app\api\reviews\route.ts`, `f:\CODE\Panchagarh\app\api\promo\validate\route.ts`, `f:\CODE\Panchagarh\app\api\storefront\inquiry\route.ts`।
- SSR/customer/admin components: `f:\CODE\Panchagarh\app\order-tracking\[orderNo]\page.tsx`, `f:\CODE\Panchagarh\src\components\admin\admin-erp-client.tsx`; public prop types in `f:\CODE\Panchagarh\src\components\storefront\account-client.tsx`, `f:\CODE\Panchagarh\src\components\storefront\category-detail-client.tsx`, `f:\CODE\Panchagarh\src\components\storefront\checkout-client.tsx`, `f:\CODE\Panchagarh\src\components\storefront\contact-client.tsx`, `f:\CODE\Panchagarh\src\components\storefront\homepage-client.tsx`, `f:\CODE\Panchagarh\src\components\storefront\order-tracking-client.tsx`, `f:\CODE\Panchagarh\src\components\storefront\product-detail-client.tsx`, `f:\CODE\Panchagarh\src\components\storefront\shop-catalog-client.tsx`, `f:\CODE\Panchagarh\src\components\storefront\storefront-shell.tsx`।
- Updated regressions: `f:\CODE\Panchagarh\src\lib\admin\admin-fetch.test.ts`, `f:\CODE\Panchagarh\src\lib\admin\phase4b.test.ts`, `f:\CODE\Panchagarh\src\lib\advance-courier-mfs.test.ts`, `f:\CODE\Panchagarh\src\lib\db\repository.test.ts`। Historical payment parsing test intentionally remains schema/history-only; new-use denial tested at HTTP boundary।
- Config/governance: `f:\CODE\Panchagarh\.env.example`, `f:\CODE\Panchagarh\AGENTS.md`, `f:\CODE\Panchagarh\docs\ai\PROJECT_STATE.md`, `f:\CODE\Panchagarh\docs\ai\PHASE_STATUS.md`, `f:\CODE\Panchagarh\docs\ai\DECISIONS.md`, `f:\CODE\Panchagarh\docs\ai\OPEN_QUESTIONS.md`, `f:\CODE\Panchagarh\docs\ai\CHANGELOG.md`, এই report এবং historical audit pointers।

**Database/production changes: NONE.** No dependency manifest/lockfile change, new package, account/MCP/OAuth connection, production resource access, deployment, courier booking বা real payment/ledger operation। Financial tests synthetic copy-তে মাত্র। Existing four-role model retained।

### আগের ব্যর্থতা সংরক্ষণ

- `f:\CODE\.panchagarh-audit\baseline-pW4lIR\summary.json`: overlapping-edit preliminary copy, type/build failure ও 116/117 tests; source changed during run, final evidence নয়।
- `f:\CODE\.panchagarh-audit\phase1-verification-4xQZQw\summary.json`: 120 tests pass, production guard-এর পর redundant narrowed TypeScript comparison fail; পরে ঠিক করা হয়েছে।
- `f:\CODE\.panchagarh-audit\phase1-verification-vF7iAw\smoke-initial-failed.json`: প্রথম HTTP smoke 4/6; valid origin Next internal host-এর কারণে 403। তাই server-configured `APP_URL`, production missing-origin guard ও regression test যোগ।
- `f:\CODE\.panchagarh-audit\phase1-verification-0lNgv0\summary.json`: type/build pass, একটি multi-role HTTP test ৫ সেকেন্ড timeout। Auth read প্রতিবার seed password hash বানাচ্ছিল; সেই unnecessary hashing/default-reseed বাদ দেওয়া হয়েছে, test timeout বা assertion শিথিল করা হয়নি।

## যা সম্পন্ন বা প্রমাণিত নয়

- Production Auth/bootstrap/SMS/customer registration/phone confirmation/account recovery/cart-resume UX; local JSON random ID durable production identity নয়।
- Real PostgreSQL customer ownership/RLS/view grants/storage isolation/JWT metadata policy fixes: SQL অপরিবর্তিত, live/local DB test NOT_TESTED। HTTP fake metadata denial SQL RLS প্রমাণ নয়।
- Multi-process transaction/session/token replay/OTP brute-force guarantees, shared throttling ও database concurrency। JSON writes/legacy finance logic production-safe দাবি নয়।
- Vendor dedicated portal, vendor-specific new API/storage paths, complete per-resource permissions/custom RBAC semantics—পরের approved scope। বর্তমান HTTP vendor boundary সব shared operation deny করে; portal completion নয়।
- Browser E2E/accessibility, real provider/webhook sandbox, physical print, DB/storage/backup restore, deployment এবং professional legal/tax/retention policy যাচাই হয়নি। Local HTTP smoke browser test নয়।
- Ledger deletion/double-count risk, read-time maturity, historical flash/provider data, underlying simulated-success service functions ও metadata-only backup unresolved; selected HTTP entry points quarantined, financial engine repaired নয়।
- Phase 0-এর তিন master-document hash mismatch ও missing ZIP cause unresolved; Phase 1-এ master docs/schema edit বা overwritten হয়নি। Full-repository preservation দাবি নয়।

## পরবর্তী gate

এখানে **Phase 1 local hardening gate-এ থামুন**। Phase 2 database/Auth/RLS/storage design/dry-run-এর জন্য পৃথক explicit approval প্রয়োজন। Production write/deploy/account connection/migration/real financial/courier action-এর জন্য আলাদা approval, backup, dry-run, review ও rollback আবশ্যক।