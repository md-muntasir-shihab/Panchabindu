# Implementation Plan: Phase 7 — Admin ERP Completion & Advanced MFS / Advance Courier Charge Engine

## 1. Overview
In accordance with the **Panchagarh Master Repair & Completion Specification** and the user's latest operational requirements, this plan completes **Phase 7 — Admin ERP Completion** while resolving the visual & functional gaps highlighted in the screenshot:
1. **Multi-Channel Manual MFS (bKash, Nagad, Rocket)**: Customer checkout and admin payment verification support all 3 popular Bangladesh MFS channels with manual TrxID.
2. **Product-Level Advance Courier Charge Configuration**: Products can require mandatory advance delivery charges + custom deposit.
3. **Orders Grid Inline TrxID & Confirm Action Fix**: Orders grid displays payment channel, TrxID, and advance courier charge status; clicking "হ্যাঁ (Confirm)" allows staff to view and verify the TrxID simultaneously.
4. **Advance Courier Accounting & Ledger Tracking**: Clear breakdown of collected advance delivery fees vs courier delivery costs in Courier 360 & General Ledger.
5. **Group-Based Navigation & `ⓘ` Tooltips**: Admin ERP left sidebar organized into functional groups with comprehensive educational tooltips.

---

## 2. Proposed Changes & Architecture

### A. Data Models & Validation (`/src/types/`, `/src/lib/validators/`, `/src/lib/db/`)
- **Payment Method Expansion**:
  - Update `PaymentMethod` enum to support `'cod' | 'bkash_manual' | 'nagad_manual' | 'rocket_manual'`.
  - Update checkout validation schema in `/src/lib/validators/` to validate bKash, Nagad, and Rocket transaction IDs (8-12 alphanumeric characters) and sender phone numbers.
- **Product Advance Courier Settings**:
  - Add `requiresAdvanceCourierCharge: boolean` and `customAdvanceDepositPoisha: number` to `InternalProductRecord` and `StorefrontProductDTO`.
  - When any cart product has `requiresAdvanceCourierCharge === true`, checkout enforces:
    $$\text{Advance Required} = \text{Full District Delivery Charge} + \text{Product Advance Deposit}$$
    and blocks pure COD submission until an MFS TrxID is provided.

### B. Admin Product Studio (`/src/components/admin/product-studio-panel.tsx`)
- Add an explicit toggle and amount field in the Product Editor:
  - **অগ্রিম কুরিয়ার চার্জ বাধ্যতামূলক (Require Advance Courier Charge)**
  - **অতিরিক্ত অগ্রিম ডিপোজিট (ঐচ্ছিক পয়সা/টাকা)**
- When enabled, shows `ⓘ` tooltip explaining: *"এই পণ্যটি অর্ডারের ক্ষেত্রে গ্রাহককে ডেলিভারি চার্জ (ঢাকা ৭০ / ঢাকার বাইরে ১২০) এবং নির্ধারিত ডিপোজিট অগ্রিম বিকাশ/নগদ/রকেটে পরিশোধ করতে হবে।"*

### C. Storefront Checkout (`/src/components/storefront/checkout-client.tsx`)
- Display selectable MFS tabs: **বিকাশ (bKash)**, **নগদ (Nagad)**, **রকেট (Rocket)** alongside COD.
- Display company personal/merchant account numbers for each provider.
- Input fields for Customer Sender Phone and Transaction ID (TrxID) with copy-paste assistance and clear guidance.

### D. Admin Orders Grid & Confirmation Fix (`/src/components/admin/orders-grid-panel.tsx` & `/src/lib/admin/phase4a-service.ts`)
- **Inline TrxID & Advance Courier Charge Status**:
  - In the "Total / COD" column and "Status & Action" column:
    - Display MFS Badge (`bKash`, `Nagad`, `Rocket`) + TrxID badge with quick copy.
    - Display Advance Payment Status badge: `অগ্রিম চার্জ: ৳[X] ভেরিফাইড` or `অগ্রিম চার্জ: ৳[X] যাচাই বাকি`.
- **Confirmation Action with TrxID Review**:
  - When clicking "হ্যাঁ (Confirm)" on an order with a pending TrxID, render an inline confirmation popover showing:
    - Provider Logo & Name (e.g. `নগদ TrxID: 7K89M2N1`)
    - Sender Phone & Paid Amount (e.g. `৳120 অগ্রিম কুরিয়ার চার্জ`)
    - Button: **"যাচাই ও কনফার্ম করুন (Verify & Confirm)"** that atomically marks payment verified, updates order status to `confirmed`, and logs to immutable audit trail.

### E. Admin ERP Group-Based Navigation & ⓘ Tooltips
- Organize Admin ERP sidebar into logical groups:
  1. **কোর অপারেশনস (Core Operations)**: আজকের কাজ (Today), অর্ডার ম্যানেজমেন্ট (Orders), প্রিন্ট ইঞ্জিন (Print 3-Part)
  2. **কনসাইনমেন্ট ক্যাটালগ (Catalog & Vendors)**: প্রোডাক্ট স্টুডিও (Products), স্টক ও ওয়্যারহাউস (Inventory), ভেন্ডর ম্যানেজমেন্ট (Vendors)
  3. **ফাইন্যান্স ও লেজার (Finance & Courier)**: কুরিয়ার ও এসক্রো (Courier 360), ডাবল-এন্ট্রি লেজার (Ledger & Payouts), ব্যয় হিসাব (Expenses)
  4. **গ্রাহক ও অটোমেশন (CRM & Tools)**: কাস্টমার ৩৬০ (Customer CRM), অটোমেশন ও মেসেজিং (Messaging), সেটিংস (Settings)
- Add `ⓘ` tooltip component across financial metrics, risk scores, escrow maturity, and return reasons.

### F. Automated Verification Tests (`/src/lib/admin/phase7.test.ts` & `/src/lib/db/repository.test.ts`)
- Add automated test cases verifying:
  1. Product Studio save and persistence of `requiresAdvanceCourierCharge`.
  2. Storefront checkout validation enforcing manual Nagad and Rocket advance charges.
  3. Orders grid one-click action verifying TrxID and confirming order.
  4. Full test suite passing with 0 errors.

---

## 3. Execution Plan
1. **Step 1: Domain & Validation Types**: Update `PaymentMethod`, `InternalProductRecord`, and Zod validators for Nagad, Rocket, and product advance flags.
2. **Step 2: Repository & Seed Store Migration**: Update persistent repository to handle Nagad & Rocket submissions and seed sample orders with advance courier charges.
3. **Step 3: Product Studio Panel**: Add advance courier charge toggle and inputs in Admin Product Studio.
4. **Step 4: Storefront Checkout**: Support bKash, Nagad, and Rocket MFS selection and advance calculations.
5. **Step 5: Orders Grid & Confirmation Fix**: Add inline TrxID review, MFS badges, advance tracking, and seamless verify-and-confirm action in Orders Grid.
6. **Step 6: Group-Based Navigation & Tooltips**: Modernize Admin ERP navigation and add `ⓘ` tooltips.
7. **Step 7: Testing & Verification**: Run `bun test`, `compile_applet`, and `lint_applet` to verify 100% pass and 0 errors.
