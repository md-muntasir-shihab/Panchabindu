import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setupProductionAdmin } from './setup-production-admin.mjs';

const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key', CREDENTIALS_ENCRYPTION_KEY: 'a-unique-private-key-for-testing-only-123' };

test('production bootstrap creates a private one-time credential and never overwrites an admin', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-bootstrap-test-'));
  const loginFile = path.join(dir, 'login.txt');
  const store = { users: [], roles: [{ roleSlug: 'super_admin' }], auditLogs: [], orderMeta: {}, blacklistedPhones: {} };
  let commit;
  const fetchImpl = async (url, options) => {
    assert.equal(options.headers.Authorization, `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
    if (url.endsWith('/erp_read_runtime_state')) return new Response(JSON.stringify({ revision: '1', documents: { 'erp-admin-store.json': store } }), { status: 200 });
    assert.ok(fs.existsSync(loginFile));
    commit = JSON.parse(options.body);
    return new Response(JSON.stringify('2'), { status: 200 });
  };
  try {
    await setupProductionAdmin({ env, fetchImpl, loginFile });
    const file = fs.readFileSync(loginFile, 'utf8');
    const password = file.match(/Temporary password: (\S+)/)?.[1];
    assert.ok(password);
    assert.equal(fs.statSync(loginFile).mode & 0o777, 0o600);
    const admin = commit.changes['erp-admin-store.json'].users[0];
    assert.equal(admin.username, 'admin');
    assert.equal(admin.mustChangePassword, true);
    assert.equal(admin.require2fa, true);
    assert.equal(admin.totpEnrolled, false);
    const [, n, r, p, salt, hash] = admin.passwordHash.split('$');
    assert.equal(crypto.scryptSync(password, Buffer.from(salt, 'hex'), 64, { N: Number(n), r: Number(r), p: Number(p) }).toString('hex'), hash);
    const [, , iv, tag, ciphertext] = admin.totpSecretEncrypted.split(':');
    const key = crypto.createHmac('sha256', env.CREDENTIALS_ENCRYPTION_KEY).update('panchagarh-kdf-v1:aes-256-gcm-at-rest').digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    assert.ok(Buffer.concat([decipher.update(Buffer.from(ciphertext, 'hex')), decipher.final()]).length > 0);
    assert.equal(commit.expected_revision, '1');
    await assert.rejects(setupProductionAdmin({ env, fetchImpl, loginFile }), /EEXIST/);
    store.users.push(admin);
    await assert.rejects(setupProductionAdmin({ env, fetchImpl, loginFile: path.join(dir, 'other') }), /already exists/);
    assert.equal(fs.existsSync(path.join(dir, 'other')), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
