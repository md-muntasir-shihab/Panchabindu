import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiRequest as NextRequest } from '@/src/lib/http';
import { POST as upload } from '../../../app/api/media/route';
import { POST as importCatalog } from '../../../app/api/catalog/import/route';
import { POST as print } from '../../../app/api/print/[orderNo]/route';
import { createAdminSession } from './crypto-session';
import { readAdminStore } from '../admin/phase4a-service';
import { readErpState } from '../db/repository';

test('media, catalog imports and financial print data reject unauthenticated callers', async () => {
  const request = (url: string) => new NextRequest(`http://localhost${url}`, { method: 'POST', headers: { origin: 'http://localhost' }, body: '{}' });
  assert.equal((await upload(request('/api/media'))).status, 401);
  assert.equal((await importCatalog(request('/api/catalog/import'))).status, 401);
  assert.equal((await print(request('/api/print/unknown'), { params: Promise.resolve({ orderNo: 'unknown' }) })).status, 401);
});

test('vendors cannot import catalogs, print finance copies or upload to another vendor product', async () => {
  const vendor = readAdminStore().users.find(user => user.roleSlug === 'vendor')!;
  const session = createAdminSession({ userId: vendor.userId, username: vendor.username, roleSlug: 'vendor' });
  const headers = { origin: 'http://localhost', cookie: `bg_admin_session=${session.token}`, 'x-csrf-token': session.csrfToken };
  const state = readErpState();
  const ownLine = state.orderLines.find(line => line.vendorId === vendor.vendorId)!;
  const order = state.orders.find(order => order.id === ownLine.orderId)!;
  assert.equal((await importCatalog(new NextRequest('http://localhost/api/catalog/import', { method: 'POST', headers, body: '{}' }))).status, 403);
  assert.equal((await print(new NextRequest(`http://localhost/api/print/${order.orderNo}`, { method: 'POST', headers, body: JSON.stringify({ copy: 'finance' }) }), { params: Promise.resolve({ orderNo: order.orderNo }) })).status, 403);
  const priorUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic-project.invalid';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-test-key';
    const form = new FormData();
    form.set('productId', state.products.find(product => product.vendorId !== vendor.vendorId)!.productId);
    form.set('file', new File([new Uint8Array([255, 216, 255])], 'synthetic.jpg', { type: 'image/jpeg' }));
    const response = await upload(new NextRequest('http://localhost/api/media', { method: 'POST', headers, body: form }));
    assert.equal(response.status, 404);
  } finally {
    if (priorUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey;
  }
});
