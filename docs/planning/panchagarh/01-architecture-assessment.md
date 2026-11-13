# 01 — Architecture Assessment (বর্তমান অবস্থা)

সব তথ্য source inspection থেকে (`INSPECTED`) যদি না অন্য level লেখা থাকে। কোনো secret value পড়া হয়নি; শুধু configuration **name** উল্লেখ আছে।

## 1. Runtime topology

| স্তর | বর্তমান বাস্তবতা | স্পেসিফিকেশন যা ধরে নিয়েছিল | মন্তব্য |
|---|---|---|---|
| Frontend | React 18 + Vite, `wouter` routing, TanStack Query, Zustand (persist), Tailwind token system (`artifacts/panchagarh`) | Next.js App Router, Vercel | Framework বদল হবে না (user decision) |
| API | Express 5 (`artifacts/api-server`); ২০টি imported Next-style handler Web `Request/Response` adapter দিয়ে mount (`src/routes/imported.ts`) + `page-data`, manifest, sitemap, robots | Next route handlers / Supabase Edge | Handler-গুলো framework-agnostic; adapter raw bytes সংরক্ষণ করে (webhook signature, multipart) |
| Persistence (dev) | `.data/*.json` ১০টি runtime document (`RUNTIME_DOCUMENTS`) | — | Git-ignored fixtures |
| Persistence (prod) | `PANCHAGARH_PERSISTENCE=postgres` → Supabase RPC `erp_read_runtime_state` / `erp_commit_runtime_state`; একই ১০টি document JSONB হিসেবে `erp_runtime_state` (single row, optimistic `revision`) | Normalized PostgreSQL + RLS | **document store**; নিচে §3 |
| Media | Supabase Storage bucket `product-staging` (upload) + migration 0010 buckets/policies; `sharp` দিয়ে WebP re-encode, EXIF strip, pixel limit | Approved media pipeline | Approve→publish ধাপ runtime-এ আছে কি না `VERIFY_REQUIRED` (route-level staging upload inspected) |
| Identity | নিজস্ব: username/password (encrypted credential registry), TOTP (otpauth), HttpOnly cookie, Origin/CSRF, rate limit, lockout; customer phone-OTP | Supabase Auth + `users_profile` | Supabase Auth integration নেই; migration 0009-এ `customers.auth_user_id` column আছে কিন্তু runtime ব্যবহার করে না |
| External adapters | Courier (Pathao/Steadfast/BD Post manual), SMS/Email notification — সব fail-closed / `NOT_INTEGRATED` / `SANDBOX_SIMULATION` | Approved providers only | কোনো live credential নেই; `TESTED_LOCAL` (unit tests) |

## 2. Route tree

### 2.1 Frontend (`src/App.tsx`, wouter)

| Path | Component | Data source | Auth |
|---|---|---|---|
| `/` | `homepage-client` | `/api/page-data?path=/` | public |
| `/shop`, `/search` | `shop-catalog-client` (q, category param) | page-data (`mode`, `initialQuery`, `initialCategorySlug`) | public |
| `/categories`, `/category/:slug` | `categories-client`, `category-detail-client` | page-data | public |
| `/product/:slug` | `product-detail-client` (+ JSON-LD) | page-data (`getPublicProductBySlug`) | public |
| `/checkout` | `checkout-client` | page-data common + `POST /api/orders`, `POST /api/promo/validate` | **customer session আবশ্যক** |
| `/account` | `account-client` | `POST /api/account/orders` (request_otp / verify_otp / get_orders / logout) | phone-OTP |
| `/order-tracking/:orderNo` | `order-tracking-client` | page-data (`getPublicOrderTrackingByToken`; sequential ORD-no শুধু logged-in owner) | public (token) |
| `/contact`, `/legal/:slug` | `contact-client`, legal | page-data; `POST /api/storefront/inquiry` | public |
| `/vendor` | `vendor-client` | `POST /api/admin/auth` → `GET /api/vendor/overview` | staff session, role `vendor` |
| `/admin` | `admin-erp-client` + ১০টি panel (catalog-import, courier-and-escrow, phase4c, phase5-readiness, phase6-ops, phase7-portal, print-engine, product-studio, storefront-content, operational-help) | `POST /api/admin/auth`, `POST /api/admin/workspace` (discriminated `operation` union, 1655-line route) | staff session |

Browser state (Zustand persist): `bongoconsign-cart-v1`, `bongoconsign-wishlist-v1`, `bongoconsign-locale-v2`; checkout address/recent-orders localStorage। **এগুলো কোনো truth নয়** — server stock/pricing snapshot ছাড়া কিছু বিশ্বাস করে না (`createStorefrontOrder` server-side price/stock)।

### 2.2 API (`src/routes/imported.ts`)

| Endpoint | Actor | Guard (inspected) |
|---|---|---|
| `POST /api/orders` | customer | Origin/CSRF, customer cookie, rate limit 10/min, 32 KB body, zod, phone==session, `runWithAtomicStockLock`, idempotency key + payload hash |
| `GET /api/orders?token=` / `GET /api/orders/track/:secureToken` | public | rate limit 30/min per IP, random token only, zero-leak DTO |
| `POST /api/payments/manual-bkash/submissions` | customer | CSRF, session, 12/10min per IP, 16 KB, `customerOwnsOrder`, duplicate TrxID, idempotency |
| `POST /api/account/orders` | customer | OTP challenge; SMS `NOT_INTEGRATED` → `SANDBOX_TEST_ONLY` non-prod |
| `POST /api/orders/cancellation-request`, `/return-request` | customer | session-scoped (inspected header) |
| `POST /api/admin/auth` | staff | CSRF, rate limit, lockout, TOTP (sandbox off via `PANCHAGARH_SANDBOX_DISABLE_2FA`), HttpOnly/SameSite=lax/Secure(prod), 8h |
| `POST /api/admin/workspace` | staff | session → `ActorSecurityContext` → module permission matrix (`workspace-policy.ts`), 512 KB body |
| `GET /api/vendor/overview` | vendor | session, vendor-scoped DTO |
| `POST /api/webhooks/courier` | courier | HMAC-SHA256 fail-closed, constant-time compare, timestamp window, event dedupe |
| `GET /api/print/:orderNo` | staff | session (print engine) |
| `POST /api/media`, `GET /api/media/:assetId`, `POST /api/admin/brand-media` | staff | 6 MB cap, sharp precheck, staging bucket |
| `POST /api/catalog/import` | staff | 300 KB CSV |
| `POST /api/promo/validate`, `/api/reviews`, `/api/cart/abandoned`, `/api/storefront/inquiry`, `GET /api/storefront` | public/customer | rate-limited |

Common wrapper `backendRoute`: body-size cap, runtime transaction (`withRuntimePersistence`), `Cache-Control: private, no-store`, bn/en error localization, `WRITE_CONFLICT`→409, অন্য failure→503 (fail-closed)।

## 3. Persistence boundary — সবচেয়ে গুরুত্বপূর্ণ ফলাফল

```
┌──────────────────────┐   dev    ┌──────────────────────────┐
│ repository.ts etc.   │ ───────► │ .data/erp-*.json (10)    │
│ (read/write JSON     │          └──────────────────────────┘
│  documents)          │   prod   ┌──────────────────────────┐
│                      │ ───────► │ erp_runtime_state (JSONB)│  ← migration 0009
└──────────────────────┘          │ revision + 10 documents  │
                                  └──────────────────────────┘
          ╳ runtime path থেকে ব্যবহার হয় না ╳
┌─────────────────────────────────────────────────────────────┐
│ migrations 0001–0008: 15 enums, 53 normalized tables, RLS,  │
│ views (v_public_site_settings, v_storefront_products,       │
│ v_vendor_masked_orders), journal triggers (0009)            │
└─────────────────────────────────────────────────────────────┘
          ▲ json-to-supabase-migrator.ts (tool, not runtime)
```

Implications:

1. **RLS runtime-এর জন্য enforcement layer নয়।** `erp_runtime_state` শুধু `service_role`-এর জন্য; সব authorization application code-এ (`permissions.ts`, `workspace-policy.ts`, DTO serializer)। স্পেসিফিকেশনের "RLS enforced + application guard" দ্বিস্তরীয় মডেল এখন একস্তরীয়।
2. **DB-level invariant (journal trigger, CHECK, UNIQUE TrxID index, maker-checker CHECK) runtime data-তে প্রযোজ্য নয়**; শুধু `erp_validate_runtime_values` RPC integer-poisha/quantity type যাচাই করে (`INVALID_INTEGER_VALUE`)।
3. **Concurrency:** single-row optimistic revision → যেকোনো দুটি concurrent write-এর একটি `WRITE_CONFLICT` পায়; throughput সীমিত কিন্তু consistency fail-closed।
4. **Stock lock** `runWithAtomicStockLock` in-process; Postgres mode-এ revision conflict দ্বিতীয় রক্ষাকবচ, তবে multi-instance-এ retry semantics `UNVERIFIED`।
5. Normalized schema **ভবিষ্যৎ target** হিসেবে ব্যবহারযোগ্য (ভালো মানের, poisha-only, append-only ledger), কিন্তু "already migrated" বলা যাবে না। Supabase-এ কোনটি আসলে apply হয়েছে — `VERIFY_REQUIRED` (user: Supabase পরে)।

## 4. Configuration names (values নয়)

| Name | ভূমিকা | Local sandbox | Production |
|---|---|---|---|
| `PANCHAGARH_PERSISTENCE` | `postgres` হলে Supabase runtime | unset (JSON) | আবশ্যক |
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | runtime RPC + storage | unset | আবশ্যক; placeholder পেলে fail |
| `CREDENTIALS_ENCRYPTION_KEY` | encrypted credential registry | `.data/` private env | আবশ্যক; rotate নয় |
| `SESSION_SECRET` | session signing (workspace secret উপস্থিত) | উপস্থিত | আবশ্যক |
| `APP_URL` | CSRF origin + sitemap base | — | আবশ্যক |
| `PANCHAGARH_SANDBOX_DISABLE_2FA` | local 2FA off | `1` (user decision) | কখনো নয় |
| SMS/Email/courier provider vars | adapter config | absent → `NOT_INTEGRATED` | Owner decision |

## 5. Test inventory (`TESTED_LOCAL` যা বলা যায় তার সীমা)

| Suite | কভার | Workflow আছে? |
|---|---|---|
| `test:migration` (`scripts/src/migration-smoke.test.mjs`) | running-app route, public data, 404, auth guard, manifest | হ্যাঁ |
| `test:domain` | finance ledger, checkout validators, runtime transaction, image precheck | হ্যাঁ |
| `test:shopping` | Chromium cart→checkout, refresh persistence, mobile catalog (**order place করে না**) | না (manual) |
| `test:sandbox` | local admin/vendor first-login ও customer OTP flow (credential print না করে) | হ্যাঁ |
| imported `*.test.ts` (৩২টি) | phase1 security, phase3 inventory integrity, phase4 ledger, phase4a/4b/4c admin, phase5 courier/notification, phase6, phase7, storefront, media, catalog import, backend endpoints, customer route guards | আংশিক — `test:domain` শুধু ৪টি চালায়; বাকিগুলো workflow-এ wired নয় → `INSPECTED` level |
| `typecheck` (frontend) | TS | হ্যাঁ |

**Production, Supabase runtime, provider integration: কোনো test নেই → `UNVERIFIED`।**

## 6. Code health observations (redesign প্রস্তাব নয়)

- `repository.ts` ~2.9k lines, `admin/workspace/route.ts` 1.6k lines, admin frontend ~21k lines — বড় কিন্তু সুসংগত; split হবে future tech-debt, এই roadmap-এর শর্ত নয়।
- Module header comment-এ "Phase/Module" নামকরণ পুরোনো master prompt অনুসরণ করে; স্পেসিফিকেশনের প্রতিটি module code-এ কোথায় আছে তা [02](02-requirements-matrix.md)-এ।
- Domain money type `Poisha = number` + `assertIntegerPoisha`; snapshot invariant read-time-এ যাচাই (`ORDER_PRICE_SNAPSHOT_INVALID` throw) — ভালো, কিন্তু DB-level নয়।
