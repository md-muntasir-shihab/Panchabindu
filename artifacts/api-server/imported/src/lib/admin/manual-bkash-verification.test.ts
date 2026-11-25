// src/lib/admin/manual-bkash-verification.test.ts
// Regression tests for the manual bKash verification path used by the admin ERP.
//   - A solo super admin who entered a TrxID must be able to verify it only by
//     recording an audited reason (maker-checker must never deadlock the shop).
//   - A successful verification moves the order's advance/COD by exactly the
//     claimed amount.
//   - Re-verifying an already approved TrxID must fail loudly instead of
//     reporting success with zero state change.

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The repository resolves its JSON store from the working directory and the
// admin store needs local keys even in tests, so keep this run hermetic.
process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), 'pb-bkash-test-')));
process.env.NODE_ENV = 'development';
process.env.PANCHABINDU_PERSISTENCE = 'json';
process.env.PANCHABINDU_ENABLE_SANDBOX_AUTH = '1';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= crypto.randomBytes(32).toString('hex');
process.env.SESSION_SECRET ??= crypto.randomBytes(32).toString('hex');

const { readErpState, reviewManualBkashSubmission, submitManualBkashPayment } =
  await import('../db/repository');
const { getActorSecurityContext } = await import('./phase4a-service');

const OVERRIDE_REASON = 'একক অপারেটর শিফটে বিকাশ স্টেটমেন্ট মিলিয়ে যাচাই করা হয়েছে';

test('Manual bKash verification: maker-checker, exact amount and no false success', () => {
  const ctx = getActorSecurityContext('usr-super-admin')!;
  assert.ok(ctx);

  const order = readErpState().orders.find(
    (o) => o.codCollectablePoisha >= 20000 && o.manualPaymentSubmissionsOpen !== false
  );
  assert.ok(order, 'fixture needs an order with an outstanding COD balance');

  const before = {
    advance: order!.advancePaidPoisha,
    cod: order!.codCollectablePoisha,
    total: order!.totalPayablePoisha,
  };
  const claimedPoisha = 15000;
  const trxId = `T${Date.now().toString().slice(-9)}`;

  // The operator (maker) records the TrxID exactly like the grid's "+ অগ্রিম জমা দিন".
  const created = submitManualBkashPayment({
    orderNo: order!.orderNo,
    senderPhone: '01711002233',
    trxId,
    submittedAmountPoisha: claimedPoisha,
    idempotencyKey: `test:${trxId}`,
    submittedByRole: 'super_admin',
    submittedByUsername: ctx.username,
  });
  assert.equal(created.success, true, created.errorBn);

  // 1. Without a reason the same person is refused (two-person rule intact).
  const blocked = reviewManualBkashSubmission(ctx, {
    orderNo: order!.orderNo,
    trxId,
    decision: 'approved',
    reviewNoteBn: 'বিকাশ অ্যাপে যাচাই',
  });
  assert.equal(blocked.success, false);
  assert.match(blocked.errorBn ?? '', /মেকার-চেকার/);
  assert.equal(
    readErpState().orders.find((o) => o.orderNo === order!.orderNo)!
      .advancePaidPoisha,
    before.advance,
    'a refused verification must not touch the order'
  );

  // 2. With a documented override it succeeds and moves money by exactly the claim.
  const approved = reviewManualBkashSubmission(ctx, {
    orderNo: order!.orderNo,
    trxId,
    decision: 'approved',
    reviewNoteBn: 'বিকাশ স্টেটমেন্টে লেনদেন মিলেছে',
    selfApprovalOverride: true,
    selfApprovalOverrideReasonBn: OVERRIDE_REASON,
  });
  assert.equal(approved.success, true, approved.errorBn);

  const after = readErpState().orders.find((o) => o.orderNo === order!.orderNo)!;
  assert.equal(after.advancePaidPoisha, before.advance + claimedPoisha);
  assert.equal(after.codCollectablePoisha, before.total - after.advancePaidPoisha);
  assert.equal(
    after.paymentStatus,
    after.codCollectablePoisha === 0 ? 'paid_verified' : 'partial_verified'
  );

  // 3. Re-verifying the same TrxID is refused with an explicit message rather
  //    than reporting a success that changed nothing.
  const repeated = reviewManualBkashSubmission(ctx, {
    orderNo: order!.orderNo,
    trxId,
    decision: 'approved',
    reviewNoteBn: 'আবার যাচাই',
    selfApprovalOverride: true,
    selfApprovalOverrideReasonBn: OVERRIDE_REASON,
  });
  assert.equal(repeated.success, false);
  assert.match(repeated.errorBn ?? '', /ইতিমধ্যেই/);
  assert.equal(
    readErpState().orders.find((o) => o.orderNo === order!.orderNo)!
      .advancePaidPoisha,
    after.advancePaidPoisha
  );
});
