import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { getActorSecurityContext, readAdminStore } from '../admin/phase4a-service';

test('runner uses disposable JSON identities without inherited account configuration', () => {
  const fixture = process.env.PANCHAGARH_UNIT_FIXTURE;
  assert.ok(fixture);
  assert.equal(process.cwd(), fixture);
  assert.equal(fs.realpathSync(path.join(fixture, '.data')), path.join(fixture, '.data'));
  assert.equal(process.env.NODE_ENV, 'test');
  assert.equal(process.env.PANCHAGARH_PERSISTENCE, 'json');
  for (const name of [
    'SESSION_SECRET', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    'SMS_API_KEY', 'NODE_OPTIONS', 'PANCHAGARH_ENABLE_SANDBOX_AUTH',
    'PANCHAGARH_SANDBOX_DISABLE_2FA', 'PANCHAGARH_SANDBOX_ADMIN_USERNAME',
    'PANCHAGARH_SANDBOX_ADMIN_PASSWORD', 'PANCHAGARH_SANDBOX_VENDOR_PASSWORD',
  ]) assert.equal(process.env[name], undefined, `${name} must not enter fixture processes`);
  assert.ok(readAdminStore().users.length);
  assert.equal(getActorSecurityContext('usr-super-admin')?.require2fa, true);
  assert.ok(fs.existsSync(path.join(fixture, '.data/erp-admin-store.json')));
});

test('accidental external requests fail before contacting a provider', async () => {
  const error = /External network is forbidden/;
  await assert.rejects(fetch('https://synthetic-project.invalid'), error);
  assert.throws(() => http.get('http://synthetic-project.invalid'), error);
  assert.throws(() => https.request('https://synthetic-project.invalid'), error);
  assert.throws(() => net.connect(443, 'synthetic-project.invalid'), error);
  assert.throws(() => new net.Socket().connect(443, 'synthetic-project.invalid'), error);
  assert.throws(() => tls.connect(443, 'synthetic-project.invalid'), error);
});
