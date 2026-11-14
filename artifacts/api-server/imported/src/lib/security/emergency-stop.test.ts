import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiRequest } from '../http';
import { createAdminSession } from './crypto-session';
import { getActorSecurityContext, readAdminStore } from '../admin/phase4a-service';
import { POST as emergency } from '../../../app/api/admin/emergency/route';
import { POST as checkout } from '../../../app/api/orders/route';
import { POST as vendorProduct } from '../../../app/api/vendor/products/route';
import { POST as workspace, GET as workspaceGet } from '../../../app/api/admin/workspace/route';
import { POST as account } from '../../../app/api/account/orders/route';
import { POST as auth } from '../../../app/api/admin/auth/route';
import { GET as cron } from '../../../app/api/cron/courier-status/route';

function request(path: string, body: unknown, token?: string, csrf?: string) {
  return new ApiRequest(`http://localhost${path}`, { method: 'POST', headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json', ...(token ? { cookie: `bg_admin_session=${token}` } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}) }, body: JSON.stringify(body) });
}

test('emergency stop is super-admin only, blocks business writes, preserves security and allows audited recovery', async () => {
  const adminActor = getActorSecurityContext('usr-super-admin')!;
  const vendorActor = getActorSecurityContext('usr-vendor-001')!;
  const admin = createAdminSession(adminActor);
  const vendor = createAdminSession(vendorActor);
  const switchRequest = (active: boolean, token?: string, csrf?: string) => request('/api/admin/emergency', { active, reason: 'Test safety event' }, token, csrf);
  assert.equal((await emergency(switchRequest(true))).status, 401);
  assert.equal((await emergency(switchRequest(true, admin.token))).status, 403);
  assert.equal((await emergency(switchRequest(true, vendor.token, vendor.csrfToken))).status, 403);
  assert.equal((await emergency(switchRequest(true, admin.token, admin.csrfToken))).status, 200);
  const ws = await workspaceGet(new ApiRequest('http://localhost/api/admin/workspace', { headers: { cookie: `bg_admin_session=${admin.token}` } }));
  assert.equal(ws.status, 200);
  assert.equal((await ws.json()).emergencyStopActive, true);
  for (const res of [
    await checkout(request('/api/orders', {})),
    await cron(new ApiRequest('http://localhost/api/cron/courier-status')),
    await vendorProduct(request('/api/vendor/products', {}, vendor.token, vendor.csrfToken)),
    await workspace(request('/api/admin/workspace', { operation: 'lookup_phone', phone: '01712345678' }, admin.token, admin.csrfToken)),
    await account(request('/api/account/orders', { action: 'register', email: 'blocked@example.test', password: 'safe password example' })),
  ]) {
    assert.equal(res.status, 503);
    assert.equal((await res.json()).code, 'EMERGENCY_STOP');
  }
  // Authentication is still evaluated normally, not bypassed or blocked by maintenance.
  assert.equal((await auth(request('/api/admin/auth', { action: 'login', username: 'nonexistent', password: 'badpass' }))).status, 401);
  assert.notEqual((await account(request('/api/account/orders', { action: 'login', identifier: 'missing@example.test', password: 'badpass' }))).status, 503);
  assert.equal((await emergency(switchRequest(false, vendor.token, vendor.csrfToken))).status, 403);
  assert.equal((await emergency(switchRequest(false, admin.token, admin.csrfToken))).status, 200);
  assert.notEqual((await checkout(request('/api/orders', {}))).status, 503);
  const actions = readAdminStore().auditLogs.map(log => log.actionCode);
  assert.ok(actions.includes('EMERGENCY_STOP_ACTIVATED'));
  assert.ok(actions.includes('EMERGENCY_STOP_RECOVERED'));
});
