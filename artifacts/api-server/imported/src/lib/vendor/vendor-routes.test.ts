import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiRequest as NextRequest } from '@/src/lib/http';
import { createAdminSession } from '@/src/lib/security/crypto-session';
import { getActorSecurityContext } from '@/src/lib/admin/phase4a-service';
import { GET as getWorkspace } from '../../../app/api/vendor/workspace/route';
import { POST as postProduct } from '../../../app/api/vendor/products/route';
import { POST as postStock } from '../../../app/api/vendor/stock/route';
import { POST as postProposal } from '../../../app/api/vendor/price-proposals/route';
import { POST as postPayout } from '../../../app/api/vendor/payouts/route';
import { POST as postProfile } from '../../../app/api/vendor/profile/route';
import { GET as getAdminVendors, POST as postAdminVendors } from '../../../app/api/admin/vendors/route';
import {
  GET as getAdminPayoutRegister,
  POST as postAdminPayouts,
} from '../../../app/api/admin/vendor-payouts/route';
import { readAdminStore } from '@/src/lib/admin/phase4a-service';

const ORIGIN = 'http://localhost';

function vendorRequest(
  url: string,
  init: { token?: string; csrf?: string; method?: string; body?: unknown; origin?: string } = {}
) {
  const headers: Record<string, string> = {};
  if (init.token) headers.cookie = `bg_admin_session=${init.token}`;
  if (init.csrf) headers['x-csrf-token'] = init.csrf;
  headers.origin = init.origin ?? ORIGIN;
  return new NextRequest(`${ORIGIN}${url}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

function vendorSession() {
  const actor = getActorSecurityContext('usr-vendor-001')!;
  const session = createAdminSession(actor);
  return { actor, token: session.token, csrf: session.csrfToken };
}

function adminSession() {
  const actor = getActorSecurityContext('usr-super-admin')!;
  const session = createAdminSession(actor);
  return { actor, token: session.token, csrf: session.csrfToken };
}

test('vendor workspace requires a signed vendor session and never leaks platform money', async () => {
  assert.equal((await getWorkspace(vendorRequest('/api/vendor/workspace'))).status, 401);

  const admin = adminSession();
  assert.equal(
    (await getWorkspace(vendorRequest('/api/vendor/workspace', { token: admin.token }))).status,
    403
  );

  const vendor = vendorSession();
  const res = await getWorkspace(vendorRequest('/api/vendor/workspace', { token: vendor.token }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { workspace: Record<string, unknown> };
  const serialized = JSON.stringify(body);

  for (const secret of [
    'platformMargin',
    'estimatedNetProfit',
    'internalVendorSku',
    'snapSupplier',
    'customerPhone',
    'customerName',
    'streetAddress',
    'vendorId"',
    'payoutAccountNo',
  ]) {
    assert.equal(serialized.includes(secret), false, secret);
  }

  const workspace = body.workspace as {
    profile: { vendorCode: string; payoutAccountMasked: string };
    capabilities: { canCreateProduct: boolean };
    products: Array<{ productId: string; categoryId: string }>;
    orders: unknown[];
  };
  assert.equal(workspace.profile.vendorCode, 'VND-001');
  assert.match(workspace.profile.payoutAccountMasked, /•/);
  assert.equal(workspace.capabilities.canCreateProduct, true);
  assert.ok(workspace.products.length > 0);
});

test('vendor mutations reject admin sessions, cross-origin and missing CSRF', async () => {
  const admin = adminSession();
  const vendor = vendorSession();
  const product = {
    action: 'upsert',
    product: {
      categoryId: 'cat-fashion',
      nameBn: 'টেস্ট পণ্য',
      nameEn: 'Test product',
      descriptionBn: 'পরীক্ষামূলক বিবরণ',
      variants: [
        { publicSku: 'TEST-1', titleBn: 'স্ট্যান্ডার্ড', supplierCostPoisha: 10000, salePricePoisha: 20000 },
      ],
    },
  } as const;

  assert.equal((await postProduct(vendorRequest('/api/vendor/products', { method: 'POST', body: product }))).status, 401);
  assert.equal(
    (await postProduct(vendorRequest('/api/vendor/products', { method: 'POST', token: admin.token, csrf: admin.csrf, body: product }))).status,
    403
  );
  assert.equal(
    (await postProduct(vendorRequest('/api/vendor/products', { method: 'POST', token: vendor.token, csrf: vendor.csrf, origin: 'https://evil.example', body: product }))).status,
    403
  );
  assert.equal(
    (await postProduct(vendorRequest('/api/vendor/products', { method: 'POST', token: vendor.token, body: product }))).status,
    403
  );
});

test('vendor can create and publish an own product, but cannot touch another vendor product', async () => {
  const vendor = vendorSession();
  const created = await postProduct(
    vendorRequest('/api/vendor/products', {
      method: 'POST',
      token: vendor.token,
      csrf: vendor.csrf,
      body: {
        action: 'upsert',
        product: {
          categoryId: 'cat-fashion',
          nameBn: 'ভেন্ডর নতুন পণ্য',
          nameEn: 'Vendor new product',
          descriptionBn: 'ভেন্ডরের নিজের যোগ করা পণ্য',
          variants: [
            { publicSku: 'VND-NEW-1', titleBn: 'স্ট্যান্ডার্ড', supplierCostPoisha: 20000, salePricePoisha: 30000 },
          ],
        },
      },
    })
  );
  assert.equal(created.status, 200);
  const createdBody = (await created.json()) as { success: boolean; product: { productId: string; status: string } };
  assert.equal(createdBody.success, true);
  assert.equal(createdBody.product.status, 'draft');

  // Thin margin is refused so the platform never sells at a loss.
  const thin = await postProduct(
    vendorRequest('/api/vendor/products', {
      method: 'POST',
      token: vendor.token,
      csrf: vendor.csrf,
      body: {
        action: 'upsert',
        product: {
          categoryId: 'cat-fashion',
          nameBn: 'কম মার্জিন',
          nameEn: 'Thin margin',
          descriptionBn: 'খুবই কম মার্জিনের পণ্য',
          variants: [
            { publicSku: 'VND-THIN-1', titleBn: 'স্ট্যান্ডার্ড', supplierCostPoisha: 29900, salePricePoisha: 30000 },
          ],
        },
      },
    })
  );
  assert.equal(thin.status, 400);

  // Another vendor's product is a 404, never a 403.
  const foreign = await postProduct(
    vendorRequest('/api/vendor/products', {
      method: 'POST',
      token: vendor.token,
      csrf: vendor.csrf,
      body: { action: 'set_status', productId: 'prod-not-mine', status: 'draft' },
    })
  );
  assert.equal(foreign.status, 404);
});

test('vendor stock, proposal, payout and profile endpoints enforce ownership and capability flags', async () => {
  const vendor = vendorSession();

  assert.equal(
    (await postStock(vendorRequest('/api/vendor/stock', {
      method: 'POST', token: vendor.token, csrf: vendor.csrf,
      body: { action: 'dispatch_lot', variantId: 'var-not-mine', dispatchedQty: 5, challanRef: 'CH-1', noteBn: '' },
    }))).status,
    404
  );

  assert.equal(
    (await postProposal(vendorRequest('/api/vendor/price-proposals', {
      method: 'POST', token: vendor.token, csrf: vendor.csrf,
      body: { variantId: 'var-not-mine', proposedSupplierCostPoisha: 10000, proposedSalePricePoisha: 20000, reasonBn: 'দাম বেড়েছে' },
    }))).status,
    404
  );

  assert.equal(
    (await postPayout(vendorRequest('/api/vendor/payouts', {
      method: 'POST', token: vendor.token, csrf: vendor.csrf,
      body: { requestedAmountPoisha: 100 },
    }))).status,
    400
  );

  const profile = await postProfile(vendorRequest('/api/vendor/profile', {
    method: 'POST', token: vendor.token, csrf: vendor.csrf,
    body: { contactPhone: '01711901999' },
  }));
  assert.equal(profile.status, 201);
  const profileBody = (await profile.json()) as { request: { status: string } };
  assert.equal(profileBody.request.status, 'pending_review');

  // Invalid phone never becomes a pending request.
  assert.equal(
    (await postProfile(vendorRequest('/api/vendor/profile', {
      method: 'POST', token: vendor.token, csrf: vendor.csrf,
      body: { contactPhone: '12345' },
    }))).status,
    400
  );
});

test('admin vendor control requires super admin and gates vendor capabilities', async () => {
  assert.equal((await getAdminVendors(vendorRequest('/api/admin/vendors'))).status, 401);

  const vendor = vendorSession();
  assert.equal((await getAdminVendors(vendorRequest('/api/admin/vendors', { token: vendor.token }))).status, 403);

  const admin = adminSession();
  const snapshotRes = await getAdminVendors(vendorRequest('/api/admin/vendors', { token: admin.token }));
  assert.equal(snapshotRes.status, 200);
  const snapshot = (await snapshotRes.json()) as {
    vendors: Array<{ vendorId: string; vendorCode: string; capabilities: { canCreateProduct: boolean } }>;
    capabilityLabels: Array<{ key: string }>;
  };
  assert.ok(snapshot.vendors.length > 0);
  assert.ok(snapshot.capabilityLabels.some((label) => label.key === 'canRequestPayout'));

  const target = snapshot.vendors.find((item) => item.vendorCode === 'VND-001')!;

  const disable = await postAdminVendors(
    vendorRequest('/api/admin/vendors', {
      method: 'POST',
      token: admin.token,
      csrf: admin.csrf,
      body: {
        operation: 'set_capabilities',
        vendorId: target.vendorId,
        capabilities: { canCreateProduct: false, canRequestPayout: false },
        restrictionNoteBn: 'পর্যালোচনার জন্য সাময়িক সীমাবদ্ধতা',
      },
    })
  );
  assert.equal(disable.status, 200);

  // Vendors are the ones who feel the toggle immediately.
  const ownSession = vendorSession();
  const blocked = await postProduct(
    vendorRequest('/api/vendor/products', {
      method: 'POST',
      token: ownSession.token,
      csrf: ownSession.csrf,
      body: {
        action: 'upsert',
        product: {
          categoryId: 'cat-fashion',
          nameBn: 'ব্লকড পণ্য',
          nameEn: 'Blocked product',
          descriptionBn: 'অ্যাডমিন বন্ধ রেখেছেন',
          variants: [
            { publicSku: 'VND-BLOCK-1', titleBn: 'স্ট্যান্ডার্ড', supplierCostPoisha: 10000, salePricePoisha: 20000 },
          ],
        },
      },
    })
  );
  assert.equal(blocked.status, 400);
  const blockedBody = (await blocked.json()) as { errorBn: string };
  assert.match(blockedBody.errorBn, /অ্যাডমিন বন্ধ/);

  const payoutBlocked = await postPayout(
    vendorRequest('/api/vendor/payouts', {
      method: 'POST',
      token: ownSession.token,
      csrf: ownSession.csrf,
      body: { requestedAmountPoisha: 50000 },
    })
  );
  assert.equal(payoutBlocked.status, 400);

  const restore = await postAdminVendors(
    vendorRequest('/api/admin/vendors', {
      method: 'POST',
      token: admin.token,
      csrf: admin.csrf,
      body: { operation: 'reset_capabilities', vendorId: target.vendorId },
    })
  );
  assert.equal(restore.status, 200);

  // A reset must also drop the admin restriction note, otherwise a re-enabled
  // vendor keeps seeing "payouts are closed" in their panel.
  const restoredSnapshot = (await (
    await getAdminVendors(vendorRequest('/api/admin/vendors', { token: admin.token }))
  ).json()) as {
    vendors: Array<{ vendorCode: string; capabilities: { canCreateProduct: boolean }; restrictionNoteBn: string | null }>;
  };
  const restoredVendor = restoredSnapshot.vendors.find((item) => item.vendorCode === 'VND-001')!;
  assert.equal(restoredVendor.capabilities.canCreateProduct, true);
  assert.equal(restoredVendor.restrictionNoteBn, null);

  const unrestricted = await postProduct(
    vendorRequest('/api/vendor/products', {
      method: 'POST',
      token: ownSession.token,
      csrf: ownSession.csrf,
      body: {
        action: 'upsert',
        product: {
          categoryId: 'cat-fashion',
          nameBn: 'পুনরুদ্ধারকৃত পণ্য',
          nameEn: 'Restored product',
          descriptionBn: 'অনুমতি ফিরে এসেছে',
          variants: [
            { publicSku: 'VND-RESTORE-1', titleBn: 'স্ট্যান্ডার্ড', supplierCostPoisha: 10000, salePricePoisha: 20000 },
          ],
        },
      },
    })
  );
  assert.equal(unrestricted.status, 200);
});

test('admin can suspend a vendor and that vendor loses every mutation', async () => {
  const admin = adminSession();
  const snapshotRes = await getAdminVendors(vendorRequest('/api/admin/vendors', { token: admin.token }));
  const snapshot = (await snapshotRes.json()) as { vendors: Array<{ vendorId: string; vendorCode: string }> };
  const target = snapshot.vendors.find((item) => item.vendorCode === 'VND-001')!;

  const suspend = await postAdminVendors(
    vendorRequest('/api/admin/vendors', {
      method: 'POST',
      token: admin.token,
      csrf: admin.csrf,
      body: { operation: 'update_vendor', vendorId: target.vendorId, status: 'suspended' },
    })
  );
  assert.equal(suspend.status, 200);

  const vendor = vendorSession();
  const blocked = await postPayout(
    vendorRequest('/api/vendor/payouts', {
      method: 'POST',
      token: vendor.token,
      csrf: vendor.csrf,
      body: { requestedAmountPoisha: 50000 },
    })
  );
  assert.equal(blocked.status, 400);
  const blockedBody = (await blocked.json()) as { errorBn: string };
  assert.match(blockedBody.errorBn, /স্থগিত/);

  await postAdminVendors(
    vendorRequest('/api/admin/vendors', {
      method: 'POST',
      token: admin.token,
      csrf: admin.csrf,
      body: { operation: 'update_vendor', vendorId: target.vendorId, status: 'active' },
    })
  );
});


test('payout register reports who was paid what, and settlement is auditable', async () => {
  const admin = adminSession();
  const vendor = vendorSession();

  // 403 for a vendor session, 401 without a session at all.
  assert.equal((await getAdminPayoutRegister(vendorRequest('/api/admin/vendor-payouts'))).status, 401);
  assert.equal(
    (
      await getAdminPayoutRegister(
        vendorRequest('/api/admin/vendor-payouts', { token: vendor.token })
      )
    ).status,
    403
  );

  const created = await postAdminPayouts(
    vendorRequest('/api/admin/vendor-payouts', {
      method: 'POST',
      token: admin.token,
      csrf: admin.csrf,
      body: {
        operation: 'create_payout',
        vendorId: '00000000-0000-4000-8000-000000000901',
        requestedAmountPoisha: 50000,
      },
    })
  );
  assert.equal(created.status, 201);
  const createdBody = (await created.json()) as { payout: { payoutId: string } };
  const payoutId = createdBody.payout.payoutId;

  // A payout cannot be marked paid before it is approved.
  const premature = await postAdminPayouts(
    vendorRequest('/api/admin/vendor-payouts', {
      method: 'POST',
      token: admin.token,
      csrf: admin.csrf,
      body: { operation: 'resolve_payout', payoutId, decision: 'mark_paid', paymentTrxId: 'TRX-PRE' },
    })
  );
  assert.equal(premature.status, 400);

  // Self-approval stays blocked without an explicit override reason...
  const blocked = await postAdminPayouts(
    vendorRequest('/api/admin/vendor-payouts', {
      method: 'POST',
      token: admin.token,
      csrf: admin.csrf,
      body: { operation: 'resolve_payout', payoutId, decision: 'approve' },
    })
  );
  assert.equal(blocked.status, 400);

  // ...and succeeds with one. Without this the console's own "initiate payout"
  // flow could never be settled by the single super admin who created it.
  const override = 'একক সুপার অ্যাডমিন — জরুরি নিষ্পত্তি';
  const approved = await postAdminPayouts(
    vendorRequest('/api/admin/vendor-payouts', {
      method: 'POST',
      token: admin.token,
      csrf: admin.csrf,
      body: {
        operation: 'resolve_payout',
        payoutId,
        decision: 'approve',
        selfApprovalOverrideReasonBn: override,
      },
    })
  );
  assert.equal(approved.status, 200);

  const paid = await postAdminPayouts(
    vendorRequest('/api/admin/vendor-payouts', {
      method: 'POST',
      token: admin.token,
      csrf: admin.csrf,
      body: {
        operation: 'resolve_payout',
        payoutId,
        decision: 'mark_paid',
        paymentTrxId: 'BKASH-REGISTER-1',
        selfApprovalOverrideReasonBn: override,
      },
    })
  );
  assert.equal(paid.status, 200);

  // The audit trail must actually be persisted: these functions used to build
  // the entry and then only write the phase-4B document.
  const auditEntries = readAdminStore().auditLogs.filter(
    (log) => log.targetId === payoutId && log.actionCode.startsWith('VENDOR_PAYOUT_')
  );
  assert.ok(auditEntries.length >= 3, 'request, approval and payment must all be audited');
  assert.ok(
    auditEntries.some(
      (log) =>
        log.actionCode === 'VENDOR_PAYOUT_MARK_PAID' &&
        log.metadata.selfApprovalOverrideReasonBn === override
    )
  );

  const registerRes = await getAdminPayoutRegister(
    vendorRequest('/api/admin/vendor-payouts', { token: admin.token })
  );
  assert.equal(registerRes.status, 200);
  const register = (await registerRes.json()) as {
    rows: Array<{
      payoutId: string;
      status: string;
      paidByUsername: string | null;
      approvedByUsername: string | null;
      payoutAccountMasked: string;
      estimatedFeePoisha: number;
      netPayablePoisha: number;
      requestedAmountPoisha: number;
      timeline: Array<{ eventEn: string }>;
    }>;
    totals: { totalDisbursedPoisha: number; paidCount: number };
    vendorRollups: Array<{ vendorCode: string; paidPoisha: number }>;
  };

  const row = register.rows.find((item) => item.payoutId === payoutId)!;
  assert.equal(row.status, 'paid');
  const adminUsername = admin.actor.username;
  assert.equal(row.approvedByUsername, adminUsername);
  assert.equal(row.paidByUsername, adminUsername);
  assert.equal(row.netPayablePoisha, row.requestedAmountPoisha - row.estimatedFeePoisha);
  assert.ok(row.timeline.length >= 3);
  // The register must never expose the full payout account number.
  assert.match(row.payoutAccountMasked, /•/);
  assert.ok(register.totals.totalDisbursedPoisha >= 50000);
  const rollup = register.vendorRollups.find((item) => item.vendorCode === 'VND-001')!;
  assert.ok(rollup.paidPoisha >= 50000);
});

test('rejecting a payout releases the held funds back to the vendor balance', async () => {
  const admin = adminSession();

  const created = await postAdminPayouts(
    vendorRequest('/api/admin/vendor-payouts', {
      method: 'POST',
      token: admin.token,
      csrf: admin.csrf,
      body: {
        operation: 'create_payout',
        vendorId: '00000000-0000-4000-8000-000000000901',
        requestedAmountPoisha: 60000,
      },
    })
  );
  assert.equal(created.status, 201);
  const { payout } = (await created.json()) as { payout: { payoutId: string } };

  const before = await getAdminPayoutRegister(
    vendorRequest('/api/admin/vendor-payouts', { token: admin.token })
  );
  const beforeBody = (await before.json()) as {
    vendorRollups: Array<{ vendorCode: string; balance: { withdrawablePoisha: number } }>;
  };
  const withdrawableBefore = beforeBody.vendorRollups.find((v) => v.vendorCode === 'VND-001')!
    .balance.withdrawablePoisha;

  const rejected = await postAdminPayouts(
    vendorRequest('/api/admin/vendor-payouts', {
      method: 'POST',
      token: admin.token,
      csrf: admin.csrf,
      body: {
        operation: 'resolve_payout',
        payoutId: payout.payoutId,
        decision: 'reject',
        rejectionReasonBn: 'অ্যাকাউন্ট নম্বর যাচাই করা যায়নি',
      },
    })
  );
  assert.equal(rejected.status, 200);

  const after = await getAdminPayoutRegister(
    vendorRequest('/api/admin/vendor-payouts', { token: admin.token })
  );
  const afterBody = (await after.json()) as {
    vendorRollups: Array<{ vendorCode: string; balance: { withdrawablePoisha: number } }>;
  };
  const withdrawableAfter = afterBody.vendorRollups.find((v) => v.vendorCode === 'VND-001')!
    .balance.withdrawablePoisha;

  // Rejection returns the held amount, so the vendor is whole again.
  assert.equal(withdrawableAfter, withdrawableBefore + 60000);
});
