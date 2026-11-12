# SECURITY MODEL & FOUR-ROLE RBAC SPECIFICATION
## পঞ্চগড় (PANCHAGARH) — Security & Access Control Architecture

**Document Status:** `IMPLEMENTED` & `TESTED`  
**Core Enforcement File:** `src/types/permissions.ts` & `supabase/migrations/0006_rls_policies_and_views.sql`

---

## ১. Strict Four-Role Access Control (No 5th Role)

Per `00_CUSTOM_INSTRUCTION.md` Section 1.1 and `02_BACKEND_MASTER_PROMPT.md` Section 2.5, internal access is restricted to **four canonical roles**:

| Module | `super_admin` | `vendor` | `marketing_manager` | `packaging_manager` |
|---|---|---|---|---|
| **Global Dashboard** | Full | Own Summary | Marketing Summary | Operations Summary |
| **Vendors** | Full | Own Profile Only | Denied | Assigned View |
| **Products & Catalog** | Full | Own Offers Only | Content & Media | Read Only |
| **Pricing & Margin** | Full (3-Tier) | Own Cost/Profit/Payable | Public Price Only | Denied |
| **Inventory & QC** | Full | Own Stock Only | Denied | Operational Receiving/Movement |
| **Orders** | Full | Own Relevant Lines (Masked PII) | Aggregate & Social Entry | Operational Fulfillment |
| **Courier & Delivery** | Full | Denied | Denied | Booking & Tracking |
| **Payment & Ledger** | Full | Own Payable Statement | Denied | Denied |
| **Settlement** | Maker-Checker Approve | Request Own Available Balance | Denied | Denied |
| **Three-Part A4 Print** | All 3 Parts | Denied | Denied | Part 1 & Part 2 (Part 3 Restricted) |
| **Staff & Security** | Full | Denied | Denied | Denied |

---

## ২. Server-Side Field Stripping & PII Masking Rules

1. **Public Customer (`public_customer`):**
   - Strips all vendor identifiers (`vendorId`, `vendorCode`, `internalVendorSku`) and all internal pricing tiers (`supplierCostPoisha`, `supplierProfitPoisha`, `supplierPayablePoisha`, `platformMarginPoisha`).
2. **Marketing Manager & Supply/Packaging Manager (`marketing_manager` / `packaging_manager`):**
   - Strips `supplierCostPoisha`, `supplierProfitPoisha`, `platformMarginPoisha`, `estimatedProfitAtEntryPoisha`, and `netProfitPoisha`.
3. **Vendor / Supplier (`vendor`):**
   - Strips `platformMarginPoisha`, `commissionOverrideBp`, `defaultCommissionBp`, and `estimatedProfitAtEntryPoisha`.
   - Masks customer phone (`017****1234`) and street address (`[গোপনীয় ঠিকানা — অ্যাডমিন নিয়ন্ত্রিত]`) by default unless explicitly unlocked by Super Admin.
   - Cross-vendor access (`ctx.vendorId !== resourceVendorId`) throws `404 Not Found` (never `403 Forbidden`) to prevent resource enumeration.

---

## ৩. Authentication, Lockout & First-Login 2FA Gate

- **No Public Staff Sign-up:** Only `super_admin` can provision staff or vendor accounts.
- **5-Attempt Brute-Force Lockout:** 5 consecutive failed password or TOTP attempts lock the account for 30 minutes and record a security event.
- **Mandatory First-Login Gate (`isFirstLoginGateCleared`):** Newly created accounts cannot access any workspace API or dashboard view until they change their temporary password (`mustChangePassword === false`) and enroll TOTP 2FA (`totpEnrolled === true`).
- **Masked Credentials Vault:** External API keys (Pathao, Steadfast, Resend, SMS Gateway) are stored server-side and returned to the UI strictly as masked previews (`****abcd`). Raw secrets never enter the browser bundle.
