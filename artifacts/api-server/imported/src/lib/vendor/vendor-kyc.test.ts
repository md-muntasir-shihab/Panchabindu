import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiRequest } from '../http';
import { readPhase4BStore, writePhase4BStore } from '../admin/phase4b-service';
import { getActorSecurityContext, readAdminStore } from '../admin/phase4a-service';
import { createAdminSession } from '../security/crypto-session';
import { GET as vendorGet, POST as vendorPost } from '../../../app/api/vendor/kyc/route';
import { GET as adminGet, POST as adminPost } from '../../../app/api/admin/vendor-kyc/route';

function req(path: string, session?: { token: string; csrfToken: string }, body?: unknown, csrf = true) {
  const headers: Record<string, string> = { origin: 'http://localhost', host: 'localhost', ...(session ? { cookie: `bg_admin_session=${session.token}` } : {}), ...(session && csrf ? { 'x-csrf-token': session.csrfToken } : {}) };
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new ApiRequest(`http://localhost${path}`, { method: body === undefined ? 'GET' : 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
test('KYC metadata, document access and review enforce roles and vendor ownership', async () => {
  const vendorActor = getActorSecurityContext('usr-vendor-001')!;
  const adminActor = getActorSecurityContext('usr-super-admin')!;
  const vendor = createAdminSession(vendorActor); const admin = createAdminSession(adminActor);
  const store = readPhase4BStore();
  const ownId = '75cfe6b8-73ea-4f94-9235-c103bc1d1c01'; const otherId = '75cfe6b8-73ea-4f94-9235-c103bc1d1c02';
  const record = (documentId: string, vendorId: string) => ({ documentId, vendorId, category: 'identity' as const, storagePath: `private/${documentId}.webp`, status: 'pending_review' as const, uploadedBy: 'example', createdAt: new Date().toISOString(), reviewedBy: null, reviewedAt: null, reviewNote: null });
  store.kycDocuments = [record(ownId, vendorActor.vendorId!), record(otherId, 'some-other-vendor')]; writePhase4BStore(store);
  assert.equal((await vendorGet(req('/api/vendor/kyc'))).status, 401);
  assert.equal((await adminGet(req('/api/admin/vendor-kyc', vendor))).status, 403);
  const own = await vendorGet(req('/api/vendor/kyc', vendor));
  assert.equal(own.status, 200);
  const body = await own.json() as { documents: Array<Record<string, unknown>> };
  assert.equal(body.documents.length, 1);
  assert.equal(body.documents[0].documentId, ownId);
  assert.equal('storagePath' in body.documents[0], false);
  assert.equal('vendorId' in body.documents[0], false);
  assert.equal((await vendorGet(req(`/api/vendor/kyc?documentId=${otherId}`, vendor))).status, 404);
  const adminList = await adminGet(req('/api/admin/vendor-kyc', admin));
  const adminBody = await adminList.json() as { documents: Array<Record<string, unknown>> };
  assert.equal(adminBody.documents.length, 2);
  assert.equal('storagePath' in adminBody.documents[0], false);
  assert.equal((await adminPost(req('/api/admin/vendor-kyc', vendor, { documentId: ownId, decision: 'approved', note: '' }))).status, 403);
  assert.equal((await adminPost(req('/api/admin/vendor-kyc', admin, { documentId: ownId, decision: 'approved', note: '' }, false))).status, 403);
  assert.equal((await adminPost(req('/api/admin/vendor-kyc', admin, { documentId: ownId, decision: 'rejected', note: '' }))).status, 400);
  assert.equal((await adminPost(req('/api/admin/vendor-kyc', admin, { documentId: ownId, decision: 'rejected', note: 'Unreadable' }))).status, 200);
  assert.equal((await adminPost(req('/api/admin/vendor-kyc', admin, { documentId: ownId, decision: 'approved', note: '' }))).status, 404);
  assert.equal(readPhase4BStore().kycDocuments?.find(d => d.documentId === ownId)?.status, 'rejected');
  assert.ok(readAdminStore().auditLogs.some(log => log.actionCode === 'VENDOR_KYC_REJECTED' && log.targetId === ownId));
  assert.equal((await vendorPost(req('/api/vendor/kyc', vendor, {}, false))).status, 403);
  // No configured storage in the isolated fixture. No call may claim a successful download.
  assert.equal((await vendorGet(req(`/api/vendor/kyc?documentId=${ownId}`, vendor))).status, 503);
});


test('KYC rejects unsupported uploads and fails closed without private storage', async () => {
  const sharp = (await import('sharp')).default;
  const actor = getActorSecurityContext('usr-vendor-001')!;
  const session = createAdminSession(actor);
  const send = (data: Uint8Array, type: string, name: string) => {
    const form = new FormData(); form.set('category', 'identity');
    form.set('file', new File([Buffer.from(data)], name, { type }));
    return new ApiRequest('http://localhost/api/vendor/kyc', { method: 'POST', headers: { origin: 'http://localhost', host: 'localhost', cookie: `bg_admin_session=${session.token}`, 'x-csrf-token': session.csrfToken }, body: form });
  };
  const invalid = await vendorPost(send(new Uint8Array([1, 2, 3]), 'image/jpeg', 'document.jpg'));
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, 'INVALID_UPLOAD');
  const image = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#999999' } }).png().toBuffer();
  const before = readPhase4BStore().kycDocuments?.length ?? 0;
  const unavailable = await vendorPost(send(image, 'image/png', 'document.png'));
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).code, 'PRIVATE_STORAGE_UNAVAILABLE');
  assert.equal(readPhase4BStore().kycDocuments?.length ?? 0, before);
});

test('KYC image upload, isolated download and approval use private storage and audit events', async () => {
  const sharp = (await import('sharp')).default;
  const priorFetch = globalThis.fetch;
  const priorUrl = process.env.SUPABASE_URL, priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const objects = new Map<string, Uint8Array>();
  process.env.SUPABASE_URL = 'https://fixture.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-service-role-key';
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    assert.equal(url.origin, 'https://fixture.invalid');
    if (url.pathname === '/storage/v1/bucket/private-ops-evidence' && request.method === 'GET') return Response.json({ id: 'private-ops-evidence', name: 'private-ops-evidence', public: false });
    const prefix = '/storage/v1/object/private-ops-evidence/';
    if (url.pathname.startsWith(prefix) && request.method === 'POST') { objects.set(url.pathname.slice(prefix.length), new Uint8Array(await request.arrayBuffer())); return Response.json({ Key: url.pathname.slice(prefix.length) }); }
    if (url.pathname.startsWith(prefix) && request.method === 'GET') { const bytes = objects.get(url.pathname.slice(prefix.length)); return bytes ? new Response(bytes, { headers: { 'content-type': 'image/webp' } }) : new Response('', { status: 404 }); }
    throw new Error(`Unexpected storage fixture request: ${request.method} ${url.pathname}`);
  };
  try {
    const actor = getActorSecurityContext('usr-vendor-001')!, vendor = createAdminSession(actor);
    const admin = createAdminSession(getActorSecurityContext('usr-super-admin')!);
    const image = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#999999' } }).png().toBuffer();
    const form = new FormData(); form.set('category', 'business'); form.set('file', new File([image], 'sample.png', { type: 'image/png' }));
    const upload = await vendorPost(new ApiRequest('http://localhost/api/vendor/kyc', { method: 'POST', headers: { origin: 'http://localhost', host: 'localhost', cookie: `bg_admin_session=${vendor.token}`, 'x-csrf-token': vendor.csrfToken }, body: form }));
    assert.equal(upload.status, 201, await upload.clone().text());
    const { documentId } = await upload.json() as { documentId: string };
    assert.equal(objects.size, 1);
    const objPath = [...objects.keys()][0];
    assert.match(objPath, /^vendor-kyc\/[a-f0-9]{64}\/[a-f0-9-]+\.webp$/);
    assert.ok(!objPath.includes(actor.vendorId!));
    const download = await adminGet(req(`/api/admin/vendor-kyc?documentId=${documentId}`, admin));
    assert.equal(download.status, 200, await download.clone().text());
    assert.match(download.headers.get('cache-control') ?? '', /no-store/);
    assert.match(download.headers.get('content-disposition') ?? '', /attachment/);
    assert.equal((await sharp(Buffer.from(await download.arrayBuffer())).metadata()).format, 'webp');
    const approve = await adminPost(req('/api/admin/vendor-kyc', admin, { documentId, decision: 'approved', note: '' }));
    assert.equal(approve.status, 200);
    const audit = readAdminStore().auditLogs;
    for (const action of ['VENDOR_KYC_SUBMITTED', 'ADMIN_KYC_VIEWED', 'VENDOR_KYC_APPROVED']) assert.ok(audit.some(log => log.actionCode === action && log.targetId === documentId), action);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey;
  }
});

test('a public evidence bucket is rejected before upload', async () => {
  const sharp = (await import('sharp')).default;
  const priorFetch = globalThis.fetch, priorUrl = process.env.SUPABASE_URL, priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://fixture.invalid'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-service-role-key';
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init); calls++;
    assert.equal(new URL(request.url).pathname, '/storage/v1/bucket/private-ops-evidence');
    return Response.json({ id: 'private-ops-evidence', name: 'private-ops-evidence', public: true });
  };
  try {
    const vendor = createAdminSession(getActorSecurityContext('usr-vendor-001')!);
    const image = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#999999' } }).png().toBuffer();
    const form = new FormData(); form.set('category', 'other'); form.set('file', new File([image], 'sample.png', { type: 'image/png' }));
    const response = await vendorPost(new ApiRequest('http://localhost/api/vendor/kyc', { method: 'POST', headers: { origin: 'http://localhost', host: 'localhost', cookie: `bg_admin_session=${vendor.token}`, 'x-csrf-token': vendor.csrfToken }, body: form }));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'PRIVATE_STORAGE_UNAVAILABLE');
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl;
    if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey;
  }
});
