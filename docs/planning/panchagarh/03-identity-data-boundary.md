# 03 — Identity ও Data Boundary Assessment

Scope: customer principal, চার staff role, vendor mapping, session/CSRF/rate-limit boundary, public DTO allowlist, ownership/RLS enforcement। Local 2FA-off নীতি ও production security decision পৃথক রাখা হয়েছে। **কোনো credential পড়া, test login বা account mutation করা হয়নি।**

## 1. Principals ও তাদের session

| Principal | কীভাবে তৈরি | Session artifact | Scope check |
|---|---|---|---|
| Anonymous | — | নেই | public DTO only (`getPublicStorefrontData`, token tracking) |
| Customer | phone OTP (`/api/account/orders` `request_otp`→`verify_otp`) | signed cookie `CUSTOMER_SESSION_COOKIE_NAME` → `{customerId, phone}` (`verifyCustomerSessionToken`) | `customerOwnsOrder`, `phone === input.customerPhone`, idempotency key prefix `customer:<id>:` |
| Staff (4 roles) | username/password (+TOTP prod) `/api/admin/auth` | HttpOnly, SameSite=lax, Secure(prod/https), 8h; `admin_sessions` concept (sql/0008) | `ActorSecurityContext` → `workspace-policy.ts` module/action matrix |
| Vendor | staff login role=`vendor` | একই cookie | `vendorId` on context; cross-vendor → 404; `maskCustomerPiiForVendor` |
| Courier provider (machine) | HMAC shared secret | নেই (per-request signature) | timestamp window + event dedupe |

Observations:
- Customer principal **phone-based**; email/password নেই (FE §7 "হালকা" অনুযায়ী সঠিক)। OTP delivery provider absent → `SANDBOX_TEST_ONLY` (non-prod) / `NOT_INTEGRATED` (prod fail-closed)। **Decision D-05** (SMS provider)।
- `customers.auth_user_id` (sql/0009) Supabase Auth bridge-এর জন্য reserved, runtime unused। Supabase Auth adoption বাধ্যতামূলক নয় (user decision: বর্তমান কাঠামো)।
- Vendor-এর নিজস্ব entry `/vendor` route; login response-এর role check **client-side** (vendor-client), কিন্তু data endpoint `/api/vendor/overview` server-side role enforce করে → UX gap মাত্র, security gap নয়। `INSPECTED`।

## 2. চার role বনাম স্পেসিফিকেশন permission matrix

| Role (code `SystemRoleSlug`) | BE §5 | Code module access (`PermissionModuleKey`, 18 modules) | Gap |
|---|---|---|---|
| `super_admin` | সব | সব + `users_security`, `settings_control_center`, `audit_logs` | — |
| `vendor` | own products/stock/statement/payout | `vendors`(own), `vendor_ledger`(own), `catalog`(own proposals), `payouts`(own) | Vendor UI mostly in admin panel (phase7-portal) — isolation UI-level (G10) |
| `marketing_manager` | orders, promos, content, messaging; no cost | `orders`, `promos`, `messaging`, `catalog`(read), `expenses`? | `expenses`/ad-spend read allowed কি না `UNVERIFIED` (matrix constants পড়া হয়নি line-by-line) |
| `packaging_manager` | packing, print, courier handover; no finance | `today_screen`, `orders`(packing ops), `print_engine`, `couriers`, `inventory` | — |
| MAP "Accounts" | payment TrxID, ledger, settlement | **role নেই**; `customOverrides` per-user override আছে | **Decision D-03** |

Spec-এর `maxDiscountBp` per actor আছে (`ActorSecurityContext.maxDiscountBp`) — promo abuse guard PRESENT।

## 3. Data boundary matrix — MAP §5 বনাম enforcement

| Data | Customer | Vendor | Marketing | Packaging | Super Admin | Enforcement এখন | Level |
|---|---|---|---|---|---|---|---|
| Public product/price | own view | own | yes | relevant | yes | `v_storefront_products` (sql), `getPublicStorefrontData` strips | INSPECTED |
| Supplier cost/profit | ✗ | own terms | ✗ | ✗ | ✓ | `CUSTOMER_FORBIDDEN_FIELDS`, `hiddenFields` per module | INSPECTED |
| Platform margin/net | ✗ | ✗ | ✗ | ✗ | ✓ | same | INSPECTED |
| Customer address/phone | own | masked | need-to-know | delivery only | ✓ | `maskCustomerPiiForVendor`; print copy isolation (customer/warehouse/accounts) | INSPECTED |
| Payment TrxID | own | ✗ | ✗ | ✗ | ✓ | tracking DTO "never exposes raw TrxID"; review guard excludes vendor/packaging | INSPECTED |
| Provider credentials | ✗ | ✗ | ✗ | ✗ | restricted | phase4c "Masked Credentials Manager (never returned to browser)", `encrypted_credentials` | INSPECTED |
| Ledger journal | ✗ | own summary | ✗ | ✗ | ✓ | `vendor_ledger` own scope; GL super_admin | INSPECTED |
| KYC/bank docs | own | own | ✗ | ✗ | restricted | vendor onboarding (phase4b) — storage policy `UNVERIFIED` | UNVERIFIED |

**Single-layer enforcement:** সব উপরের নিয়ম application layer-এ। Normalized schema-র RLS (`fn_current_role_slug`, `fn_current_vendor_id`, `fn_current_customer_phone`, policies per table) শুধু normalized tables-এ; runtime JSONB document service-role দিয়ে পড়ে, তাই **RLS কোনো runtime request-এ কার্যকর নয়**। এটি স্পেসিফিকেশন D7 (BE §20.4) এর সঙ্গে structural gap, bug নয়।

## 4. Request boundary controls

| Control | Implementation | Multi-instance safe? |
|---|---|---|
| Origin/CSRF | `verifyOriginAndCsrf` vs `APP_URL` | হ্যাঁ (stateless) |
| Rate limit | `checkRateLimit(key, n, windowMs)` in-memory Map | **না** — per-process; production-এ instance count ≥2 হলে weak (`UNVERIFIED`) |
| Body size | `backendRoute` streaming cap (64 KB default; media 6 MB; workspace 512 KB; CSV 300 KB) + route-level `assertJsonBodySize` | হ্যাঁ |
| Lockout (5 attempts) | credential registry counter in runtime document | হ্যাঁ (document commit) |
| Session revocation | `admin_sessions` document; `save/revoke` operations | হ্যাঁ |
| Cache | `private, no-store` on all API | হ্যাঁ |
| Error localization | `localizedResponse` bn/en, no stack leak; 503 fail-closed on tx error | হ্যাঁ |

## 5. Public DTO allowlist (বর্তমান)

- Site settings: `PUBLIC_SETTINGS_KEYS` (brand, tagline, accent, support, whatsapp, free-delivery threshold, bd-post per-kg, bKash number/instructions, maintenance, demo) + `delayBanner`, `promoCampaign`, `trustBadges`, `heroBanners`, `homepageSections`, `legalPages`, `aboutContactPage`, `storefront`.
- Category: `mapPublicCategory` (id, parentId, slug, names, descriptions, icon, sortOrder, isActive).
- Product: `StorefrontProductDTO` (no vendor/cost).
- Tracking: zero-leak (no street, landmark, unmasked phone, TrxID, vendor, cost).

Spec-চাহিদা অনুযায়ী `GET /api/payments/methods` public-safe fields (B11) ভবিষ্যতে এই allowlist-এর extension হবে — নতুন leak surface নয় যদি `receiver_display` masked রাখা হয়।

## 6. Production security decisions (আলাদা অনুমোদন)

| বিষয় | বর্তমান | Decision |
|---|---|---|
| Production MFA (TOTP) সব staff role-এ বাধ্যতামূলক? | code supports; local off | D-04 |
| Supabase Auth adoption নাকি নিজস্ব auth বজায়? | নিজস্ব | D-04 |
| Customer OTP provider | none | D-05 |
| Rate limiter shared store (Postgres/redis-free: runtime document বা DB table) | in-memory | Phase B remediation plan |
| RLS strategy: (a) normalized tables-এ runtime migrate; (b) doc-store রেখে app-layer tests দ্বিগুণ | doc-store | D-11 (architecture) |

## 7. Phase B remediation plan (proposal, approval-gated)

1. **Test wiring (no code change):** phase1 security, customer-route-guards, backend-endpoints, phase4a RBAC tests-কে `test:domain`/নতুন `test:security` script-এ যুক্ত করা → `INSPECTED` → `TESTED_LOCAL`।
2. **RBAC matrix snapshot test:** ৬ actor (anon, customer, vendor A/B, marketing, packaging, super_admin) × প্রতিটি `workspace` operation → allow/deny table (BE-V2 §8)।
3. **Rate limiter persistence:** runtime document `erp-security-sessions.json`-এ window counters (additive) — multi-instance safe via revision commit।
4. **Vendor route UX guard:** `/vendor` server-side role response code (not client-only) — allowlist [06](06-frontend-connection-plan.md)।
5. **RLS decision D-11** এর পরে: হয় normalized adoption roadmap (Phase C+) অথবা doc-store-এ "RLS equivalent" automated leak tests।

কোনো credential rotation, username পরিবর্তন, local 2FA চালু — এই plan-এ নেই।
