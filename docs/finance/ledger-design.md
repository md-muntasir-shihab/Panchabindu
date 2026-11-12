# PHASE 04 — DOUBLE-ENTRY GENERAL LEDGER & ESCROW-STYLE HOLDING DESIGN
## পঞ্চগড় (PANCHAGARH) — Financial Control, Chart of Accounts & Consignment Accounting

**Document Status:** `IMPLEMENTED` & `TESTED` (Phase 4 Verified)  
**Core Engine Files:**
- `src/lib/finance/phase4-general-ledger-engine.ts`
- `src/lib/money.ts`
- `src/lib/db/product-sync.ts`
- `src/lib/admin/phase4b-service.ts`
- `src/lib/admin/phase7-service.ts`
- `supabase/migrations/0008_phase2_schema_rls_and_gl_completion.sql`

> **Legal & Accounting Notice (`VERIFY_REQUIRED — PROFESSIONAL/LEGAL REVIEW`):**  
> In this platform, **Escrow-style Holding Ledger** refers strictly to **Internal Accounting Liability Tracking** (`Pending` → `Locked` → `Available` vendor payable buckets). It does not claim or represent a legally ring-fenced bank escrow account under Bangladesh banking regulations unless verified by professional legal/banking arrangements.

---

## ১. Three-Tier Consignment Pricing Formula (Integer Poisha)

Every product variant and order line item strictly obeys:

$$\text{Supplier Cost (Poisha)} + \text{Supplier Profit (Poisha)} = \text{Supplier Payable (Poisha)}$$
$$\text{Supplier Payable (Poisha)} + \text{Platform Margin (Poisha)} = \text{Final Sale Price (Poisha)}$$

- **1 BDT = 100 Poisha** (Safe integers only; zero floating-point arithmetic).
- **Currency:** Explicitly stored as `'BDT'` on all general ledger journals and reconciliations.
- **Commission Priority Hierarchy:**
  1. Product Override (`product.commissionOverrideBp`)
  2. Vendor Default (`vendor.defaultCommissionBp`)
  3. Global Default (`globalDefaultCommissionBp = 1500` bp = 15.00%)
- **Golden Consignment Rule (Promo Discount):** Promotional discounts deduct strictly from `platformMarginPoisha`. `supplierPayablePoisha` is never reduced without explicit vendor consent.

---

## ২. Double-Entry General Ledger & Chart of Accounts (`gl_chart_of_accounts`)

Every posted financial journal entry strictly enforces:

$$\sum \text{Debit (Poisha)} = \sum \text{Credit (Poisha)} > 0$$

### Chart of Accounts
- **Assets (`DEBIT` Normal Balance):**
  - `1010` — Cash & Bank Verified (`যাচাইকৃত নগদ ও ব্যাংক তহবিল`)
  - `1020` — Manual bKash Unverified Clearing (`ম্যানুয়াল বিকাশ ক্লিয়ারিং`)
  - `1030` — Courier COD Receivable — In-Transit / Delivered Unremitted (`কুরিয়ার সিওডি প্রাপ্য`)
  - `1040` — Courier Damage & Short-Payment Claim Receivable (`কুরিয়ার ক্ষতিপূরণ ও শর্ট-পেমেন্ট দাবি প্রাপ্য`)
  - `1050` — Supplier Post-Payout Clawback Receivable (`সাপ্লায়ার পেআউট-পরবর্তী ক্লব্যাক প্রাপ্য`)
- **Liabilities (`CREDIT` Normal Balance):**
  - `2010` — Supplier Holding Liability — Pending Delivery (`সাপ্লায়ার হোল্ডিং দায় — Pending`)
  - `2015` — Supplier Holding Liability — Locked 7-Day Hold (`সাপ্লায়ার হোল্ডিং দায় — Locked`)
  - `2020` — Supplier Payable — Matured / Available for Settlement (`সাপ্লায়ার প্রদেয় — Available`)
  - `2025` — Supplier Payout Hold Reserved (`সাপ্লায়ার পেআউট হোল্ড রিজার্ভড`)
  - `2030` — Customer Advance & Refund Liability (`গ্রাহক অগ্রিম ও রিফান্ড প্রদেয় দায়`)
  - `2040` — VAT Payable on Platform Commission (5%) (`প্ল্যাটফর্ম কমিশনের ওপর প্রদেয় ভ্যাট`)
- **Equity (`CREDIT` Normal Balance):**
  - `3010` — Platform Retained Earnings (`প্ল্যাটফর্ম সংরক্ষিত আয়`)
- **Revenue (`CREDIT` Normal Balance):**
  - `4010` — Gross Consignment Merchandise Sales Control (`গ্রস কনসাইনমেন্ট পণ্য বিক্রয় কন্ট্রোল`)
  - `4020` — Platform Commission / Margin Revenue (`প্ল্যাটফর্ম কমিশন ও মার্জিন রাজস্ব`)
  - `4030` — Customer Delivery Charge Recovery (`গ্রাহক ডেলিভারি চার্জ আদায়`)
- **Expenses (`DEBIT` Normal Balance):**
  - `5010` — Courier Delivery & COD Fee Expense (`কুরিয়ার ডেলিভারি ও সিওডি চার্জ খরচ`)
  - `5020` — Unrecovered Return & Warehouse Damage Loss (`অনাদায়ী রিটার্ন ও ওয়্যারহাউস ড্যামেজ ক্ষতি`)
  - `5030` — Promotional Margin Discount Subsidy (`প্রোমোশনাল মার্জিন ডিসকাউন্ট ভর্তুকি`)
  - `5040` — Packaging, Ad Spend & Operating Expense (`প্যাকেজিং, বিজ্ঞাপন ও অপারেটিং খরচ`)

---

## ৩. Separate Financial Flows (Zero Double-Counting)

1. **Verified Manual bKash Payment (`MANUAL_BKASH_VERIFIED`):**
   - `Dr 1010 Cash & Bank Verified` / `Cr 2030 Customer Advance & Refund Liability`
   - Requires Maker-Checker separation (`creator !== verifier`). Does not prematurely recognize merchandise revenue before delivery.
2. **Order Delivery Recognition (`ORDER_DELIVERED_COD_RECOGNITION`):**
   - `Dr 1030 Courier COD Receivable` (`codCollectablePoisha`)
   - `Dr 2030 Customer Advance Liability` (`advancePaidPoisha`)
   - `Dr 5030 Promotional Margin Discount Subsidy` (`promoDiscountPoisha`)
   - `Cr 2015 Supplier Holding Liability — Locked Escrow` (per-vendor `supplierPayablePoisha`)
   - `Cr 4020 Platform Commission / Margin Revenue` (`platformMarginPoisha`)
   - `Cr 4030 Customer Delivery Charge Recovery` (`deliveryChargePoisha`)
3. **Courier COD Remittance Settlement (`COURIER_REMITTANCE_SETTLED`):**
   - `Dr 1010 Cash & Bank Verified` (`remittedCashPoisha`)
   - `Dr 5010 Courier Delivery & COD Fee Expense` (`courierFeeDeductedPoisha`)
   - `Dr 1040 Courier Claim Receivable` (`shortPaymentPoisha`, if any)
   - `Cr 1030 Courier COD Receivable` (`expectedCodPoisha`)
   - Pure asset conversion + fee recognition — never double-counts `4020` revenue.
4. **Escrow Hold Maturity Release (`ESCROW_HOLD_MATURED`):**
   - `Dr 2015 Supplier Holding Liability — Locked` / `Cr 2020 Supplier Payable — Available`
   - Blocked (`DISPUTE_HOLD_ACTIVE_RELEASE_BLOCKED`) if an active Return/Dispute/Chargeback hold exists on that order.
5. **Supplier Payout Hold & Maker-Checker Settlement (`SUPPLIER_PAYOUT_HOLD_PLACED` & `SUPPLIER_SETTLEMENT_DISBURSED`):**
   - Hold: `Dr 2020 Available` / `Cr 2025 Payout Hold Reserved`
   - Disbursed (Maker !== Checker): `Dr 2025 Payout Hold Reserved` / `Cr 1010 Cash & Bank Verified`

---

## ৪. Accounting Invariants Enforced in Code

- **Balanced Journals Only:** `totalDebitPoisha === totalCreditPoisha > 0`.
- **Immutable Posted Journals:** `EDIT` and `DELETE` on posted journals return `IMMUTABLE_POSTED_JOURNAL`. Corrections require `reversePostedJournalEntry` with Maker-Checker approval.
- **No Direct Balance Edits:** `attemptDirectAccountBalanceEdit` is strictly blocked (`DIRECT_BALANCE_EDIT_FORBIDDEN`); all balances are derived from posted `GLJournalLine` rows.
- **Closed Period Protection:** Posting into a `CLOSED` accounting period returns `ACCOUNTING_PERIOD_CLOSED`.
- **Idempotency:** Duplicate `idempotencyKey` submissions return `idempotentReplay: true` without creating duplicate ledger lines.
