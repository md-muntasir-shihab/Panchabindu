import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { fork } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { chromium, request } from 'playwright';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const username = 'sandbox_fixture_owner';
const password = randomBytes(24).toString('hex');
let fixture, child, base;
const fixturePasswords = new Map();

// Never use TEST_APP_URL or the development launcher: that launcher loads private
// account configuration. All state and the app process belong to this test run.
before(async () => {
  fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'panchabindu-sandbox-'));
  fs.mkdirSync(path.join(fixture, '.data'));
  child = fork(fileURLToPath(new URL('./sandbox-fixture-app.mjs', import.meta.url)), [], {
    cwd: fixture,
    execArgv: ['--import', require.resolve('tsx/esm')],
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'development',
      LOG_LEVEL: 'silent',
      PORT: '1', // Vite config requires a value; the HTTP server binds port 0.
      BASE_PATH: '/',
      TSX_TSCONFIG_PATH: path.join(root, 'artifacts/api-server/tsconfig.json'),
      PANCHABINDU_SANDBOX_FIXTURE: fixture,
      PANCHABINDU_PERSISTENCE: 'json',
      PANCHABINDU_ENABLE_SANDBOX_AUTH: '1',
      PANCHABINDU_SANDBOX_DISABLE_2FA: '1',
      PANCHABINDU_SANDBOX_ADMIN_USERNAME: username,
      PANCHABINDU_SANDBOX_ADMIN_PASSWORD: password,
      PANCHABINDU_SANDBOX_VENDOR_PASSWORD: password,
      CREDENTIALS_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      SESSION_SECRET: randomBytes(32).toString('hex'),
    },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  // Do not forward app output: error payloads may contain fixture credentials.
  child.stderr.resume();
  base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Isolated sandbox startup timed out')), 60_000);
    const exit = () => {
      clearTimeout(timer);
      reject(new Error('Isolated sandbox exited before it was ready'));
    };
    child.once('exit', exit);
    child.once('error', reject);
    child.once('message', (message) => {
      clearTimeout(timer);
      child.off('exit', exit);
      assert.equal(message.type, 'ready');
      resolve(`http://127.0.0.1:${message.port}`);
    });
  });
}, { timeout: 70_000 });

after(async () => {
  // Reap the process before deleting its working directory, even after failures.
  try {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
      try { await exited; } finally { clearTimeout(timer); }
    }
  } finally {
    if (fixture) fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('fixture admin and vendor sign in and complete first login without TOTP', { timeout: 60_000 }, async () => {
  for (const [account, role] of [[username, 'super_admin'], ['rupganj_vendor', 'vendor']]) {
    const client = await request.newContext({ baseURL: base, extraHTTPHeaders: { origin: base } });
    try {
      const settings = await client.get('/api/admin/auth');
      assert.equal(settings.status(), 200);
      assert.deepEqual(await settings.json(), {
        twoFactorLoginEnabled: true,
        defaultAdminUsername: username,
      });
      const response = await client.post('/api/admin/auth', {
        data: { action: 'login', username: account, password },
      });
      assert.equal(response.status(), 200);
      const body = await response.json();
      assert.equal(body.success, true);
      assert.equal(body.user?.roleSlug, role);
      assert.equal(body.user?.require2fa, false);
      assert.equal(body.requiresFirstLoginGate, true);
      assert.equal(body.totpSetupUri, undefined);
      const changedPassword = randomBytes(24).toString('hex');
      fixturePasswords.set(account, changedPassword);
      const completion = await client.post('/api/admin/auth', {
        headers: { 'x-csrf-token': body.csrfToken },
        data: {
          action: 'complete_first_login', userId: body.user.userId,
          currentPassword: password, newPassword: changedPassword, totpCode: '',
        },
      });
      assert.equal(completion.status(), 200);
      const completed = await completion.json();
      assert.equal(completed.success, true);
      assert.equal(completed.user.mustChangePassword, false);
      const logout = await client.post('/api/admin/auth', {
        headers: { 'x-csrf-token': completed.csrfToken },
        data: { action: 'logout' },
      });
      assert.equal(logout.status(), 200);
      const relogin = await client.post('/api/admin/auth', {
        data: { action: 'login', username: account, password: changedPassword },
      });
      assert.equal(relogin.status(), 200);
      const signedIn = await relogin.json();
      assert.equal(signedIn.success, true);
      assert.equal(signedIn.requiresFirstLoginGate, false);
      assert.equal(signedIn.totpSetupUri, undefined);
    } finally {
      await client.dispose();
    }
  }
});

test('only the temporary registry has local 2FA disabled', () => {
  const store = JSON.parse(fs.readFileSync(path.join(fixture, '.data/erp-admin-store.json'), 'utf8'));
  assert.equal(store.users.length, 2);
  assert.ok(store.users.some((user) => user.username === username));
  assert.ok(store.users.every((user) => user.require2fa === false));
  assert.ok(store.roles.length > 0 && store.roles.every((role) => role.require2fa === false));
});

test('isolated admin and vendor screens make authenticator codes optional', { timeout: 90_000 }, async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium',
    headless: true,
    args: ['--no-sandbox'],
    env: { PATH: process.env.PATH, HOME: fixture, TMPDIR: fixture },
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (error) => console.error('Fixture browser error:', error.message));
    page.on('response', (response) => {
      if (response.status() >= 500) console.error('Fixture HTTP error:', response.status(), new URL(response.url()).pathname);
    });
    await page.route('**/*', (route) =>
      new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const document = await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
    assert.equal(document.status(), 200);
    await page.getByLabel(/Username/).waitFor();
    await page.waitForFunction((expected) =>
      document.querySelector('form input')?.value === expected &&
      document.querySelectorAll('form input').length === 3 &&
      !document.querySelectorAll('form input')[2].required, username);

    await page.goto(`${base}/vendor`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/Username/).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('form input').length === 3 && !document.querySelectorAll('form input')[2].required);
  } finally {
    await browser.close();
  }
});


test('vendor support and statement work in an isolated browser on mobile and desktop', { timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'], env: { PATH: process.env.PATH, HOME: fixture, TMPDIR: fixture } });
  try {
    for (const width of [375, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await page.goto(`${base}/vendor`, { waitUntil: 'domcontentloaded' });
      await page.getByLabel(/Username|ইউজারনেম/).fill('rupganj_vendor');
      await page.getByLabel(/Password|পাসওয়ার্ড/).fill(fixturePasswords.get('rupganj_vendor'));
      await page.locator('form button[type=submit]').click();
      await page.getByRole('navigation', { name: /Vendor panel navigation|ভেন্ডর প্যানেল মেনু/ }).waitFor();
      // Exercise both locales without depending on a persisted locale setting.
      const english = page.getByRole('button', { name: 'English', exact: true });
      if (await english.count()) await english.click();
      await page.getByRole('button', { name: 'Support', exact: true }).click();
      const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Vendor support' }) });
      await panel.getByLabel('Subject').fill(`Fixture ${width}`);
      await panel.getByLabel('Message', { exact: true }).fill('Need help with this test');
      await panel.getByRole('button', { name: 'Create ticket' }).click();
      await panel.getByRole('heading', { name: `Fixture ${width}` }).waitFor();
      await page.getByRole('button', { name: 'Earnings & Escrow', exact: true }).click();
      await page.getByLabel('From', { exact: true }).fill('2026-01-01');
      await page.getByLabel('To', { exact: true }).fill('2026-12-31');
      await page.getByRole('button', { name: 'View statement' }).click();
      await page.getByRole('heading', { name: /Ledger bucket statement/ }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `viewport ${width} has page-level overflow`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
});

test('guest checkout address selection and order submission use isolated fixture data', { timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'], env: { PATH: process.env.PATH, HOME: fixture, TMPDIR: fixture } });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await page.goto(`${base}/product/sundarbans-raw-khalisha-flower-honey`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Add to Cart|কার্টে যোগ করুন/i }).first().click();
    await page.goto(`${base}/checkout`, { waitUntil: 'domcontentloaded' });
    await page.locator('#checkout-district').waitFor();
    assert.equal(await page.locator('#checkout-thana-search').isDisabled(), true);
    assert.equal(await page.locator('#checkout-upazila').isDisabled(), true);
    await page.locator('#checkout-district').selectOption('1');
    assert.equal(await page.locator('#checkout-thana-search').isEnabled(), true);
    await page.locator('#checkout-upazila').selectOption({ index: 1 });
    await page.locator('#checkout-district').selectOption('');
    assert.equal(await page.locator('#checkout-upazila').isDisabled(), true);
    await page.locator('#checkout-district').selectOption('1');
    await page.locator('#checkout-upazila').selectOption({ index: 1 });
    await page.getByLabel(/Full Name|আপনার পূর্ণ নাম/).fill('Fixture Buyer');
    await page.getByLabel(/Mobile Number|মোবাইল নম্বর/).fill('01712345678');
    await page.getByLabel(/Street Address|বাড়ি, রোড/).fill('House 12 Road 7 Fixture Area');
    const orderResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/orders' && response.request().method() === 'POST');
    await page.locator('form button[type="submit"]').first().click();
    const response = await orderResponse;
    assert.equal(response.status(), 200, await response.text());
    assert.equal((await response.json()).success, true);
    await page.waitForURL(/order-tracking/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

test('admin browser login, reload and logout render without errors', { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'], env: { PATH: process.env.PATH, HOME: fixture, TMPDIR: fixture } });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/Username/).fill(username);
    await page.getByLabel(/Password/).fill(fixturePasswords.get(username));
    await page.locator('form button[type=submit]').click();
    await page.getByRole('button', { name: /Logout|লগআউট/ }).waitFor({ timeout: 10000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Logout|লগআউট/ }).waitFor({ timeout: 10000 });
    const nav = page.getByRole('navigation', { name: /Admin ERP Sidebar|অ্যাডমিন/ });
    await nav.locator('button[title="Orders Grid"], button[title="অর্ডার গ্রিড"]').click();
    const row = page.locator('tr').filter({ hasText: 'Fixture Buyer' });
    await row.waitFor();
    await row.locator('button[title*="tracking link"], button[title*="মেসেজ"]').first().click();
    const messagePanel = page.locator('[role="dialog"]').filter({ has: page.locator('textarea') });
    await messagePanel.getByRole('button', { name: /কুরিয়ার ট্র্যাকিং লিংক|tracking/i }).click();
    const message = await messagePanel.locator('textarea').inputValue();
    assert.doesNotMatch(message, /bongoconsign\.bd|01712345678|রাইডার/);
    const statusUrl = message.match(/https?:\/\/[^\s]+\/order-tracking\/trk_[a-zA-Z0-9]+/)?.[0];
    assert.ok(statusUrl, 'message must use the actual origin and secure token');
    const statusPage = await page.context().request.get(`${base}/api/page-data?${new URLSearchParams({ path: new URL(statusUrl).pathname })}`);
    assert.equal(statusPage.status(), 200);
    const statusData = await statusPage.json();
    assert.equal(statusData.data.props.order?.customerName?.includes('Fixture'), true);
    await page.keyboard.press('Escape');
    await nav.locator('button[title="Product Studio"], button[title="প্রোডাক্ট স্টুডিও"]').click();
    assert.equal(await page.getByRole('heading', { name: /Emergency operations control|জরুরি কার্যক্রম নিয়ন্ত্রণ/ }).count(), 0);
    assert.equal(await page.getByText(/Account security|অ্যাকাউন্ট নিরাপত্তা/, { exact: true }).isVisible(), false);
    assert.equal(await page.getByText(/Active Role:|সক্রিয় রোল:/).count(), 0);
    await page.getByRole('button', { name: /Product Linkage Review|পণ্য সংযোগ পর্যালোচনা/ }).click();
    await page.getByRole('heading', { name: /Product linkage review|পণ্য সংযোগ পর্যালোচনা/ }).waitFor();
    assert.match(await page.locator('main').innerText(), /not an end-to-end test|পূর্ণাঙ্গ পরীক্ষা নয়/);
    await page.getByRole('button', { name: /All Products Catalog|সব পণ্য/ }).click();
    await page.locator('button[title="View product linkage details"], button[title="পণ্যের সংযোগের তথ্য দেখুন"]').first().click();
    const details = page.getByRole('dialog', { name: /Product linkage details|পণ্য সংযোগের তথ্য/ });
    await details.waitFor();
    assert.match(await details.innerText(), /do not verify downstream services|কার্যকারিতা নিশ্চিত করে না/);
    assert.doesNotMatch(await details.innerText(), /৳৭০|৳১৩০|বর্তমান সক্রিয় অর্ডারে লাইভ ইউনিট/);
    await details.getByRole('button', { name: /Close|বন্ধ করুন/ }).click();
    await nav.locator('button[title="Users & Roles"], button[title="ইউজার ও রোল"]').click();
    await page.getByText(/Account security|অ্যাকাউন্ট নিরাপত্তা/, { exact: true }).waitFor();
    await nav.locator('button[title="Control Center"], button[title="কন্ট্রোল সেন্টার"]').click();
    await page.getByRole('heading', { name: /Emergency operations control|জরুরি কার্যক্রম নিয়ন্ত্রণ/ }).waitFor();
    await page.getByRole('button', { name: /Logout|লগআউট/ }).click();
    await page.getByLabel(/Username/).waitFor();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
