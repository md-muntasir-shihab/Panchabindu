# CRM-01 (P1) — Fraud Blacklist Enforcement — Exact Patch

> Status: FIX NOT APPLIED TO CODE YET. This is the exact edit to apply in Cursor/local editor.
> Branch: `audit/crm-blacklist-fix-2026-11-24` (created from main @ ec54601)
> Regression test ALREADY on main: `scripts/src/crm-blacklist-enforcement.test.mjs` — it FAILS today; must pass after this patch.
> Dynamic verification BLOCKED in this session (no shell) — owner must run the commands in §6.

## Finding recap `[TRACED]`

`calculateOrderRiskScore` (validators/index.ts, both copies) has working blacklist logic — `isCustomerBlacklisted: true` returns maximum risk. But its callers hardcode `false`:

- `createStorefrontOrder` → `repository.ts` (both `artifacts/panchabindu/src/lib/db/repository.ts` AND `artifacts/api-server/imported/src/lib/db/repository.ts`) passes `isCustomerBlacklisted: false` `[TRACED]`
- Admin smart order entry → `phase4a-service.ts` (both copies) passes `isCustomerBlacklisted: false` `[TRACED]`
- `recoverAbandonedCartToOrder` → `phase6-service.ts` (both copies) performs NO blacklist check before converting an abandoned cart into a live COD order `[TRACED]`

Result: the fraud blacklist is a display label, not a server-side control. Blacklisted fraudsters can keep placing COD orders via storefront, admin entry, and cart recovery.

OWASP mapping: A06 Insecure Design (OWASP Top 10:2025); API6 Unrestricted Access to Sensitive Business Flows (API Top 10:2023).

## Patch

Apply to BOTH copies of each file (frontend mirror `artifacts/panchabindu/src/...` and backend `artifacts/api-server/imported/src/...` — DUP-01 parity rule).

### 1) `src/lib/db/repository.ts` — createStorefrontOrder

Near the top of `createStorefrontOrder` (where phone is available), compute the real blacklist state. In the api-server copy, import the admin store reader if not already imported:

```ts
import { readAdminStore } from '../admin/phase4a-service';
```

(Frontend mirror uses the same relative import from its own copy of phase4a-service.)

Then replace the hardcoded risk input in the `calculateOrderRiskScore` call:

```ts
// BEFORE [TRACED on main]
const riskEval = calculateOrderRiskScore({
  customerTotalOrders: 0,
  customerReturnedOrders: 0,
  isCustomerBlacklisted: false,
  addressQualityScore: addrQuality.score,
  districtSuccessRateBp: 9000,
  totalPayablePoisha,
```

```ts
// AFTER — CRM-01: enforce the fraud blacklist server-side at order creation.
const isCustomerBlacklisted = Boolean(
  readAdminStore().blacklistedPhones[normalizeBdPhone(input.customerPhone)]
);
const riskEval = calculateOrderRiskScore({
  customerTotalOrders: 0,
  customerReturnedOrders: 0,
  isCustomerBlacklisted,
  addressQualityScore: addrQuality.score,
  districtSuccessRateBp: 9000,
  totalPayablePoisha,
```

Notes:
- `normalizeBdPhone` and `readAdminStore` must exist/import cleanly in repository.ts; if `normalizeBdPhone` is not exported from validators, import it from its existing module (`grep -rn "export function normalizeBdPhone" artifacts/api-server/imported/src`).
- `createStorefrontOrder` runs inside `runWithAtomicStockLock`; a read-only admin-store read is safe there.

### 2) `src/lib/admin/phase4a-service.ts` — smart/admin order entry

Replace:

```ts
// BEFORE [TRACED on main]
const riskResult = calculateOrderRiskScore({
  customerTotalOrders: customerPastOrders.length,
  customerReturnedOrders: customerReturnedCount,
  isCustomerBlacklisted: false,
  addressQualityScore: addressQuality.score,
  districtSuccessRateBp: 8800,
  totalPayablePoisha,
```

with:

```ts
// AFTER — CRM-01: real blacklist state instead of hardcoded false.
const isCustomerBlacklisted = Boolean(
  readAdminStore().blacklistedPhones[normalizeBdPhone(payload.customerPhone)]
);
const riskResult = calculateOrderRiskScore({
  customerTotalOrders: customerPastOrders.length,
  customerReturnedOrders: customerReturnedCount,
  isCustomerBlacklisted,
  addressQualityScore: addressQuality.score,
  districtSuccessRateBp: 8800,
  totalPayablePoisha,
```

Use the actual phone variable in that scope (it may be named `customerPhone` or `input.customerPhone` — match the surrounding code).

### 3) `src/lib/admin/phase6-service.ts` — recoverAbandonedCartToOrder

Add an explicit guard BEFORE the call to `createStorefrontOrder` (or before stock reservation begins):

```ts
// CRM-01: never convert an abandoned cart into a live order while the
// customer's phone is on the fraud blacklist. Remove from blacklist first.
const blacklistReasonBn = readAdminStore().blacklistedPhones[normalizeBdPhone(cart.customerPhone)] ?? null;
if (blacklistReasonBn) {
  return {
    success: false,
    errorBn: 'গ্রাহকের ফোন নম্বরটি ব্ল্যাকলিস্টেড — আগে ব্ল্যাকলিস্ট থেকে সরান, তারপর অর্ডার রিকভারি করুন।',
  };
}
```

Adjust the variable holding the cart's phone to match scope (`cart.customerPhone`). Ensure the return type already includes `success: false` + `errorBn` (it does for other failure paths in the same function).

### 4) Frontend mirror parity (DUP-01)

Apply identical edits to:
- `artifacts/panchabindu/src/lib/db/repository.ts`
- `artifacts/panchabindu/src/lib/admin/phase4a-service.ts`
- `artifacts/panchabindu/src/lib/admin/phase6-service.ts`

### 5) Register the regression test (it is on main but NOT in any npm script)

`scripts/package.json` — add to `"scripts"`:

```json
"test:crm": "node --test ./src/crm-blacklist-enforcement.test.mjs",
```

Run it against the dev preview (needs `npm run dev` running and an admin-authorized preview session).

## 6) Owner verification commands `[BLOCKED in this session — no shell]`

```powershell
nvm use 22.20.0
npm run dev
# new tab:
npm run test:crm          # CRM-01: expect 3/3 pass (before fix: test 1 and 3 FAIL)
npm run test:security     # expect 12/12 — phase4a.test.ts and phase6.test.ts must stay green (regression check)
npm run test:payments     # stock lock / ledger consumers of createStorefrontOrder
npm run typecheck
```

## 7) Blast radius — consumers to re-test after the patch

| Changed file | Known consumers |
|---|---|
| `repository.ts` (api-server) | `/api/orders` POST (storefront checkout), `/api/cart/abandoned` recovery path, `test:payments`, `test:security` |
| `phase4a-service.ts` | Admin workspace smart order entry (`/api/admin/workspace`), orders grid actions, `phase4a.test.ts` |
| `phase6-service.ts` | Admin `recover_abandoned_cart` operation, CRM panel 1-click conversion, `phase6.test.ts` |
| Frontend mirrors | `test:domain`, Vite build |

Behavior change: blacklisted phones now get maximum risk score at order creation (storefront order may then be rejected or flagged by existing risk policy — verify `riskAdvanceMandatoryScore` interplay in settings) and cart recovery hard-fails for blacklisted phones. This is the intended control; the product help text already promises it.
