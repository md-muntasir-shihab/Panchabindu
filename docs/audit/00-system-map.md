# 00 — System Map (Panchabindu Storefront & Consignment Platform)

> Living architectural map maintained across page-by-page audits. Updated: 2026-11-21 (Homepage `/` + Admin Orders Grid + Print Engine & Invoice Studio + Product & Category Studio `/admin` audits).

## 1. Tech Stack & Runtime

| Layer | Technology | Version / Notes |
| --- | --- | --- |
| Frontend SPA | React + Vite + Wouter + TanStack Query + Zustand + Tailwind CSS v4 | React `19.1.0`, Vite `7.3.2`, Tailwind `4.x` (`artifacts/panchabindu`) |
| Backend API | Express 5 + adapted route handlers + Pino logger | Express `5.3.0` (`artifacts/api-server`) |
| Persistence | Dual-mode runtime store: local JSON fixture in sandbox/dev preview (`scripts/src/sandbox-fixture-app.mjs`) or PostgreSQL/Supabase (`DATABASE_URL`) in production | `artifacts/api-server/imported/src/lib/db/*` |
| Shared Packages | `@workspace/api-server`, `@workspace/panchabindu`, `@workspace/scripts`, `lib/*` | npm workspaces + `bun.lock` |
| Dev Preview Server | `node scripts/src/preview.mjs` on port `3000` (proxies SPA + Express API) | Sets `PANCHABINDU_BYPASS_AUTH=1` in local offline preview only (exits if `NODE_ENV=production` or `VERCEL`) |
| Language & Currency | Bilingual `BN` (default) / `EN`, currency `BDT` stored in integer `poisha` (`100 poisha = 1 BDT`) | `artifacts/panchabindu/src/lib/storefront/*` |

## 2. Application Routes (Client SPA — `artifacts/panchabindu/src/App.tsx`)

| Route | Component | Audience / Role | Audit Status |
| --- | --- | --- | --- |
| `/` | `HomepageClient` | Public Storefront Customer | **AUDITED (2026-11-21)** |
| `/shop`, `/search` | `ShopCatalogClient` | Public Storefront Customer | NOT YET PROVIDED (smoke-checked as `StorefrontShell`/`ProductCard` consumer) |
| `/category/:slug` | `CategoryDetailClient` | Public Storefront Customer | NOT YET PROVIDED (smoke-checked as consumer) |
| `/product/:slug` | `ProductDetailClient` | Public Storefront Customer | NOT YET PROVIDED |
| `/checkout` | `CheckoutClient` | Public / Customer | NOT YET PROVIDED (smoke-checked as consumer) |
| `/order-tracking`, `/order-tracking/:orderNo` | `OrderTrackingClient` | Public / Customer (token/phone) | NOT YET PROVIDED (smoke-checked as consumer) |
| `/account` | `AccountClient` | Customer | NOT YET PROVIDED |
| `/contact` | `ContactClient` | Public Customer | NOT YET PROVIDED |
| `/legal/:slug` | `LegalPage` | Public Customer | NOT YET PROVIDED (smoke-checked as consumer) |
| `/vendor` | `VendorClient` | Vendor (RBAC protected; hidden from public storefront nav) | NOT YET PROVIDED |
| `/admin` (Orders Grid + 4 Sheets) | `AdminErpClient` -> `OrdersGridMinimal`, `OrderDetailsSheet`, `OrderDispatchSheet`, `CourierBulkCsvPanel`, `OrderPrintPreviewSheet` | Admin / Staff / Super Admin (RBAC) | **AUDITED (2026-11-21)** |
| `/admin` (Print Engine & Invoice Studio) | `AdminErpClient` -> `PrintEnginePanel` (`Print queue`, `Template settings`, `Print history`) + `OrderPrintPreviewSheet` + `/api/print/:orderNo` | Super Admin (full) / Warehouse & Ops Staff (`print_engine:create`, Part 3 server-redacted) | **AUDITED (2026-11-21)** |
| `/admin` (Product & Category Studio) | `AdminErpClient` -> `ProductManagementStudioPanel` (4 tabs + 4 modals) + `CatalogImportPanel` + `/api/catalog/import` + `/api/media` | Super Admin (catalog/category/CSV/media writes) + Marketing Manager (review moderation via `catalog:update`) | **AUDITED (2026-11-21)** (Other `/admin` tabs pending) |
| `/categories` | `<Redirect to="/shop" />` | Redirect | N/A |

## 3. API Endpoints (`artifacts/api-server/src/routes/imported.ts`)

### Public Storefront & Page Data
- `GET /api/healthz` — Health check (`artifacts/api-server/src/routes/health.ts`)
- `GET /api/page-data?pagePath=...&q=...&category=...` — Unified page loader (`artifacts/api-server/src/routes/page-data.ts`)
- `GET /api/storefront` — Catalog, product detail, and BD district/weight delivery quote (`artifacts/api-server/imported/app/api/storefront/route.ts`)
- `POST /api/storefront/inquiry` — Contact/storefront inquiry
- `GET /api/media`, `GET /api/media/:assetId` — Storefront & product media delivery
- `POST /api/cart/abandoned`, `POST /api/promo/validate`, `POST /api/orders`, `GET/POST /api/reviews`
- `GET /api/orders/track/:secureToken`, `POST /api/orders/cancellation-request`, `POST /api/orders/return-request`
- `POST /api/payments/manual-bkash/submissions`, `GET /api/account/orders`, `POST /api/print/:orderNo`
- `GET /manifest.webmanifest`, `GET /sitemap.xml`, `GET /robots.txt`

### Vendor Portal Endpoints (Direct route only; server-side signed session + CSRF + ownership checks)
- `/api/vendor/overview`, `/api/vendor/workspace`, `/api/vendor/statement`, `/api/vendor/products`, `/api/vendor/stock`, `/api/vendor/price-proposals`, `/api/vendor/payouts`, `/api/vendor/profile`, `/api/vendor/onboarding`, `/api/vendor/kyc`, `/api/vendor/support`

### Admin & Internal Operations Endpoints (Direct route only; server-side RBAC + CSRF)
- `/api/admin/auth`, `/api/admin/workspace`, `/api/admin/emergency`, `/api/admin/brand-media`, `/api/admin/system-health`, `/api/admin/vendors`, `/api/admin/vendor-kyc`, `/api/admin/vendor-payouts`, `/api/admin/vendor-support`, `/api/catalog/import`
- `/api/webhooks/courier`, `/api/cron/courier-status`

## 4. Client State Stores (`artifacts/panchabindu/src/lib/storefront/`)

- `useCartStore` (`cart-store.ts`): Persisted `localStorage` cart items, drawer open state, undo-remove buffer, subtotal & free-delivery threshold math.
- `useWishlistStore` (`wishlist-store.ts`): Persisted `localStorage` saved product IDs.
- `useLocaleStore` (`locale-store.ts`): Persisted `localStorage` `bn` | `en` locale + `<html lang>` sync.
- `useQuery(['page-data', location, search])` (`App.tsx`): TanStack Query fetcher for `/api/page-data`.

## 5. Shared Components & Utilities (Blast Radius)

| Shared File | Consumers |
| --- | --- |
| `artifacts/api-server/src/app.ts` | Every `/api/*` endpoint across Storefront, Customer, Vendor, Admin |
| `artifacts/api-server/src/routes/page-data.ts` | Every SPA route (`/`, `/shop`, `/category/:slug`, `/product/:slug`, `/checkout`, `/account`, `/order-tracking`, `/contact`, `/legal/:slug`, `/admin`, `/vendor`) |
| `artifacts/api-server/imported/app/api/storefront/route.ts` | Homepage quote/storefront helpers, Checkout delivery quote, Shop/Category queries |
| `artifacts/api-server/imported/src/lib/admin/phase4a-service.ts` | All `/api/admin/workspace` order, courier, and ERP operations |
| `artifacts/api-server/imported/src/lib/admin/phase4b-service.ts` & `artifacts/panchabindu/src/lib/admin/phase4b-service.ts` | Print Engine slip generation (`generateOrderPrintSlips`, role-redacted `internalPart3`), Print Template config (`updatePrintTemplateConfig`), and Print History audit trail |
| `artifacts/api-server/imported/src/lib/security/workspace-policy.ts` & `artifacts/panchabindu/src/lib/security/workspace-policy.ts` | All `/api/admin/workspace` HTTP RBAC allow/deny rules (`generate_print_slips` mapped to `print_engine:create`; `update_print_config` locked to `settings_control_center:update`) |
| `artifacts/panchabindu/src/components/admin/print-engine-panel.tsx` & `order-print-preview-sheet.tsx` | Print Engine & Invoice Studio (all 3 tabs) and Admin Orders Print Preview drawer (`PrintableSlipsDocument`, `executeNativeSlipPrint`) |
| `artifacts/panchabindu/src/components/admin/product-studio-panel.tsx` & `catalog-import-panel.tsx` | Product & Category Studio (4 tabs, CSV bulk import, 4 modals: Product Editor, Linkage Snapshot, Archive Confirmation, Category Modal) |
| `artifacts/api-server/imported/src/lib/db/repository.ts` & `artifacts/api-server/imported/src/lib/media/catalog-import.ts` | Product upsert/soft-archive (`deleteAdminProduct`), category unique-slug upsert, and atomic CSV draft catalog import |
| `artifacts/panchabindu/src/components/ui/responsive-sheet.tsx` | All Admin ERP operational sheets (`OrderDetailsSheet`, `OrderDispatchSheet`, `CourierBulkCsvPanel`, `OrderPrintPreviewSheet`) and Storefront slide-overs |
| `artifacts/panchabindu/src/lib/admin/order-management.ts` | `OrdersGridMinimal`, `OrderDispatchSheet`, `OrderDetailsSheet`, `CourierBulkCsvPanel` |
| `artifacts/panchabindu/src/lib/courier/bulk-csv-exporter.ts` | `CourierBulkCsvPanel`, Courier export routines |
| `artifacts/panchabindu/src/styles/tokens.css` & `src/index.css` | All storefront and portal pages |
| `artifacts/panchabindu/src/components/storefront/storefront-shell.tsx` | `HomepageClient`, `ShopCatalogClient`, `CategoryDetailClient`, `ProductDetailClient`, `CheckoutClient`, `OrderTrackingClient`, `AccountClient`, `ContactClient`, `LegalPage` |
| `artifacts/panchabindu/src/components/storefront/product-card.tsx` | `HomepageClient`, `ShopCatalogClient`, `CategoryDetailClient` |
| `artifacts/panchabindu/src/lib/storefront/product-image.ts` | `HomepageClient`, `ProductCard`, `StorefrontShell`, `ProductDetailClient`, `CheckoutClient`, `ShopCatalogClient`, `CategoryDetailClient` |
