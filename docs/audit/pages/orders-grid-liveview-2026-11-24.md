# Orders Grid & Verification — Live-View Round — 2026-11-24

Input: 1 screenshot of the Orders Grid (EN locale, 4 orders, super_admin) read [EXECUTED]. Zero requests were made against any live URL; production screenshot used as data only.

## Findings

```
ID: OG-01
Severity: P2 | Category: Data-integrity / Connection
Where: artifacts/api-server/imported/src/lib/admin/phase4a-service.ts — executeOrderGridAction (actionType 'attach_tracking') and updateOrderCourierMeta; artifacts/panchabindu/src/lib/admin/order-management.ts — validateDispatchInput
What: Courier tracking codes are NOT unique across orders. Screenshot shows the SAME Steadfast tracking code SF-982341 on ORD-261106-0004 (Confirmed) and ORD-261106-0001 (Delivered) [EXECUTED screenshot]. Server code fully read: attach_tracking validates only (1) non-empty code, (2) allowed status, (3) manual-courier name, (4) safe URL — no cross-order duplicate check [TRACED].
Root cause: no uniqueness guard at the two write paths (attach_tracking, updateOrderCourierMeta) nor in client validateDispatchInput; DB has a duplicate guard only for bKash TrxIDs (DUPLICATE_TRX_ID), not courier codes.
Impact: two customers open the same live tracking page; courier CSV/reconciliation maps one code to two orders; support confusion; signals test-data reuse in production.
Evidence: screenshot values + full function trace [EXECUTED/TRACED].
In scope? YES — fix below (server-side guard, super-admin override path with audit log, regression test).
```

```
ID: OG-02
Severity: P3 | Category: Data-quality / UX
Where: same write paths; orders-grid-minimal.tsx tracking cell; resolveOrderTrackingDisplay
What: (a) placeholder values ('NONE', 'N/A', 'NA') are accepted and stored as tracking codes (Row 4 shows NONE); (b) for Pathao, a tracking URL is built from consignmentId alone, so the grid renders 'Tracking link' while the code column has no usable code — confusing pair.
Fix: reject placeholder codes in validateDispatchInput + server write paths; for Pathao display the consignmentId as the tracking identity.
In scope? YES — included in patch.
```

```
ID: OG-03 (informational — no fix)
verify_bkash one-click grid action supports super_admin self-approval ONLY with an explicit override reason (>=5 chars) and writes an immutable audit log entry [TRACED]. Deliberate compensating control; maker-checker for non-super-admin remains enforced. Documented; no change.
```

```
ID: OG-04 (P4, ASSUMED)
Google Translate floating widget overlaps the header in the screenshot. The app does not ship a translate widget in StorefrontShell/Admin shell [TRACED imports]; most likely a browser extension on the reviewer's machine. Verify: open the same page in incognito with extensions off. If it persists, investigate injected third-party script (e-skimming class) — then it becomes a security finding.
```

## Positive verdicts this round (no fix needed)
Status-filter counts (All 4 / Confirmed 1 / Delivered 2 / Closed 1) consistent with row statuses [EXECUTED/TRACED]; stage mapping shipped→in_transit, returned→closed correct; payment column math (Total/Paid/Due) matches server-computed poisha logic; pending bKash claim shows 'Verify bKash' inline action wired to review flow (chain traced previous round).

## FIX PATCH — OG-01 + OG-02 (apply in editor; phase4a-service.ts is 114KB, agent write-tool cannot safely whole-replace)

### A) artifacts/api-server/imported/src/lib/admin/phase4a-service.ts — executeOrderGridAction, 'attach_tracking' branch
Immediately AFTER the allowed-status check block (the `!['pending_confirmation', ...].includes(ord.status)` guard) and BEFORE `const nextProvider = ...`, insert:

```ts
      // OG-01: reject a tracking code already attached to a different live order (same provider).
      const PLACEHOLDER_CODES = new Set(['none', 'n/a', 'na', 'null', 'undefined', '-']);
      if (PLACEHOLDER_CODES.has(nextTracking.toLowerCase())) {
        results.push({
          orderNo: ord.orderNo,
          ok: false,
          messageBn: 'ট্র্যাকিং কোড হিসেবে placeholder মান (NONE/N/A) গ্রহণযোগ্য নয়।',
        });
        continue;
      }
      const trackingOwner = erpState.orders.find(
        (o) =>
          o.orderNo !== ord.orderNo &&
          (o.trackingCode ?? '').trim().toUpperCase() === nextTracking.toUpperCase() &&
          o.courierProvider === (payload.courierProvider ?? ord.courierProvider ?? 'steadfast') &&
          !['cancelled', 'returned'].includes(o.status)
      );
      const overrideTracking =
        ctx.roleSlug === 'super_admin' &&
        (payload.selfApprovalOverrideReasonBn ?? '').trim().length >= 5;
      if (trackingOwner && !overrideTracking) {
        results.push({
          orderNo: ord.orderNo,
          ok: false,
          messageBn: `এই ট্র্যাকিং কোড (${nextTracking}) ইতিমধ্যে ${trackingOwner.orderNo} অর্ডারে ব্যবহৃত। ডুপ্লিকেট ট্র্যাকিং গ্রহণযোগ্য নয়।`,
        });
        continue;
      }
```
(Keep the existing audit-log call; the duplicate-override path is naturally logged through it because metadata carries prev/next values. If you used an override reason, append `overrideReason` to the audit `metadata` object.)

### B) Same file — updateOrderCourierMeta
Add the identical guard (placeholder + cross-order duplicate, super-admin override with reason) before assigning `ord.trackingCode = ...`.

### C) artifacts/panchabindu/src/lib/admin/order-management.ts — validateDispatchInput
After the `trackingCode.length < 3` check add:
```ts
  if (['none', 'n/a', 'na', 'null', 'undefined', '-'].includes(trackingCode.toLowerCase())) {
    return {
      valid: false,
      errorBn: 'ট্র্যাকিং কোড হিসেবে placeholder মান (NONE/N/A) গ্রহণযোগ্য নয়।',
      errorEn: 'Placeholder tracking codes (NONE/N/A) are not allowed.',
    };
  }
```

### D) Regression test — NEW FILE artifacts/api-server/imported/src/lib/admin/phase4a-tracking-uniqueness.test.ts
```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getActorSecurityContext } from '../../types/permissions';
import { executeOrderGridAction } from './phase4a-service';
import { readErpState, writeErpState } from '../db/repository';

test('OG-01: duplicate courier tracking code is rejected across live orders', () => {
  const actor = getActorSecurityContext('usr-super-admin')!;
  const state = readErpState();
  const first = state.orders.find(o => o.status === 'confirmed');
  const second = state.orders.find(o => o.orderNo !== first?.orderNo && o.status === 'confirmed');
  if (!first || !second) return; // fixture-dependent; seed two confirmed orders if absent
  const code = 'SF-DUP-TEST-1';
  const r1 = executeOrderGridAction(actor, { orderNos: [first.orderNo], actionType: 'attach_tracking', courierProvider: 'steadfast', trackingCode: code });
  assert.equal(r1.results[0].ok, true);
  const r2 = executeOrderGridAction(actor, { orderNos: [second.orderNo], actionType: 'attach_tracking', courierProvider: 'steadfast', trackingCode: code });
  assert.equal(r2.results[0].ok, false, 'duplicate tracking must be rejected (OG-01)');
  // placeholder rejection (OG-02)
  const r3 = executeOrderGridAction(actor, { orderNos: [second.orderNo], actionType: 'attach_tracking', courierProvider: 'steadfast', trackingCode: 'NONE' });
  assert.equal(r3.results[0].ok, false, 'placeholder NONE must be rejected (OG-02)');
  writeErpState(state);
});
```

### E) Register the test — scripts/src/isolated-domain-tests.mjs
In the `security:` suite array append: `'lib/admin/phase4a-tracking-uniqueness.test.ts',`

## Verify after applying
```powershell
pnpm run typecheck
pnpm --filter @workspace/scripts test:security   # expect 13/13 (new test passes)
# visual: re-open Orders Grid — try attaching an existing tracking code to another order; expect Bangla rejection message
```
