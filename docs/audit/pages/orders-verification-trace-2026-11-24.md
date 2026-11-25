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

## Fix log — 2026-11-25: "অর্ডার কনফার্ম / বিকাশ ভেরিফাই কাজ করছে না"

Production evidence (`erp_runtime_state`, revision 133): `ORD-261106-0005` (created 07:06, customer TrxID rejected, admin entered a new TrxID at 07:08, order cancelled at 07:12) and `ORD-261106-0004` (same pattern on 11-21) both stall at `pending_verification`. The order status change itself always succeeded — what blocked the shop was the verification step:

| # | Root cause | Fix |
|---|---|---|
| 1 | Only one operator exists, so the maker is always the checker. The audited super-admin override only appeared **after** a failed approve click, and its button stayed enabled with an empty reason. | `order-details-sheet.tsx`: the reason field is rendered up front when the viewer submitted the claim, the button is disabled until ≥5 chars, and non-super-admin makers get an explicit "ask another operator" note instead of a dead button. |
| 2 | The grid's one-click `verify_bkash` cannot carry a reason, so it only ever produced a bare policy refusal. | `phase4a-service.ts`: the refusal now tells the operator to open the order and use "কারণসহ ভেরিফাই করুন". |
| 3 | Re-verifying an already `approved` TrxID fell through every guard and returned **success with zero state change** (green toast, nothing moved). | `repository.ts`: explicit errors for "already approved" and for non-pending claims. |
| 4 | `POST /api/orders` hardcoded `advancePaidPoisha: 0`, so the customer's declared advance was dropped and the claim was recorded as `delivery charge + required deposit` (৳100 instead of ৳130) — verification then credited the wrong amount. | `app/api/orders/route.ts`: the validated declared advance travels through; it is still only a claim until an operator verifies it. |
| 5 | Workspace POSTs (grid actions, sheet actions) sent no `x-csrf-token` while `verifyOriginAndCsrf` requires it whenever a session exists. | `admin-erp-client.tsx` + `order-details-sheet.tsx`: send the token from session storage when present. |

Regression coverage: `imported/src/lib/admin/manual-bkash-verification.test.ts` (`pnpm run test:payments`, wired into CI) asserts maker-checker refusal, the audited override, the exact advance/COD delta, and the no-false-success path.
