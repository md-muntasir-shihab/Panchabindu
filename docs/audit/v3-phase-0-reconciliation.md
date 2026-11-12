# Phase 0 — v3 reconciliation ও প্রস্তাবিত Phase 1

> **Historical Phase 0 snapshot.** ব্যবহারকারী পরে “Phase 1” স্পষ্টভাবে অনুমোদন করেছেন। বর্তমান local remediation, tests ও production-blocked gate: `f:\CODE\Panchagarh\docs\audit\v3-phase-1-security-identity.md`। নিচের NOT AUTHORIZED এবং “fix হয়নি” মন্তব্য Phase 0-এর সময়ের; historical evidence অপরিবর্তিত রাখা হয়েছে।

তারিখ: ১১ নভেম্বর ২০২৬। **Scope: static audit ও documentation; application, migration, OAuth, production access বা Phase 1 কাজ নয়।** সম্পূর্ণ v3 Sections A–P কথোপকথনে সরবরাহ করা হয়েছে; missing-v3 blocker সমাধান হয়েছে। একই নামের স্থানীয় ফাইল পাওয়া গেছে এমন দাবি নেই। November 6 artifact-এর পুরোনো backend A–P modules v3 Sections A–P নয়। বর্তমান নির্দেশ ও v3 পুরোনো দ্বন্দ্বপূর্ণ তথ্যের ওপর প্রাধান্য পায়।

**অবস্থা:** requirements-level reconciliation নথিভুক্ত; **Phase 0 acceptance PARTIAL / BLOCKED**। TypeScript baseline fail, বাস্তব PostgreSQL/RLS/storage, browser, print, provider, backup/restore ও deployment tests অনুপস্থিত এবং গুরুত্বপূর্ণ ঝুঁকি খোলা। `f:\CODE\Panchagarh\docs\audit\v3-requirements-matrix.md`-এ A–P ও আট domain-এর grouped evidence ও পাঁচ status আছে। গ্রুপের প্রতিটি bullet আলাদাভাবে dynamically verified নয়; আরও decomposition প্রয়োজন। `VERIFIED` শুধু নির্দিষ্ট সীমিত স্থানীয় তথ্যের জন্য, `PARTIAL`, `MISSING`, `NOT_TESTED`, `VERIFY_REQUIRED` আলাদা। Source বা migration live deployment-এর প্রমাণ নয়।

## আট domain-এর ফলাফল

1. **Customer — PARTIAL:** `f:\CODE\Panchagarh\app\shop\page.tsx`, `f:\CODE\Panchagarh\app\search\page.tsx` আছে। `f:\CODE\Panchagarh\app\api\orders\route.ts:38-88` session ও phone check করে, কিন্তু durable customer-ID ownership, কার্যকর production registration/phone confirmation ও cart-resume E2E প্রতিষ্ঠিত নয়। `f:\CODE\Panchagarh\src\store\use-wishlist-store.ts` local persistence, cross-device নয়। Profile, support, notification এবং privacy workflow সম্পূর্ণ বা প্রমাণিত নয়।
2. **Vendor — MISSING/PARTIAL:** `f:\CODE\.panchagarh-audit\phase0-reconciliation-20261111\inventory.json:50-77`-এ dedicated `/vendor` route নেই। `f:\CODE\Panchagarh\src\types\permissions.ts:357` shared admin access সীমিত করে, কিন্তু tenant API, PII, RLS ও storage denial পরীক্ষিত নয়।
3. **Admin — PARTIAL:** `f:\CODE\Panchagarh\app\api\admin\workspace\route.ts:110-205` session/actor boundary ব্যবহার করে; dashboard, grid, product ও finance modules আছে। সব action-level permission, maker-checker, KPI formula, complete grid action inventory ও responsive operation পরীক্ষা হয়নি।
4. **Product media — PARTIAL/MISSING:** `f:\CODE\Panchagarh\src\components\admin\product-studio-panel.tsx` URL-centric; `f:\CODE\Panchagarh\src\lib\media\product-image-precheck.ts` standalone header/size check, নিরাপদ decode নয়। Direct device upload, private staging, approved promotion, metadata removal ও CSV-media mapping প্রতিষ্ঠিত নয়।
5. **Finance — PARTIAL/HIGH RISK:** integer Poisha domain logic ও SQL journal structures আছে; মূল runtime JSON (`f:\CODE\Panchagarh\src\lib\db\repository.ts`)। `f:\CODE\Panchagarh\supabase\migrations\0008_phase2_schema_rls_and_gl_completion.sql:237-280` header balance check actual line sums/finality প্রতিষ্ঠা করে না। `f:\CODE\Panchagarh\src\lib\admin\phase7-service.ts:1060-1100` ledger filter/maturity এবং `f:\CODE\Panchagarh\src\lib\money.ts:350-375` read-time maturity একত্রে deletion/double-count ঝুঁকি তৈরি করে; transactional reproduction NOT_TESTED।
6. **Courier — PARTIAL/NOT_TESTED:** Pathao/Steadfast/Bangladesh Post code আছে; অননুমোদিত RedX-ও আছে। `f:\CODE\Panchagarh\src\lib\admin\phase4a-service.ts:1580-1625`-এ একটি booking branch locally tracking তৈরি করে; real booking-এর প্রমাণ নয়। Webhook HMAC/timestamp code আছে, বাস্তব provider/replay sandbox NOT_TESTED।
7. **Print — PARTIAL/NOT_TESTED:** `f:\CODE\Panchagarh\src\components\admin\print-engine-panel.tsx`-এ A4 ও thermal code আছে। `f:\CODE\Panchagarh\src\lib\admin\phase4b-service.ts:680-900` vendor shared bundle deny করে; Part 3 শুধুই authorized Admin/Accounts কি না, copy isolation ও pagination প্রমাণিত নয়। Browser PDF, color/grayscale ও physical printer পরীক্ষা হয়নি; CSS hardware color বাধ্য করতে পারে না।
8. **Security — PARTIAL/HIGH RISK:** signed session, admin guards, origin/CSRF ও masked tracking code আছে; সব route/RBAC পরীক্ষা হয়নি। Rate limit `f:\CODE\Panchagarh\src\lib\security\crypto-session.ts:820` process-local। Production configuration, grants ও independent review অজানা।

## অগ্রাধিকারভিত্তিক ঝুঁকি

P0/P1 audit triage, বাস্তব exploit বা deployment ঘটেছে তার প্রমাণ নয়।

| ID | Priority | Evidence এবং ঝুঁকি | প্রয়োজনীয় যাচাই / প্রস্তাবিত phase |
|---|---|---|---|
| R01 | P0 | `f:\CODE\Panchagarh\src\lib\db\repository.ts:1290-1305` raw `siteSettings` ফেরত দেয়; `f:\CODE\Panchagarh\app\page.tsx:10-17` client component-এ পাঠায়। API sanitizer আলাদা। Internal settings serialized হওয়ার ঝুঁকি; অন্যান্য storefront page-ও একই pattern ব্যবহার করে। | Synthetic SSR/RSC payload field tests; Phase 1 allowlist. Production exposure NOT_TESTED. |
| R02 | P0 | `f:\CODE\Panchagarh\src\lib\admin\phase7-service.ts:1081-1100` এবং `f:\CODE\Panchagarh\src\lib\money.ts:350-375` ledger filter/maturity logic; append-only/double-count ঝুঁকি। | Isolated reproduction, accounting review; Phase 2/8; live mutation নয়। |
| R03 | P0 | `f:\CODE\Panchagarh\supabase\migrations\0007_rls_policies.sql:181-213` vendor view-তে explicit vendor predicate নেই; `f:\CODE\Panchagarh\supabase\migrations\0008_phase2_schema_rls_and_gl_completion.sql:560` authenticated grant। Effective RLS/view-owner অনুযায়ী cross-tenant exposure সম্ভব। | Effective grants ও cross-vendor/non-vendor real PostgreSQL tests; Phase 2. |
| R04 | P1 | `f:\CODE\Panchagarh\supabase\migrations\0008_phase2_schema_rls_and_gl_completion.sql:488-499,698-706` phone ownership-এ user_metadata fallback। | Synthetic JWT/cross-customer tests, auth.uid-linked identity; Phase 1–2. |
| R05 | P1 | `f:\CODE\Panchagarh\supabase\migrations\0008_phase2_schema_rls_and_gl_completion.sql:719-720,843-846` public image metadata read ও bucket definition; scoped review-এ complete object staging/upload policy নেই। | Local object RLS negative tests; Phase 2–3. Deployed policies অজানা। |
| R06 | P1 | `f:\CODE\Panchagarh\app\api\reviews\route.ts:9-33` supplied phone নেয়; `f:\CODE\Panchagarh\src\lib\db\repository.ts:2032-2048` non-cancelled order থেকে verified purchase নির্ধারণ করে; session/delivered check নেই। | Authenticated principal/delivered order tests; Phase 1/4. |
| R07 | P1 | JSON persistence ও process-level stock coordination (`f:\CODE\Panchagarh\src\lib\inventory\phase3-inventory-order-engine.ts`) distributed transaction/stock/ledger invariant নয়। | Multi-process DB/concurrency tests; Phase 2/6/8. |
| R08 | P1 | `f:\CODE\Panchagarh\src\lib\admin\phase4a-service.ts:2222` password reset-এ `Math.random()`। | Cryptographically secure reset/expiry/session invalidation tests; Phase 1. |
| R09 | P1 | `f:\CODE\Panchagarh\src\lib\admin\phase6-service.ts:1228-1254` inspected backup handler checksum/count metadata রাখে; restorable payload সেভের প্রমাণ নেই। | Isolated backup/restore drill; Phase 12. |
| R10 | P1 | `f:\CODE\Panchagarh\src\lib\admin\phase4c-service.ts:1370-1442` configuration থাকলেই Sheets pushed status তৈরি করে; inspected function network push করে না। Scheduler ও vault-এর প্রকৃত আচরণও পুনঃযাচাই প্রয়োজন। | NOT_INTEGRATED বনাম CONNECTED পৃথক করা; Phase 1/9/12; external call নয়। |
| R11 | P1 | `f:\CODE\Panchagarh\src\lib\validators\index.ts:231`, `f:\CODE\Panchagarh\app\api\admin\workspace\route.ts:735,1343` নিষিদ্ধ payment/flash ধারণ করে; RedX webhook-এ আছে। | New-use quarantine ও historical compatibility plan, data deletion নয়; Phase 1 তারপর প্রাসঙ্গিক phase. |
| R12 | P1 | `f:\CODE\Panchagarh\src\lib\admin\phase4b-service.ts:680-900` Part 3 role separation নিশ্চিত নয়; vendor denial staff financial-field boundary প্রমাণ নয়। | Per-copy DTO ও role denial tests; Phase 1/10. |
| R13 | P1 | `f:\CODE\Panchagarh\src\lib\security\crypto-session.ts:820` memory rate limiter distributed নয়। | Deployment-aware limits এবং CSRF/session abuse tests; Phase 1. |
| R14 | P2 | Production bundle/data-flow, external dependencies, print, legal ও restore evidence অসম্পূর্ণ। | Supported isolated environment ও পৃথক অনুমতি; Phase 11–12. |

পুরোনো `f:\CODE\Panchagarh\docs\ai\PHASE_0_AUDIT.md`-এর unsigned/default-super-admin, TOTP preview, vendor print এবং sequential tracking সংক্রান্ত findings বর্তমান অবস্থার সরাসরি প্রমাণ নয়; `f:\CODE\Panchagarh\docs\audit\phase-0-reaudit-2026-11-11.md:69-77`-এ সংশোধন আছে। Guard দেখা মানে পূর্ণ security pass নয়।

## নিষিদ্ধ ও conditional integration register

| Feature | প্রমাণ ও lifecycle | কার্যকর সিদ্ধান্ত |
|---|---|---|
| Flash campaign | **CODE_PRESENT**: `f:\CODE\Panchagarh\app\api\admin\workspace\route.ts:735,1343-1345`; service/UI/tests-ও আছে | নিষিদ্ধ; ভবিষ্যৎ reviewed quarantine, ইতিহাস না মুছে |
| Nagad/Rocket | **CODE_PRESENT**: `f:\CODE\Panchagarh\src\lib\validators\index.ts:231`, `f:\CODE\Panchagarh\src\components\storefront\checkout-client.tsx`, `f:\CODE\Panchagarh\supabase\migrations\0001_enums_and_extensions.sql:78-81` | নিষিদ্ধ; শুধু COD/manual bKash |
| RedX | **CODE_PRESENT**: `f:\CODE\Panchagarh\app\api\webhooks\courier\route.ts:24-25,86`, admin schemas | অননুমোদিত; new operations বন্ধের plan ও historical compatibility |
| Pathao/Steadfast | **CODE_PRESENT**; CONNECTED/TESTED/PRODUCTION_READY **VERIFY_REQUIRED** | Official API ও isolated sandbox validation ছাড়া live claim নয় |
| Bangladesh Post | **CODE_PRESENT**; live API **VERIFY_REQUIRED** | API প্রমাণ না হলে manual booking/tracking |
| Supabase/Postgres/storage | **CODE_PRESENT** `f:\CODE\Panchagarh\src\lib\supabase\admin.ts`, migrations; live configuration/connection **VERIFY_REQUIRED** | Production access বা schema state পরীক্ষা হয়নি |
| Google Sheets | **CODE_PRESENT**, inspected handler actual push **NOT_INTEGRATED**, connection **VERIFY_REQUIRED** | External customer export default-off/approval; simulated status risk |
| WhatsApp Cloud, paid SMS/email, Resend/TextBee | `f:\CODE\Panchagarh\.env.example` ও admin integration-এ **CODE/CONFIG REFERENCES PRESENT**; বাস্তব ব্যবহার/দাম/connection **VERIFY_REQUIRED** | অনুমতি, privacy ও cost review ছাড়া connect নয়; manual/deep-link আলাদা |
| Gemini / Google APIs | `f:\CODE\Panchagarh\package.json` dependency/config reference; use/connection **VERIFY_REQUIRED** | Core-বহির্ভূত use approval ছাড়া নয় |
| Marketing pixels, GA/GTM | Scoped static search-এ implementation পাওয়া যায়নি; production bundle **NOT_TESTED** | নিষিদ্ধ; search absence সর্বব্যাপী প্রমাণ নয় |
| Gateway, bundle/combo, fake scarcity | Scoped review-এ পূর্ণ implementation প্রতিষ্ঠিত নয়; **NOT_TESTED** | নিষিদ্ধ; print data structure-এর ‘bundle’ commerce bundle নয় |
| Regular promo | Code আছে; exact policy **VERIFY_REQUIRED** | সাধারণ promo অনুমোদনযোগ্য, নিষিদ্ধ flash/urgency নয় |
| Google Drive media, Google OAuth/custom roles | কিছু legacy proposal; actual connection **VERIFY_REQUIRED** | v3 media, চার role ও অনুমতি ছাড়া external connection নয়; history সংরক্ষিত |

কোনো `CONFIGURED`, `CONNECTED`, `TESTED`, `PRODUCTION_READY` শুধু placeholder/UI/dependency থেকে দাবি করা হয়নি। Production state অজানা।

## Tests — পূর্ববর্তী isolated baseline, এই documentation pass-এ rerun নয়

Evidence: `f:\CODE\panchagarh-final-verification.json`, `f:\CODE\.panchagarh-audit\baseline-hMwJtQ\summary.json`।

| Exact command in isolated copy | Actual result |
|---|---|
| `node.exe --test scripts/tooling/isolated-baseline.test.mjs` | 10 pass, exit 0 |
| `bun.exe test scripts/tooling/isolated-baseline.test.mjs` | 10 pass, exit 0 |
| `bun.exe test` | supplemental 110 pass/0 fail, 24 files, exit 0; কিছু legacy test নিষিদ্ধ behavior অনুমোদন করে; PostgreSQL evidence নয় |
| `node.exe node_modules/eslint/bin/eslint.js .` | exit 0, 0 errors/3 warnings |
| `node.exe node_modules/next/dist/bin/next build` | earlier baseline exit 0; tooling-only edit-এর পরে rerun হয়নি |
| `node.exe node_modules/typescript/bin/tsc --noEmit --incremental false` | exit 2: দুই missing `bun:test` type declaration, একটি `Headers.get` on `never`; fix করা হয়নি |

Real PostgreSQL/RLS/storage/concurrency/restore, browser/accessibility, physical print, courier/payment/SMS এবং production **NOT_TESTED**। Captured Docker Linux engine unavailable। আগের hash check নির্বাচিত 146 original application/config file-এর, পুরো repository নয়। Captured inventory-তে `.git` নেই; Git diff দাবি নয়। Isolated runner OS/network sandbox নয়।

### এই documentation pass-এর preservation check

`f:\CODE\.panchagarh-audit\phase0-reconciliation-20261111\documentation-verification.json` অনুযায়ী audit শুরুর snapshot-এর 188টি non-edited-entry যাচাইয়ে তিনটি পুরোনো master documentation file-এর hash আলাদা পাওয়া গেছে: `f:\CODE\Panchagarh\docs\00_CUSTOM_INSTRUCTION.md`, `f:\CODE\Panchagarh\docs\01_FRONTEND_MASTER_PROMPT.md`, `f:\CODE\Panchagarh\docs\02_BACKEND_MASTER_PROMPT.md`; snapshot-এ থাকা একটি ZIP path-ও পাওয়া যায়নি। এই pass-এ সেগুলো edit/delete করা হয়নি, কারণ এখনো নির্ধারিত নয়; external change, snapshot/path বা encoding সমস্যা হতে পারে। তাই সম্পূর্ণ repository অপরিবর্তিত দাবি করা যাচ্ছে না। বাকি snapshot entries-তে কোনো mismatch রিপোর্ট হয়নি; নতুন বা snapshot-এ না থাকা ফাইল সম্পূর্ণ inventory নয়। ১১টি যাচাইকৃত changed/governance document-এ empty/NUL/merge-marker সমস্যা পাওয়া যায়নি, পাঁচটি status matrix-এ আছে। Terminal PSReadLine completion reporting অস্থির; JSON output পড়েই ফল নিশ্চিত করা হয়েছে, process exit independently নিশ্চিত নয়।

## প্রস্তাবিত Phase 1 — NOT AUTHORIZED / NOT STARTED

1. **P0 containment:** public/SSR DTO allowlist; flash/Nagad/Rocket/RedX new-use quarantine, historical records অক্ষত; simulated courier/Sheets/backup/OTP status বাস্তব success থেকে পৃথক। Financial mutation containment-এর প্রভাব ও প্রয়োজনীয় অনুমোদন আলাদা মূল্যায়ন।
2. **P1 identity/authorization:** server-controlled customer principal, registration/login, সৎ pending phone confirmation, session revocation/CSRF; প্রতিটি API/action-এ role check, vendor admin denial বজায়, vendor API/guard design, customer ownership ও Part 3 role separation। Secure password reset এবং RSC/API field allowlists।
3. **P2 negative tests:** anonymous/expired/revoked; customer A বনাম B, vendor A বনাম B, non-vendor/staff field denial; forged phone/JWT metadata; CSRF/origin/replay/rate limit; DTO redaction ও false integration success। শুধুই isolated synthetic data।
4. **Dependency gate:** DB schema/RLS/storage/journal enforcement আলাদা অনুমোদিত Phase 2, media Phase 3, customer UX v3 Phase 4, vendor portal Phase 5। Real local database tests ছাড়া DB acceptance নয়। Phase 0-তে TypeScript diagnostic fix নয়।
5. **Exit:** scoped tests ও typecheck pass, negative tests pass, বাকি dependency স্পষ্টভাবে reported ও user gate। Production migration/financial action-এর আগে পৃথক approval, backup, dry-run, SQL review ও verified rollback।

## VERIFY_REQUIRED এবং gate

Owner/local professionals: return/refund period, tax/VAT/invoice, agreement/settlement/holding treatment, retention/deletion, phone-confirmation fallback, historical guest-order linking, provider ও print-signature policy। Supported isolated Docker/browser এবং deployed configuration অজানা। Chat-এ কোনো credential নয়। **এখানে থামুন; Phase 1-এর জন্য explicit approval আবশ্যক।**