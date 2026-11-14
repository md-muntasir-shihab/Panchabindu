# 06 — Frontend Connection Plan (reuse-first, redesign নয়)

Design token, primitives, বাংলা/ইংরেজি UX, route tree অপরিবর্তিত থাকবে। নিচের allowlist-এর বাইরে কোনো frontend file পরিবর্তন প্রস্তাবিত নয়।

## 1. Reuse inventory

| Asset | অবস্থান | Reuse |
|---|---|---|
| Token system | `web/styles/` (+ `index.css`) | সব নতুন UI এখান থেকে; hardcoded hex নিষিদ্ধ (Phase I grep gate) |
| Primitives | `web/components/ui/primitives.tsx` — Button, Card, Badge, Input, Select, Skeleton, EmptyState, InfoTooltip (financial glossary) | নতুন component তৈরি নয়; payment method selector = `Select`/radio card from `Card` |
| Shell | `storefront-shell.tsx`, `brand-mark.tsx` | — |
| Stores | `use-cart-store` (persist), `use-wishlist-store` (persist), `use-locale-store` | wishlist store → server-sync adapter (same API surface) |
| i18n | `lib/i18n/ui-messages.ts` + server `localizedResponse` | নতুন string দুই ভাষায় |
| Page loader | `/api/page-data?path=` | নতুন public data (payment methods) এখানে যোগ, নতুন fetch নয় |
| Admin panels | `admin-erp-client.tsx` + ১০ panel | nav regroup only |

## 2. Page → backend mapping (বর্তমান + proposed delta)

| Screen | এখন | Proposed delta | Actor | Downstream event |
|---|---|---|---|---|
| Home `/` | page-data (sections, hero, badges, products) | — | anon | — |
| Shop/Search/Category | page-data + facets | — | anon | — |
| PDP | page-data product + reviews | — | anon | `review.submitted` (customer) |
| Cart drawer | local store | — | anon/customer | `cart.validated` at checkout |
| Checkout | page-data common; `POST /api/orders`; `POST /api/promo/validate`; client delivery preview | (1) delivery quote from server (page-data `deliveryQuote` by district/upazila/weight → new action or `GET /api/storefront?quote=`); (2) payment methods from `GET /api/payments/methods` (fallback `siteSettings` keys); (3) post-login return to `/checkout` | customer | `order.created` |
| Order confirmation / tracking | page-data tracking (token or owner) | payment status label from derived state (04 §4.2) | customer/anon(token) | — |
| Payment submission | bKash form → `/api/payments/manual-bkash/submissions` | provider-neutral form: method select (enabled only), instructions from registry, `transaction_at`, optional evidence upload (private) → `POST /api/payments/submissions`; old path alias | customer | `payment.submitted` |
| Account | OTP login; `get_orders`; localStorage addresses; wishlist local | `get_payments`, `addresses` CRUD (server `customer_addresses`), wishlist sync | customer | — |
| Vendor `/vendor` | login → `/api/vendor/overview` | server role check response; dispatch lot / proposal / payout request read-write via vendor-scoped operations (reuse phase7 operations with vendor actor) | vendor | `consignment.received`, `supplier.settlement_requested` |
| Admin `/admin` | 10 panels | nav regroup to BE §6 13 groups (mapping §4); payment review queue panel extension (needs_clarification, evidence viewer); flash campaign section hidden by flag | staff | `payment.verified/rejected` |

## 3. File / folder allowlist (proposed changes only; এই task-এ কিছু বদলানো হয়নি)

### Frontend (`artifacts/panchabindu/src/`)
- `components/storefront/checkout-client.tsx` — server delivery quote, payment method list from server, post-login redirect
- `components/storefront/account-client.tsx` — payments tab, addresses from server, wishlist sync
- `components/storefront/order-tracking-client.tsx` — payment status label
- `components/vendor/vendor-client.tsx` — server role gate message, portal sections
- `components/admin/admin-erp-client.tsx` — nav regroup, flag-gated sections
- `components/admin/phase7-portal-panel.tsx` — flash campaign section behind flag
- `components/admin/courier-and-escrow-panel.tsx` — simulation badge visibility
- `store/use-wishlist-store.ts` — server sync adapter
- `lib/validators/index.ts` — payment method code string (replace union), `transaction_at`
- `lib/i18n/ui-messages.ts` — new strings
- `types/database.types.ts` — regenerated types after Phase C (read-only artifact)
- **নতুন:** `components/storefront/payment-submission-form.tsx` (extracted from checkout; primitives only)

### Backend (`artifacts/api-server/`)
- `imported/app/api/payments/submissions/route.ts` (নতুন), `imported/app/api/payments/methods/route.ts` (নতুন), `manual-bkash/submissions/route.ts` (alias)
- `imported/app/api/account/orders/route.ts` — `get_payments`, addresses, wishlist actions
- `imported/app/api/vendor/overview/route.ts` — write operations vendor-scoped
- `imported/src/lib/db/repository.ts` — registry read, submission generalization (bKash path unchanged), new optional arrays
- `imported/src/lib/db/runtime-persistence.ts` — document allowlist (if new document) 
- `imported/src/lib/finance/phase4-general-ledger-engine.ts` — `payment_transactions` posting reference
- `imported/src/lib/security/workspace-policy.ts` — new operations permission
- `imported/src/lib/storefront/storefront-config.ts` — `flashCampaignsEnabled`, `googleSheetsSyncEnabled` flags
- `src/routes/imported.ts`, `src/routes/page-data.ts` — route registration, payment methods in page-data
- `supabase/migrations/0011_*.sql` (নতুন, local only)
- `lib/api-spec/openapi.yaml` — new public endpoints

### Scripts / tests
- `scripts/src/*` — `test:security`, `test:payments`, responsive matrix
- imported `*.test.ts` — wiring only

**বাইরে (পরিবর্তন নয়):** `styles/`, `primitives.tsx`, `homepage-client`, `product-*`, `shop-catalog-client`, `storefront-shell`, print engine UI (upgrade only Phase H), `admin/auth` route, credential/session modules, `.data/`।

## 4. Admin nav regroup (BE §6 13 groups → বিদ্যমান panels)

| Group | বিদ্যমান panel/section |
|---|---|
| 01 Overview | admin-erp-client Today screen (phase4a Module M) |
| 02 Orders | admin-erp-client order grid + smart entry |
| 03 Product & Catalog | product-studio-panel, catalog-import-panel |
| 04 Vendor & Consignment | phase7-portal-panel (vendor side extracted later) |
| 05 Inventory & Warehouse | phase4c Module F/M sections |
| 06 Courier & Delivery | courier-and-escrow-panel (courier half) |
| 07 Payment & Finance | manual bKash review (workspace), escrow/payout (courier-and-escrow-panel), GL (phase7) |
| 08 Customer & Fraud | phase6-ops-panel, phase4c Module H |
| 09 Storefront & Content | storefront-content-panel |
| 10 Reviews & Support | phase6-ops-panel reviews, inquiries |
| 11 Reports & Analytics | phase4c Module G money map, phase7 executive ledger (manual, no external analytics) |
| 12 Team & Access | phase4a users/roles section |
| 13 System & Security | phase4c Module L/R control center, phase5-readiness-panel, phase6 backup |

## 5. State coverage checklist (Phase I audit targets)

প্রতিটি data-fetching component: loading (`Skeleton`), empty (`EmptyState` + CTA), error (retry + bn/en message), auth-expired (redirect to `/account` with return path)। `prefers-reduced-motion` respected (FE §2)। Responsive matrix: 360, 390, 768, 1024, 1440 — screens: Home, Shop, PDP, Cart drawer, Checkout (3 accordion steps), Payment form, Account (orders/payments/addresses), Tracking, Vendor, Admin (sidebar collapse)। Screenshots → `generated-artifacts/` (ignored)।
