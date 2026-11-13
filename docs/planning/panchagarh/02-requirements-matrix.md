# 02 — Requirements Matrix ও Conflict Register

**অবস্থা কোড:** `PRESENT` (কার্যকর ও প্রমাণিত), `PARTIAL` (আংশিক / ভিন্ন shape), `MISSING`, `UNVERIFIED` (কোড আছে কিন্তু প্রমাণ নেই বা external), `CONFLICT` (স্পেসিফিকেশন বনাম কোড/ব্যবহারকারী-সিদ্ধান্ত)।
**Level:** [README](README.md) legend (`INSPECTED` / `STATIC_VERIFIED` / `TESTED_LOCAL` / `UNVERIFIED` / `VERIFY_REQUIRED`)।
**Source:** FE = Frontend Master Prompt, FE-V2 = Frontend blueprint addendum, BE = Backend Master Prompt (§ নম্বর), BE-V2 = Backend blueprint addendum, MAP = Integration Map v2.0, PAY = Payment Schema Addendum।

Path সংক্ষেপ: `api/` = `artifacts/api-server/imported/`, `web/` = `artifacts/panchagarh/src/`, `sql/` = `artifacts/api-server/supabase/migrations/`।

## A. Business model ও money

| ID | Requirement | Source | অবস্থা | Evidence | Level | পরবর্তী কাজ |
|---|---|---|---|---|---|---|
| A1 | Consignment 3-tier split: supplier cost + supplier profit = supplier payable; + platform margin = sale price | BE §2.2 | PRESENT | `ThreeTierPriceSnapshot` (`api/src/types/domain.ts`); read-time snapshot invariant `ORDER_PRICE_SNAPSHOT_INVALID` (`repository.ts` `readErpState`) | INSPECTED + `test:domain` | DB-level CHECK normalized schema-তেই আছে; runtime doc-store-এ নেই (Phase C) |
| A2 | সব টাকা integer paisa; কোনো float নয় | BE §4.1 | PRESENT (naming ভিন্ন) | `Poisha = number`, `assertIntegerPoisha`, SQL `*_poisha BIGINT`, RPC `erp_validate_runtime_values` integer check | INSPECTED | Spec `*_paisa`; code `*_poisha`। **একটি canonical naming রাখতে হবে** — proposal: বিদ্যমান `poisha` বজায়, নতুন টেবিলে alias নয় (Decision D-07) |
| A3 | API-তে amount integer string | BE §4.1 | PARTIAL | API JSON-এ `number` (safe integer) পাঠানো হয় | INSPECTED | Backward-compatible রাখতে number রাখা হোক; decision D-07 |
| A4 | Immutable line snapshot | BE §9.1 | PRESENT | `orderLines.snap*Poisha`; read-time validation throws | INSPECTED | — |
| A5 | Supplier cost/profit/margin কখনো customer-facing নয় | BE §24 | PRESENT | `CUSTOMER_FORBIDDEN_FIELDS`, DTO serializer (`permissions.ts`), public views `v_storefront_products` | INSPECTED; `test:migration` public data check | Vendor-side `maskCustomerPiiForVendor` আছে |

## B. Payment

| ID | Requirement | Source | অবস্থা | Evidence | Level | পরবর্তী কাজ |
|---|---|---|---|---|---|---|
| B1 | শুধু COD + manual bKash; gateway নেই | BE §2.3, user | PRESENT | `createStorefrontOrder` ও `submitManualBkashPayment` non-bKash reject; `chk_orders_approved_payment_methods` (sql/0008) | INSPECTED | — |
| B2 | Manual bKash fields (configurable number, instructions, sender phone, TrxID, amount, timestamp, status, verified by/time, rejection reason, evidence optional) | BE §2.3, §11.2 | PARTIAL | `siteSettings.bkashManualNumber/bkashInstructionBn/En`; `manual_payment_submissions` (sql/0008) ও runtime `ManualBkashSubmissionRecord` — **evidence file নেই**, `transaction_at` নেই | INSPECTED | Phase D: additive `evidence_object_path`, `transaction_at` |
| B3 | Payment কখনো auto-verified নয় | BE §2.3 | PRESENT | Route header "Never auto-verifies"; `reviewManualBkashSubmission` reviewer role guard | INSPECTED | — |
| B4 | Duplicate TrxID guard | BE §11.2, PAY | PRESENT | `createStorefrontOrder` 1b; `submitManualBkashPayment` `DUPLICATE_TRX_ID`; SQL partial unique index `uq_manual_payment_active_trx_id` | INSPECTED | Provider-namespaced uniqueness (PAY) Phase D |
| B5 | Maker-checker on approval | BE §10.5 | PRESENT | `checkMakerCheckerSeparation`; SQL `chk_manual_bkash_maker_checker` | INSPECTED | Owner threshold config (BE-V2 C.9) MISSING → Phase D |
| B6 | Approval → verified transaction + journal in one idempotent tx | BE-V2 C.10, PAY | PARTIAL | Approval `postVerifiedManualBkashPaymentJournal` কল করে; আলাদা `payment_transactions` entity নেই; atomicity runtime single-document commit দিয়ে | INSPECTED | Phase D |
| B7 | Payment status আলাদা state group (12-state) | BE §9.3, BE-V2 F | PARTIAL / CONFLICT | Runtime submission status: `pending_verification/under_review/approved/rejected/reversed`; order-level `paymentStatus` enum SQL: `unpaid/partial_verified/paid_verified/remitted/refunded` (`remitted` = courier collection state মিশে আছে) | INSPECTED | Mapping table [04 §4](04-schema-api-contract.md) — rename নয়, derived view |
| B8 | Provider registry `payment_methods` | PAY, BE-V2 A | MISSING | কোনো টেবিল/document নেই; method hardcoded union `'cod' \| 'bkash_manual'` (frontend `checkout-client`, backend validators) | STATIC_VERIFIED | Phase D additive |
| B9 | `payment_submissions`/`payment_transactions`/`payment_verifications`/`payment_provider_events`/reconciliation tables | PAY | PARTIAL | `manual_payment_submissions` ≈ submissions+verification merged; `courier_webhook_events` ≈ provider events (courier only); reconciliation শুধু courier remittance (phase6) | INSPECTED | [04 §2](04-schema-api-contract.md) |
| B10 | Rocket/Nagad candidates; "National" ambiguous; none enabled | MAP §4 | PARTIAL | SQL enum-এ `nagad_manual`, `rocket_manual` আছে কিন্তু CHECK ও runtime reject করে — সঠিক আচরণ | INSPECTED | **Decision D-01, D-02** |
| B11 | `GET /api/payments/methods`, `POST /api/payments/submissions`, `GET /api/account/payments`, admin review/reconcile endpoints | BE-V2 §5 | MISSING (equivalent আংশিক) | বিদ্যমান: `POST /api/payments/manual-bkash/submissions`; admin review `workspace` operation `MANUAL_BKASH_*`; `MFS_INPUT_*` operation (staff-entered MFS) | STATIC_VERIFIED | Versioned compatibility plan [04 §6](04-schema-api-contract.md) |
| B12 | Refund management (maker-checker) | BE §11.3 | PARTIAL | `customer_refund_executions` (sql), phase3 payment reversal, phase7 refund | INSPECTED | Test coverage `UNVERIFIED` (test না চলা) |

## C. Ledger ও finance

| ID | Requirement | Source | অবস্থা | Evidence | Level | পরবর্তী কাজ |
|---|---|---|---|---|---|---|
| C1 | Double-entry, debit=credit | BE §10.1 | PRESENT | GL engine (`finance/phase4-general-ledger-engine.ts`); SQL `chk_journal_entry_balanced` + trigger `UNBALANCED_JOURNAL` (sql/0009) | `test:domain` (ledger test) | DB trigger runtime path-এ inactive (doc-store) |
| C2 | Immutable posted journal; correction শুধু linked reversal | BE §10.6 | PRESENT | `ledger_reversal_requests` (sql); trigger `POSTED_JOURNAL_IMMUTABLE`; review guard "অনুমোদিত লেজার রিভার্সাল প্রক্রিয়া ব্যবহার করুন" | INSPECTED | — |
| C3 | Supplier holding ledger Pending→Locked→Available (7-day) | BE §10.3 | PRESENT | phase4b escrow ledger; phase7 maturity promoter; `escrow_bucket` enum | INSPECTED (unit tests not wired) | Legal notice "not bank escrow" code-এ আছে — ভালো |
| C4 | COD lifecycle: receivable → courier remittance → reconciled | BE §10.4A | PRESENT | phase4b short-payment detector, phase6 remittance reconciliation, `courier_remittance_ledger` | INSPECTED | Live courier data `UNVERIFIED` |
| C5 | Settlement/payout request → approve → record | BE §10.4C | PRESENT | `payout_requests`, phase4b payout flow, phase7 fee calculator | INSPECTED | — |
| C6 | Chart of accounts/tax treatment professional sign-off | BE §10.2 | VERIFY_REQUIRED | phase7 VAT 500bp on margin hardcoded assumption | INSPECTED | Decision D-09 |
| C7 | Reconciliation queue when posting fails; never Paid while journal failed | MAP §6 | PARTIAL | Single-document commit → approval ও journal একসাথে fail/succeed; আলাদা queue নেই | INSPECTED | Doc-store-এ atomic by construction; normalized schema-তে outbox দরকার (Phase G) |

## D. Identity, RBAC, security

| ID | Requirement | Source | অবস্থা | Evidence | Level | পরবর্তী কাজ |
|---|---|---|---|---|---|---|
| D1 | ঠিক ৪টি role, fifth নয় | BE §2.5 | PRESENT | `APPROVED_SYSTEM_ROLES` = super_admin, vendor, marketing_manager, packaging_manager | STATIC_VERIFIED | — |
| D2 | "Accounts" column in data boundary | MAP §5 | CONFLICT | MAP-এ Accounts আলাদা actor; BE §2.5 fifth role নিষিদ্ধ; code-এ `customOverrides` per-module permission আছে | INSPECTED | **Decision D-03**: Accounts = super_admin permission subset, role নয় |
| D3 | Staff auth: username+password+TOTP, lockout, first-login change | BE §20.1 | PRESENT | phase4a Module P; `admin/auth` route | `test:sandbox` (2FA off) | Production MFA Decision D-04 |
| D4 | Supabase Auth as identity provider | BE §3.1, MAP §2 | CONFLICT (non-binding) | নিজস্ব auth; `customers.auth_user_id` column unused | INSPECTED | বর্তমান auth বজায়; Decision D-04 |
| D5 | Customer light account (phone OTP, no password) | FE §7 | PRESENT | `/api/account/orders` OTP actions | `test:sandbox` | SMS provider `NOT_INTEGRATED` — Decision D-05 |
| D6 | Session HttpOnly/Secure/SameSite; CSRF; rate limit | BE §20.5 | PRESENT | `crypto-session.ts`, `verifyOriginAndCsrf`, `checkRateLimit` (in-memory) | INSPECTED; `test:migration` auth guard | Rate limiter in-memory → multi-instance `UNVERIFIED` |
| D7 | RLS enforced for every table | BE §20.4 | PARTIAL / CONFLICT | ৫৩ টেবিলে RLS policy SQL-এ; runtime `erp_runtime_state` service-role only → RLS runtime data-তে প্রযোজ্য নয় | INSPECTED | [03](03-identity-data-boundary.md); Phase B |
| D8 | Cross-vendor access → 404 | BE §5.2 | PRESENT | `permissions.ts` header rule; vendor overview scoped | INSPECTED (tests not wired) | Wire phase4a tests (Phase I) |
| D9 | Field-level hiding server-side | BE §5.5 | PRESENT | `ModulePermissionRule.hiddenFields/maskedFields`, DTO serializer | INSPECTED | — |
| D10 | Service-role key never in browser | BE §20.3 | PRESENT | supabase client শুধু server (`lib/supabase/admin.ts`); frontend `import type` only (replit.md) | STATIC_VERIFIED | — |
| D11 | Immutable audit log for every mutation | BE §20.7 | PRESENT | `appendImmutableAuditLog`, `audit_logs` | INSPECTED | — |
| D12 | Public tracking token (no sequential ORD enumeration) | BE §21.1 | PRESENT | `getPublicOrderTrackingByToken`, `SEQUENTIAL_ORDER_NO_FORBIDDEN`; logged-in owner fallback (page-data) | INSPECTED; `test:migration` | — |

## E. Catalog, media, inventory, orders

| ID | Requirement | Source | অবস্থা | Evidence | Level | পরবর্তী কাজ |
|---|---|---|---|---|---|---|
| E1 | Product approval workflow, vendor proposals | BE §15.1 | PRESENT | phase7 `vendor_price_proposals`, `supplier_product_offers` | INSPECTED | — |
| E2 | Direct media upload (URL-only replace), private staging → approved public | MAP §7, BE §20.6 | PARTIAL | `POST /api/media`: sharp precheck, WebP, `product-staging` bucket, rollback on tx fail; approve→public promote step `VERIFY_REQUIRED`; product-studio panel upload UI আছে কি না `UNVERIFIED` | INSPECTED | Phase F/H |
| E3 | Stock reservation, zero oversell, concurrency lock | BE §8.3–8.4 | PARTIAL | phase3 engine; `runWithAtomicStockLock` in-process; Postgres mode optimistic revision | INSPECTED (phase3 test not wired) | Multi-instance row-lock/conditional update (Phase F) |
| E4 | Consignment lot → QC → stock increment | BE §8 | PRESENT | phase7 LOT queue, phase4c QC receipt, `consignment_dispatch_lots` | INSPECTED | — |
| E5 | Multi-vendor fulfillment groups, partial ops | BE §9.5 | PRESENT | `buildAndPersistOrderFulfillmentGroups`, VFG | INSPECTED | — |
| E6 | 23-state order machine with history (prev/new/actor/ts/reason/event) | BE §9.2 | PARTIAL / CONFLICT | SQL `order_status` ৯ values; runtime 5 orthogonal dimensions (`computeOrthogonalOrderState`) | INSPECTED | **Rename নয়**: mapping + history table additive ([04 §4](04-schema-api-contract.md)) |
| E7 | Idempotency key on order create | BE §21.4 | PRESENT | key + payload hash; customer-scoped prefix | INSPECTED | — |
| E8 | Server-side pricing/delivery calculation | FE §5, BE §3.2 | PARTIAL | Order total server-side; **checkout delivery preview client-side** `calculateDeliveryCharge` import (`web/components/storefront/checkout-client.tsx`) | INSPECTED | Preview endpoint বা page-data-এ server quote (Phase F; frontend allowlist) |
| E9 | Promo validation server-side | FE §5 | PRESENT | `POST /api/promo/validate` | INSPECTED | — |
| E10 | Abandoned cart recovery | FE §11 | PRESENT | `/api/cart/abandoned`, phase6 CRM | INSPECTED | — |
| E11 | Verified-purchase reviews with moderation | FE §8 | PRESENT | `/api/reviews`, phase6 moderation | INSPECTED | — |

## F. Courier, returns, print, notifications, jobs

| ID | Requirement | Source | অবস্থা | Evidence | Level | পরবর্তী কাজ |
|---|---|---|---|---|---|---|
| F1 | Pathao/Steadfast adapters only with real credentials; no fake API | BE §2.4, §12 | PRESENT | `allowLiveBooking:false`, `LIVE_COURIER_BOOKING_LOCKED`, `SANDBOX_SIMULATION` mode tagged | INSPECTED (unit test exists) | Decision D-06 |
| F2 | Bangladesh Post manual workflow | BE §12.4 | PRESENT | adapter header "100% honest manual" | INSPECTED | — |
| F3 | Webhook signature/replay/idempotency | BE §12.5 | PRESENT | HMAC fail-closed, timestamp window, dedupe; `courier_webhook_events` | INSPECTED | Wire tests (Phase I) |
| F4 | Return/refund/RTO/claims | BE §9.4, BE-V2 3.10 | PRESENT | `return_cases`, `courier_claims`, 4-way fault engine | INSPECTED | — |
| F5 | Three-part A4 print with copy isolation (customer/warehouse/accounts) | BE §17 | PRESENT | phase4b print engine, `print-engine-panel.tsx`, `GET /api/print/:orderNo`, `print_logs` | INSPECTED | Leakage test (Phase I) |
| F6 | Notifications non-blocking; OTP redacted in logs | BE §19 | PRESENT | phase5 engine; provider failure never aborts tx | INSPECTED (unit test exists) | — |
| F7 | Transactional outbox for events | MAP §3 | MISSING | ইভেন্ট implicit (function calls in same commit); `outbox_events` টেবিল নেই; phase5 webhook queue শুধু courier | STATIC_VERIFIED | Phase C/G — doc-store-এ outbox document additive |
| F8 | Background jobs (reservation expiry, maturity promoter, cron dashboard) | BE §19 | PARTIAL | Logic exists (phase7 promoter, phase4c cron dashboard); scheduler/runner `UNVERIFIED` | INSPECTED | Phase H |

## G. Frontend (Customer Store / Account / Vendor / Admin)

| ID | Requirement | Source | অবস্থা | Evidence | Level | পরবর্তী কাজ |
|---|---|---|---|---|---|---|
| G1 | Single token source, no hardcoded hex, one Button/Card/Badge system | FE tokens, §7 | PRESENT | `web/components/ui/primitives.tsx`, `styles/` tokens | INSPECTED; `typecheck` | Hex audit grep Phase I |
| G2 | Admin-configurable homepage sections, hero, trust badges | FE §1 | PRESENT | `HomepageSectionConfig`, `HeroBannerSlide`, `TrustBadgeItem`, storefront-content-panel | INSPECTED | — |
| G3 | Listing/filter/sort, search | FE §2, §9 | PRESENT | shop-catalog-client, phase6 facets | INSPECTED; `test:shopping` | — |
| G4 | PDP with reviews, JSON-LD, delivery estimate | FE §3 | PRESENT | product-detail-client, `buildVerifiedProductJsonLd` | INSPECTED | — |
| G5 | Cart drawer, optimistic add, persist | FE §4 | PRESENT | `use-cart-store` persist | `test:shopping` | — |
| G6 | Cart-through-login (cart survives login) | FE-V2 2.4–2.5 | PRESENT | Zustand persist independent of session | `test:shopping` refresh persistence | Post-login redirect back to checkout `UNVERIFIED` |
| G7 | Checkout single-page accordion, server pricing, payment instructions from server | FE §5 | PARTIAL | Instructions from `siteSettings` ✓; delivery preview client-side (E8); payment list hardcoded (B8) | INSPECTED | Phase D/F frontend allowlist |
| G8 | Provider-neutral payment submission UI | FE-V2 2.6 | PARTIAL | bKash-specific form; আলাদা provider selector নেই | INSPECTED | Phase D (after D-01) |
| G9 | Account: own orders, addresses, wishlist, returns, payment status | FE §7, FE-V2 2.7 | PARTIAL | Orders/returns server ✓; **addresses + wishlist localStorage only**; payment status per order `UNVERIFIED` | INSPECTED | Phase F additive `customer_addresses` (sql আছে, runtime নেই), wishlist |
| G10 | Vendor portal isolated | FE-V2 2.8 | PARTIAL | `/vendor` → `vendor-client` + `/api/vendor/overview` (read); dispatch lot / proposals UI admin panel (`phase7-portal-panel`) এ | INSPECTED | MAP §7 "extract dedicated /vendor portal" — Phase F/I |
| G11 | Loading/empty/error states everywhere | FE §6 | PARTIAL | `Skeleton`, `EmptyState` primitives; coverage per component `UNVERIFIED` | INSPECTED | Phase I audit |
| G12 | Responsive 360/390/768/1024/1440 | FE, BE-V2 §8 | PARTIAL | `test:shopping` mobile catalog check only | TESTED_LOCAL (partial) | Phase I matrix |
| G13 | PWA manifest/installable | FE §12 | PARTIAL | `/manifest.webmanifest` served; service worker `UNVERIFIED` | `test:migration` manifest | — |
| G14 | Bilingual bn/en everywhere | FE | PRESENT | `use-locale-store`, `ui-messages.ts`, server `localizedResponse` | INSPECTED | — |
| G15 | Admin 13 navigation groups | BE §6 | PARTIAL | ১০ panel + admin-erp-client; group-to-panel mapping [06](06-frontend-connection-plan.md) | INSPECTED | Reorganize nav only (no rebuild) |

## H. Prohibited features / Conflict register

| ID | Item | Spec rule | কোড evidence | রায় | Action |
|---|---|---|---|---|---|
| X1 | Flash-sale campaign engine | BE §24 "Flash Sale Countdown" নিষিদ্ধ | phase7-service §3 "Margin-Safe Flash-Sale Campaign Engine"; `phase7-portal-panel.tsx`; MAP §7 "must be disabled/quarantined" | **CONFLICT** | Decision D-08: quarantine (feature flag off + UI hide), delete নয় |
| X2 | Bundle / Combo offer | BE §24 | grep `bundle|combo` → কোনো engine নেই | NOT PRESENT | — |
| X3 | Facebook/TikTok pixel, GA/GTM marketing tracking | BE §24 | grep → কোনো pixel/gtag script নেই; `facebook`/`instagram` শুধু **manual order-source enum** (smart order entry) ও `facebook_page_url` setting | NOT PRESENT (false positive ব্যাখ্যা করা) | — |
| X4 | Payment gateway / automated bKash | BE §24 | নেই; runtime reject | NOT PRESENT | — |
| X5 | Google Sheets one-way mirror (Module J, Apps Script) | BE §24 "Unnecessary third-party"; "Paid-by-default SaaS" নয় (free) | phase4c Module J; permission module `google_sync`; `sheets_sync_queue` (sql/0006) | **AMBIGUOUS** | Decision D-10; default: disabled-by-config, keep code |
| X6 | Expense & Ad Spend tracker (ROAS/CPO) | "Paid Analytics Platform" নিষিদ্ধ | phase4c Module G — manual expense entry, কোনো external platform নয় | NOT A CONFLICT | — |
| X7 | Fake courier API / fake order status | BE §24 | adapters fail-closed; `SANDBOX_SIMULATION` explicitly labeled | COMPLIANT | UI-তে simulation label দেখানো নিশ্চিত করা (Phase H) |
| X8 | Fake payment verification | BE §24 | approval requires reviewer + note + amount check | COMPLIANT | — |
| X9 | Editable financial journal / silent adjustment | BE §24 | reversal-only policy; trigger (normalized) | COMPLIANT (runtime app-level) | — |
| X10 | Next.js/Vercel/Supabase Auth targets | BE §3.1 | React/Vite/Express | CONFLICT — **user decision wins**: no framework migration | Documented, no action |
| X11 | Local 2FA off | BE §20.1 production MFA | `PANCHAGARH_SANDBOX_DISABLE_2FA` local only; production unaffected | NO CONFLICT (scoped) | Decision D-04 for production |
| X12 | `*_paisa` vs `*_poisha` | BE-V2 §4 "keep one canonical" | code/sql `poisha` সর্বত্র | CONFLICT (naming) | Decision D-07: keep `poisha` |
| X13 | Accounts actor | MAP §5 vs BE §2.5 | — | CONFLICT | Decision D-03 |
| X14 | Spec `docs/schema.md`, `docs/finance/ledger-design.md`, `docs/api/api-contract.md`, `src/lib/db/product-sync.ts` | BE-V2 §6 ZIP mapping | এই workspace-এ নেই (`.migration-backup/` থাকতে পারে, `UNVERIFIED`) | STALE REFERENCE | Spec-এর ZIP inventory বর্তমান tree-এর সঙ্গে মেলে না; evidence এই অডিটের path দিয়ে |
