# FRONTEND MASTER PROMPT — Customer Store (Modern Multi-Vendor F-Commerce)

> এটি **02_BACKEND_MASTER_PROMPT**-এর সাথে ১০০% সামঞ্জস্যপূর্ণ — একই Database schema, একই Admin-control দর্শন, একই Design System ব্যবহার করবে, যাতে দুটো আলাদাভাবে বানালেও শেষে নিখুঁতভাবে একসাথে কাজ করে।

---

<role>
তুমি একজন Senior Frontend Architect এবং Award-winning Product Designer, যার বিশেষত্ব Next.js, TypeScript, Tailwind CSS এবং modern, conversion-optimized e-commerce experience তৈরিতে। তুমি Shopify Plus / premium D2C ব্র্যান্ডের মানের সাইট বানাতে পারো, কিন্তু Bangladesh-এর বাস্তবতা (COD, ধীরগতির নেটওয়ার্ক, মোবাইল-ফার্স্ট ইউজার) মাথায় রেখে।
</role>

<context>
এটি একটি Multi-Vendor Consignment F-Commerce Store-এর **Customer-facing Frontend**। এটি কোনো standalone প্রজেক্ট না — **02_BACKEND_MASTER_PROMPT** দিয়ে বানানো Admin Dashboard-এর একই Supabase database-এর সাথে connected থাকবে। এই অংশে কোনো payment gateway নেই (manual bKash + COD — backend/admin এটা verify করে)।

**সম্পূর্ণ Admin-Controlled সিস্টেম** — frontend-এ কোনো কিছু hardcode থাকবে না। নিচের প্রতিটা জিনিস Admin Panel (backend) থেকে এসে এখানে render হবে:
- Brand নাম, লোগো, color override (যদি admin চায়), contact info, social link
- Category tree (unlimited nesting, প্রতিটা category-র নিজস্ব banner/icon/description)
- Product, variant, price, stock — সব live Supabase থেকে
- Delivery rate, Free Delivery threshold, Promo code — সব admin-set
- Homepage layout-এর ব্লক (কোন section কোথায় বসবে তাও admin toggle করতে পারবে — "Section Manager")
- Legal page content (Privacy/Return/Terms — admin-editable rich text)

ব্যবসার মডেল: সাপ্লায়ার consignment ভিত্তিতে পণ্য দেয়, আমরা বিক্রি করি, বিক্রির পর backend-এ কমিশন/পাওনা হিসাব হয়। Frontend শুধু **Final Sale Price** দেখাবে (backend-এর three-tier pricing logic অনুযায়ী আগেই calculate করা) — vendor cost/margin কখনো customer-facing কোথাও দেখাবে না।
</context>

<tech_stack>
- Framework: Next.js 14+ / 15+ (App Router, Server Components যেখানে সম্ভব — faster load)
- Language: TypeScript (strict mode)
- Styling: Tailwind CSS + CSS Variables (Design Token ভিত্তিক — নিচে দেখো)
- Animation: Framer Motion / Motion (হালকাভাবে — শুধু meaningful micro-interaction-এ, decorative না)
- Database Client: Supabase JS Client (read-only product/order queries; RLS public-read policy backend থেকে আসবে)
- Image: Supabase Storage + `next/image` (automatic WebP, lazy-load, blur placeholder)
- Hosting: Vercel (free tier)
- State: Zustand (cart, wishlist — হালকা, persist middleware দিয়ে localStorage sync)
- Form: React Hook Form + Zod validation
- i18n: বাংলা (default) + ইংরেজি টগল
- PWA: next-pwa (installable, offline fallback page)
- Fonts: Inter (English) + Noto Sans Bengali (বাংলা) + variable font loading (perf-friendly)
</tech_stack>

<design_system>
## এটাই একমাত্র সোর্স — পুরো সাইটের প্রতিটা রঙ, স্পেসিং, radius এখান থেকে আসবে (`src/styles/tokens.css`)। Backend Admin Dashboard-এর design lock-এর সাথে EXACTLY মিলবে, যেন ব্র্যান্ড অভিজ্ঞতা seamless লাগে।

### Color Tokens (Base — 4 Solid Color Lock)
```css
--color-bg: #FFFFFF;
--color-surface: #F4F4F5;   /* card/section background */
--color-border: #E4E4E7;
--color-ink: #09090B;       /* primary text */
--color-muted: #71717A;     /* secondary text */
```
### Semantic (status/badge only — কখনো decorative use না)
```css
--color-success: #16A34A;  /* In Stock, Delivered */
--color-warning: #D97706;  /* Low Stock, Pending */
--color-danger:  #DC2626;  /* Out of Stock, Cancelled */
--color-info:    #2563EB;  /* Promo, New */
```
### Dark Mode (prefers-color-scheme: dark বা toggle)
```css
--color-bg: #09090B; --color-surface: #18181B; --color-border: #27272A; --color-ink: #FAFAFA; --color-muted: #A1A1AA;
```
### নিয়ম
- **কোনো Gradient, Glow, Glassmorphism, ভারী Shadow, decorative illustration, বা emoji UI-তে না** — এটা একটা non-negotiable lock, backend dashboard-এর মতোই
- Admin চাইলে শুধু `--color-info` (Accent/Brand color)-টা Admin Panel থেকে override করতে পারবে (ব্র্যান্ড পার্সোনালাইজেশনের জন্য) — বাকি টোকেন fixed থাকবে
- Spacing: 8px স্কেল (4, 8, 12, 16, 24, 32, 48, 64...)
- Radius: max 10px (sharp-ish, premium-minimal feel — বেশি round না)
- Typography scale: স্পষ্ট hierarchy (Hero 40-56px / H2 28-32px / Body 16px / Caption 13px), numeric price-এ tabular-nums
</design_system>

<modern_ux_principles>
এটা শুধু "কাজ করে" এমন সাইট না — **premium, trustworthy, conversion-focused** অনুভূতি দিতে হবে:

1. **Visual Hierarchy দিয়ে বিক্রি** — বড়, ঝকঝকে product photography; price সবসময় prominent; CTA বাটন সবসময় one clear primary action
2. **Micro-interactions** — add-to-cart-এ subtle bounce/fade, hover-এ image swap (২য় product photo), skeleton loading (স্পিনারের বদলে), button press feedback — সব ১৫০ms-এর মধ্যে, `prefers-reduced-motion` respect করবে
3. **Trust Signals** — "✓ ক্যাশ অন ডেলিভারি", "✓ ৭ দিনের রিটার্ন নীতি" (admin-editable badge), review count, verified purchase badge, delivery estimate
4. **Mobile-First, App-এর মতো অনুভূতি** (backend Admin-এর Q-module-এর সাথে সামঞ্জস্যপূর্ণ):
   - Bottom sticky "Add to Cart" bar মোবাইলে
   - Bottom sheet filter/sort (modal-এর বদলে) মোবাইলে
   - Safe-area inset handling (`env(safe-area-inset-*)`)
   - ৪৪px+ tap target, `inputmode="tel"` ফোন ফিল্ডে
   - Pull-to-refresh অনুভূতি (অপশনাল)
5. **Perceived Speed** — route transition instant মনে হবে (prefetch), optimistic UI (cart add সাথে সাথে count বাড়বে, API confirm পরে)
6. **Empty/Loading/Error states** — কখনো blank screen না; প্রতিটার জন্য designed state (skeleton, friendly empty message + CTA, retry button)
7. **Consistent Component System** — একটাই button style (primary/secondary/ghost), একটাই card style, একটাই badge style — পুরো সাইটে repeat হবে, প্রতিটা পেজ আলাদা আলাদা না লাগে
</modern_ux_principles>

<pages_and_features>

## ১. Homepage (Admin-configurable Section Manager দিয়ে চালিত)
- Hero Section — dynamic banner/carousel (admin একাধিক banner upload + order + link সেট করতে পারবে)
- **Category Grid/Showcase** — unlimited category, প্রতিটার icon/image আলাদা, nested subcategory hover-এ দেখাবে
- Featured Products (admin যেকোনো product "Featured" মার্ক করলে এখানে আসবে)
- New Arrivals (সর্বশেষ added product, auto)
- Best Sellers (sales count অনুযায়ী, backend থেকে)
- Promo/Campaign Banner (admin on/off + schedule — শুরু/শেষ তারিখ)
- Trust strip (COD/Return policy/Delivery badges — admin-editable text)
- Newsletter/WhatsApp subscribe block (optional)
- **Section order/visibility পুরোটাই Admin Panel-এর Homepage Builder থেকে নিয়ন্ত্রিত** — কোনো section hardcode position-এ থাকবে না

## ২. Category ও Product Listing Page
- **Multi-level category navigation** — breadcrumb সহ (যেমন: হোম > ফ্যাশন > শাড়ি > সিল্ক শাড়ি)
- প্রতিটা category page-এর নিজস্ব banner/description (admin SEO-friendly content দেবে)
- **Advanced Filter**: category, sub-category, price range (slider), size/color/attribute (variant-ভিত্তিক, dynamic — category অনুযায়ী filter option বদলাবে), availability, discount
- Sort: price low-high/high-low, newest, popularity, rating
- Grid/List view toggle
- Infinite scroll (মোবাইলে) + pagination fallback (SEO-র জন্য desktop/crawler-এ)
- Product Card: image (hover-এ ২য় photo), name, price (discount থাকলে strike-through original), rating stars, "Low Stock" বা "নতুন" badge, quick Add-to-Cart (variant না থাকলে সরাসরি)

## ৩. Product Detail Page
- Image Gallery — zoom-on-hover (desktop), swipe gallery (mobile), thumbnail strip, up to ৮ ছবি
- **Dynamic Variant Selector** — category/product অনুযায়ী বদলাবে (Size/Color/Weight/Material — backend-এর generic variant system থেকে render হবে, UI hardcode করবে না কোন attribute আসবে সেটা)
- Variant বদলালে: price, stock status, image (যদি color-specific photo থাকে) সব live update
- Stock Status: In Stock (সবুজ) / Low Stock — "মাত্র X টি বাকি" (সবুজ-হলুদ urgency) / Out of Stock (লাল, "Notify Me" ফর্ম)
- Quantity selector + Add to Cart (sticky bottom bar মোবাইলে)
- "Buy Now" shortcut (সরাসরি checkout-এ যায়)
- Product Description — rich text (admin থেকে), Specification Table (dynamic key-value, category-ভিত্তিক attribute)
- Delivery estimate (জেলা দিলে preview — backend delivery-rate API কল করে)
- Reviews + Rating summary (star breakdown bar chart)
- Related/Frequently Bought Together (same category বা backend-recommended)
- Share button (social/copy link)

## ৪. Cart Page / Drawer
- Slide-in drawer (ডেস্কটপ) + full-page (মোবাইল)
- Item list — thumbnail, variant info, quantity stepper, remove (undo toast সহ)
- Auto-calculated subtotal, discount line (promo applied হলে), delivery charge preview
- "Free delivery-র জন্য আরও ৳X যোগ করুন" progress bar (admin-set threshold অনুযায়ী) — conversion booster
- Empty cart state — friendly message + "Continue Shopping" CTA

## ৫. Checkout Page (Single-page, Multi-step Accordion স্টাইল — কম ক্লিকে শেষ)
- Customer Info: Name, Phone (BD format validation), Address — জেলা → উপজেলা cascading dropdown (backend থেকে পূর্ণ তালিকা)
- **Delivery Method Selection** (admin যা চালু রেখেছে শুধু সেগুলো দেখাবে):
  - Courier (Pathao/Steadfast — admin-set rate, জেলা অনুযায়ী auto-calculate)
  - বাংলাদেশ ডাক বিভাগ (per-kg rate, admin-set)
  - Free Delivery (threshold পূরণ হলে বা admin global toggle থাকলে)
- Order Summary sidebar (sticky, সব সময় visible — subtotal, discount, delivery, **total** বড় করে)
- Promo Code field — real-time validate (backend API), success/error inline feedback
- Payment Method: **"Cash on Delivery"** এবং **"bKash Manual"** (bKash হলে Transaction ID ফর্ম + "কীভাবে পাঠাবেন" instruction admin থেকে editable) — কোনো gateway redirect নেই
- Order Note (optional, special instruction)
- "অর্ডার নিশ্চিত করুন" বাটন — loading state, double-submit protect (idempotency)
- Trust badges পাশে (secure checkout অনুভূতি, যদিও কোনো payment gateway নেই)

## ৬. Order Confirmation + Tracking Page
- Success animation (subtle) + Order ID + Invoice summary
- Live courier status timeline (backend API থেকে — Draft→Confirmed→Packed→Shipped→Delivered ভিজ্যুয়াল স্টেপার)
- WhatsApp/SMS/Email trigger backend handles — frontend শুধু "আপনার ফোনে কনফার্মেশন পাঠানো হয়েছে" দেখাবে
- "আরও কেনাকাটা করুন" CTA

## ৭. Customer Account (হালকা — ভারী auth system না)
- Phone দিয়ে OTP login (Supabase Auth phone OTP বা backend custom OTP endpoint)
- Order History (status badge, reorder বাটন)
- Wishlist (heart icon টগল পুরো সাইটে — product card, detail page সব জায়গায় sync)
- Saved Address (একাধিক ঠিকানা সংরক্ষণ)
- Profile edit (নাম, ফোন)

## ৮. Product Reviews
- Verified Purchase badge (backend order history দিয়ে cross-check)
- Star rating + text + optional photo upload
- Review submit → Admin moderation queue (backend-এ approve/reject, এখানে শুধু approved reviews দেখাবে)
- Helpful/Not-helpful vote (optional)

## ৯. Search Experience
- Header-এ সবসময় visible search bar
- Live suggestion/autocomplete (debounced, product name + category match)
- Search result page — একই filter/sort system listing page-এর মতো
- "কিছু পাওয়া যায়নি" friendly state + category suggestion

## ১০. Static/Legal Pages (Admin-editable Content)
- About Us, Contact (admin-set info + Google Map embed optional), Privacy Policy, Return & Refund Policy, Terms & Conditions, FAQ — সবগুলো admin-এ rich-text editor দিয়ে editable, frontend শুধু render করবে

## ১১. Abandoned Cart Recovery
- Cart data localStorage + Zustand persist-এ থাকবে সবসময়
- Customer phone দিলে (checkout শুরু করে ছেড়ে দিলেও) backend-এ cart snapshot যাবে reminder message-এর জন্য (admin-এর Automation Engine সেটা handle করবে — frontend শুধু data পাঠাবে)

## ১২. PWA / App-এর মতো অভিজ্ঞতা
- Installable (Add to Home Screen prompt)
- Offline fallback page
- App icon/splash — admin logo থেকে auto-generate
- Bottom tab navigation মোবাইলে (Home, Categories, Cart, Account)
</pages_and_features>

<admin_connected_data>
নিচের **প্রতিটা জিনিস** backend Admin Panel-এর সাথে live connected থাকবে — frontend-এ কোনো কিছু static/hardcoded থাকবে না:

| Frontend-এ যা দেখা যাবে | Backend-এ কোথা থেকে আসবে |
|---|---|
| Brand নাম, লোগো, favicon, accent color | Admin → Branding Settings |
| Category tree + banner/icon | Admin → Category Manager |
| Product, variant, price, stock, image | Admin → Product/Inventory module |
| Homepage section order/visibility | Admin → Homepage Builder (Section Manager) |
| Delivery method ও rate (district-wise) | Admin → Delivery Rate Table |
| Promo code validation | Admin → Discount/Promo Engine |
| Order status/tracking | Admin → Order Lifecycle |
| Review approval | Admin → Review Moderation Queue |
| Legal page content | Admin → Content/Pages Manager |
| Trust badge text | Admin → Branding/Settings |
| "Maintenance Mode" চালু থাকলে | Admin → Maintenance Toggle (পুরো সাইট maintenance page দেখাবে) |

এই table অনুযায়ী প্রতিটা component **props/data backend API বা Supabase query থেকে নেবে, কখনো inline hardcode করবে না** — এমনকি placeholder data দিয়েও না (Demo/Dev mode-এ শুধু `.env` flag দিয়ে mock data switch করবে, প্রোডাকশনে না)।
</admin_connected_data>

<constraints>
### DO NOT:
- কোনো paid package/library ব্যবহার করবে না
- আমার বলে দেওয়া ফাইলের বাইরে অন্য কোনো ফাইল এডিট করবে না
- Placeholder বা dummy code (`// TODO`) রেখে দেবে না — সম্পূর্ণ working code দেবে
- কোনো payment gateway SDK integrate করবে না (future-placeholder হিসেবে শুধু interface/type রাখতে পারো)
- Google Drive-কে image hosting হিসেবে ব্যবহার করবে না — শুধুমাত্র **Supabase Storage**
- Gradient, shadow-heavy, glassmorphism design করবে না — design_system-এর token-এর বাইরে কোনো রঙ ব্যবহার করবে না
- কোনো text/category/product/price/delivery-rate frontend কোডে hardcode করবে না — সব backend থেকে আসবে
- অপ্রয়োজনীয় heavy npm package যোগ করবে না (bundle size সবসময় মাথায় রাখবে — initial JS ≤200KB gzip target)
</constraints>

<data_assumptions>
Backend (Supabase) থেকে নিচের table/API আসবে বলে ধরে নেবে — **02_BACKEND_MASTER_PROMPT**-এর schema-র সাথে মিলিয়ে নেবে:
- `products` (variants, category_id, images[], featured flag সহ)
- `categories` (parent_id দিয়ে nested tree)
- `orders`, `order_items`
- `delivery_rates` (district/upazila-wise)
- `promo_codes`
- `reviews`
- `site_settings` (brand, homepage section config, legal page content)
- `customers` (phone-based, wishlist, saved address)

Public-facing table-গুলোতে RLS policy **read-only public access** থাকবে; frontend কখনো সরাসরি write করবে না বরং API route দিয়ে (order create, review submit, promo validate) — direct table write নিরাপদ না।
</data_assumptions>

<execution_protocol>
**IMPORTANT — Plan-Before-Execute:**

আগে কোনো কোড লিখবে না। প্রথমে আমাকে দেখাও:
1. কোন কোন ফাইল/ফোল্ডার বানাবে (folder structure)
2. Design token setup + component library plan (Button, Card, Badge ইত্যাদি কীভাবে বানাবে)
3. প্রতিটা page/component-এর জন্য কোন লজিক ব্যবহার করবে, backend-এর কোন table/API-র উপর নির্ভর করবে
4. তোমার কোনো প্রশ্ন আছে কিনা

আমি Approve করার পর কাজ শুরু করবে। **Micro-scoping** মেনে চলবে:
- Step 1: Design Token + Core Component System
- Step 2: Layout Shell (Navbar + Mobile Bottom Nav + Footer) + i18n setup
- Step 3: Homepage (Section Manager-driven, dynamic block rendering)
- Step 4: Category + Product Listing (Filter/Sort/Search)
- Step 5: Product Detail + Dynamic Variant System
- Step 6: Cart (Drawer + Page) + Zustand store
- Step 7: Checkout flow (Delivery calc + Promo + Manual Payment)
- Step 8: Order Confirmation + Tracking
- Step 9: Account (OTP login, Order History, Wishlist, Address)
- Step 10: Reviews + Search Experience
- Step 11: Legal Pages + SEO (metadata, sitemap, structured data)
- Step 12: PWA setup + Performance pass

প্রতিটা step শেষে self-check:
1. সব TypeScript type ঠিক আছে কিনা
2. Mobile responsive কিনা (360px থেকে 1920px)
3. কোনো অব্যবহৃত কোড/import আছে কিনা
4. Design token lock মানা হয়েছে কিনা (hardcoded hex color নেই)
5. কোনো data hardcode হয়ে যায়নি তো — সব backend-driven কিনা
6. Loading/Empty/Error state প্রতিটা data-fetching component-এ আছে কিনা

যদি কোনো তথ্যের ঘাটতি থাকে বা backend schema নিশ্চিত না হও, অনুমান করে কিছু লিখবে না — সরাসরি আমার কাছে জানতে চাইবে।
</execution_protocol>

---

# V2 — FRONTEND INTEGRATION BLUEPRINT (ADDENDUM)
**Scope:** Customer Storefront + Customer Account UI + Admin/Vendor-facing frontend contracts  
**Existing design:** Freeze. Existing colors, typography, logo, spacing, card style, layout and brand identity MUST remain unchanged. This document adds functional/data integration details; it does not authorize a redesign.

## ১. Frontend architecture map

| UI Layer | Route / Existing location | Data source | Server contract | Permission |
|---|---|---|---|---|
| Store shell | existing storefront layout/components | `branding_settings`, navigation CMS | public read DTO | public |
| Home | `/` | active categories/products/home sections | `GET /api/storefront` or dedicated read query | public |
| Shop/Search | `/shop`, `/search` (audit/create only if missing) | active product catalog | server query with filters/pagination | public |
| Category | `/category/[slug]` | category tree + active products | sanitized product DTO | public |
| Product detail | `/product/[slug]` | product, variants, public images, stock display | sanitized product DTO | public |
| Cart | existing cart route/state | Zustand persistent cart + server revalidation | cart read/validate endpoint | customer/local |
| Checkout | existing checkout | customer profile/address, delivery quote, payment methods | `POST /api/orders` | authenticated customer |
| Payment submission | checkout/account payment panel | payment instructions + provider configuration | `POST /api/payments/submissions` (target contract; reconcile with existing bKash route) | own customer |
| Order success | existing success route/modal | order summary | create-order response | own customer |
| Tracking | `/track/[secureToken]` or existing secure route | sanitized status events | secure token endpoint | token-scoped |
| Account | `/account` | own profile, address, orders, wishlist, tickets | authenticated APIs | own customer |
| Vendor | `/vendor/*` | vendor-scoped DTOs | dedicated vendor APIs | vendor only |
| Admin | `/admin/*` | admin/staff scoped DTOs | admin workspace/API | permission-aware |

**Do not duplicate an existing route.** Audit actual route tree and adapt the mapping. Do not create a new route merely because it appears in this table.

## ২. Frontend page modules and connections

### ২.১ Storefront shell 🔴
- Read existing brand settings, logo and support contact from public-safe settings DTO.
- Existing header, footer, mobile navigation and visual hierarchy remain.
- Add responsive states only where a current requirement is missing.
- 360px minimum viewport target; no horizontal overflow; touch target >=44px.
- Server Components by default; Client Components only for interaction/state.

### ২.২ Home / Catalog / Search 🔴
- Home sections are CMS-configured, but only render published/active blocks.
- Search, category tree, filters, sorting, pagination are URL-addressable.
- Public DTO allowlist: product name, slug, public SKU if approved, sale price in paisa/string, public images, public attributes, stock availability indicator.
- Never send supplier cost/profit, platform margin, vendor-private SKU, vendor KYC or internal risk data to browser.
- Empty/loading/error/offline-retry states required.

### ২.৩ Product Detail 🔴
- Product gallery consumes approved public media only.
- Variant selection must resolve exact variant ID and current server price.
- Quantity/stock is revalidated at checkout; UI stock is informational.
- Wishlist action requires signed-in customer; anonymous user may be asked to sign in and return to PDP.
- No client-side trust of price/discount/stock.

### ২.৪ Cart 🔴
- Keep cart through sign-in/register.
- Local cart is convenience state only; server revalidates SKU, variant, price, active status, quantity, stock and delivery.
- Cart merge on login must be deterministic and duplicate-safe.
- Never treat localStorage as order/payment source of truth.

### ২.৫ Checkout 🔴
- Customer must register/login before final order placement.
- Address: Bangladesh phone, district/upazila, detailed address, landmark.
- Delivery quote is server-calculated.
- Payment options are loaded from server configuration; disabled providers never render as selectable.
- Payment instruction content (receiver, account type, reference pattern, support contact) is admin-managed and sanitized.
- Customer sees payable amount, selected method, payment steps, and status. No vendor cost or internal accounting.

### ২.৬ Payment submission UI — hybrid-ready, provider-neutral 🔴
- Component: `PaymentMethodSelector`.
- Component: `ManualPaymentInstructionCard`.
- Component: `ManualPaymentSubmissionForm`.
- Component: `PaymentVerificationStatus`.
- Component: `PaymentEvidenceUpload` (optional and private; screenshot is supporting evidence only).
- Fields: provider, sender number, TrxID/reference, amount, transaction time, optional evidence, customer/order association.
- Provider list must come from active `payment_methods` config; no provider hardcoding.
- Duplicate/invalid/amount mismatch errors are explicit and non-accusatory.
- Status shown: `not_required_cod`, `awaiting_submission`, `submitted_pending`, `under_review`, `verified`, `rejected`, `needs_clarification`, `reversed`, `refunded`, `disputed`.
- Customer cannot approve or alter verification status.
- Do not show "Payment successful" until backend returns provider-confirmed/manual-approved status.
- If API is unavailable, show "যাচাই অপেক্ষমাণ"; do not create fake success.

### ২.৭ Customer Account 🔴
Sections:
- Profile and contact verification state
- Saved addresses
- Wishlist
- Persistent cart
- Orders and order details
- Payment submissions and verification status
- Tracking timeline
- Cancellation request where policy allows
- Return/refund requests
- Support tickets
- Notifications
- Review after verified delivered purchase
- Session/security settings
All reads and mutations must be customer-owned. UI never uses phone number alone to retrieve private orders.

### ২.৮ Vendor Portal 🔴
- Dedicated `/vendor/login` and `/vendor/*` shell.
- No public Storefront navigation inside vendor portal.
- Vendor dashboard only shows own product, stock, assigned fulfillment, own payable/statement, return claims and support.
- Vendor must never see payment-provider credentials, other vendor payments, customer full PII beyond fulfillment need, platform margin or global finance.
- All pages use server-scoped DTO; hiding menu is not authorization.

### ২.৯ Admin UI 🔴
- Existing grouped admin navigation and existing dashboard style retained.
- Payment & Finance group contains provider settings, payment queue, verification queue, exceptions, reconciliation, refund and audit history.
- Order grid keeps existing actions and adapts to cards/drawers on mobile.
- High-risk actions require confirmation and maker-checker.
- All KPI calculations have ⓘ formula explanation.
- Responsive 360/390/768/1024/1440 tests.

## ৩. Frontend-to-backend API map

| Action | Request | Response | Must enforce |
|---|---|---|---|
| Load catalog | `GET /api/storefront` | public-safe catalog/settings | no private fields |
| Create order | `POST /api/orders` | order + next action | auth, idempotency, price/stock recalc |
| Load payment options | `GET /api/payments/methods` | enabled public instructions | only approved active providers |
| Submit manual payment | `POST /api/payments/submissions` | pending submission ID | own order, idempotency, unique ref |
| View payment status | `GET /api/account/payments/[id]` | sanitized status/history | owner-only |
| Admin review | `POST /api/admin/payments/[id]/review` | audit-backed decision | RBAC, maker-checker |
| Automatic check | server-only worker/provider adapter | normalized provider result | signature/auth, idempotency, amount/reference match |
| Tracking | secure token route | minimal timeline | unguessable token, rate limit |

These are target contracts. Existing routes (for example `/api/payments/manual-bkash/submissions`) must be inventoried and either retained with compatible DTOs or migrated deliberately. Do not introduce duplicate endpoints without a contract migration plan.

## ৪. Frontend tools — reuse before install

Existing ZIP `package.json` already declares:
- Next.js 15 / React 19 / TypeScript
- Tailwind CSS 4
- Zod 4, React Hook Form, `@hookform/resolvers`
- Zustand
- TanStack Table and Virtual
- Lucide React
- QRCode and JsBarcode

Rules:
- Use existing dependencies where fit.
- Do not install another form library, state manager, icon set or table library.
- `shadcn/ui` is a component source/pattern, not a requirement to replace the current UI. Add only missing primitives after checking `components.json` and `src/components/ui`.
- Playwright Test is a dev dependency only if not present in lockfile; verify Windows/WSL compatibility before browser installation.
- Do not add a paid UI kit or analytics SDK.

## ৫. Frontend acceptance checklist
- Current design screenshot comparison passes.
- Public DTO has no cost/margin/vendor-private field.
- Customer cannot final-submit without authenticated account.
- Cart survives login.
- Payment method list is config-driven and only approved providers are active.
- Manual TrxID submission never marks payment paid by itself.
- Duplicate submission is blocked and explained.
- Vendor portal is separate and data-scoped.
- Admin grid works at 360px without horizontal overflow.
- Customer, Vendor, Admin loading/error/empty states work.
- No pixel/marketing tracker, flash countdown, bundle/combo or gateway redirect.
