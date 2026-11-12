import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { createAdminSession } from '@/src/lib/security/crypto-session';
import { getActorSecurityContext } from '@/src/lib/admin/phase4a-service';
import { GET } from './route';

function request(token?: string, forgedVendorId?: string) {
  const url = `http://localhost/api/vendor/overview${forgedVendorId ? `?vendorId=${forgedVendorId}` : ''}`;
  return new NextRequest(url, { headers: token ? { cookie: `bg_admin_session=${token}` } : {} });
}

test('vendor overview rejects anonymous, staff, enrollment and forged tenant ID', async () => {
  assert.equal((await GET(request())).status, 401);
  const admin = getActorSecurityContext('usr-super-admin')!;
  const adminSession = createAdminSession(admin);
  assert.equal((await GET(request(adminSession.token))).status, 403);
  const vendor = getActorSecurityContext('usr-vendor-001')!;
  const enrollment = createAdminSession({ ...vendor, purpose: 'enrollment' });
  assert.equal((await GET(request(enrollment.token))).status, 401);
  const session = createAdminSession(vendor);
  const res = await GET(request(session.token, 'another-vendor'));
  assert.equal(res.status, 200);
  const body = await res.json() as { products: Array<{ id: string }>; orders: unknown[] };
  assert.ok(body.products.length > 0);
  const vendorId = vendor.vendorId;
  const { readErpState } = await import('@/src/lib/db/repository');
  const expectedIds = new Set(readErpState().products.filter(p => p.vendorId === vendorId).map(p => p.productId));
  assert.ok(body.products.every((p) => expectedIds.has(p.id)));
  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes('another-vendor'), false);
  for (const secret of ['vendorId', 'customerPhone', 'streetAddress', 'supplierCost', 'platformMargin', 'internalVendorSku', 'snapSupplier', 'estimatedNetProfit']) {
    assert.equal(serialized.includes(secret), false, secret);
  }
});