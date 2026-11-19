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
import { readAdminStore, writeAdminStore } from '@/src/lib/admin/phase4a-service';
import { POST as postOnboarding } from '../../../app/api/vendor/onboarding/route';

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
    capabilities: {
      canCreateProduct: boolean;
      canEditProduct: boolean;
      canSubmitConsignmentLot: boolean;
      canSubmitPriceProposal: boolean;
      canEditProfile: boolean;
      canRequestPayout: boolean;
    };
    products: Array<{ productId: string; categoryId: string }>;
    orders: unknown[];
  };
  assert.equal(workspace.profile.vendorCode, 'VND-001');
  assert.match(workspace.profile.payoutAccountMasked, /•/);
  assert.equal(workspace.capabilities.canCreateProduct, false);
  assert.equal(workspace.capabilities.canEditProduct, false);
  assert.equal(workspace.capabilities.canSubmitConsignmentLot, false);
  assert.equal(workspace.capabilities.canSubmitPriceProposal, false);
  assert.equal(workspace.capabilities.canEditProfile, false);
  assert.equal(workspace.capabilities.canRequestPayout, true);
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

test('vendor cannot create products by default, and admin unlock permits create while isolating foreign products', async () => {
  const admin = adminSession();
  const vendor = vendorSession();
  const defaultBlocked = await postProduct(
    vendorRequest('/api/vendor/products', {
      method: 'POST',
      token: vendor.token,
      csrf: vendor.csrf,
      body: {
        action: 'upsert',
        product: {
          categoryId: 'cat-fashion',
          nameBn: 'ডিফল্ট ব্লক পণ্য',
          nameEn: 'Default blocked product',
          descriptionBn: 'অনুমতি ছাড়া তৈরি হবে না',
          variants: [
            { publicSku: 'VND-DEF-BLOCK', titleBn: 'স্ট্যান্ডার্ড', supplierCostPoisha: 20000, salePricePoisha: 30000 },
          ],
        },
      },
    })
  );
  assert.equal(defaultBlocked.status, 400);

  const targetVendorId = vendor.actor.vendorId!;
  await postAdminVendors(
    vendorRequest('/api/admin/vendors', {
      method: 'POST',
      token: admin.token,
      csrf: admin.csrf,
      body: {
        operation: 'set_capabilities',
        vendorId: targetVendorId,
        capabilities: { canCreateProduct: true, canEditProduct: true, canChangeProductStatus: true },
      },
    })
  );

  try {
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
  } finally {
    await postAdminVendors(
      vendorRequest('/api/admin/vendors', {
        method: 'POST',
        token: admin.token,
        csrf: admin.csrf,
        body: { operation: 'reset_capabilities', vendorId: targetVendorId },
      })
    );
  }
});

test('vendor stock, proposal, payout and profile endpoints enforce ownership and capability flags', async () => {
  const admin = adminSession();
  const vendor = vendorSession();
  const targetVendorId = vendor.actor.vendorId!;

  // Read-only by default blocks dispatch lots, proposals, and profile requests.
  assert.equal(
    (await postStock(vendorRequest('/api/vendor/stock', {
      method: 'POST', token: vendor.token, csrf: vendor.csrf,
      body: { action: 'dispatch_lot', variantId: 'var-not-mine', dispatchedQty: 5, challanRef: 'CH-1', noteBn: '' },
    }))).status,
    400
  );
  assert.equal(
    (await postProposal(vendorRequest('/api/vendor/price-proposals', {
      method: 'POST', token: vendor.token, csrf: vendor.csrf,
      body: { variantId: 'var-not-mine', proposedSupplierCostPoisha: 10000, proposedSalePricePoisha: 20000, reasonBn: 'দাম বেড়েছে' },
    }))).status,
    400
  );
  assert.equal(
    (await postProfile(vendorRequest('/api/vendor/profile', {
      method: 'POST', token: vendor.token, csrf: vendor.csrf,
      body: { contactPhone: '01711901999' },
    }))).status,
    400
  );

  // Payout requests remain enabled by default and validate minimum thresholds.
  assert.equal(
    (await postPayout(vendorRequest('/api/vendor/payouts', {
      method: 'POST', token: vendor.token, csrf: vendor.csrf,
      body: { requestedAmountPoisha: 100 },
    }))).status,
    400
  );

  // When Admin explicitly enables self-service capabilities, ownership checks run.
  await postAdminVendors(
    vendorRequest('/api/admin/vendors', {
      method: 'POST',
      token: admin.token,
      csrf: admin.csrf,
      body: {
        operation: 'set_capabilities',
        vendorId: targetVendorId,
        capabilities: {
          canSubmitConsignmentLot: true,
          canSubmitPriceProposal: true,
          canEditProfile: true,
        },
      },
    })
  );

  try {
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
  } finally {
    await postAdminVendors(
      vendorRequest('/api/admin/vendors', {
        method: 'POST',
        token: admin.token,
        csrf: admin.csrf,
        body: { operation: 'reset_capabilities', vendorId: targetVendorId },
      })
    );
  }
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

  // Super Admin enables product creation, vendor creates product successfully.
  const enableProduct = await postAdminVendors(
    vendorRequest('/api/admin/vendors', {
      method: 'POST',
      token: admin.token,
      csrf: admin.csrf,
      body: {
        operation: 'set_capabilities',
        vendorId: target.vendorId,
        capabilities: { canCreateProduct: true },
      },
    })
  );
  assert.equal(enableProduct.status, 200);

  const ownSession = vendorSession();
  const allowedProduct = await postProduct(
    vendorRequest('/api/vendor/products', {
      method: 'POST',
      token: ownSession.token,
      csrf: ownSession.csrf,
      body: {
        action: 'upsert',
        product: {
          categoryId: 'cat-fashion',
          nameBn: 'অনুমতিপ্রাপ্ত পণ্য',
          nameEn: 'Allowed product',
          descriptionBn: 'অনুমতি সক্রিয় থাকা অবস্থায় তৈরি',
          variants: [
            { publicSku: 'VND-ALLOW-1', titleBn: 'স্ট্যান্ডার্ড', supplierCostPoisha: 10000, salePricePoisha: 20000 },
          ],
        },
      },
    })
  );
  assert.equal(allowedProduct.status, 200);

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

  // A reset restores read-only defaults (canCreateProduct = false, canRequestPayout = true)
  // and drops the admin restriction note.
  const restoredSnapshot = (await (
    await getAdminVendors(vendorRequest('/api/admin/vendors', { token: admin.token }))
  ).json()) as {
    vendors: Array<{
      vendorCode: string;
      capabilities: { canCreateProduct: boolean; canRequestPayout: boolean };
      restrictionNoteBn: string | null;
    }>;
  };
  const restoredVendor = restoredSnapshot.vendors.find((item) => item.vendorCode === 'VND-001')!;
  assert.equal(restoredVendor.capabilities.canCreateProduct, false);
  assert.equal(restoredVendor.capabilities.canRequestPayout, true);
  assert.equal(restoredVendor.restrictionNoteBn, null);

  // Product creation remains read-only after reset.
  const defaultReadOnly = await postProduct(
    vendorRequest('/api/vendor/products', {
      method: 'POST',
      token: ownSession.token,
      csrf: ownSession.csrf,
      body: {
        action: 'upsert',
        product: {
          categoryId: 'cat-fashion',
          nameBn: 'ডিফল্ট রিড-অনলি',
          nameEn: 'Default read only',
          descriptionBn: 'ডিফল্ট রিড-অনলি যাচাই',
          variants: [
            { publicSku: 'VND-RESTORE-1', titleBn: 'স্ট্যান্ডার্ড', supplierCostPoisha: 10000, salePricePoisha: 20000 },
          ],
        },
      },
    })
  );
  assert.equal(defaultReadOnly.status, 400);
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

test('new vendor remains pending, cannot transact before activation and cannot bypass closure audit', async () => {
  const admin = adminSession();
  const response = await postAdminVendors(vendorRequest('/api/admin/vendors', {
    method: 'POST', token: admin.token, csrf: admin.csrf,
    body: { operation: 'create_vendor', businessNameBn: 'নতুন ব্যবসা', ownerNameBn: 'মালিক', contactPhone: '01712345678', defaultCommissionBp: 1000, escrowHoldDaysOverride: 7, payoutMethodBn: 'বিকাশ', payoutAccountNo: '01712345678', status: 'active' },
  }));
  assert.equal(response.status, 201, await response.clone().text());
  const { vendorId } = await response.json() as { vendorId: string };
  const { readPhase4BStore } = await import('@/src/lib/admin/phase4b-service');
  const profile = readPhase4BStore().vendors.find(v => v.vendorId === vendorId)!;
  assert.equal(profile.status, 'pending_onboarding');
  assert.deepEqual(profile.onboardingAnswers15, {});
  const { assertVendorAccountUsable } = await import('@/src/lib/vendor/vendor-workspace-service');
  assert.equal(assertVendorAccountUsable(profile).ok, false);
  assert.equal(assertVendorAccountUsable(profile, true).ok, true);
  const close = await postAdminVendors(vendorRequest('/api/admin/vendors', {
    method: 'POST', token: admin.token, csrf: admin.csrf,
    body: { operation: 'update_vendor', vendorId, status: 'closed' },
  }));
  assert.equal(close.status, 400);
  const updateStatus = (status: string, activationReason?: string) => postAdminVendors(vendorRequest('/api/admin/vendors', {
    method: 'POST', token: admin.token, csrf: admin.csrf,
    body: { operation: 'update_vendor', vendorId, status, activationReason },
  }));
  assert.equal((await updateStatus('active', 'Reviewed onboarding')).status, 400);
  assert.equal((await updateStatus('suspended')).status, 400);
  const registry = readAdminStore();
  const linked = registry.users.find(user => user.userId === 'usr-vendor-001')!;
  const previousVendor = linked.vendorId;
  linked.vendorId = vendorId; writeAdminStore(registry);
  try {
    const { VENDOR_ONBOARDING_15_QUESTIONS } = await import('@/src/lib/admin/phase4b-service');
    const vendor = vendorSession();
    const answers15 = Object.fromEntries(VENDOR_ONBOARDING_15_QUESTIONS.map(q => [q.key, 'Test response']));
    assert.equal(
      (await postOnboarding(vendorRequest('/api/vendor/onboarding', { method: 'POST', token: vendor.token, csrf: vendor.csrf, body: { answers15 } }))).status,
      400
    );
    await postAdminVendors(
      vendorRequest('/api/admin/vendors', {
        method: 'POST',
        token: admin.token,
        csrf: admin.csrf,
        body: { operation: 'set_capabilities', vendorId, capabilities: { canSubmitOnboardingAnswers: true } },
      })
    );
    const submitted = await postOnboarding(vendorRequest('/api/vendor/onboarding', { method: 'POST', token: vendor.token, csrf: vendor.csrf, body: { answers15 } }));
    assert.equal(submitted.status, 201, await submitted.clone().text());
    assert.equal((await updateStatus('active', 'Reviewed onboarding')).status, 400);
    const directory = await getAdminVendors(vendorRequest('/api/admin/vendors', { token: admin.token }));
    const snapshot = await directory.json() as { requests: Array<{ requestId: string; vendorId: string; kind: string; status: string }> };
    const pending = snapshot.requests.find(r => r.vendorId === vendorId && r.kind === 'onboarding_update' && r.status === 'pending_review');
    assert.ok(pending);
    const decision = await postAdminVendors(vendorRequest('/api/admin/vendors', { method: 'POST', token: admin.token, csrf: admin.csrf, body: { operation: 'decide_vendor_request', requestId: pending.requestId, decision: 'approve' } }));
    assert.equal(decision.status, 200, await decision.clone().text());
    assert.equal((await updateStatus('active')).status, 400);
    assert.equal((await updateStatus('active', 'Reviewed onboarding')).status, 200);
    assert.equal(readPhase4BStore().vendors.find(v => v.vendorId === vendorId)?.status, 'active');
    assert.ok(readAdminStore().auditLogs.some(log => log.actionCode === 'VENDOR_PROFILE_UPDATED_BY_ADMIN' && log.metadata?.activationReason === 'Reviewed onboarding'));
  } finally {
    const restored = readAdminStore(); restored.users.find(user => user.userId === 'usr-vendor-001')!.vendorId = previousVendor; writeAdminStore(restored);
  }
});


test('return resolutions are scoped to the signed vendor and omit internal fields', async () => {
  const { readPhase4BStore, writePhase4BStore } = await import('@/src/lib/admin/phase4b-service');
  const vendor = vendorSession();
  const store = readPhase4BStore();
  const previous = [...store.returnResolutions];
  const row = { returnId: 'ret-own', orderNo: 'ORDER-OWN', vendorId: vendor.actor.vendorId!, faultType: 'SUPPLIER_DEFECT' as const,
    quantity: 2, vendorDebitPoisha: 1000, platformLossPoisha: 123, courierClaimPoisha: 456,
    restockQuantity: 1, proofUrl: 'private-proof', noteBn: 'internal-note', createdAt: '2026-01-01T00:00:00Z' };
  try {
    store.returnResolutions = [row, { ...row, returnId: 'ret-other', orderNo: 'ORDER-OTHER', vendorId: 'other-vendor' }];
    writePhase4BStore(store);
    const res = await getWorkspace(vendorRequest('/api/vendor/workspace', { token: vendor.token }));
    assert.equal(res.status, 200);
    const body = await res.json() as { workspace: { returns: unknown[] } };
    assert.deepEqual(body.workspace.returns, [{ returnId: 'ret-own', orderNo: 'ORDER-OWN', faultType: 'SUPPLIER_DEFECT', quantity: 2, vendorDebitPoisha: 1000, restockQuantity: 1, createdAt: '2026-01-01T00:00:00Z' }]);
    for (const secret of ['ORDER-OTHER', 'platformLossPoisha', 'courierClaimPoisha', 'private-proof', 'internal-note']) assert.equal(JSON.stringify(body.workspace.returns).includes(secret), false);
  } finally {
    const current = readPhase4BStore(); current.returnResolutions = previous; writePhase4BStore(current);
  }
});

test('statement export is tenant scoped, date bounded, spreadsheet safe and never silently truncated', async () => {
  const { GET: statement } = await import('../../../app/api/vendor/statement/route');
  const { readPhase4BStore, writePhase4BStore } = await import('@/src/lib/admin/phase4b-service');
  const vendor = vendorSession(), admin = adminSession();
  const url = '/api/vendor/statement?from=2026-01-01&to=2026-01-31&vendorId=other';
  assert.equal((await statement(vendorRequest(url))).status, 401);
  assert.equal((await statement(vendorRequest(url, { token: admin.token }))).status, 403);
  assert.equal((await statement(vendorRequest('/api/vendor/statement?from=2026-02-30&to=2026-03-01', { token: vendor.token }))).status, 400);
  const store = readPhase4BStore(), original = [...store.vendorLedger];
  const seed = original[0];
  assert.ok(seed);
  const own = { ...seed, id: 'own', vendorId: vendor.actor.vendorId!, orderNo: 'OWN', descriptionBn: ' \t=HYPERLINK("evil")', amountPoisha: -100, createdAt: '2026-01-31T23:59:59.999Z' };
  try {
    store.vendorLedger = [own, { ...own, id: 'other', vendorId: 'other', orderNo: 'SECRET' }, { ...own, id: 'later', createdAt: '2026-02-01T00:00:00.000Z' }];
    writePhase4BStore(store);
    const response = await statement(vendorRequest(url, { token: vendor.token }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const csv = await response.text();
    assert.ok(csv.includes('OWN')); assert.ok(csv.includes('"\' \t=HYPERLINK(""evil"")"'));
    assert.ok(csv.includes(',-100,')); assert.ok(!csv.includes('SECRET')); assert.ok(!csv.includes('later'));
    const large = readPhase4BStore(); large.vendorLedger = Array.from({ length: 5001 }, (_, i) => ({ ...own, id: `row-${i}` })); writePhase4BStore(large);
    const tooMany = await statement(vendorRequest(url, { token: vendor.token }));
    assert.equal(tooMany.status, 400); assert.equal((await tooMany.json() as { code: string }).code, 'RANGE_TOO_LARGE');
  } finally { const current = readPhase4BStore(); current.vendorLedger = original; writePhase4BStore(current); }
});

test('support tickets enforce tenant isolation, CSRF, role boundaries, state and audit', async () => {
  const vendorApi = await import('../../../app/api/vendor/support/route');
  const adminApi = await import('../../../app/api/admin/vendor-support/route');
  const { readPhase4BStore, writePhase4BStore } = await import('@/src/lib/admin/phase4b-service');
  const vendor = vendorSession(), admin = adminSession();
  const post = (token: string, csrf: string | undefined, body: unknown) => vendorRequest('/api/vendor/support', { method: 'POST', token, csrf, body });
  const adminPost = (token: string, csrf: string | undefined, body: unknown) => vendorRequest('/api/admin/vendor-support', { method: 'POST', token, csrf, body });
  const payload = { action: 'create', subject: 'Need help', text: 'Please help' };
  assert.equal((await vendorApi.GET(vendorRequest('/api/vendor/support'))).status, 401);
  assert.equal((await adminApi.GET(vendorRequest('/api/admin/vendor-support', { token: vendor.token }))).status, 403);
  assert.equal((await vendorApi.POST(post(vendor.token, undefined, payload))).status, 403);
  assert.equal((await vendorApi.POST(post(vendor.token, vendor.csrf, { ...payload, vendorId: 'other' }))).status, 400);
  const created = await vendorApi.POST(post(vendor.token, vendor.csrf, payload));
  assert.equal(created.status, 201);
  const { ticket } = await created.json() as { ticket: { ticketId: string; vendorId?: string } };
  assert.equal(ticket.vendorId, undefined);
  const store = readPhase4BStore();
  const own = store.supportTickets!.find(row => row.ticketId === ticket.ticketId)!;
  const other = { ...own, ticketId: 'f59dbb35-c1e9-4af0-adca-c002e32d4d11', vendorId: 'other', subject: 'OTHER SECRET' };
  store.supportTickets!.push(other); writePhase4BStore(store);
  const list = await vendorApi.GET(vendorRequest('/api/vendor/support', { token: vendor.token }));
  assert.equal(JSON.stringify(await list.json()).includes('OTHER SECRET'), false);
  assert.equal((await vendorApi.POST(post(vendor.token, vendor.csrf, { action: 'reply', ticketId: other.ticketId, text: 'Intrusion' }))).status, 409);
  assert.equal((await adminApi.POST(adminPost(admin.token, undefined, { action: 'close', ticketId: ticket.ticketId }))).status, 403);
  assert.equal((await adminApi.POST(adminPost(vendor.token, vendor.csrf, { action: 'close', ticketId: ticket.ticketId }))).status, 403);
  assert.equal((await adminApi.POST(adminPost(admin.token, admin.csrf, { action: 'reply', ticketId: ticket.ticketId, text: 'We can help' }))).status, 200);
  assert.equal((await vendorApi.POST(post(vendor.token, vendor.csrf, { action: 'reply', ticketId: ticket.ticketId, text: 'Thanks' }))).status, 200);
  assert.equal((await adminApi.POST(adminPost(admin.token, admin.csrf, { action: 'close', ticketId: ticket.ticketId }))).status, 200);
  assert.equal((await vendorApi.POST(post(vendor.token, vendor.csrf, { action: 'reply', ticketId: ticket.ticketId, text: 'Late' }))).status, 409);
  assert.equal((await adminApi.POST(adminPost(admin.token, admin.csrf, { action: 'close', ticketId: ticket.ticketId }))).status, 409);
  const audit = readAdminStore().auditLogs.filter(log => log.targetId === ticket.ticketId);
  assert.deepEqual(new Set(audit.map(log => log.actionCode)), new Set(['VENDOR_SUPPORT_CREATED', 'VENDOR_SUPPORT_REPLIED', 'VENDOR_SUPPORT_CLOSED']));
  assert.equal(JSON.stringify(audit).includes('Please help'), false);
});

test('bucket statement rolls forward own complete ledger and reports recorded paid payouts without secrets', async () => {
  const { GET: statement } = await import('../../../app/api/vendor/statement/route');
  const { readPhase4BStore, writePhase4BStore } = await import('@/src/lib/admin/phase4b-service');
  const vendor = vendorSession(), admin = adminSession();
  const url = '/api/vendor/statement?from=2026-01-01&to=2026-01-31&format=summary&vendorId=other';
  assert.equal((await statement(vendorRequest(url))).status, 401);
  assert.equal((await statement(vendorRequest(url, { token: admin.token }))).status, 403);
  const store = readPhase4BStore(), oldLedger = store.vendorLedger, oldPayouts = store.payoutRequests;
  const seed = oldLedger[0], ownId = vendor.actor.vendorId!;
  const row = { ...seed, vendorId: ownId, createdAt: '2026-01-01T00:00:00.000Z' };
  const payout = { payoutId: 'paid-test', vendorId: ownId, vendorCode: 'VND-001', vendorNameBn: 'vendor', requestedAmountPoisha: 200, payoutMethodBn: 'manual', payoutAccountNo: '01712345678', status: 'paid' as const, holdLedgerEntryId: 'hold', rejectionReasonBn: null, paymentTrxId: 'TRX-123', proofUrl: 'private-proof', requestedByUsername: 'private-user', requestedAt: '2025-12-30T00:00:00.000Z', resolvedAt: '2026-01-31T23:59:59.999Z' };
  try {
    store.vendorLedger = [
      { ...row, id: 'open', escrowBucket: 'pending', amountPoisha: 1000, createdAt: '2025-12-31T23:59:59.999Z' },
      { ...row, id: 'offset', escrowBucket: 'pending', amountPoisha: -1000 },
      { ...row, id: 'locked', escrowBucket: 'locked', amountPoisha: 1000 },
      { ...row, id: 'adjust', escrowBucket: 'available', amountPoisha: -200, createdAt: '2026-01-31T23:59:59.999Z' },
      { ...row, id: 'future', escrowBucket: 'available', amountPoisha: 999, createdAt: '2026-02-01T00:00:00.000Z' },
      { ...row, id: 'other', vendorId: 'other', escrowBucket: 'available', amountPoisha: 98765 },
    ];
    store.payoutRequests = [payout, { ...payout, vendorId: 'other', payoutId: 'other-paid' }, { ...payout, payoutId: 'future-paid', resolvedAt: '2026-02-01T00:00:00.000Z' }]; writePhase4BStore(store);
    const response = await statement(vendorRequest(url, { token: vendor.token })); assert.equal(response.status, 200);
    const body = await response.json() as { statement: { buckets: unknown[]; ledgerEntryCount: number; payouts: Array<{ payoutId: string; accountMasked: string }> } };
    assert.deepEqual(body.statement.buckets, [
      { bucket: 'pending', openingPoisha: 1000, creditsPoisha: 0, debitsPoisha: -1000, closingPoisha: 0 },
      { bucket: 'locked', openingPoisha: 0, creditsPoisha: 1000, debitsPoisha: 0, closingPoisha: 1000 },
      { bucket: 'available', openingPoisha: 0, creditsPoisha: 0, debitsPoisha: -200, closingPoisha: -200 },
    ]);
    assert.equal(body.statement.ledgerEntryCount, 3);
    assert.equal(body.statement.payouts.length, 1); assert.equal(body.statement.payouts[0].payoutId, 'paid-test');
    assert.match(body.statement.payouts[0].accountMasked, /5678$/);
    for (const secret of ['01712345678', 'other-paid', 'private-proof', 'private-user', '98765']) assert.equal(JSON.stringify(body).includes(secret), false);
    const broken = readPhase4BStore(); broken.vendorLedger.push({ ...row, id: 'broken', createdAt: 'invalid' }); writePhase4BStore(broken);
    const bad = await statement(vendorRequest(url, { token: vendor.token })); assert.equal(bad.status, 503);
    assert.equal((await bad.json() as { code: string }).code, 'INVALID_LEDGER_DATA');
    const overflow = readPhase4BStore(); overflow.vendorLedger = [
      { ...row, id: 'max', amountPoisha: Number.MAX_SAFE_INTEGER, escrowBucket: 'available', createdAt: '2025-12-31T00:00:00Z' },
      { ...row, id: 'one', amountPoisha: 1, escrowBucket: 'available', createdAt: '2025-12-31T00:00:00Z' },
    ]; writePhase4BStore(overflow);
    assert.equal((await statement(vendorRequest(url, { token: vendor.token }))).status, 503);
  } finally { const current = readPhase4BStore(); current.vendorLedger = oldLedger; current.payoutRequests = oldPayouts; writePhase4BStore(current); }
});

test('vendor workspace exposes only admin-approved reviews and excludes pending or rejected ones', async () => {
  const { readErpState, writeErpState } = await import('@/src/lib/db/repository');
  const { readPhase6Store, writePhase6Store } = await import('@/src/lib/admin/phase6-service');
  const vendor = vendorSession();
  const erp = readErpState();
  const p6 = readPhase6Store();
  const oldReviews = [...erp.reviews];
  const oldModeration = { ...(p6.reviewModerationStatus ?? {}) };
  const ownProduct = erp.products.find((p) => p.vendorId === vendor.actor.vendorId)!;

  try {
    erp.reviews = [
      {
        id: 'rev-test-approved',
        productId: ownProduct.productId,
        customerName: 'অনুমোদিত ক্রেতা',
        rating: 5,
        comment: 'দারুণ মানের পণ্য অনুমোদিত',
        isVerifiedPurchase: true,
        createdAt: '2026-11-10T10:00:00.000Z',
      },
      {
        id: 'rev-test-pending',
        productId: ownProduct.productId,
        customerName: 'অপেক্ষমাণ ক্রেতা',
        rating: 1,
        comment: 'পেন্ডিং গোপন মন্তব্য',
        isVerifiedPurchase: false,
        createdAt: '2026-11-11T10:00:00.000Z',
      },
      {
        id: 'rev-test-rejected',
        productId: ownProduct.productId,
        customerName: 'বাতিল ক্রেতা',
        rating: 2,
        comment: 'রিজেক্টেড গোপন মন্তব্য',
        isVerifiedPurchase: false,
        createdAt: '2026-11-12T10:00:00.000Z',
      },
    ];
    writeErpState(erp);
    p6.reviewModerationStatus = {
      'rev-test-approved': { status: 'approved', moderatedBy: 'super_admin', moderatedAt: '2026-11-10T12:00:00.000Z' },
      'rev-test-pending': { status: 'pending', moderatedBy: null, moderatedAt: null },
      'rev-test-rejected': { status: 'rejected', moderatedBy: 'super_admin', moderatedAt: '2026-11-12T12:00:00.000Z' },
    };
    writePhase6Store(p6);

    const res = await getWorkspace(vendorRequest('/api/vendor/workspace', { token: vendor.token }));
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      workspace: {
        approvedReviews: Array<{ reviewId: string; rating: number; reviewerLabel: string; comment: string }>;
        counters: { approvedReviews: number };
      };
    };
    const serialized = JSON.stringify(body.workspace.approvedReviews);
    assert.equal(body.workspace.approvedReviews.length, 1);
    assert.equal(body.workspace.counters.approvedReviews, 1);
    assert.equal(body.workspace.approvedReviews[0].reviewId, 'rev-test-approved');
    assert.match(body.workspace.approvedReviews[0].reviewerLabel, /•••/);
    assert.equal(serialized.includes('অনুমোদিত ক্রেতা'), false);
    assert.equal(serialized.includes('পেন্ডিং গোপন মন্তব্য'), false);
    assert.equal(serialized.includes('রিজেক্টেড গোপন মন্তব্য'), false);
  } finally {
    const restoreErp = readErpState();
    restoreErp.reviews = oldReviews;
    writeErpState(restoreErp);
    const restoreP6 = readPhase6Store();
    restoreP6.reviewModerationStatus = oldModeration;
    writePhase6Store(restoreP6);
  }
});

test('admin consignment intake updates warehouse stock and vendor dispatch/receive history', async () => {
  const { GET: getAdminWorkspace, POST: postAdminWorkspace } = await import('../../../app/api/admin/workspace/route');
  const { readErpState, writeErpState } = await import('@/src/lib/db/repository');
  const { readPhase7Store, writePhase7Store } = await import('@/src/lib/admin/phase7-service');
  const admin = adminSession();
  const vendor = vendorSession();
  const erp = readErpState();
  const p7 = readPhase7Store();
  const targetProd = erp.products.find((p) => p.vendorId === vendor.actor.vendorId)!;
  const targetVar = targetProd.variants[0]!;
  const beforeAvail = targetVar.stockAvailable;
  const beforeLots = [...p7.consignmentLots];

  try {
    const res = await postAdminWorkspace(
      vendorRequest('/api/admin/workspace', {
        method: 'POST',
        token: admin.token,
        csrf: admin.csrf,
        body: {
          operation: 'record_admin_consignment_intake',
          variantId: targetVar.variantId,
          dispatchedQty: 12,
          qcRejectedQty: 2,
          unitSupplierCostPoisha: 175000,
          challanRef: 'CH-ADMIN-INTAKE-99',
          dispatchedAt: '2026-11-14T08:00:00.000Z',
          receivedAt: '2026-11-15T14:30:00.000Z',
          qcProofUrl: 'https://example.com/proof-99.jpg',
          noteBn: '১০ পিস গ্রহণ এবং ২ পিস কোয়ালিটি ইস্যুতে ফেরত।',
        },
      })
    );
    assert.equal(res.status, 201, await res.clone().text());
    const intakeBody = (await res.json()) as { success: boolean; updatedStockAvailable: number };
    assert.equal(intakeBody.success, true);
    assert.equal(intakeBody.updatedStockAvailable, beforeAvail + 10);

    const vendorRes = await getWorkspace(vendorRequest('/api/vendor/workspace', { token: vendor.token }));
    assert.equal(vendorRes.status, 200);
    const vendorBody = (await vendorRes.json()) as {
      workspace: {
        lots: Array<{
          challanRef: string;
          dispatchedQty: number;
          qcAcceptedQty: number | null;
          qcRejectedQty: number | null;
          unitSupplierCostPoisha: number;
          totalValuePoisha: number;
          dispatchedAt: string;
          receivedAt: string | null;
          qcProofUrl: string | null;
          status: string;
        }>;
      };
    };
    const recorded = vendorBody.workspace.lots.find((l) => l.challanRef === 'CH-ADMIN-INTAKE-99')!;
    assert.ok(recorded);
    assert.equal(recorded.dispatchedQty, 12);
    assert.equal(recorded.qcAcceptedQty, 10);
    assert.equal(recorded.qcRejectedQty, 2);
    assert.equal(recorded.unitSupplierCostPoisha, 175000);
    assert.equal(recorded.totalValuePoisha, 1750000);
    assert.equal(recorded.dispatchedAt, '2026-11-14T08:00:00.000Z');
    assert.equal(recorded.receivedAt, '2026-11-15T14:30:00.000Z');
    assert.equal(recorded.qcProofUrl, 'https://example.com/proof-99.jpg');
    assert.equal(recorded.status, 'approved_stocked');

    // Admin overview GET also surfaces open vendor support tickets.
    const vendorApi = await import('../../../app/api/vendor/support/route');
    const createdTicketRes = await vendorApi.POST(
      vendorRequest('/api/vendor/support', {
        method: 'POST',
        token: vendor.token,
        csrf: vendor.csrf,
        body: { action: 'create', subject: 'অ্যাডমিন ইনবক্স টেস্ট', text: 'সাপোর্ট নোটিফিকেশন যাচাই' },
      })
    );
    assert.equal(createdTicketRes.status, 201);
    const { ticket } = (await createdTicketRes.json()) as { ticket: { ticketId: string } };

    const adminOverview = await getAdminWorkspace(vendorRequest('/api/admin/workspace', { token: admin.token }));
    assert.equal(adminOverview.status, 200);
    const adminBody = (await adminOverview.json()) as {
      vendorSupportTickets?: Array<{ ticketId: string; status: string; subject: string; lastSender: string }>;
    };
    assert.ok(
      adminBody.vendorSupportTickets?.some(
        (t) => t.ticketId === ticket.ticketId && t.status === 'open' && t.lastSender === 'vendor'
      )
    );
  } finally {
    const restoreErp = readErpState();
    for (const prod of restoreErp.products) {
      const vr = prod.variants.find((v) => v.variantId === targetVar.variantId);
      if (vr) {
        vr.stockOnHand = targetVar.stockOnHand;
        vr.stockAvailable = targetVar.stockAvailable;
      }
    }
    writeErpState(restoreErp);
    const restoreP7 = readPhase7Store();
    restoreP7.consignmentLots = beforeLots;
    writePhase7Store(restoreP7);
  }
});
