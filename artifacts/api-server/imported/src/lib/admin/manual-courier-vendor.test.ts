import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiRequest as NextRequest } from '@/src/lib/http';
import { createAdminSession } from '@/src/lib/security/crypto-session';
import { getActorSecurityContext } from './phase4a-service';
import { readErpState } from '../db/repository';
import {
  adminDirectVendorSettlement,
  computeManualCourierAccountsSummary,
  readPhase4BStore,
  recordManualCourierRemittance,
  recordManualVendorLedgerEntry,
  upsertManualCourierParcel,
} from './phase4b-service';
import { computeVendorEscrowBalance } from '../money';
import { getAdminVendorPayoutRegister } from '../vendor/vendor-payout-register';
import { getVendorWorkspace } from '../vendor/vendor-workspace-service';
import { GET as workspaceGet, POST as workspacePost } from '../../../app/api/admin/workspace/route';
import { POST as payoutRegisterPost } from '../../../app/api/admin/vendor-payouts/route';
import { GET as vendorStatementGet } from '../../../app/api/vendor/statement/route';

const ORIGIN = 'http://localhost';

function makeReq(
  url: string,
  init: { token?: string; csrf?: string; method?: string; body?: unknown } = {}
) {
  const headers: Record<string, string> = { origin: ORIGIN, host: 'localhost' };
  if (init.token) headers.cookie = `bg_admin_session=${init.token}`;
  if (init.csrf) headers['x-csrf-token'] = init.csrf;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(`${ORIGIN}${url}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

function sessionFor(userId: string) {
  const actor = getActorSecurityContext(userId)!;
  assert.ok(actor, `Missing actor fixture: ${userId}`);
  const session = createAdminSession(actor);
  return { actor, token: session.token, csrf: session.csrfToken };
}

test('Manual courier parcel dispatch & delivery auto-syncs order, idempotent vendor escrow, and supports standalone parcels', () => {
  const admin = getActorSecurityContext('usr-super-admin')!;
  const erpBefore = readErpState();
  const order = erpBefore.orders.find((o) => o.orderNo === 'ORD-261106-0001')!;
  assert.ok(order);
  const lines = erpBefore.orderLines.filter((l) => l.orderId === order.id);
  const primaryVendorId = lines[0]!.vendorId;
  const expectedLinePayable = lines
    .filter((l) => l.vendorId === primaryVendorId)
    .reduce((sum, l) => sum + l.snapSupplierPayablePoisha * l.quantity, 0);

  // 1. Dispatch order-linked parcel -> sets order status shipped & creates EARNING_PENDING (without duplicating if already positive)
  const dispatchedAt = '2026-11-10T09:30:00.000Z';
  const dRes = upsertManualCourierParcel(admin, {
    isStandalone: false,
    orderNo: order.orderNo,
    courierProvider: 'steadfast',
    deliveryMethodBn: 'হোম ডেলিভারি (COD)',
    consignmentId: 'SF-CNS-9001',
    trackingCode: 'SF-TRK-9001',
    districtId: 47,
    districtNameBn: 'ঢাকা',
    upazilaNameBn: 'ধানমন্ডি',
    destinationAddressBn: 'রোড ১২, ধানমন্ডি, ঢাকা',
    dispatchedAt,
    collectableCodPoisha: order.codCollectablePoisha || 250000,
    courierChargePoisha: 6000,
    riderName: 'রফিকুল ইসলাম',
    riderPhone: '01711009900',
    status: 'dispatched',
    proofRef: 'SLIP-9001',
    proofUrl: '/proofs/slip-9001.jpg',
    noteBn: 'সকাল ৯:৩০ এ হ্যান্ডওভার',
  });
  assert.equal(dRes.success, true, dRes.errorBn);
  assert.ok(dRes.parcel);
  assert.equal(dRes.parcel.consignmentId, 'SF-CNS-9001');
  assert.equal(dRes.parcel.dispatchedAt, dispatchedAt);

  const erpAfterDispatch = readErpState();
  const ordAfterDispatch = erpAfterDispatch.orders.find((o) => o.orderNo === order.orderNo)!;
  assert.equal(ordAfterDispatch.courierProvider, 'steadfast');
  assert.equal(ordAfterDispatch.consignmentId, 'SF-CNS-9001');
  assert.equal(ordAfterDispatch.trackingCode, 'SF-TRK-9001');
  assert.equal(ordAfterDispatch.status, 'shipped');

  // 2. Mark parcel delivered -> updates order status 'delivered' & promotes escrow Pending -> Locked idempotently
  const deliveredAt = '2026-11-11T15:45:00.000Z';
  const delivRes1 = upsertManualCourierParcel(admin, {
    parcelId: dRes.parcel.parcelId,
    isStandalone: false,
    orderNo: order.orderNo,
    courierProvider: 'steadfast',
    deliveryMethodBn: 'হোম ডেলিভারি (COD)',
    consignmentId: 'SF-CNS-9001',
    trackingCode: 'SF-TRK-9001',
    districtId: 47,
    districtNameBn: 'ঢাকা',
    upazilaNameBn: 'ধানমন্ডি',
    destinationAddressBn: 'রোড ১২, ধানমন্ডি, ঢাকা',
    dispatchedAt,
    deliveredAt,
    collectableCodPoisha: order.codCollectablePoisha || 250000,
    courierChargePoisha: 6000,
    status: 'delivered',
    proofRef: 'POD-9001',
    proofUrl: 'https://example.com/pod-9001.png',
    noteBn: 'ডেলিভারি নিশ্চিত',
  });
  assert.equal(delivRes1.success, true, delivRes1.errorBn);
  assert.equal(
    readErpState().orders.find((o) => o.orderNo === order.orderNo)!.status,
    'delivered'
  );

  const lockedCountAfterFirst = readPhase4BStore().vendorLedger.filter(
    (e) =>
      e.vendorId === primaryVendorId &&
      e.orderNo === order.orderNo &&
      (e.entryType === 'EARNING_LOCKED' || e.entryType === 'EARNING_MATURED') &&
      e.amountPoisha > 0
  ).length;
  assert.equal(lockedCountAfterFirst, 1);

  const lockedCredit = readPhase4BStore().vendorLedger.find(
    (e) =>
      e.vendorId === primaryVendorId &&
      e.orderNo === order.orderNo &&
      e.entryType === 'EARNING_LOCKED' &&
      e.amountPoisha > 0
  )!;
  assert.equal(lockedCredit.amountPoisha, expectedLinePayable);
  assert.equal(lockedCredit.deliveredAt, deliveredAt);

  // Re-submitting delivered update does NOT duplicate EARNING_LOCKED
  const delivRes2 = upsertManualCourierParcel(admin, {
    parcelId: dRes.parcel.parcelId,
    isStandalone: false,
    orderNo: order.orderNo,
    courierProvider: 'steadfast',
    deliveryMethodBn: 'হোম ডেলিভারি (COD)',
    consignmentId: 'SF-CNS-9001',
    trackingCode: 'SF-TRK-9001',
    districtId: 47,
    districtNameBn: 'ঢাকা',
    upazilaNameBn: 'ধানমন্ডি',
    destinationAddressBn: 'রোড ১২, ধানমন্ডি, ঢাকা',
    dispatchedAt,
    deliveredAt,
    collectableCodPoisha: order.codCollectablePoisha || 250000,
    courierChargePoisha: 6000,
    status: 'delivered',
    noteBn: 'দ্বিতীয়বার আপডেট',
  });
  assert.equal(delivRes2.success, true);
  const lockedCountAfterSecond = readPhase4BStore().vendorLedger.filter(
    (e) =>
      e.vendorId === primaryVendorId &&
      e.orderNo === order.orderNo &&
      (e.entryType === 'EARNING_LOCKED' || e.entryType === 'EARNING_MATURED') &&
      e.amountPoisha > 0
  ).length;
  assert.equal(lockedCountAfterSecond, 1);

  // 3. Standalone parcel (e.g. Pathao manual parcel without system orderNo)
  const standaloneRes = upsertManualCourierParcel(admin, {
    isStandalone: true,
    courierProvider: 'pathao',
    deliveryMethodBn: 'পার্সেল সার্ভিস (COD)',
    consignmentId: 'PTH-MAN-77',
    trackingCode: 'PTH-TRK-77',
    districtId: 10,
    districtNameBn: 'চট্টগ্রাম',
    upazilaNameBn: 'পাঁচলাইশ',
    destinationAddressBn: 'চট্টগ্রাম হাব',
    dispatchedAt: '2026-11-12T11:00:00.000Z',
    deliveredAt: '2026-11-13T16:15:00.000Z',
    collectableCodPoisha: 150000,
    courierChargePoisha: 11000,
    status: 'delivered',
    proofRef: 'PTH-SLIP-77',
    noteBn: 'স্বতন্ত্র ফোন অর্ডার পার্সেল',
  });
  assert.equal(standaloneRes.success, true, standaloneRes.errorBn);
  assert.equal(standaloneRes.parcel!.isStandalone, true);
  assert.equal(standaloneRes.parcel!.orderNo, null);
});

test('Manual courier remittance computes short payment, syncs order paymentStatus, and updates accounts summary', () => {
  const admin = getActorSecurityContext('usr-super-admin')!;
  const beforeSummary = computeManualCourierAccountsSummary();
  const parcel = readPhase4BStore().manualCourierParcels!.find(
    (p) => !p.isStandalone && p.orderNo === 'ORD-261106-0001'
  )!;
  assert.ok(parcel);

  // Record parcel-linked remittance with small fee/adjustment and check math
  const expectedCod = parcel.collectableCodPoisha;
  const fee = 6000;
  const adj = 1000;
  const received = Math.max(1000, expectedCod - fee - adj - 5000); // short by 5000 poisha (৳50)
  const remRes = recordManualCourierRemittance(admin, {
    isStandalone: false,
    parcelId: parcel.parcelId,
    orderNo: parcel.orderNo,
    courierProvider: 'steadfast',
    consignmentId: parcel.consignmentId,
    settlementRef: 'STF-REM-8801',
    paymentChannelBn: 'ব্যাংক ট্রান্সফার (Dutch-Bangla)',
    expectedCodPoisha: expectedCod,
    courierFeeDeductedPoisha: fee,
    adjustmentPoisha: adj,
    remittedAmountPoisha: received,
    settledAt: '2026-11-12T14:20:00.000Z',
    proofUrl: 'https://example.com/remit-8801.pdf',
    noteBn: 'প্রথম সেটেলমেন্ট',
  });
  assert.equal(remRes.success, true, remRes.errorBn);
  assert.equal(remRes.record!.shortPaymentPoisha, expectedCod > 0 ? 5000 : 0);
  assert.equal(remRes.record!.isShortPaymentFlagged, expectedCod > 0);
  assert.equal(remRes.record!.adjustmentPoisha, adj);

  const syncedOrder = readErpState().orders.find((o) => o.orderNo === 'ORD-261106-0001')!;
  assert.equal(syncedOrder.paymentStatus, 'remitted');

  // Standalone courier remittance (e.g. Pathao batch settlement)
  const standRem = recordManualCourierRemittance(admin, {
    isStandalone: true,
    courierProvider: 'pathao',
    settlementRef: 'PTH-REM-550',
    paymentChannelBn: 'বিকাশ মার্চেন্ট',
    expectedCodPoisha: 150000,
    courierFeeDeductedPoisha: 11000,
    adjustmentPoisha: 0,
    remittedAmountPoisha: 139000,
    settledAt: '2026-11-14T10:00:00.000Z',
    noteBn: 'পাঠাও স্বতন্ত্র জমা',
  });
  assert.equal(standRem.success, true, standRem.errorBn);
  assert.equal(standRem.record!.shortPaymentPoisha, 0);
  assert.equal(standRem.record!.isStandalone, true);

  const afterSummary = computeManualCourierAccountsSummary();
  assert.equal(
    afterSummary.totals.totalReceivedPoisha,
    beforeSummary.totals.totalReceivedPoisha + received + 139000
  );
  assert.equal(
    afterSummary.totals.totalAdjustmentsPoisha,
    beforeSummary.totals.totalAdjustmentsPoisha + adj
  );
  // Pathao switched cleanly from parcel charge (11000) to remittance fee (11000) without double counting
  const pathaoRow = afterSummary.providers.find((p) => p.provider === 'pathao')!;
  assert.ok(pathaoRow.deliveredParcels >= 1);
  assert.equal(pathaoRow.totalCourierFeesPoisha, 11000);
  assert.equal(pathaoRow.totalReceivedPoisha, 139000);
  assert.equal(pathaoRow.netReceivablePoisha, Math.max(0, 150000 - 11000 - 139000));
  const steadfastRow = afterSummary.providers.find((p) => p.provider === 'steadfast')!;
  assert.ok(steadfastRow.totalCourierFeesPoisha >= fee);
});

test('Manual vendor ledger entry & direct vendor payout update owed/paid balances and keep /api/vendor/statement valid', async () => {
  const admin = getActorSecurityContext('usr-super-admin')!;
  const vendorSess = sessionFor('usr-vendor-001');
  const vendorId = vendorSess.actor.vendorId!;

  const beforeLedger = readPhase4BStore().vendorLedger.filter((e) => e.vendorId === vendorId);
  const beforeBal = computeVendorEscrowBalance(vendorId, beforeLedger);

  // 1. Add manual vendor credit (+50,000 poisha = ৳500)
  const creditRes = recordManualVendorLedgerEntry(admin, {
    vendorId,
    direction: 'credit',
    escrowBucket: 'available',
    amountPoisha: 50000,
    descriptionBn: 'সরাসরি ম্যানুয়াল প্রাপ্য যোগ',
    referenceNo: 'VCRED-101',
    paymentMethodBn: 'অফলাইন চালান',
    proofUrl: '/proofs/vcred-101.png',
    noteBn: 'ভেন্ডর হিসাব সমন্বয়',
    eventTimestamp: '2026-11-15T08:00:00.000Z',
  });
  assert.equal(creditRes.success, true, creditRes.errorBn);

  // 2. Add manual vendor debit (-10,000 poisha = ৳100)
  const debitRes = recordManualVendorLedgerEntry(admin, {
    vendorId,
    direction: 'debit',
    escrowBucket: 'available',
    amountPoisha: 10000,
    descriptionBn: 'ম্যানুয়াল কর্তন',
    referenceNo: 'VDEB-102',
    noteBn: 'প্যাকেজিং সমন্বয়',
    eventTimestamp: '2026-11-15T09:00:00.000Z',
  });
  assert.equal(debitRes.success, true, debitRes.errorBn);

  const beforeWsEscrow = getVendorWorkspace(vendorSess.actor).escrow;
  const midLedger = readPhase4BStore().vendorLedger.filter((e) => e.vendorId === vendorId);
  const midBal = computeVendorEscrowBalance(vendorId, midLedger);
  assert.equal(midBal.withdrawablePoisha, beforeBal.withdrawablePoisha + 40000);
  assert.equal(
    beforeWsEscrow.totalOwedPoisha,
    midBal.pendingPoisha + midBal.lockedPoisha + midBal.withdrawablePoisha
  );

  // 3. Direct settlement exceeding withdrawable using creditAndSettleIfInsufficient=true
  const settleAmount = midBal.withdrawablePoisha + 25000;
  const directRes = adminDirectVendorSettlement(admin, {
    vendorId,
    requestedAmountPoisha: settleAmount,
    feePoisha: 500,
    payoutMethodBn: 'বিকাশ মার্চেন্ট',
    payoutAccountNo: '01711223344',
    senderAccountNo: '01899887766',
    paymentTrxId: 'BKS-DIR-778899',
    proofUrl: 'https://example.com/payout-778899.jpg',
    noteBn: 'সম্পূর্ণ নিষ্পত্তি + অতিরিক্ত অগ্রিম সমন্বয়',
    paidAt: '2026-11-16T12:00:00.000Z',
    creditAndSettleIfInsufficient: true,
  });
  assert.equal(directRes.success, true, directRes.errorBn);
  assert.equal(directRes.payout!.status, 'paid');
  assert.equal(directRes.payout!.feePoisha, 500);
  assert.equal(directRes.payout!.netPaidPoisha, settleAmount - 500);
  assert.equal(directRes.payout!.entryType, 'direct_settlement');
  const afterDirectLedger = readPhase4BStore().vendorLedger.filter((e) => e.vendorId === vendorId);
  const afterDirectBal = computeVendorEscrowBalance(vendorId, afterDirectLedger);
  assert.equal(afterDirectBal.payoutHoldPoisha, beforeBal.payoutHoldPoisha);

  const ws = getVendorWorkspace(vendorSess.actor);
  const register = getAdminVendorPayoutRegister(admin);
  const rollup = register.vendorRollups.find((r) => r.vendorId === vendorId)!;
  assert.equal(rollup.paidPoisha, ws.escrow.totalPaidPoisha);
  assert.equal(rollup.totalOwedPoisha, ws.escrow.totalOwedPoisha);
  assert.equal(rollup.totalEarnedPoisha, ws.escrow.totalEarnedPoisha);
  assert.equal(
    ws.escrow.totalEarnedPoisha - ws.escrow.totalPaidPoisha,
    ws.escrow.totalOwedPoisha
  );
  assert.ok(rollup.parcelCount >= 1);

  // 4. Verify /api/vendor/statement?format=summary stays 200 and strictly valid
  const stmtRes = await vendorStatementGet(
    makeReq('/api/vendor/statement?from=2026-10-01&to=2026-12-31&format=summary', {
      token: vendorSess.token,
    })
  );
  assert.equal(stmtRes.status, 200);
  const stmtBody = (await stmtRes.json()) as { success: boolean; statement: { payouts: unknown[] } };
  assert.equal(stmtBody.success, true);
  assert.ok(stmtBody.statement.payouts.length >= 1);

  // 5. Verify Vendor workspace exposes tracking/timestamps & proof without PII/margin leaks
  const serialized = JSON.stringify(ws);
  for (const forbidden of [
    'customerPhone',
    'customerName',
    'streetAddress',
    'platformMargin',
    'snapSupplier',
    'internalVendorSku',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `Vendor DTO leaked: ${forbidden}`);
  }
  const trackedOrder = ws.orders.find((o) => o.orderNo === 'ORD-261106-0001');
  assert.ok(trackedOrder);
  assert.equal(trackedOrder.trackingCode, 'SF-TRK-9001');
  assert.ok(trackedOrder.dispatchedAt);
  assert.ok(trackedOrder.deliveredAt);
  assert.ok(ws.ledger.some((l) => l.referenceNo === 'VCRED-101' && l.proofUrl === '/proofs/vcred-101.png'));
  assert.ok(ws.payouts.some((p) => p.paymentTrxId === 'BKS-DIR-778899' && p.feePoisha === 500));
});

test('HTTP workspace & payout-register routes enforce RBAC, reject redx, and validate proof URLs', async () => {
  const admin = sessionFor('usr-super-admin');
  const pkg = sessionFor('usr-packaging-01');
  const mkt = sessionFor('usr-marketing-01');
  const vendor = sessionFor('usr-vendor-001');

  // Packaging manager CAN record a parcel dispatch, but CANNOT record courier remittance, manual ledger, or direct payout
  const pkgParcel = await workspacePost(
    makeReq('/api/admin/workspace', {
      method: 'POST',
      token: pkg.token,
      csrf: pkg.csrf,
      body: {
        operation: 'upsert_manual_courier_parcel',
        isStandalone: true,
        courierProvider: 'bd_post',
        deliveryMethodBn: 'ডাক বিভাগ পার্সেল',
        destinationAddressBn: 'পঞ্চগড় সদর',
        collectableCodPoisha: 90000,
        courierChargePoisha: 5000,
        status: 'dispatched',
      },
    })
  );
  assert.equal(pkgParcel.status, 200);

  for (const opBody of [
    {
      operation: 'record_manual_courier_remittance',
      isStandalone: true,
      courierProvider: 'steadfast',
      settlementRef: 'REF-1',
      paymentChannelBn: 'Bank',
      expectedCodPoisha: 10000,
      courierFeeDeductedPoisha: 500,
      adjustmentPoisha: 0,
      remittedAmountPoisha: 9500,
    },
    {
      operation: 'record_manual_vendor_ledger',
      vendorId: '00000000-0000-4000-8000-000000000901',
      direction: 'credit',
      escrowBucket: 'available',
      amountPoisha: 5000,
      descriptionBn: 'Unauthorized credit attempt',
    },
    {
      operation: 'direct_vendor_payout',
      vendorId: '00000000-0000-4000-8000-000000000901',
      requestedAmountPoisha: 5000,
      feePoisha: 0,
      payoutMethodBn: 'bKash',
      payoutAccountNo: '01700000000',
      paymentTrxId: 'TRX-UNAUTH',
      creditAndSettleIfInsufficient: false,
    },
  ]) {
    for (const actor of [pkg, mkt, vendor]) {
      const denied = await workspacePost(
        makeReq('/api/admin/workspace', {
          method: 'POST',
          token: actor.token,
          csrf: actor.csrf,
          body: opBody,
        })
      );
      assert.equal(denied.status, 403);
    }
  }

  // Super admin sees courierAccountsSummary & manualCourierParcels in workspace GET
  const wsGet = await workspaceGet(makeReq('/api/admin/workspace', { token: admin.token }));
  assert.equal(wsGet.status, 200);
  const wsBody = (await wsGet.json()) as {
    manualCourierParcels: unknown[];
    courierAccountsSummary: { totals: { netReceivablePoisha: number } };
  };
  assert.ok(Array.isArray(wsBody.manualCourierParcels));
  assert.ok(wsBody.manualCourierParcels.length >= 1);
  assert.equal(typeof wsBody.courierAccountsSummary.totals.netReceivablePoisha, 'number');

  // RedX rejected
  const redxBlocked = await workspacePost(
    makeReq('/api/admin/workspace', {
      method: 'POST',
      token: admin.token,
      csrf: admin.csrf,
      body: {
        operation: 'upsert_manual_courier_parcel',
        isStandalone: true,
        courierProvider: 'redx',
        deliveryMethodBn: 'COD',
        destinationAddressBn: 'Dhaka',
        collectableCodPoisha: 1000,
        courierChargePoisha: 100,
        status: 'dispatched',
      },
    })
  );
  assert.equal(redxBlocked.status, 400);

  // Unsafe javascript: proofUrl rejected on both /api/admin/workspace and /api/admin/vendor-payouts
  const badUrl1 = await workspacePost(
    makeReq('/api/admin/workspace', {
      method: 'POST',
      token: admin.token,
      csrf: admin.csrf,
      body: {
        operation: 'record_manual_vendor_ledger',
        vendorId: '00000000-0000-4000-8000-000000000901',
        direction: 'credit',
        escrowBucket: 'available',
        amountPoisha: 1000,
        descriptionBn: 'Test credit',
        proofUrl: 'javascript:alert(1)',
      },
    })
  );
  assert.equal(badUrl1.status, 400);

  const badUrl2 = await payoutRegisterPost(
    makeReq('/api/admin/vendor-payouts', {
      method: 'POST',
      token: admin.token,
      csrf: admin.csrf,
      body: {
        operation: 'direct_payout',
        vendorId: '00000000-0000-4000-8000-000000000901',
        requestedAmountPoisha: 1000,
        feePoisha: 0,
        payoutMethodBn: 'bKash',
        payoutAccountNo: '01700000000',
        paymentTrxId: 'TRX-BADURL',
        proofUrl: 'javascript:alert(1)',
        creditAndSettleIfInsufficient: true,
      },
    })
  );
  assert.equal(badUrl2.status, 400);

  // Valid direct_payout on /api/admin/vendor-payouts succeeds for super_admin
  const okDirect = await payoutRegisterPost(
    makeReq('/api/admin/vendor-payouts', {
      method: 'POST',
      token: admin.token,
      csrf: admin.csrf,
      body: {
        operation: 'direct_payout',
        vendorId: '00000000-0000-4000-8000-000000000901',
        requestedAmountPoisha: 12000,
        feePoisha: 200,
        payoutMethodBn: 'নগদ / ব্যাংক',
        payoutAccountNo: '01711223344',
        senderAccountNo: '01811223344',
        paymentTrxId: 'HTTP-DIR-4455',
        proofUrl: '/proofs/http-dir-4455.png',
        noteBn: 'HTTP পেমেন্ট টেস্ট',
        creditAndSettleIfInsufficient: true,
      },
    })
  );
  assert.equal(okDirect.status, 201);
  const okBody = (await okDirect.json()) as {
    success: boolean;
    payout: { status: string; paymentTrxId: string; feePoisha: number };
  };
  assert.equal(okBody.success, true);
  assert.equal(okBody.payout.status, 'paid');
  assert.equal(okBody.payout.paymentTrxId, 'HTTP-DIR-4455');
  assert.equal(okBody.payout.feePoisha, 200);
});
