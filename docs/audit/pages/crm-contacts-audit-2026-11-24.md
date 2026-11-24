# CRM, Contacts Directory, Cart Recovery & Blacklist — Audit (2026-11-24)

> Page: `/admin` → `CrmContactsPanel` (crm_contacts), role: super_admin + marketing/packaging staff per RBAC matrix
> Branch: `audit/crm-contacts-2026-11-24` (from `main` @ ea25a26)
> All claims `[TRACED]` (verified by reading the real code path). Screenshots provided were unreadable by the environment (parser failure) — code is the source of truth.
> Scope: unified customer directory (11-source merge), Customer A-Z profile view, abandoned cart reminder (wa.me/sms) + 1-click order conversion, fraud blacklist registry, segments/search/sort.

## 1. Findings

### CRM-01 — P1 · Security / Data-integrity (OWASP A06 Insecure Design / API6 BOLA-adjacent)
- **What:** The fraud blacklist is **never enforced server-side at order creation**:
  - `createStorefrontOrder` (repository.ts, both frontend + api-server copies) passes `isCustomerBlacklisted: false` **hardcoded** into `calculateOrderRiskScore` — the one parameter designed to carry blacklist state.
  - `phase4a-service.ts` (smart/admin order entry) also passes `isCustomerBlacklisted: false` hardcoded.
  - `recoverAbandonedCartToOrder` (phase6-service.ts) performs **no blacklist check at all** and calls `createStorefrontOrder` with `paymentMethod: 'cod'` — a blacklisted number's abandoned cart becomes a live COD order in 1 click.
- **Contradiction:** the product's own help text (`operational-help-modal.tsx`) claims "Blacklisted numbers automatically flag risk during checkout and smart order entry" — the code does not do this. `calculateOrderRiskScore` in `validators/index.ts` contains working blacklist logic (returns max risk), but its only two callers hardcode `false`, making the parameter dead in production.
- **Impact:** blacklisted fraudsters (flagged for repeated returns/fake orders) can keep placing COD orders via storefront, admin entry, AND cart recovery. Blacklist becomes a display label, not a control. Direct business loss vector (COD return cost, courier chargeback).
- **Evidence:** `[TRACED]` — repository.ts riskEval call, phase4a-service.ts call, recoverAbandonedCartToOrder full body, validators/index.ts signature read on main @ ea25a26.
- **Fix plan (root cause, minimal):**
  1. `createStorefrontOrder`: compute `isCustomerBlacklisted` from `readAdminStore().blacklistedPhones` keyed by `normalizeBdPhone(input.customerPhone)` and pass the real value to `calculateOrderRiskScore`. Keep function signature; store read already imported in repository (verify — if not, add import from phase4a-service).
  2. `phase4a-service.ts` smart entry: same — pass real value instead of `false`.
  3. `recoverAbandonedCartToOrder`: add an explicit guard — if the cart's phone is in `blacklistedPhones`, return `{ success: false, errorBn: 'গ্রাহকটি ব্ল্যাকলিস্টেড — আগে ব্ল্যাকলিস্ট থেকে সরাতে হবে।' }`. (Admin can still remove the number from blacklist and retry; recovery stays possible for legit customers.)
  4. Regression tests: extend the existing audit-api test script pattern with (a) blacklisted phone storefront order rejected/high-risk, (b) recover_abandoned_cart on a blacklisted phone's cart fails, (c) after blacklist remove, recovery succeeds.
  5. Note: frontend mirror files (`artifacts/panchabindu/src/lib/...`) must receive the same edit to keep the parity (DUP-01 family — both copies must change together).

### CRM-02 — P2 · Data-integrity (fraud score consistency)
- **What:** Fraud score has **three different formulas**: `computeCustomer360Directory` (returnedOrders*35 + cancelledOrders*15, blacklisted→95), panel's unified merge (blacklisted→90 via `Math.max(entry.fraudScore, 90)`), panel fallback fresh entry (blEntry→90). Directory shows one score, A-Z view can show another after recompute.
- **Impact:** operator sees inconsistent risk for the same customer across views; high_risk segment (`fraudScore < 55` filter) can silently mis-bucket.
- **Fix plan:** single source of truth — panel should prefer the server-computed `customers360` fraudScore when present (it already seeds first); only fall back to panel-derived when the contact exists in no directory (blacklist-only entries). Small, local.

### CRM-03 — P3 · Code-quality (duplicate blacklist UIs)
- **What:** `phase4c-panels.tsx` contains an older blacklist form calling the same `upsert_blacklist` operation; CrmContactsPanel is the canonical surface. Two surfaces mutate the same registry.
- **Fix plan:** verify phase4c panel's blacklist section usage (which tab renders it); if it's the legacy Finance panel still reachable, either hide the section or link to the CRM tab. Low priority; no data risk (same operation, same RBAC).

### CRM-04 — observation (no action): audit trail coverage is GOOD
`upsertCustomerBlacklist` and cart reminder/recovery all write immutable audit logs with actor attribution (`CUSTOMER_BLACKLIST_ADDED/REMOVED`, `ABANDONED_CART_REMINDER_DISPATCHED`, `ABANDONED_CART_RECOVERED_TO_ORDER`). Phone normalized (`normalizeBdPhone`) before storage — no trivial bypass via formatting. Vendor role explicitly denied. RBAC matrix: `record_cart_reminder` ALLOW for marketing, `upsert_blacklist` → orders.update, `recover_abandoned_cart` → orders.create. `[TRACED]`

## 2. Verified secure `[TRACED]`
- Route: zod discriminated union (`upsert_blacklist`: phone min 10 + enum add/remove; cart ops), handlers gate vendor role, RBAC fail-closed policy map.
- `upsertCustomerBlacklist`: vendor denied, phone normalized, reason default if empty, full audit write.
- Cart recovery idempotency: `recover-<cartId>-<Date.now()>` key + `cart.isRecovered` early-return — a double-submit creates at most one order (guard-before-create race exists in theory but doc-store single-threaded writes make it benign in dev; Postgres runtime dedupes via idempotency key).
- GET workspace: `blacklistedPhones` hidden from vendor role.
- Customer A-Z view: blacklist action gated by `isSuperAdmin` prop; phone validated client-side AND server-side.

## 3. Threat Matrix (page-specific)

| Threat | Verdict |
|---|---|
| Blacklisted customer bypasses order placement | **VULNERABLE — CRM-01 (P1)** |
| Vendor edits blacklist or recovers carts | Guarded (role denial + RBAC) |
| Mass-assignment via workspace operations | Guarded (zod union + handler whitelist) |
| Stored XSS via reasonBn / customer names | Guarded (React text nodes; no dangerouslySetInnerHTML in these panels) |
| Double-recovery race → duplicate orders | Guarded (isRecovered guard + idempotency key) |
| Enumeration of wa.me recovery links | Accepted (links contain no secrets; cart ids non-sequential enough for dev) |
| Fraud score confusion across views | CRM-02 (P2) |

## 4. Status

**FAIL — one P1 (CRM-01) must be fixed before this page passes.** CRM-02/03 logged with plans. Dynamic verification BLOCKED on the owner's environment (Node 22 switch pending, same blocker as prior pages).

## 5. Owner commands after fix lands

```powershell
nvm use 22.20.0
npm run dev
npm run test:crm:api        # to be added with CRM-01 regression tests
npm run test:catalog:api ; npm run test:orders:api    # shared-file consumers (repository.ts!)
npm run typecheck
```
