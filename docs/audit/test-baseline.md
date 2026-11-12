# Test Baseline & Execution Verification Report

> **Historical November 8 snapshot, not the current baseline.** Use `f:\CODE\Panchagarh\docs\audit\phase-0-reaudit-2026-11-11.md` for verified November 11 outcomes and evidence paths. Old passing counts and build root-cause guesses are not current verification; browser/PostgreSQL/RLS acceptance remains unestablished.
**Project**: Panchagarh (পঞ্চগড়) — Bangladesh Multi-Vendor Consignment F-Commerce & ERP  
**Assessment Date**: 2026-11-08  
**Phase**: Phase 0 — Re-Audit & Baseline  

---

## 1. Test Execution Summary

| Test Suite / Command | Tool / Engine | Executed? | Result | Notes |
| :--- | :--- | :---: | :---: | :--- |
| **Unit & Integration Tests** | `bun test` | **YES** | **58 PASS, 0 FAIL** (1425ms) | Ran 58 domain tests across 11 files |
| **TypeScript Typecheck** | `npx tsc --noEmit` | **YES** | **PASS (0 Errors)** | Strict type checking clean |
| **ESLint Static Analysis** | `npm run lint` | **YES** | **PASS (0 Errors, 3 Warnings)**| Warnings on unoptimized `<img>` tags |
| **Applet Compilation Check**| `compile_applet` | **YES** | **PASS** | Applet successfully compiled |
| **Production Build Check** | `next build` | **YES** | **FAILED (Prerender Error)** | Build failed prerendering `/500` without root error boundary |
| **Live Database Tests** | PostgreSQL / Supabase | **NO** | **NOT TESTED** | No live database configured; app runs on `.data/*.json` |
| **Live Courier API Tests** | Pathao / Steadfast | **NO** | **NOT TESTED** | Production credentials not provided/configured |
| **Live OTP / SMS Gateway** | TextBee / Resend | **NO** | **NOT TESTED** | Production SMS gateway not configured |

---

## 2. Detailed `bun test` Results Breakdown

```text
bun test v1.4.4 (38afee6c8)

src/lib/money.test.ts:
  (pass) Golden Case 1: Exact Poisha & Half-Up Rounding (Zero Floating-Point Drift) [20.71ms]
  (pass) Golden Case 2: Commission Priority (Product Override > Vendor Default > Global Default) [0.17ms]
  (pass) Golden Case 3: Three-Tier Consignment Pricing & Line Snapshot [0.47ms]
  (pass) Golden Case 4: Promo Discount Deducts Strictly from Platform Margin (Supplier Payable Untouched) [0.68ms]
  (pass) Golden Case 5: Escrow Maturity Date & Real-Time Bucket Promotion on Read [1.13ms]
  (pass) Golden Case 6: Four-Way Return Engine & Post-Payout Clawback [0.33ms]
  (pass) Golden Case 7: Payout Limit & Double-Request Hold Protection [16.70ms]
  (pass) Golden Case 8: Partial Delivery & Auto Net Profit Formula [0.86ms]

src/store/store.test.ts:
  (pass) Cart Case 1: Free Delivery Progress Bar Calculation in Exact Poisha [0.50ms]
  (pass) Cart Case 2: Product-Level or Global Free Delivery Override [0.13ms]
  (pass) i18n Case 3: Bangla Digit Conversion & Number Formatting [0.79ms]

src/lib/admin/phase5.test.ts:
  (pass) Phase 5 — Pre-Launch Readiness > passes all 12 automated checks [108.33ms]
  (pass) Phase 5 — Pre-Launch Readiness > enforces strict role-based DTO field stripping [4.59ms]
  (pass) Phase 5 — Pre-Launch Readiness > executes 9-stage consignment lifecycle dry-run [8.84ms]
  (pass) Phase 5 — Pre-Launch Readiness > provides all 7 PostgreSQL migration manifests [0.12ms]

src/lib/admin/phase6.test.ts:
  (pass) Phase 6 Case 1: Abandoned Cart Recovery & Customer 360 CRM [41.58ms]
  (pass) Phase 6 Case 2: Live Courier Webhook Receiver (HMAC-SHA256) & Bulk CSV Booking [60.01ms]
  (pass) Phase 6 Case 3: Verified-Purchase Product Review Moderation & Vendor Scorecard [23.20ms]
  (pass) Phase 6 Case 4: Full System Disaster Recovery Snapshot (SHA-256 Checksum) [35.96ms]

src/lib/admin/phase7.test.ts:
  (pass) Phase 7 Case 1: Self-Service Consignment Stock Dispatch Lot & Warehouse QC [33.77ms]
  (pass) Phase 7 Case 2: Vendor Cost/Retail Price Proposal & 3-Tier Split Update [52.16ms]
  (pass) Phase 7 Case 3: Margin-Safe Flash Campaign Guard & Escrow Maturity Promoter [27.19ms]
  (pass) Phase 7 Case 4: Executive BDT Double-Entry Accounting & Strict Role Isolation [12.16ms]
  (pass) Phase 7 Case 5: Multi-Supplier Product Offers & Fulfillment Group Split [25.81ms]
  (pass) Phase 7 Case 6: Maker-Checker Ledger Reversal Guard & Customer Refund [58.99ms]

src/lib/admin/phase4b.test.ts:
  (pass) Phase 4B Case 1: A4 3-Part Print Slip DTO Customer-Safety & Role Cost Hiding [27.22ms]
  (pass) Phase 4B Case 2: Pickup Batch Creation, Handover Manifest & Shipped Transition [27.41ms]
  (pass) Phase 4B Case 3: Courier 360 Remittance Settlement & Escrow Promotion [16.98ms]
  (pass) Phase 4B Case 4: Four-Way Return Engine (Supplier Defect & Courier Negligence) [11.10ms]
  (pass) Phase 4B Case 5: Payout Hold Protection, 15Q Onboarding & Contract Closure [68.50ms]
  (pass) Phase 4B Case 6: Live Courier Tracking Sync & Auto Courier Ledger Entry [25.63ms]

src/lib/admin/phase4c.test.ts:
  (pass) Phase 4C Case 1: Product 360 Role Sanitization & Stock QC Receipt [14.21ms]
  (pass) Phase 4C Case 2: Financial Money Map, Ad Spend ROAS & Auto Net Profit [30.64ms]
  (pass) Phase 4C Case 3: Bilingual Message Template & Customer Blacklist Registry [13.77ms]
  (pass) Phase 4C Case 4: Automation Rules Engine (Dry-Run & Kill-Switch) [15.89ms]
  (pass) Phase 4C Case 5: Masked Credentials Vault, Google Sheets Sync & Branding [21.84ms]

src/lib/admin/phase4a.test.ts:
  (pass) Phase 4A Case 1: Strict Login, First-Login Gate, and Super Admin User Creation [31.09ms]
  (pass) Phase 4A Case 2: Role-Based Field Stripping & Cross-Vendor 404 Isolation [28.28ms]
  (pass) Phase 4A Case 3: Smart Order Entry 24h Duplicate Guard & Override Reason [26.02ms]
  (pass) Phase 4A Case 4: Orders Grid One-Click Actions & Immutable Audit Log [29.19ms]
  (pass) Phase 4A Case 5: Full Order Master Editor & Call Confirmation [38.81ms]

src/lib/db/product-sync.test.ts:
  (pass) ProductSync Case 1: resolveVendorProfile finds active vendors [10.81ms]
  (pass) ProductSync Case 2: calculateAutomatedMargin computes 3-tier prices [0.35ms]
  (pass) ProductSync Case 3: syncProductWithVendorProfile links product and vendor [13.60ms]
  (pass) ProductSync Case 4: validateProductVendorLink verifies integrity [6.11ms]
  (pass) ProductSync Case 5: syncAllProductsWithVendors scans full catalog [46.25ms]
  (pass) ProductSync Case 6: recordVendorProductOrderAccrual connects order to ledger [12.57ms]

src/lib/db/repository.test.ts:
  (pass) Repository Security Case 1: Storefront DTO strips vendor & cost fields [1.75ms]
  (pass) Repository Case 2: getPublicProductBySlug returns sanitized product [2.07ms]
  (pass) Repository Case 3: validatePromoForCart calculates Paisa discount from margin [5.20ms]
  (pass) Repository Case 4: createStorefrontOrder enforces idempotency and stock reservation [13.23ms]
  (pass) Repository Case 5: submitProductReview, saveAbandonedCartSnapshot, getCustomerOrders [47.96ms]
  (pass) Repository Case 6: submitManualBkashPayment and requestOrderCancellation [16.04ms]

src/lib/validators/validators.test.ts:
  (pass) Validator Case 1: Bangladesh Phone Normalization [1.73ms]
  (pass) Validator Case 2: Address Quality Check & District-Upazila Cascade [0.25ms]
  (pass) Validator Case 3: Order Risk Score & Mandatory Advance Rule [0.06ms]
  (pass) Validator Case 4: Checkout Zod Schema Enforces Manual bKash Trx ID & Geo [13.81ms]
  (pass) Validator Case 5: Server-Side Field Hiding & Cross-Vendor 404 Isolation [0.27ms]

Total: 58 passed, 0 failed (1425.00ms)
```

---

## 3. Static Code Analysis (`npm run lint`)

```text
> ai-studio-applet@0.1.0 lint
> eslint .

/app/applet/src/components/admin/courier-and-escrow-panel.tsx
  1672:15  warning  Using `<img>` could result in slower LCP. Consider `<Image />`  @next/next/no-img-element

/app/applet/src/components/admin/product-studio-panel.tsx
   585:33  warning  Using `<img>` could result in slower LCP. Consider `<Image />`  @next/next/no-img-element
  1425:23  warning  Using `<img>` could result in slower LCP. Consider `<Image />`  @next/next/no-img-element

✖ 3 problems (0 errors, 3 warnings)
```

---

## 4. Production Build Test (`next build`)

- **Command**: `npm run build`
- **Output**:
  ```text
  Error: <Html> should not be imported outside of pages/_document.
  Error occurred prerendering page "/500".
  Export encountered an error on /_error: /500, exiting the build.
  ```
- **Root Cause Diagnosis**: Next.js App Router encountered an unhandled error boundary prerendering condition during the static optimization phase because no `app/error.tsx` or `app/global-error.tsx` exists, causing Next.js to fall back to its internal pages legacy `_error` template.
- **Action for Phase 10 / Build Gate**: Add `app/error.tsx` and `app/global-error.tsx` adhering to App Router specifications.

---

## 5. Untested Areas & Justification

1. **Production Database Transactions**:
   - Status: **NOT TESTED**
   - Reason: In accordance with Phase 0 rules ("Phase 0-তে কোনো Application Code, Database Schema বা Production Data পরিবর্তন করবে না"), the application is in baseline audit mode and not connected to an external live database.
2. **Third-Party Courier Merchant Endpoints**:
   - Status: **NOT TESTED / NOT INTEGRATED**
   - Reason: No live merchant API keys or sandbox tokens configured. Courier logic is currently verified via offline simulation tests.
3. **SMS / WhatsApp Cloud Notification Delivery**:
   - Status: **NOT TESTED / NOT INTEGRATED**
   - Reason: No paid SMS or Meta WhatsApp Cloud API credentials configured. Application properly uses free `wa.me` and `sms:` deep-links as the primary free-path mechanism.
