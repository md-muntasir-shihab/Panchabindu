import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, request } from 'playwright';

const base = process.env.TEST_APP_URL || 'http://127.0.0.1:80';
const loginFile = fs.readFileSync(new URL('../../artifacts/api-server/.data/LOCAL-LOGIN.txt', import.meta.url), 'utf8');
const adminPassword = loginFile.match(/Admin\nURL: \/admin\nUsername: panchagarh_owner\nPassword: (.+)/)?.[1];
assert.ok(adminPassword, 'Private local admin credential is missing.');
const localAdminStore = JSON.parse(fs.readFileSync(new URL('../../artifacts/api-server/.data/erp-admin-store.json', import.meta.url), 'utf8'));
assert.ok(localAdminStore.users.length > 0 && localAdminStore.users.every((user) => !user.require2fa));
assert.ok(localAdminStore.roles.length > 0 && localAdminStore.roles.every((role) => !role.require2fa));

test('local sandbox has 2FA turned off for all stored roles and users', () => {
  assert.ok(localAdminStore.users.every((user) => user.require2fa === false));
  assert.ok(localAdminStore.roles.every((role) => role.require2fa === false));
});

test('rotated admin credentials sign in without a TOTP code', async () => {
  const client = await request.newContext({ baseURL: base, extraHTTPHeaders: { origin: base } });
  try {
    const settings = await client.get('/api/admin/auth');
    assert.equal(settings.status(), 200);
    assert.deepEqual(await settings.json(), {
      twoFactorLoginEnabled: false,
      defaultAdminUsername: 'panchagarh_owner',
    });
    const response = await client.post('/api/admin/auth', {
      data: { action: 'login', username: 'panchagarh_owner', password: adminPassword },
    });
    assert.equal(response.status(), 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.user?.roleSlug, 'super_admin');
    assert.equal(body.user?.require2fa, false);
    assert.equal(body.requiresFirstLoginGate, false);
    assert.equal(body.totpSetupUri, undefined);
    const logout = await client.post('/api/admin/auth', {
      headers: { 'x-csrf-token': body.csrfToken },
      data: { action: 'logout' },
    });
    assert.equal(logout.status(), 200);
  } finally {
    await client.dispose();
  }
});

test('admin and vendor login screens make authenticator codes optional', async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/Username/).waitFor();
    await page.waitForFunction(() =>
      document.querySelector('form input')?.value === 'panchagarh_owner' &&
      document.querySelectorAll('form input').length === 2
    );

    await page.goto(`${base}/vendor`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/Username/).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('form input').length === 2);
  } finally {
    await browser.close();
  }
});
