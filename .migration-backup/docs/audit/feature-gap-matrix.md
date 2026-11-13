# Feature Gap & Implementation Matrix

> **Current matrix:** `f:\CODE\Panchagarh\docs\audit\v3-requirements-matrix.md` supersedes the historical rows below. The complete v3 A–P was supplied in the conversation; its requirements are reconciled there. `/shop` and `/search` exist. The remainder of this file is retained as dated historical evidence, not current acceptance or phase authorization.
**Project**: Panchagarh (পঞ্চগড়) — Bangladesh Multi-Vendor Consignment F-Commerce & ERP  
**Assessment Date**: 2026-11-08  
**Audit Baseline**: Master Specification Requirements vs Current Repository Status  

---

## Status Classification
- **IMPLEMENTED**: Code and domain logic exist, tested, and operational in current layer.
- **PARTIALLY_IMPLEMENTED**: Implemented partially (e.g. mock/in-memory only, or missing specific sub-features).
- **NOT_IMPLEMENTED**: Required feature is completely absent from the codebase.
- **NOT_INTEGRATED**: Code structure exists but is not connected to live external API or production database.
- **VERIFY_REQUIRED**: Policy, workflow, or legal treatment requires user business clarification before execution.

---

## 1. Customer Storefront (Phase 6 Master Prompt)

| Feature Requirement | Status | Current Evidence / Gap Details | Target Phase |
| :--- | :---: | :--- | :---: |
| **Design Freeze Preservation** | **IMPLEMENTED** | Brand palette, green/dark accents, typography, and card designs match visual screenshots | Phase 6 |
| **Mobile-First Responsive Shell** | **IMPLEMENTED** | `storefront-shell.tsx` with mobile bottom nav, sticky header, drawer menu | Phase 6 |
| **Dedicated All Products `/shop` Page** | **NOT_IMPLEMENTED** | No `/shop` or `/products` route exists in `app/` | Phase 6 |
| **Dedicated Search Results `/search` Page** | **NOT_IMPLEMENTED** | Search exists in header as text input but lacks dedicated search results page and URL routing | Phase 6 |
| **Category Breadcrumbs** | **PARTIALLY_IMPLEMENTED** | Basic category title displayed; nested hierarchy breadcrumb missing | Phase 6 |
| **Price Filter Slider / Min-Max Input** | **PARTIALLY_IMPLEMENTED** | Simple sorting in category page; interactive range slider missing | Phase 6 |
| **Attribute Filters (Size, Color)** | **NOT_IMPLEMENTED** | Variant attributes schema exists in DB types, but filter facets are missing from UI | Phase 6 |
| **Sort by Price, Newest, Best Selling** | **IMPLEMENTED** | Present in category detail view | Phase 6 |
| **Single Product Page with Variants** | **IMPLEMENTED** | `app/product/[slug]/page.tsx` with variant pills, gallery, price calculation | Phase 6 |
| **Cart & Free Delivery Progress Bar**| **IMPLEMENTED** | `use-cart-store.ts` calculates exact Paisa threshold for free delivery | Phase 6 |
| **COD Checkout Flow** | **IMPLEMENTED** | Full address validation, district delivery rate calculation, order creation | Phase 6 |
| **Manual bKash Checkout Flow** | **IMPLEMENTED** | TrxID input, merchant bKash number prompt, duplicate TrxID guard | Phase 6 |
| **Order Confirmation Screen** | **IMPLEMENTED** | Success modal with order summary and tracking link | Phase 6 |
| **Order Tracking Timeline** | **PARTIALLY_IMPLEMENTED** | UI timeline works, but leaks full street address and uses predictable orderNo (SEC-05) | Phase 1 & 6 |
| **Customer Account Order History** | **PARTIALLY_IMPLEMENTED** | UI works, but relies on static demo OTP `'123456'` with no real verification (SEC-06) | Phase 1 & 6 |
| **Wishlist Persistence** | **IMPLEMENTED** | `use-wishlist-store.ts` with local storage persistence | Phase 6 |

---

## 2. Admin ERP (Phase 7 Master Prompt)

| Feature Requirement | Status | Current Evidence / Gap Details | Target Phase |
| :--- | :---: | :--- | :---: |
| **13-Group Admin Navigation** | **IMPLEMENTED** | All 13 navigation sections defined in `admin-erp-client.tsx` | Phase 7 |
| **ⓘ Business Terms Tooltip/Help** | **IMPLEMENTED** | `operational-help-modal.tsx` with bilingual explanations | Phase 7 |
| **Today Command Screen** | **IMPLEMENTED** | 1-click action queues for calls, packing, dispatched batches | Phase 7 |
| **Orders Grid with Bulk Actions** | **IMPLEMENTED** | Full master grid, status updates, staff notes, and call logging | Phase 7 |
| **Smart Order Entry** | **IMPLEMENTED** | Phone history lookup, risk score, 24h duplicate order guard | Phase 7 |
| **Product Studio & Variant Catalog**| **IMPLEMENTED** | `product-studio-panel.tsx` with 3-tier price calculator | Phase 7 |
| **Vendor Management & Onboarding** | **IMPLEMENTED** | 15-point questionnaire, commission rate, payout bank details | Phase 7 |
| **Maker-Checker Workflows** | **IMPLEMENTED** | Self-approval prevention for ledger reversals and customer refunds | Phase 4 & 7 |
| **Role-Based Access Control (4 Roles)**| **IMPLEMENTED** | Super Admin, Vendor, Marketing Manager, Supply & Packaging Manager | Phase 1 & 7 |
| **Admin Modular Refactoring** | **PARTIALLY_IMPLEMENTED** | `admin-erp-client.tsx` is 6,020 lines; components should be modularized | Phase 7 |

---

## 3. Inventory, Orders & Consignment (Phase 3 Master Prompt)

| Feature Requirement | Status | Current Evidence / Gap Details | Target Phase |
| :--- | :---: | :--- | :---: |
| **Consignment Stock Receiving & QC** | **IMPLEMENTED** | `receiveConsignmentStockWithQc` with photo proof and lot recording | Phase 3 |
| **Negative Stock Prevention** | **IMPLEMENTED** | Checked during checkout and order creation | Phase 3 |
| **Stock Reservation & Expiry** | **PARTIALLY_IMPLEMENTED** | Reservation exists on checkout; auto-expiry cron needs database trigger | Phase 3 |
| **Multi-Vendor Order Split** | **IMPLEMENTED** | `splitOrderIntoVendorFulfillmentGroups` by vendor allocation policy | Phase 3 |
| **Order State Machine Transitions** | **IMPLEMENTED** | Strict states: pending, confirmed, packed, shipped, delivered, returned | Phase 3 |
| **Atomic Stock Concurrency Lock** | **NOT_IMPLEMENTED** | Currently uses synchronous JSON writes; needs PostgreSQL `FOR UPDATE` | Phase 2 & 3 |
| **Four-Way Return Engine** | **IMPLEMENTED** | Warehouse fault, supplier defect, customer intact, courier negligence | Phase 3 |

---

## 4. Financial System & Ledger (Phase 4 Master Prompt)

| Feature Requirement | Status | Current Evidence / Gap Details | Target Phase |
| :--- | :---: | :--- | :---: |
| **Paisa / Poisha Integer Math** | **IMPLEMENTED** | Zero floating-point drift; all calculations in integer Paisa | Phase 4 |
| **Vendor Payable Ledger** | **IMPLEMENTED** | Accrual upon delivery, hold period, clawback on return | Phase 4 |
| **Escrow-style Holding Liability** | **IMPLEMENTED** | Pending -> Locked (7-day countdown) -> Available promotion | Phase 4 |
| **Double-Entry General Ledger** | **PARTIALLY_IMPLEMENTED** | Domain math in service layer; database tables & journals pending in DB | Phase 4 |
| **Chart of Accounts** | **NOT_IMPLEMENTED** | Needs formal schema in PostgreSQL | Phase 4 |
| **Courier Remittance Reconciliation**| **IMPLEMENTED** | Bulk CSV reconciliation and short-payment detection | Phase 4 & 5 |
| **Vendor Payout Approval Flow** | **IMPLEMENTED** | Minimum payout threshold, account snapshot, proof URL recording | Phase 4 |
| **Legal Escrow Distinction** | **VERIFY_REQUIRED** | Marked strictly as internal accounting liability, not legal banking escrow | Phase 4 |

---

## 5. Courier & Integrations (Phase 5 Master Prompt)

| Feature Requirement | Status | Current Evidence / Gap Details | Target Phase |
| :--- | :---: | :--- | :---: |
| **Steadfast API Adapter** | **NOT_INTEGRATED** | Adapter architecture outlined; real API credentials NOT_INTEGRATED | Phase 5 |
| **Pathao API Adapter** | **NOT_INTEGRATED** | Adapter architecture outlined; real API credentials NOT_INTEGRATED | Phase 5 |
| **Bangladesh Post Manual Workflow** | **IMPLEMENTED** | Manual booking, consignment number entry, tracking link generation | Phase 5 |
| **RedX Courier Quarantine** | **VERIFY_REQUIRED** | RedX present in codebase; requires user decision whether to prune | Phase 5 |
| **Courier Webhook Receiver** | **PARTIALLY_IMPLEMENTED** | Route exists, but has fail-open security vulnerability (SEC-07) | Phase 1 & 5 |
| **In-App & Deep-Link Notifications** | **IMPLEMENTED** | Free `wa.me` and `sms:` deep-links with message template interpolation | Phase 5 |

---

## 6. Three-Part A4 Print Engine (Phase 8 Master Prompt)

| Feature Requirement | Status | Current Evidence / Gap Details | Target Phase |
| :--- | :---: | :--- | :---: |
| **A4 3-Part Layout Slip** | **IMPLEMENTED** | Part 1 (Courier/Customer), Part 2 (Packaging/Vendor), Part 3 (Accounts) | Phase 8 |
| **Thermal 4x6 Label Mode** | **IMPLEMENTED** | Toggleable in print configuration | Phase 8 |
| **Barcode / QR Code Rendering** | **IMPLEMENTED** | JSBarcode and QRCode.react integration for Order and SKU | Phase 8 |
| **Sensitive Cost Stripping on Slips** | **IMPLEMENTED** | Customer/Courier slip hides vendor cost and platform margin | Phase 8 |
| **Copy Recipient & Retention Policy**| **VERIFY_REQUIRED** | Business policy for three copies requires user verification | Phase 8 |

---

## 7. Fraud Prevention & Audit Trail (Phase 9 Master Prompt)

| Feature Requirement | Status | Current Evidence / Gap Details | Target Phase |
| :--- | :---: | :--- | :---: |
| **Customer Phone Blacklist** | **IMPLEMENTED** | Blacklist registry with reason and checkout block | Phase 9 |
| **Order Risk Score (0-100)** | **IMPLEMENTED** | Calculates delivery history, address quality, advance required | Phase 9 |
| **24-Hour Duplicate Order Guard** | **IMPLEMENTED** | Flags identical phone/cart combinations within 24 hours | Phase 9 |
| **Duplicate TrxID Rejection** | **IMPLEMENTED** | Prevents reusing submitted bKash transaction IDs across orders | Phase 9 |
| **Immutable Audit Log** | **IMPLEMENTED** | Server-side append-only log with actor, action, and timestamp | Phase 9 |
