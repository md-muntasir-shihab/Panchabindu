# PHASE 00 — INITIAL ARCHITECTURE ASSESSMENT & BASELINE
## পঞ্চগড় (PANCHAGARH) — Multi-Vendor Consignment F-Commerce

**Document Status:** `IMPLEMENTED`  
**Phase:** `PHASE 00 — DISCOVERY & BASELINE`  
**Last Verified:** 2026-11-08  

---

## ১. Repository & Runtime Inspection (`CONFIRMED`)

- **Framework & Runtime:** Next.js 15 (App Router) + React 19 + TypeScript (Strict Mode).
- **Styling System:** Tailwind CSS v4 + CSS Custom Properties (`src/styles/tokens.css`) enforcing the 4-Solid Color Lock (`--color-bg`, `--color-surface`, `--color-border`, `--color-ink`, `--color-muted`) and semantic status tokens (`--color-success`, `--color-warning`, `--color-danger`, `--color-info`).
- **State Management:** Zustand (`use-cart-store.ts`, `use-wishlist-store.ts`, `use-locale-store.ts`) with persistent localStorage hydration and server-side store synchronization.
- **Validation Engine:** Zod schemas (`src/lib/validators/index.ts`) validating Bangladesh mobile phone numbers (`01[3-9]\d{8}`), 64 districts / 495+ upazilas, 3-tier Poisha pricing invariants, and idempotency keys.

---

## ২. Database & Migration Inspection (`CONFIRMED`)

- **Primary Database Target:** PostgreSQL (Supabase compatible) with 7 version-controlled SQL migrations in `/supabase/migrations/` (`0001` through `0007`) and local deterministic JSON persistence in `.data/` for zero-config development and automated test execution.
- **Immutability Triggers:** Append-only enforcement on `vendor_ledger`, `courier_remittance_ledger`, `inventory_ledger`, and `audit_logs` via `fn_prevent_ledger_mutation`.
- **Row-Level Security (RLS):** Defined across all 7 migration manifests for `super_admin`, `vendor`, `marketing_manager`, `packaging_manager`, and public storefront read access.

---

## ৩. Existing API & Module Baseline (`IMPLEMENTED` & `TESTED`)

| Module | Status | Summary |
|---|---|---|
| **Storefront Shell & Homepage** | `TESTED` | Modernized D2C header (`পঞ্চগড় / PANCHAGARH`), live instant search dropdown, smooth category strip, unified zero-duplicate collection tabs (`সব পণ্য`, `নির্বাচিত`, `বেস্ট সেলার`, `নতুন আগমন`). |
| **Product Detail & Checkout** | `TESTED` | Dynamic multi-variant selector, district/upazila delivery estimator, single-page accordion checkout with COD & Manual bKash (`TrxID`). |
| **Product Management Studio** | `TESTED` | Full Admin CRUD, 3-tier Poisha pricing calculator, dual-SKU generator (`${vendorCode}-${publicSku}`), and 8-way ecosystem connectivity inspector. |
| **Product-Vendor Sync Engine** | `TESTED` | `src/lib/db/product-sync.ts` linking products to active vendor profiles and automating ledger accruals. |
| **4-Role RBAC & TOTP 2FA Gate** | `TESTED` | Server-side DTO field stripping (`src/types/permissions.ts`), 5-attempt login lockout, mandatory first-login password + 2FA gate, and cross-vendor `404 Not Found` isolation. |
| **Escrow-Style Holding Ledger** | `TESTED` | Internal liability tracking across `Pending` → `Locked` → `Available` buckets, 4-way return/damage engine, and maker-checker payout workflow. |
| **Three-Part A4 Print Engine** | `TESTED` | Role-isolated Part 1 (Customer Invoice), Part 2 (Courier Box Sticker with Code128/QR), and Part 3 (Internal Warehouse/Supplier Copy), plus 4×6 thermal mode. |

---

## ৪. Risk Register & Mitigation Matrix

| Risk ID | Risk Description | Impact | Mitigation Implemented | Status |
|---|---|---|---|---|
| **RSK-01** | Floating-point rounding drift in BDT calculations | Critical | All money stored and computed in integer **Poisha** (`1 BDT = 100 Poisha`) and **Basis Points** (`100 bp = 1%`) with half-up rounding in `src/lib/money.ts`. | `TESTED` |
| **RSK-02** | Exposure of Supplier Cost or Platform Margin to Customers/Marketing | Critical | Server-side DTO serializer (`sanitizeRecordForRole`) strips confidential cost/margin/vendor fields before JSON serialization. | `TESTED` |
| **RSK-03** | Cross-Vendor data enumeration by Supplier accounts | High | `assertVendorOwnershipOr404` returns `404 Not Found` (never `403`) on mismatched `vendorId`. | `TESTED` |
| **RSK-04** | Duplicate Manual bKash `TrxID` reuse across orders | High | Unique `TrxID` registry check and mandatory reviewer verification before payment confirmation. | `TESTED` |
| **RSK-05** | Direct editing or deletion of posted ledger rows | Critical | Append-only ledger design; corrections require balanced reversal entries (`HOLD_PERIOD_RETURN_REVERSAL`, `POST_PAYOUT_CLAWBACK`). | `TESTED` |
| **RSK-06** | Unverified live Courier API calls without credentials | Medium | Adapter defaults to `"Not Connected — Setup Guide"` with manual/CSV fallback until official merchant credentials are configured. | `IMPLEMENTED` |

---

## ৫. `VERIFY_REQUIRED` Items (No Assumptions Made)

Per Section 2, Section 8, and Section 11 of `00_CUSTOM_INSTRUCTION.md`, the following items require explicit business, legal, or merchant credential verification before production activation:

1. **`VERIFY_REQUIRED — MERCHANT CREDENTIALS` (Pathao & Steadfast Live API):** Live production client ID, secret, and webhook signing secrets must be provisioned from official Pathao and Steadfast merchant portals before enabling live API booking.
2. **`VERIFY_REQUIRED — BANGLADESH POST API`:** Bangladesh Post operates strictly in **Manual Booking & Tracking Workflow** (`bd_post`) until an official API specification is verified.
3. **`VERIFY_REQUIRED — PROFESSIONAL/LEGAL REVIEW`:** Chart of Accounts, VAT/Tax treatment, Consumer Rights compliance, and Supplier Consignment Contract terms require professional legal/accounting sign-off. Note: The **Escrow-style Holding Ledger** is strictly an **Internal Accounting Liability Tracking** mechanism, not a separate legally ring-fenced bank escrow account.
4. **`VERIFY_REQUIRED — BUSINESS PRINT RECIPIENT CONFIRMATION`:** The Three-Part A4 Print layout supports configurable Part 1 (Customer Invoice), Part 2 (Courier Box Sticker), and Part 3 (Warehouse / Accounts Internal Copy) with role-based field isolation; final physical cut-sheet distribution workflow remains configurable by Super Admin.
