# CRM-01 Patch — Enforce fraud blacklist at order creation & cart recovery

> Branch: `audit/crm-contacts-2026-11-24`
> Severity: P1 (OWASP Top 10:2025 A06 Insecure Design)
> Regression tests: `scripts/src/crm-blacklist-enforcement.test.mjs` (`npm run test:crm:api`) — fail before, pass after.
> Apply with `git apply docs/audit/patches/crm-01-blacklist-enforcement.patch` from repo root.

## Files (4 edits, both mirrors must change together — DUP-01 parity)

### 1. `artifacts/api-server/imported/src/lib/db/repository.ts` — createStorefrontOrder riskEval

```diff
+  const isCustomerBlacklisted = Boolean(
+    (readAdminStore().blacklistedPhones ?? {})[normalizeBdPhone(input.customerPhone) ?? '']
+  );

   const riskEval = calculateOrderRiskScore({
     customerTotalOrders: 0,
     customerReturnedOrders: 0,
-    isCustomerBlacklisted: false,
+    isCustomerBlacklisted,
     addressQualityScore: addrQuality.score,
     districtSuccessRateBp: 9000,
     totalPayablePoisha,
```

Imports: `readAdminStore` from `../admin/phase4a-service` (add if absent); `normalizeBdPhone` from `../validators` (already imported in this file — verify).

### 2. `artifacts/panchabindu/src/lib/db/repository.ts` — identical edit (frontend mirror)

Same diff as #1, byte-for-byte.

### 3. `artifacts/api-server/imported/src/lib/admin/phase4a-service.ts` — smart order entry

```diff
   const riskEval = calculateOrderRiskScore({
     ...
-    isCustomerBlacklisted: false,
+    isCustomerBlacklisted: Boolean(
+      (readAdminStore().blacklistedPhones ?? {})[normalizeBdPhone(input.customerPhone) ?? '']
+    ),
```

`readAdminStore` is defined in this same file — no new import needed. Verify `normalizeBdPhone` import exists.

### 4. `artifacts/panchabindu/src/lib/admin/phase4a-service.ts` — identical edit (mirror)

### 5. `artifacts/api-server/imported/src/lib/admin/phase6-service.ts` — recoverAbandonedCartToOrder guard

Insert AFTER the `if (cart.isRecovered && cart.recoveredOrderNo)` early-return, BEFORE `const upazilas = ...`:

```ts
  const blacklistEntry =
    adminStore.blacklistedPhones[normalizeBdPhone(cart.customerPhone) ?? ''];
  if (blacklistEntry) {
    return {
      success: false,
      errorBn: `গ্রাহকটি ব্ল্যাকলিস্টেড (${blacklistEntry}) — আগে ব্ল্যাকলিস্ট থেকে সরাতে হবে।`,
    };
  }
```

`adminStore` is already read at function top (`readAdminStore()`); `normalizeBdPhone` already imported from `../validators`.

### 6. `artifacts/panchabindu/src/lib/admin/phase6-service.ts` — identical guard (mirror)

## Behavior contract

- Blacklisted phone + storefront order → riskScore 100 (calculateOrderRiskScore returns max for blacklisted) instead of a falsely low score.
- Blacklisted phone + smart admin entry → same.
- Blacklisted phone + abandoned cart recovery → rejected with bilingual error naming the blacklist reason; no order created, no stock reserved.
- Removing the number from blacklist (existing `upsert_blacklist` remove flow) restores recovery — admin retains the escape hatch.
- Non-blacklisted customers: zero behavioral change (riskEval was hardcoded `false` before, which is also the correct computed value for them).

## Verification (after apply)

```powershell
npm run typecheck
npm run dev                        # Terminal 1
npm run test:crm:api                # 3/3 PASS expected
npm run test:catalog:api           # repository.ts consumers
npm run test:orders:api             # order path consumers
```

Commit message: `fix(crm): enforce fraud blacklist at order creation and cart recovery (CRM-01, OWASP A06)`
