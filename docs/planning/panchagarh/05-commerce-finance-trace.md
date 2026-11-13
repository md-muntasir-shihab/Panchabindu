# 05 — Commerce ও Finance End-to-End Trace

প্রতিটি ধাপে: বর্তমান code path → invariant → verification level → gap। Live provider status অনুমান করা হয়নি।

## 1. Catalog ও media → storefront

| ধাপ | Path | Invariant | Level | Gap |
|---|---|---|---|---|
| Vendor offer / price proposal | phase7 `vendor_price_proposals`, `supplier_product_offers` | 3-tier recalculation on approval | INSPECTED | — |
| Product approval → active | phase4c/product-studio; `product_status` enum | only approved visible | INSPECTED | — |
| Media upload | `POST /api/media` → sharp (16 MP limit, failOn warning) → WebP → `product-staging/<vendorId>/<asset>.webp`; tx rollback removes object | staging private; no SVG/HTML | INSPECTED | approve→public bucket promote `VERIFY_REQUIRED`; orphan cleanup job MISSING |
| Public read | `getPublicStorefrontData` → `StorefrontProductDTO` (no vendor/cost); page-data | forbidden fields stripped | `test:migration` | — |

## 2. Cart → checkout → order

```
browser cart (Zustand persist)            ← not truth
   │ POST /api/orders (cookie, CSRF, 10/min, 32KB)
   ▼
zod createOrderInputSchema → phone==session
   ▼
runWithAtomicStockLock( createStorefrontOrder )
   ├─ payment method ∈ {cod, bkash_manual}
   ├─ idempotency key (customer-scoped) + payload sha256  → replay returns same order / mismatch 422
   ├─ district/upazila validity
   ├─ bKash TrxID duplicate (non-cancelled orders)
   ├─ per-variant cumulative qty vs min(stockAvailable, onHand-reserved)
   ├─ 3-tier snapshot per line (server price; browser price ignored)
   ├─ promo (server validate), delivery charge (server `calculateDeliveryCharge`)
   └─ write order + lines + reservation; secure tracking token
   ▼
buildAndPersistOrderFulfillmentGroups → reconcileOrderReservationRecords → computeOrthogonalOrderState
```

Invariants held: server pricing ✓, zero-oversell (single process) ✓, idempotent ✓, customer-scoped ✓.
Gaps: (a) checkout **delivery preview** client-side `calculateDeliveryCharge` — display only, server recomputes, কিন্তু FE §5 "server-calculated" literal নয় → server quote endpoint/page-data (Phase F); (b) lock in-process (E3); (c) payment method list hardcoded (B8)।
Level: route guards `INSPECTED`; checkout UI `test:shopping` (order place করে না) → order placement **`TESTED_LOCAL` নয়**।

## 3. Stock: consignment → QC → reservation → release

| ধাপ | Path | Level | Gap |
|---|---|---|---|
| Dispatch lot (LOT-…) → warehouse QC → stock increment | phase7 + phase4c QC receipt; `consignment_dispatch_lots`, `inventory_ledger` append-only | INSPECTED | tests not wired |
| Reservation on order; release on cancel | phase3 engine | INSPECTED | reservation expiry job runner `UNVERIFIED` |
| Reconciliation (onHand vs reserved vs available) | phase3 stock reconciliation | INSPECTED | — |

## 4. Payment review → ledger

```
customer POST /api/payments/manual-bkash/submissions
   ├─ cookie + CSRF + ownsOrder + 12/10min
   ├─ submitManualBkashPayment: provider must be bkash; amount ≤ remaining due; TrxID uppercase; idempotent replay
   └─ status pending_verification; audit log
admin workspace operation (reviewer ≠ vendor/packaging)
   ├─ maker-checker (maker username ≠ checker) if staff-submitted
   ├─ approve requires: status ∈ {pending_verification, under_review}, amount ≤ due, reviewNoteBn
   ├─ advancePaidPoisha += amount (capped)
   └─ postVerifiedManualBkashPaymentJournal (balanced journal; Dr Cash/MFS, Cr Customer advance)
approved → change only via ledger reversal request
```

Invariants: no auto-verify ✓, duplicate TrxID ✓, maker-checker ✓, journal on approval ✓, immutable approved ✓.
Gaps: `payment_transactions` entity (B6); owner-configurable maker-checker threshold (B5); `needs_clarification`/`disputed` states (B7); evidence object (B2)।
Level: `INSPECTED`; ledger math `test:domain`; route-level `backend-endpoints.test.ts` not wired।

## 5. COD → courier → remittance → reconciliation

| ধাপ | Path | Level | Gap |
|---|---|---|---|
| Courier booking | phase5 adapters; `allowLiveBooking:false` → `LIVE_COURIER_BOOKING_LOCKED`; sandbox mode explicit | INSPECTED (unit test exists) | Decision D-06 credentials; UI simulation label check |
| Webhook status | `POST /api/webhooks/courier` HMAC fail-closed, timestamp, dedupe → shipment dim | INSPECTED | wire tests |
| COD collected → remittance received | phase4b courier 360, short-payment detector; phase6 bulk CSV remittance reconciliation; `courier_remittance_ledger` | INSPECTED | per-order collection status derived (04 §4.3) |
| Receivable journal | GL engine COD lifecycle (BE §10.4A) | `test:domain` ledger | — |

## 6. Settlement: pending → locked (7d) → available → payout

| ধাপ | Path | Level |
|---|---|---|
| Delivered → `DELIVERED_HOLD_LOCK` (7-day) | phase4b escrow ledger, phase5 simulator stage 5 | INSPECTED |
| Maturity promotion `EARNING_MATURED` | phase7 batch promoter | INSPECTED; scheduler `UNVERIFIED` |
| Payout request → hold/approve → record; fee bKash 185bp / bank 0 | phase4b + phase7 | INSPECTED |
| Vendor statement (own only) | phase4b statement, `/api/vendor/overview` | INSPECTED |

Legal note in code: holding ledger ≠ bank escrow — Decision D-09 (accountant sign-off) বজায়।

## 7. Return / refund / RTO

| ধাপ | Path | Level |
|---|---|---|
| Customer return request (7-day eligibility) | `POST /api/orders/return-request` (session) | INSPECTED |
| QC inspection: restock / damaged / rejected; 4-way fault liability | phase3 §6.4, phase4b Module E | INSPECTED |
| Refund execution (maker-checker) + payment reversal | `customer_refund_executions`, phase3/phase7 | INSPECTED |
| Ledger reversal (linked) | `ledger_reversal_requests` | INSPECTED |

## 8. Three-part print

`GET /api/print/:orderNo` (staff session) → phase4b print engine → customer / warehouse / accounts copies; `print_logs` reprint counter। Copy isolation: customer copy without vendor/cost; warehouse without price/TrxID; accounts full। `INSPECTED`; leakage test Phase I।

## 9. Financial invariants — সারণি

| Invariant | App-level | DB-level (normalized) | Runtime doc-store | Test |
|---|---|---|---|---|
| debit = credit | GL engine | CHECK + trigger | app only | `test:domain` |
| posted journal immutable | reversal policy | trigger | app only | partial |
| integer poisha | `assertIntegerPoisha`, zod `.int()` | BIGINT + CHECK | RPC `erp_validate_runtime_values` | `test:domain` |
| line snapshot consistency | read-time throw | CHECK (sql) | app | — |
| no auto-verify | reviewer required | maker-checker CHECK | app | unit (not wired) |
| TrxID unique | app scan | partial unique index | app | unit (not wired) |
| payable ≥ advance | cap | — | app | — |
| cross-vendor isolation | 404 + DTO | RLS | app | unit (not wired) |

## 10. Prohibited integration conflicts (trace-level)

- **Flash-sale engine (phase7 §3)** campaign discount → affects `platformMarginPoisha` only (never supplier payable) — margin-safe, কিন্তু **feature নিজেই নিষিদ্ধ**। Quarantine plan: config flag `storefront.flashCampaignsEnabled=false` default + admin panel section hidden + public DTO omit `promoCampaign.countdown` fields। Data retained. (D-08)
- **Google Sheets mirror (phase4c Module J)**: one-way, free Apps Script, credential masked; permission module `google_sync`. Not a tracker, not paid; "unnecessary third-party" দাবি Owner-নির্ভর (D-10)। Default proposal: disabled unless configured; কোনো kill নয়।
- **Order source enum `facebook/instagram/whatsapp`**: manual social-order entry channel, pixel নয় — compliant।
- **Expense/Ad-spend tracker**: manual entry; compliant।
- **Courier simulation**: explicitly labeled; compliant as long as UI label persists।
