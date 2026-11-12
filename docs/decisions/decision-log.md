# ARCHITECTURE DECISION LOG (ADR)
## পঞ্চগড় (PANCHAGARH) — Multi-Vendor Consignment F-Commerce

**Document Status:** `IMPLEMENTED`  
**Phase:** `PHASE 01 — ARCHITECTURE & CONTRACT`  

---

## ADR-001: Exact Integer Poisha & Basis Points Arithmetic
- **Date:** 2026-11-08
- **Status:** `TESTED`
- **Context:** Floating-point arithmetic in JavaScript (`0.1 + 0.2`) introduces rounding drift in commission splits, promo discounts, and vendor payouts.
- **Options:** (A) Decimal library, (B) Native integer Poisha (`1 BDT = 100 Poisha`) and integer Basis Points (`1% = 100 bp`).
- **Selected Option:** Option B — Pure integer Poisha and Basis Points with deterministic half-up rounding (`src/lib/money.ts`).
- **Consequences:** Zero floating-point drift across all 3-tier consignment calculations and double-entry journals.

---

## ADR-002: Strict Four-Role RBAC Lock (No 5th Role)
- **Date:** 2026-11-08
- **Status:** `APPROVED` & `IMPLEMENTED`
- **Context:** Section 2.5 of `02_BACKEND_MASTER_PROMPT.md` mandates exactly four internal roles (`super_admin`, `vendor`, `marketing_manager`, `packaging_manager`) and forbids creating a 5th role.
- **Options:** (A) Dynamic custom role creation, (B) Strict 4-Role union type with per-user module/field overrides within those 4 roles.
- **Selected Option:** Option B — Lock active role definitions strictly to the 4 canonical roles while allowing Super Admin to fine-tune module/field permissions.
- **Consequences:** Deterministic security matrix, zero privilege escalation through unverified custom roles, and complete RLS test coverage.

---

## ADR-003: Payment Methods Restricted Strictly to COD & Manual bKash
- **Date:** 2026-11-08
- **Status:** `APPROVED` & `IMPLEMENTED`
- **Context:** Section 2.3 and Section 10.2 of `00_CUSTOM_INSTRUCTION.md` mandate that only Cash on Delivery (`cod`) and Manual bKash (`bkash_manual`) are allowed, with zero payment gateways or unapproved payment options.
- **Options:** (A) Include Nagad/Rocket options in forms, (B) Restrict order creation and checkout strictly to `cod` and `bkash_manual`.
- **Selected Option:** Option B — Enforce `cod` and `bkash_manual` across Storefront Checkout, Admin Smart Order Entry, and Zod order creation validators.
- **Consequences:** 100% alignment with Panchagarh payment governance and Manual bKash `TrxID` duplicate-prevention workflow.

---

## ADR-004: Internal Escrow-Style Holding Liability vs. Regulated Bank Escrow
- **Date:** 2026-11-08
- **Status:** `CONFIRMED` (`VERIFY_REQUIRED — PROFESSIONAL/LEGAL REVIEW` for external banking claims)
- **Context:** Supplier payables must be held after delivery until collection reconciliation and return maturity (`hold_days`) complete.
- **Selected Option:** Implement `Pending` → `Locked` → `Available` buckets as an **Internal Accounting Liability Tracking** ledger (`vendor_ledger`), explicitly documenting that it does not claim a separate regulated bank escrow account.
- **Consequences:** Accurate internal financial control with full legal transparency.

---

## ADR-005: Cross-Vendor Access Returns `404 Not Found`
- **Date:** 2026-11-08
- **Status:** `TESTED`
- **Context:** Returning `403 Forbidden` when a vendor queries another vendor's product or order leaks the existence of that resource ID.
- **Selected Option:** Enforce `assertVendorOwnershipOr404` which throws `404 Not Found` on any cross-vendor access attempt.
- **Consequences:** Complete vendor-to-vendor isolation and zero ID enumeration leakage.
