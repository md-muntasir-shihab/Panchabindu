# v3 A–P requirements reconciliation matrix — 2026-11-11

> **Phase 0 snapshot retained.** User subsequently approved Phase 1; local remediations and exact tests are in `f:\CODE\Panchagarh\docs\audit\v3-phase-1-security-identity.md`. Do not read the old authorization/diagnostic rows as current status, or change grouped rows to exhaustive VERIFIED based on unit tests. Real DB/RLS/storage and production identity remain blocked.

Authority: user's complete `Panchagarh_Codex_Master_Implementation_Specification_v3` supplied in conversation, Sections A–P. This is not the November 6 artifact's unrelated backend module A–P. Latest user instruction > v3 > older project documents on conflict. No local same-named v3 file is asserted. Paths below are absolute; line references are snapshot locators. This is a requirements-level static assessment, not a claim that all individual controls have been dynamically verified. A grouped row's status applies to the group, not proof of each listed bullet. Do not infer deployed state from source or migrations.

Status: **VERIFIED** = specifically stated local fact/test only; **PARTIAL** = some implementation/evidence, material gaps remain; **MISSING** = not located in scoped inspection; **NOT_TESTED** = execution/acceptance not established; **VERIFY_REQUIRED** = owner, legal, provider or deployment fact needed. Groups can include untested sub-items; evidence and limits govern. Integration lifecycle labels (CODE_PRESENT, CONFIGURED, CONNECTED, TESTED, PRODUCTION_READY, NOT_CONNECTED, NOT_INTEGRATED, VERIFY_REQUIRED) are separate from these five primary statuses; never infer connection from placeholders.

## A–C: authority, constraints, tooling and governance

| ID | Requirement | Status | Evidence / limitation | Target |
|---|---|---|---|---|
| A1 | Preserve existing Next.js app; reconcile old reports against current source | VERIFIED | `f:\CODE\Panchagarh\package.json`; `f:\CODE\Panchagarh\docs\audit\phase-0-reaudit-2026-11-11.md`; historical claims are not acceptance | 0 |
| A2 | Full v3 sections and conflicting legacy instructions | PARTIAL | Conversation v3 available; `f:\CODE\Panchagarh\docs\schema.md:81-84` conflicts with B payment/courier policy. Reconciliation is source-based; dynamic acceptance remains open | 0 |
| B1 | Design, tokens, logo, layout freeze | NOT_TESTED | `f:\CODE\Panchagarh\src\styles\tokens.css`; no responsive/browser screenshot comparison or physical visual sign-off | 11 |
| B2 | Four internal roles; separate authenticated customer | PARTIAL | `f:\CODE\Panchagarh\src\types\permissions.ts`; phone session exists, durable customer principal and complete isolation unproven | 1–2 |
| B3 | COD and manual bKash exclusively | PARTIAL | `f:\CODE\Panchagarh\src\lib\validators\index.ts:231` also accepts Nagad/Rocket; conflicting current behavior | 1,4,8 |
| B4 | Pathao, Steadfast, Bangladesh Post only | PARTIAL | `f:\CODE\Panchagarh\app\api\webhooks\courier\route.ts:24-25` also accepts RedX; real integrations untested | 1,9 |
| B5 | Integer Poisha, payable/margin formulas, balanced append-only ledger, reversals | PARTIAL | `f:\CODE\Panchagarh\src\lib\money.ts`; `f:\CODE\Panchagarh\supabase\migrations\0008_phase2_schema_rls_and_gl_completion.sql:237-280`; database line-sum/finality and JSON persistence risks | 2,8 |
| B6 | No pixels/marketing tracking, flash/urgency, bundle/combo, gateways, paid-by-default SaaS | PARTIAL | `f:\CODE\Panchagarh\app\api\admin\workspace\route.ts:735,1343-1345` has flash operation. Static searches did not prove runtime absence of all other prohibited behavior | 1,4,7 |
| B7 | Legal escrow, finance/tax/consumer obligations | VERIFY_REQUIRED | Internal holding ledger is not legal escrow; independent Bangladesh legal/accountant review required | 8,12 |
| C1 | Environment inventory and project-local governance/skills | PARTIAL | `f:\CODE\Panchagarh\docs\ai\TOOLING_REGISTRY.md`; local governance/skills exist; official Supabase skills staged externally, NOT ENABLED | -1 |
| C2 | Official CLI, Playwright, compatibility, cost; no unnecessary plugins | PARTIAL | `f:\CODE\Panchagarh\docs\ai\TOOLING_REGISTRY.md`; CLI/browser installation and full compatibility not established; staged hashes are not full security certification | -1,11 |
| C3 | MCP project-scope, read-only, no OAuth/production without approval | VERIFIED | Prior local audit records NOT_CONFIGURED / NOT_CONNECTED in `f:\CODE\Panchagarh\docs\ai\TOOLING_REGISTRY.md`; no remote inspection attempted | -1 |
| C4 | AGENTS, state, decisions, questions, registry, changelog and phase handoff | PARTIAL | `f:\CODE\Panchagarh\AGENTS.md`, `f:\CODE\Panchagarh\docs\ai\`; historical handoffs remain, ongoing maintenance needed | -1,0 |

## D: Customer storefront and account

| ID | Requirement | Status | Evidence / limitation | Target |
|---|---|---|---|---|
| D1 | Home, search, category, product, cart, checkout, tracking, account | PARTIAL | `f:\CODE\Panchagarh\app\shop\page.tsx`, `f:\CODE\Panchagarh\app\search\page.tsx`, `f:\CODE\Panchagarh\app\checkout\page.tsx`; route presence is not workflow acceptance | 4 |
| D2 | Phone-first, 44px touch, accessibility, low bandwidth, loading/empty/error/offline/retry | NOT_TESTED | `f:\CODE\Panchagarh\src\components\storefront\`; viewport, keyboard, network and performance acceptance not run | 4,11 |
| D3 | Browse/cart as guest; authenticate before final order; cart resume | PARTIAL | `f:\CODE\Panchagarh\app\api\orders\route.ts:38-88` guards by session/phone; stable customer ID, functional production registration and cart-resume E2E not established | 1,4 |
| D4 | Phone ownership verification or honest pending staff call; no false OTP | PARTIAL | `f:\CODE\Panchagarh\src\lib\security\crypto-session.ts:587-650`; live provider absent, operational alternative unverified | 1,4 |
| D5 | Profile, email, auth settings, sessions, saved/default addresses | PARTIAL | `f:\CODE\Panchagarh\src\components\storefront\account-client.tsx`; full persistent authenticated profile/address/session flows not established | 1,4 |
| D6 | Wishlist and persistent cart across sessions/devices | PARTIAL | `f:\CODE\Panchagarh\src\store\use-wishlist-store.ts` browser-local; authenticated cross-device persistence unproven | 4 |
| D7 | Own orders, details, payment, timeline, courier tracking, receipt | PARTIAL | `f:\CODE\Panchagarh\app\api\account\orders\route.ts`; identity phone-based and end-to-end ownership not proven | 1,4 |
| D8 | Own cancellation, returns/refunds, support, notifications, privacy requests | PARTIAL | `f:\CODE\Panchagarh\app\api\orders\cancellation-request\route.ts`, `f:\CODE\Panchagarh\app\api\orders\return-request\route.ts`; complete customer-owned flows and privacy export/deletion not established | 4,9 |
| D9 | Only delivered verified purchase may review | PARTIAL | `f:\CODE\Panchagarh\app\api\reviews\route.ts:9-33`, `f:\CODE\Panchagarh\src\lib\db\repository.ts:2032-2048`: user-submitted phone and any non-cancelled order used without route session; no delivered check | 1,4 |
| D10 | Bangladesh phone/address structure, landmark, BN/EN, charge preview | PARTIAL | `f:\CODE\Panchagarh\src\lib\validators\index.ts`; geographic coverage and workflow validation not fully tested | 4 |
| D11 | Customer privacy: no cross-customer phone lookup; masked public tracking | PARTIAL | `f:\CODE\Panchagarh\src\lib\db\repository.ts:1888` opaque token logic; real ownership and SSR/client DTO leak testing incomplete | 1,4 |

## E: product media and catalog import

| ID | Requirement | Status | Evidence / limitation | Target |
|---|---|---|---|---|
| E1 | Device image picker/camera/gallery, multi-select, drag/drop; URL not primary | MISSING | `f:\CODE\Panchagarh\src\components\admin\product-studio-panel.tsx` currently URL-focused; no complete device upload path located | 3 |
| E2 | Progress/retry/cancel, previews, cover/reorder/replace, variant images, alt text, dimensions, bulk | PARTIAL | URL/gallery fields exist in `f:\CODE\Panchagarh\src\components\admin\product-studio-panel.tsx`; full upload management not established | 3 |
| E3 | JPEG/PNG/WebP, 5 MiB, magic bytes, safe name, dimensions, decode/re-encode, EXIF strip | PARTIAL | `f:\CODE\Panchagarh\src\lib\media\product-image-precheck.ts:14`; isolated header precheck only, not trusted decoder or integrated upload | 3 |
| E4 | Private staging, owner-derived vendor paths, object RLS, approved-only promotion to public | MISSING | `f:\CODE\Panchagarh\supabase\migrations\0008_phase2_schema_rls_and_gl_completion.sql:719-720,843-846`: public metadata read and bucket definitions; reviewed migrations show no complete storage.objects upload policy/promotion flow | 2–3 |
| E5 | Private evidence/vendor documents and restricted downloads | NOT_TESTED | Private bucket declaration at same migration `:843-846`; live policies, signed URLs and cross-tenant denial not tested | 2–3 |
| E6 | bucket/object metadata, approval, legacy URL compatibility and non-destructive migration | PARTIAL | `f:\CODE\Panchagarh\supabase\migrations\0008_phase2_schema_rls_and_gl_completion.sql:28-62`; current URL metadata insufficient to prove staged approval workflow | 2–3 |
| E7 | Upload limits/rate limit, duplicate hashes, orphan cleanup | MISSING | No complete integrated workflow found in scoped review; do not treat header check as security control | 3 |
| E8 | Product draft, variants, own vendor proposals, admin publish and price approval | PARTIAL | `f:\CODE\Panchagarh\src\components\admin\product-studio-panel.tsx`; dedicated vendor submissions and end-to-end approval absent | 3,5 |
| E9 | CSV import preview/mapping/validation, filename+SKU mapping, dry-run and errors, no silent overwrite | PARTIAL | Catalog/admin import-related code exists; direct-media mapping, isolated dry-run and full user flow not demonstrated | 3 |
| E10 | ZIP import optional, traversal/bomb/count protection if enabled | VERIFY_REQUIRED | Optional feature; absent safe archive validation means do not enable | 3 |

## F: dedicated vendor portal

| ID | Requirement | Status | Evidence / limitation | Target |
|---|---|---|---|---|
| F1 | Separate login, layout, /vendor and all products/consignments/orders/shipments/returns/finance/statements/notifications/support/profile routes | MISSING | Route inventory `f:\CODE\.panchagarh-audit\phase0-reconciliation-20261111\inventory.json:50-77` contains no vendor page | 5 |
| F2 | Own KPI dashboard, meaningful empty states and notifications | MISSING | No dedicated portal route in same inventory; existing admin panel is not the required vendor workspace | 5 |
| F3 | Own product drafts/media/variants, submit/approve/reject and price proposal | PARTIAL | `f:\CODE\Panchagarh\src\components\admin\phase7-portal-panel.tsx` has some related admin workspace functionality; not a standalone isolated vendor lifecycle | 3,5 |
| F4 | Consignment/challan/QC/stock/movements; vendor cannot finalize QC | PARTIAL | `f:\CODE\Panchagarh\src\lib\admin\phase4c-service.ts`; dedicated portal, storage permissions and denial tests absent | 5–6 |
| F5 | Assigned order lines, limited PII, shipment, returns/claims only; no global status/refund | PARTIAL | `f:\CODE\Panchagarh\src\lib\admin\phase4b-service.ts`; service-level filtering does not prove isolated APIs or negative tests | 1,5,9 |
| F6 | Own payable/holding/statement/settlement request, immutable read-only ledger | PARTIAL | `f:\CODE\Panchagarh\src\lib\money.ts` and `f:\CODE\Panchagarh\src\lib\admin\phase4b-service.ts`; finance correctness and portal acceptance unproven | 5,8 |
| F7 | Own support, notifications, profile, contracts, protected KYC/bank documents | MISSING | Complete dedicated flow and private tenant-owned document implementation not established by inspected routes | 5 |
| F8 | Server-derived vendor_id, isolated API/RPC/RLS/storage; no admin workspace | PARTIAL | `f:\CODE\Panchagarh\src\types\permissions.ts:357`; admin workspace guard exists, DB view/grant and cross-vendor tests remain unverified | 1–2,5 |

## G: admin dashboard and order operations

| ID | Requirement | Status | Evidence / limitation | Target |
|---|---|---|---|---|
| G1 | Operational/financial KPIs with correctly explained formulas | PARTIAL | `f:\CODE\Panchagarh\src\components\admin\admin-erp-client.tsx`; data source/finance integrity and all formulas not verified | 7–8 |
| G2 | Group navigation and role-aware controls | PARTIAL | `f:\CODE\Panchagarh\src\types\permissions.ts`, `f:\CODE\Panchagarh\src\components\admin\admin-erp-client.tsx`; permission/action coverage incomplete | 1,7 |
| G3 | Preserve complete order-grid field/action inventory, filters, sorting, server pagination, bulk | PARTIAL | `f:\CODE\Panchagarh\src\components\admin\orders-grid-panel.tsx`; full field/action inventory and server-side pagination acceptance not completed | 7 |
| G4 | Mobile order cards/drawer/sticky controls, 360px no overflow, 44px | NOT_TESTED | `f:\CODE\Panchagarh\src\components\admin\orders-grid-panel.tsx`; no supported browser viewport tests | 7,11 |
| G5 | Low-risk one-click; high-risk confirmation/maker-checker | PARTIAL | `f:\CODE\Panchagarh\src\lib\admin\phase4a-service.ts`; complete per-action permission, confirmation and separation of duties not established | 1,7–8 |
| G6 | Product Studio gallery/import/approval, pricing and stock, audit | PARTIAL | `f:\CODE\Panchagarh\src\components\admin\product-studio-panel.tsx`; direct media/import and vendor review not complete | 3,7 |
| G7 | Public DTO excludes supplier cost/profit/margin/internal SKU and sensitive settings | PARTIAL | `f:\CODE\Panchagarh\src\lib\db\repository.ts:1290-1305`, `f:\CODE\Panchagarh\app\page.tsx:10-17`: raw settings cross to client despite API sanitizer; inspect serialized payloads | 1,4 |
| G8 | Admin 360/390/768/1024/1440, no action loss and incremental refactor | NOT_TESTED | No browser/responsive regression evidence for `f:\CODE\Panchagarh\src\components\admin\admin-erp-client.tsx` | 7,11 |

## H: A4 print

| ID | Requirement | Status | Evidence / limitation | Target |
|---|---|---|---|---|
| H1 | Customer/courier, packaging/vendor, Admin/Accounts-only Part 3; no cross-vendor/cost leak | PARTIAL | `f:\CODE\Panchagarh\src\lib\admin\phase4b-service.ts:680-900`; vendor denied shared bundle, but staff-role and copy-specific authorization require proof | 1,10 |
| H2 | A4 orientation/theme/logo/header/footer/typography/margins, columns and per-copy fields | PARTIAL | `f:\CODE\Panchagarh\src\components\admin\print-engine-panel.tsx`; UI exists; complete settings validation/authorization not established | 10 |
| H3 | QR/barcode/signature, page breaks, queue/history/reprint reason/template versions and authorization | PARTIAL | Same print panel and `f:\CODE\Panchagarh\src\lib\admin\phase4b-service.ts`; full per-copy permissions/history acceptance untested | 10 |
| H4 | Color/ink-saving, CSS color-adjust, help; 4×6 preserve; browser PDF and physical output | NOT_TESTED | `f:\CODE\Panchagarh\src\styles\tokens.css`, print panel; CSS cannot force printer hardware color; no browser/printer test | 10–11 |
| H5 | Signature and retention | VERIFY_REQUIRED | Owner/legal policy needed; no inferred legal retention period | 10,12 |

## I–J: Bangladesh operations and prioritization

| ID | Requirement | Status | Evidence / limitation | Target |
|---|---|---|---|---|
| I1 | Fake order/RTO risk, duplicate order/customer, explainable human review and appeal | PARTIAL | `f:\CODE\Panchagarh\src\lib\admin\phase4a-service.ts`; all review/appeal fairness and privacy controls not established | 6–7,9 |
| I2 | Remittance shortfall, bKash duplicate/fake TrxID, vendor payout disputes | PARTIAL | `f:\CODE\Panchagarh\src\lib\admin\phase4b-service.ts`, `f:\CODE\Panchagarh\app\api\payments\manual-bkash\submissions\route.ts`; no real provider/finance verification | 8–9 |
| I3 | Late stock, QC/counterfeit, negative inventory, price disputes, partial delivery/returns, lost/damaged parcel | PARTIAL | `f:\CODE\Panchagarh\src\lib\inventory\phase3-inventory-order-engine.ts`; concurrency, evidence and complete workflows not accepted | 6,9 |
| I4 | Complaints/refund escalation, address, employee abuse, cash-flow visibility | PARTIAL | `f:\CODE\Panchagarh\src\lib\admin\phase7-service.ts`; ownership, permission and finance invariants require tests | 1,7–9 |
| I5 | Recoverable backup/restore, quota and privacy retention | PARTIAL | `f:\CODE\Panchagarh\src\lib\admin\phase6-service.ts:1228-1254` stores checksum/count metadata in inspected handler, not verified restorable payload | 3,12 |
| I6 | VAT/tax, invoicing, legal agreements, refund window, consumer/data retention | VERIFY_REQUIRED | Owner and Bangladesh legal/accounting professional decisions; not inferred from code | 8,12 |
| J1 | Core before extras; recommendations/BI/PWA/ZIP/SMS optional | PARTIAL | Current code contains extras and prohibited conflicts; no claim that core prerequisites are done | 1–12 |

## K–P: phase sequence, mandatory tests, integration register, controls and reporting

| ID | Requirement | Status | Evidence / limitation | Target |
|---|---|---|---|---|
| K1 | Phase -1/0 then 1–12 with user gates; v3 Phase 4 is Customer Account & Storefront | PARTIAL | `f:\CODE\Panchagarh\docs\ai\PHASE_STATUS.md`; historical partial later-phase work retained; current Phase 1 not authorized | 0 |
| L1 | Anonymous, cross-customer, cross-vendor, non-vendor, staff field and revoked session denial | NOT_TESTED | `f:\CODE\Panchagarh\src\lib\security\customer-route-guards.test.ts` covers only some local cases; no full DB/API cross-tenant suite | 1,11 |
| L2 | Upload abuse, private object, staging approval and CSV/ZIP tests | NOT_TESTED | `f:\CODE\Panchagarh\src\lib\media\product-image-precheck.test.ts` covers header/size only | 2–3,11 |
| L3 | Authenticated order/cart, persistent wishlist, own order/payment/return/support | NOT_TESTED | `f:\CODE\Panchagarh\app\api\orders\route.ts`; no full customer E2E | 1,4,11 |
| L4 | Vendor portal approval/PII/QC/settlement isolation | NOT_TESTED | No dedicated vendor route in `f:\CODE\.panchagarh-audit\phase0-reconciliation-20261111\inventory.json` | 1,5,11 |
| L5 | Concurrent stock, idempotency, bKash verification, COD/remittance, balanced immutable journals, maker-checker, returns | NOT_TESTED | `f:\CODE\Panchagarh\supabase\migrations\0008_phase2_schema_rls_and_gl_completion.sql:237-280`; real multi-session DB and financial acceptance not run | 2,6,8,11 |
| L6 | 360/390/768/1024/1440 responsive, accessibility, A4 and copy separation, color/grayscale | NOT_TESTED | No browser/physical evidence; local unit success is not viewport or printer acceptance | 10–11 |
| M1 | Integration statuses separately CODE_PRESENT/CONFIGURED/CONNECTED/TESTED/PRODUCTION_READY | PARTIAL | `f:\CODE\Panchagarh\docs\ai\TOOLING_REGISTRY.md`, `f:\CODE\Panchagarh\docs\audit\v3-phase-0-reconciliation.md`; source/config does not prove live connectivity | 0,9,12 |
| M2 | Conditional approved providers and quarantine RedX, WhatsApp Cloud, paid messaging, Sheets, Gemini, trackers/gateways/flash | PARTIAL | `f:\CODE\Panchagarh\app\api\admin\workspace\route.ts:612,1343`, `f:\CODE\Panchagarh\src\lib\admin\phase4c-service.ts:1370-1442`; code still present; no quarantine performed | 1,9 |
| N1 | Least privilege, no secrets, untrusted input, SSRF, rate limit, backups, audit, no unhackability promise | PARTIAL | `f:\CODE\Panchagarh\src\lib\security\crypto-session.ts:820,905`; in-memory rate buckets; backup is metadata; broader controls unverified | 1–3,12 |
| N2 | No production reset/deploy/migration/payment/account connection without approval, backup, dry-run, rollback | VERIFIED | This Phase 0 continuation performs documentation/static work only; prior isolated baseline is not production execution | 0 |
| O1 | Phase report: files, database, exact commands, actual tests, security, gaps, questions, next proposal | PARTIAL | `f:\CODE\Panchagarh\docs\audit\v3-phase-0-reconciliation.md`; reports distinguish historical baseline and present validation; untested checks remain open | 0 |
| P1 | Bootstrap/Phase 0 then stop and obtain explicit Phase 1 approval | VERIFIED | Current scope expressly excludes Phase 1 implementation; see `f:\CODE\Panchagarh\docs\ai\PHASE_STATUS.md` | 0 |

## Coverage limits

The grouped rows trace v3 sections A–P and eight requested domains, including test and operations acceptance. They are not a demonstrated one-row-per-bullet exhaustive proof: implementation of every subfeature in large grouped rows, all historical integrations, and production behavior remains explicitly NOT_TESTED/VERIFY_REQUIRED. Further decomposition and negative testing are required before any claim of full compliance. Legal, provider and live-deployment facts cannot be resolved from this repository.