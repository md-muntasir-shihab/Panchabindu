# Orders Grid & Verification — Page Trace — 2026-11-24

Page: Orders Grid (`orders_grid`) + Manual bKash Verification flow · route `/admin` · roles: super_admin (review), packaging/order_moderator (grid actions, RBAC-scoped) · components: `OrdersGridMinimal`, `OrderDetailsSheet`, `OrderDispatchSheet`, `OrderPrintPreviewSheet`, today_screen queue card (`ord-verify-bkash-queue`).
Baseline: Orders Grid + 4 sheets previously audited 2026-11-21 with executed browser/API PASS records (LEDGER §2). This round traces the **verification sub-chain** specifically. Code-search API was rate-limited mid-round; findings tagged [TRACED] from the slices read before the limit.

## Verification chain (traced end-to-end)
1. Customer submits manual bKash claim → `manualBkashSubmissions[]`, status `pending_verification`; TrxID uppercase; idempotent replay; duplicate TrxID blocked (unique active index).
2. Orders Grid / today_screen surfaces it: `todayQueues.verifyBkashCount` counter → alert card "বিকাশ TrxID যাচাই বাকি: N টি অর্ডার" (`ord-verify-bkash-queue`) in `admin-erp-client.tsx` [TRACED].
3. Review action: workspace operation `review_manual_bkash` — zod-strict body (`orderNo`, optional `trxId`, `decision: under_review|approved|rejected|reversed`, `reviewNoteBn`) [TRACED route.ts].
4. Maker-checker: `OrderDetailsSheet` blocks approving a TrxID the same reviewer previously touched (`makerCheckerBlockedTrx[sub.trxId]`) [TRACED]; policy test asserts non-privileged staff CANNOT run `review_manual_bkash` (deny-by-default) [TRACED phase1-reconciliation.test.ts].
5. Approval → `postVerifiedManualBkashPaymentJournal` — approval + journal in ONE single-document commit (atomic by construction); audit log `MANUAL_BKASH_VERIFIED` with actor/role [TRACED phase4a-service].
6. Claims are NOT counted as received funds while pending (explicit copy in admin client + counter logic) [TRACED].

## Findings

```
ID: ORD-V01
Severity: P2 (design-gap, documented) | Category: Data-integrity
What: No separate `payment_transactions` entity; verified advance lives only as `orders.advancePaidPoisha` increment + journal. Reversals recompute rather than sum. Planning doc 02-requirements-matrix B6 marks this PARTIAL.
Status: already logged in planning (Phase D proposal). Not a code bug today; atomicity holds in the doc-store. NO FIX in this round — normalized schema migration is Phase D scope with owner decision.
In scope? NO → Deferred Issues Log (planning decision, not page bug).
```

```
ID: ORD-V02
Severity: P3 (design-gap) | Category: UX / Data-integrity
What: Payment status lacks `needs_clarification`/`disputed` states (B7) and maker-checker threshold is not owner-configurable (B5) — reviewer self-approval blocked only at fixed granularity (any prior touch by same reviewer).
In scope? NO → planning Phase D decisions; log only.
```

```
ID: ORD-V03
Severity: P3 | Category: Test-coverage
What: Refund maker-checker coverage marked UNVERIFIED in 02-requirements-matrix (B12) — refund flow tests existed but were not run in the recorded snapshot. Needs the payments/security suites run locally to confirm.
In scope? PARTIAL — covered by `test:payments` + `test:security` runs requested from the user; verify before PASS.
```

```
ID: ORD-V04
Severity: P4 | Category: Code-quality
What: `phase4a-service.ts` contains a path auto-approving with `decision: 'approved', reviewNoteBn: staffNote` (staff-entered MFS input flow, `MFS_INPUT_*` op). Two approval entry-points exist (review_manual_bkash + MFS_INPUT) for the same money event; both audit-log, but the dual path is a consolidation candidate.
In scope? NO (cross-module money-core; belongs to the Finance module round) → Deferred.
```

Positive verdicts (no fix needed): duplicate TrxID guard ✓ [TRACED], maker≠checker ✓ [TRACED], RBAC deny-by-default on review ✓ [TRACED], claims-not-funds counter ✓ [TRACED], atomic approval+journal ✓ [TRACED].

## Verify (user runs)
```powershell
pnpm --filter @workspace/scripts test:payments
pnpm --filter @workspace/scripts test:security
# then visual: /admin → Orders Grid → open an order with a pending bKash claim → approve as a DIFFERENT admin than the claim submitter; confirm journal entry + counter decrements.
```
