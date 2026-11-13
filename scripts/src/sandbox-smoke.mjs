import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.TEST_APP_URL || 'http://127.0.0.1:80';
const localAdminStore = JSON.parse(fs.readFileSync(new URL('../../artifacts/api-server/.data/erp-admin-store.json', import.meta.url), 'utf8'));
assert.ok(localAdminStore.users.length > 0 && localAdminStore.users.every((user) => !user.require2fa));
assert.ok(localAdminStore.roles.length > 0 && localAdminStore.roles.every((role) => !role.require2fa));

test('local sandbox has 2FA turned off for all stored roles and users', () => {
  assert.ok(localAdminStore.users.every((user) => user.require2fa === false));
  assert.ok(localAdminStore.roles.every((role) => role.require2fa === false));
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
    const adminCopy = await page.locator('body').innerText();
    assert.ok(adminCopy.includes('only when 2FA is enabled') || adminCopy.includes('শুধু 2FA চালু থাকলে'));
    assert.equal(await page.locator('form input').nth(2).getAttribute('required'), null);

    await page.goto(`${base}/vendor`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/Username/).waitFor();
    const vendorCopy = await page.locator('body').innerText();
    assert.ok(vendorCopy.includes('only if 2FA is enabled') || vendorCopy.includes('2FA চালু থাকলে'));
    assert.equal(await page.locator('form input').nth(2).getAttribute('required'), null);
  } finally {
    await browser.close();
  }
});
