import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium, request } from 'playwright';

const base = process.env.TEST_APP_URL || 'http://127.0.0.1:80';
const loginFile = fs.readFileSync(new URL('../../artifacts/api-server/.data/LOCAL-LOGIN.txt', import.meta.url), 'utf8');
const vendorPassword = loginFile.match(/Vendor\nURL: \/vendor\nUsername: rupganj_vendor\nOne-time initial password: (.+)/)?.[1];
assert.ok(vendorPassword, 'Private local vendor bootstrap credential is missing.');
const localAdminStore = JSON.parse(fs.readFileSync(new URL('../../artifacts/api-server/.data/erp-admin-store.json', import.meta.url), 'utf8'));
assert.ok(localAdminStore.users.length > 0 && localAdminStore.users.every((user) => !user.require2fa));
assert.ok(localAdminStore.roles.length > 0 && localAdminStore.roles.every((role) => !role.require2fa));

test('local sandbox accepts the initial admin and vendor credentials', async () => {
  const client = await request.newContext({ baseURL: base, extraHTTPHeaders: { origin: base } });
  try {
    const response = await client.post('/api/admin/auth', {
      data: { action: 'login', username: 'rupganj_vendor', password: vendorPassword },
    });
    assert.equal(response.status(), 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.user?.roleSlug, 'vendor');
    assert.equal(body.requiresFirstLoginGate, true);
    assert.equal(body.user?.require2fa, false);
    assert.equal(body.totpSetupUri, undefined);
    assert.ok(response.headers()['set-cookie']?.includes('HttpOnly'));
    const customer = await client.get('/api/account/orders');
    assert.equal(customer.status(), 200);
    const customerBody = await customer.json();
    assert.equal(customerBody.authenticated, false);
    assert.equal(customerBody.providerStatus, 'SANDBOX_TEST_ONLY');

    const phone = '01700000000';
    const otpResponse = await client.post('/api/account/orders', {
      data: { action: 'request_otp', customerPhone: phone },
    });
    assert.equal(otpResponse.status(), 200);
    const otpBody = await otpResponse.json();
    assert.equal(otpBody.success, true);
    assert.equal(otpBody.providerStatus, 'SANDBOX_TEST_ONLY');
    assert.match(otpBody.sandboxOtpPreview, /^\d{6}$/);
    const verifyResponse = await client.post('/api/account/orders', {
      data: { action: 'verify_otp', customerPhone: phone, otpCode: otpBody.sandboxOtpPreview },
    });
    assert.equal(verifyResponse.status(), 200);
    assert.equal((await verifyResponse.json()).success, true);
    const verifiedCustomer = await client.get('/api/account/orders');
    assert.equal((await verifiedCustomer.json()).authenticated, true);
  } finally {
    await client.dispose();
  }
});

test('admin and vendor first-login screens accept the private bootstrap passwords', async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
    assert.ok((await page.locator('body').innerText()).includes('Authenticator code (only when 2FA is enabled)'));
    const adminTotpInput = page.getByPlaceholder('6-Digit RFC 6238 TOTP');
    assert.equal(await adminTotpInput.getAttribute('required'), null);

    for (const [path, username, password, gateText] of [
      ['/vendor', 'rupganj_vendor', vendorPassword, 'Change your password at first login'],
    ]) {
      await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
      await page.getByLabel(/Username/).fill(username);
      await page.getByLabel(/^Password/).fill(password);
      await page.getByRole('button', { name: /Log in|Verify 2FA/ }).click();
      await page.getByText(gateText, { exact: false }).waitFor();
      const gateCopy = await page.locator('body').innerText();
      assert.ok(!gateCopy.includes('otpauth://totp/'));
      assert.equal(await page.locator('input[autocomplete="one-time-code"]').count(), 0);
      if (path === '/admin') assert.ok(gateCopy.includes('2FA is currently off'));
      else assert.ok(!gateCopy.includes('authenticator app'));
    }
  } finally {
    await browser.close();
  }
});
