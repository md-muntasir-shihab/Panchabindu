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

test('dashboard shows role-scoped status counts and opens matching order filters on mobile and desktop', { timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'], env: { PATH: process.env.PATH, HOME: fixture, TMPDIR: fixture } });
  try {
    for (const width of [375, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
      await page.getByLabel(/Username/).fill(username);
      await page.getByLabel(/Password/).fill(fixturePasswords.get(username));
      await page.locator('form button[type=submit]').click();
      await page.getByRole('button', { name: /Logout|লগআউট/ }).waitFor();
      if (await page.getByTitle('বাংলায় পরিবর্তন করুন').count()) await page.getByTitle('বাংলায় পরিবর্তন করুন').click();
      const summary = page.locator('[aria-label="অর্ডার স্ট্যাটাসের সারসংক্ষেপ"], [aria-label="Order status overview"]');
      await summary.waitFor();
      const snapshot = await (await context.request.get(`${base}/api/admin/workspace`)).json();
      const count = snapshot.orders.filter(order => order.status === 'pending_confirmation').length;
      const card = summary.getByRole('button', { name: /নিশ্চিতকরণ বাকি|Pending confirmation/ });
      assert.match(await card.innerText(), new RegExp(String(count).replace(/[0-9]/g, d => `[${d}${'০১২৩৪৫৬৭৮৯'[Number(d)]}]`)));
      assert.match(await page.locator('main').innerText(), /not connected|সংযুক্ত নয়/);
      assert.match(await page.locator('main').innerText(), /অপঠিত গ্রাহক বার্তা|Unread customer inquiries/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `dashboard width ${width}`);
      await page.getByTitle('Switch to English').click();
      await page.getByRole('heading', { name: 'Order overview' }).waitFor();
      await page.getByTitle('বাংলায় পরিবর্তন করুন').click();
      await card.click();
      assert.equal(await page.getByLabel('Filter by order status').inputValue(), 'pending_confirmation');
      if (width === 1280) {
        await page.locator('input[type=search]').fill('no-matching-order');
        await page.getByRole('navigation', { name: /Admin ERP Sidebar|অ্যাডমিন/ }).locator('button[title="Today"], button[title="আজকের কাজ"]').click();
        await page.locator('[aria-label="অর্ডার স্ট্যাটাসের সারসংক্ষেপ"]').getByRole('button', { name: /রিটার্ন প্রক্রিয়াধীন/ }).click();
        assert.equal(await page.getByLabel('Filter by order status').inputValue(), 'return_initiated');
        assert.equal(await page.locator('input[type=search]').inputValue(), '');
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
});

test('courier receivables distinguish recorded COD from unverified historical payments', { timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'], env: { PATH: process.env.PATH, HOME: fixture, TMPDIR: fixture } });
  try {
    for (const width of [375, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
      await page.getByLabel(/Username/).fill(username);
      await page.getByLabel(/Password/).fill(fixturePasswords.get(username));
      await page.locator('form button[type=submit]').click();
      await page.getByRole('button', { name: /Logout|লগআউট/ }).waitFor();
      if (await page.getByTitle('বাংলায় পরিবর্তন করুন').count()) await page.getByTitle('বাংলায় পরিবর্তন করুন').click();
      if (width < 1024) await page.locator('button[aria-expanded="false"]').filter({ has: page.locator('svg.lucide-menu') }).click();
      const nav = page.getByRole('navigation', { name: /Admin ERP Sidebar|অ্যাডমিন/ });
      await nav.locator('button[title="Courier & Rates"], button[title="কুরিয়ার ও রেট"]').click();
      await page.getByRole('heading', { name: 'কুরিয়ার হিসাব ও অর্ডার' }).waitFor();
      const main = page.locator('main');
      assert.match(await main.innerText(), /নিশ্চিত কুরিয়ার পাওনা এখন নির্ণয় করা যাচ্ছে না/);
      assert.match(await main.innerText(), /পুরোনো রেমিট্যান্স রেকর্ড — যাচাইবিহীন/);
      assert.doesNotMatch(await main.innerText(), /TRX-STF-998811|পেআউট শিডিউল|প্রাপ্য নিট/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `courier width ${width}`);
      await page.getByLabel('কুরিয়ার নির্বাচন').selectOption('steadfast');
      await page.getByLabel('অর্ডারের অবস্থা').selectOption('delivered');
      await page.getByLabel('অর্ডার বা ট্র্যাকিং খুঁজুন').fill('no-match-order');
      await page.getByText('কোনো অর্ডার পাওয়া যায়নি।').waitFor();
      await page.getByLabel('অর্ডার বা ট্র্যাকিং খুঁজুন').fill('');
      await page.getByRole('button', { name: 'জেলাভিত্তিক রেট' }).click();
      await page.getByLabel(/Select district to edit rate|জেলা/).first().waitFor();
      await page.getByRole('button', { name: 'কুরিয়ারের হিসাব' }).click();
      await page.getByRole('heading', { name: 'অর্ডারভিত্তিক বিস্তারিত' }).waitFor();
      await page.getByTitle('Switch to English').click();
      await page.getByRole('heading', { name: 'Order details' }).waitFor();
      assert.match(await main.innerText(), /Actual balance: unknown/);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
});

test('customer account registration, signed-in checkout and order details work on mobile and desktop', { timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'], env: { PATH: process.env.PATH, HOME: fixture, TMPDIR: fixture } });
  try {
    for (const width of [375, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await page.goto(`${base}/account`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /Create an account|নতুন অ্যাকাউন্ট তৈরি করুন/ }).click();
      const identifier = `customer${width}@example.test`;
      await page.getByLabel(/Phone number or email|ফোন নম্বর অথবা ইমেইল/).fill(identifier);
      await page.getByLabel(/Password|পাসওয়ার্ড/, { exact: true }).fill('fixture secure password');
      await page.getByRole('button', { name: /Create account|অ্যাকাউন্ট তৈরি করুন/, exact: true }).click();
      await page.getByRole('button', { name: /Log out|লগআউট/ }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `account width ${width}`);
      await page.goto(`${base}/product/sundarbans-raw-khalisha-flower-honey`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /Add to Cart|কার্টে যোগ করুন/i }).first().click();
      await page.goto(`${base}/checkout`, { waitUntil: 'domcontentloaded' });
      await page.locator('#checkout-district').selectOption('1');
      await page.locator('#checkout-upazila').selectOption({ index: 1 });
      await page.getByLabel(/Full Name|আপনার পূর্ণ নাম/).fill('Account Fixture');
      await page.getByLabel(/Mobile Number|মোবাইল নম্বর/).fill('01712345678');
      await page.getByLabel(/Street Address|বাড়ি, রোড/).fill('House 12 Road 7 Fixture Area');
      const responsePromise = page.waitForResponse(r => new URL(r.url()).pathname === '/api/orders' && r.request().method() === 'POST');
      await page.locator('form button[type="submit"]').first().click();
      const response = await responsePromise;
      assert.equal(response.status(), 200, await response.text());
      const order = (await response.json()).order;
      await page.waitForURL(/order-tracking/);
      const secureTrackingUrl = page.url();
      assert.match(secureTrackingUrl, /trk_/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `order details width ${width}`);
      await page.goto(`${base}/account?tab=orders`, { waitUntil: 'domcontentloaded' });
      await page.getByText(order.orderNo, { exact: true }).first().waitFor();
      const card = page.locator('div').filter({ has: page.getByRole('link', { name: order.orderNo, exact: true }) }).filter({ has: page.getByRole('link', { name: /View details|বিস্তারিত দেখুন/ }) }).last();
      await card.getByRole('link', { name: /View details|বিস্তারিত দেখুন/ }).click();
      await page.getByText(order.orderNo, { exact: true }).first().waitFor();
      // Order IDs resolve for the signed-in owner, including case-insensitive input.
      await page.goto(`${base}/order-tracking`, { waitUntil: 'domcontentloaded' });
      await page.getByLabel(/Order ID or tracking token|অর্ডার আইডি বা ট্র্যাকিং টোকেন/).fill(order.orderNo.toLowerCase());
      await page.getByRole('button', { name: /Track|ট্র্যাক করুন/, exact: true }).click();
      await page.getByText(order.orderNo, { exact: true }).first().waitFor();
      const ownerResponse = await page.request.get(`${base}/api/page-data?pagePath=${encodeURIComponent('/order-tracking/' + order.orderNo)}`);
      assert.match(ownerResponse.headers()['cache-control'], /no-store/);
      assert.equal((await ownerResponse.json()).data.props.order.orderNo, order.orderNo);
      const otherContext = await browser.newContext();
      const otherPage = await otherContext.newPage();
      await otherPage.goto(`${base}/account`, { waitUntil: 'domcontentloaded' });
      await otherPage.getByRole('button', { name: /Create an account|নতুন অ্যাকাউন্ট তৈরি করুন/ }).click();
      await otherPage.getByLabel(/Phone number or email|ফোন নম্বর অথবা ইমেইল/).fill(`other${width}@example.test`);
      await otherPage.getByLabel(/Password|পাসওয়ার্ড/, { exact: true }).fill('fixture secure password');
      await otherPage.getByRole('button', { name: /Create account|অ্যাকাউন্ট তৈরি করুন/, exact: true }).click();
      await otherPage.getByRole('button', { name: /Log out|লগআউট/ }).waitFor();
      const otherResponse = await otherPage.request.get(`${base}/api/page-data?pagePath=${encodeURIComponent('/order-tracking/' + order.orderNo)}`);
      assert.equal((await otherResponse.json()).data.props.order, null, 'another customer cannot track by order ID');
      await otherContext.close();
      await page.goto(`${base}/account`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: /Log out|লগআউট/ }).click();
      await page.getByRole('button', { name: /Sign in|লগইন/, exact: true }).waitFor();
      assert.equal(await page.getByText(order.orderNo, { exact: true }).count(), 0);
      const guestResponse = await page.request.get(`${base}/api/page-data?pagePath=${encodeURIComponent('/order-tracking/' + order.orderNo)}`);
      assert.equal((await guestResponse.json()).data.props.order, null, 'anonymous order ID cannot expose order');
      await page.goto(secureTrackingUrl, { waitUntil: 'domcontentloaded' });
      await page.getByText(order.orderNo, { exact: true }).first().waitFor();
      await page.goto(`${base}/order-tracking/${encodeURIComponent(order.orderNo)}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('link', { name: /Sign in|লগইন করুন/ }).click();
      await page.getByLabel(/Phone number or email|ফোন নম্বর অথবা ইমেইল/).fill(identifier);
      await page.getByLabel(/Password|পাসওয়ার্ড/, { exact: true }).fill('fixture secure password');
      await page.getByRole('button', { name: /Sign in|লগইন/, exact: true }).click();
      await page.waitForURL(/order-tracking/);
      await page.getByText(order.orderNo, { exact: true }).first().waitFor();
      await page.goto(`${base}/account`, { waitUntil: 'domcontentloaded' });
      await page.getByText(order.orderNo, { exact: true }).first().waitFor();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByText(order.orderNo, { exact: true }).first().waitFor();
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
});

test('storefront safe-area layout keeps controls visible across mobile, landscape, tablet and desktop', { timeout: 120_000 }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'], env: { PATH: process.env.PATH, HOME: fixture, TMPDIR: fixture } });
  try {
    for (const [width, height, inset] of [[320, 700, 18], [375, 812, 24], [844, 390, 24], [768, 1024, 18], [1024, 768, 0], [1440, 900, 0]]) {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
      await page.goto(`${base}/product/sundarbans-raw-khalisha-flower-honey`, { waitUntil: 'domcontentloaded' });
      await page.locator('.storefront-shell').waitFor();
      await page.evaluate(value => { for (const edge of ['top', 'right', 'bottom', 'left']) document.documentElement.style.setProperty(`--safe-${edge}`, `${value}px`); }, inset);
      await page.waitForFunction(() => document.querySelector('meta[name=viewport]').content.includes('viewport-fit=cover'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `horizontal overflow ${width}`);
      const header = await page.locator('.storefront-header > div').boundingBox();
      assert.ok(header.x >= inset && header.x + header.width <= width - inset + 1 && header.y >= inset - 1, `header safe ${width}`);
      if (width < 768) {
        const nav = page.locator('.storefront-bottom-nav');
        await nav.waitFor();
        const navBox = await nav.boundingBox();
        const navButton = await nav.locator('a,button').first().boundingBox();
        assert.ok(navButton.x >= inset - 1 && navButton.x + navButton.width <= width - inset + 1 && navButton.y + navButton.height <= height - inset + 1, `bottom nav safe ${width}`);
        const action = page.locator('.storefront-action-bar');
        const actionBox = await action.boundingBox();
        assert.ok(actionBox.y + actionBox.height <= navBox.y + 1, `purchase bar not covered ${width}`);
        for (const button of await action.locator('button').all()) {
          const box = await button.boundingBox();
          assert.ok(box.x >= inset && box.x + box.width <= width - inset + 1, `purchase controls safe ${width}`);
        }
        await action.locator('button').first().click();
      } else await page.getByRole('button', { name: /Add to Cart|কার্টে যোগ করুন/i }).first().click();
      await page.goto(`${base}/checkout`, { waitUntil: 'domcontentloaded' });
      await page.locator('#checkout-district').waitFor();
      await page.evaluate(value => { for (const edge of ['top', 'right', 'bottom', 'left']) document.documentElement.style.setProperty(`--safe-${edge}`, `${value}px`); }, inset);
      if (width < 1024) {
        const bar = page.locator('.storefront-action-bar');
        const box = await bar.boundingBox();
        const button = await bar.locator('button').boundingBox();
        assert.ok(button.x >= inset && button.x + button.width <= width - inset + 1 && button.y + button.height <= height - inset + 1, `checkout safe ${width}`);
        if (width < 768) assert.ok(box.y + box.height <= (await page.locator('.storefront-bottom-nav').boundingBox()).y + 1, `checkout/nav do not overlap ${width}`);
      }
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(100);
      const footer = await page.locator('footer').boundingBox();
      const fixedTop = width < 1024 ? (await page.locator('.storefront-action-bar').boundingBox()).y : height;
      assert.ok(footer.y + footer.height <= fixedTop + 2, `footer not hidden behind checkout controls ${width}`);
      if (width < 768) {
        await page.locator('.storefront-bottom-nav button').click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        await page.waitForTimeout(600); // Vaul's opening animation must finish before measuring.
        const close = await dialog.getByRole('button', { name: /Close panel|প্যানেল বন্ধ করুন/ }).boundingBox();
        assert.ok(close.x >= inset && close.x + close.width <= width - inset + 1 && close.y >= inset - 1, `drawer safe ${width}`);
        const checkoutLink = dialog.getByRole('link', { name: /Proceed to Checkout|চেকআউট/ });
        if (await checkoutLink.count()) { const box = await checkoutLink.boundingBox(); assert.ok(box.y + box.height <= height - inset + 1, `drawer footer safe ${width}`); }
      }
      if ([320, 844, 1440].includes(width)) {
        for (const path of ['/', '/shop', '/account', '/order-tracking', '/contact']) {
          await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
          await page.locator('.storefront-shell').waitFor();
          await page.evaluate(value => { for (const edge of ['top', 'right', 'bottom', 'left']) document.documentElement.style.setProperty(`--safe-${edge}`, `${value}px`); }, inset);
          const main = await page.locator('.storefront-shell main').boundingBox();
          assert.ok(main.x >= inset - 1 && main.x + main.width <= width - inset + 1, `${path} safe width ${width}`);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${path} overflow ${width}`);
        }
        await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
        assert.doesNotMatch(await page.locator('meta[name=viewport]').getAttribute('content'), /viewport-fit=cover/);
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
});

test('print preview fits one A4 or thermal page without leaking internal data to customer copies', { timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'], env: { PATH: process.env.PATH, HOME: fixture, TMPDIR: fixture } });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => { window.print = () => { document.body.dataset.printInvoked = 'yes'; }; });
    const page = await context.newPage();
    await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/Username/).fill(username);
    await page.getByLabel(/Password/).fill(fixturePasswords.get(username));
    await page.locator('form button[type=submit]').click();
    await page.getByRole('button', { name: /Logout|লগআউট/ }).waitFor();
    await page.locator('nav button[title="Print & Invoice"], nav button[title="প্রিন্ট ও ইনভয়েস"]').click();
    const selected = page.locator('.print-slips > div');
    await page.locator('button').filter({ hasText: /Select all|সব সিলেক্ট/i }).first().click();
    assert.ok(await selected.count() >= 1);
    // Limit to one order, then measure the resulting printed PDF.
    await page.locator('button').filter({ hasText: /Deselect|আনসেলেক্ট/i }).first().click();
    await page.locator('input[type=checkbox]').last().check();
    const printButton = page.getByRole('button', { name: /A4.*প্রিন্ট|A4.*Print/i });
    await printButton.click();
    const frame = page.frameLocator('iframe[title="Print preview"]');
    await frame.locator('body[data-print-invoked="yes"]').waitFor({ timeout: 15000 });
    const printFrame = page.frames().find(f => f.parentFrame() && f.url() === 'about:blank');
    assert.ok(printFrame);
    const sheets = await printFrame.locator('.print-a4-sheet').count();
    assert.equal(sheets, 1);
    const html = await printFrame.content();
    const pdfPage = await context.newPage();
    await pdfPage.setContent(html, { waitUntil: 'load' });
    const pdf = await pdfPage.pdf({ preferCSSPageSize: true, printBackground: true });
    assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 1, 'A4 output must contain one page');
    await pdfPage.close();
    await page.locator('iframe[title="Print preview"]').evaluate(el => el.remove());
    // Every selected order must occupy one page, with no extra blank pages.
    await page.locator('button').filter({ hasText: /Select all|সব সিলেক্ট/i }).first().click();
    const expectedOrders = await selected.count();
    assert.ok(expectedOrders > 1);
    await printButton.click();
    const batch = page.frameLocator('iframe[title="Print preview"]');
    await batch.locator('body[data-print-invoked="yes"]').waitFor({ timeout: 15000 });
    const batchFrame = page.frames().find(f => f.parentFrame() && f.url() === 'about:blank');
    const batchPage = await context.newPage();
    await batchPage.setContent(await batchFrame.content(), { waitUntil: 'load' });
    const batchPdf = await batchPage.pdf({ preferCSSPageSize: true, printBackground: true });
    assert.equal((batchPdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, expectedOrders, 'one page per order in a batch');
    await batchPage.close();
    await page.locator('iframe[title="Print preview"]').evaluate(el => el.remove());
    await page.locator('button').filter({ hasText: /Deselect|আনসেলেক্ট/i }).first().click();
    await page.locator('input[type=checkbox]').last().check();
    // Customer copy is a physically separate printable DOM with the internal part removed.
    await page.getByLabel('কুরিয়ার / Courier').uncheck();
    await page.getByLabel('অভ্যন্তরীণ / Internal').uncheck();
    await printButton.click();
    const customerFrame = page.frameLocator('iframe[title="Print preview"]');
    await customerFrame.locator('body[data-print-invoked="yes"]').waitFor({ timeout: 15000 });
    assert.equal(await customerFrame.locator('.print-slip-part').count(), 1);
    assert.doesNotMatch(await customerFrame.locator('body').innerText(), /Vendor SKU|সাপ্লায়ার লাভ|Supplier Profit/);
    await page.locator('iframe[title="Print preview"]').evaluate(el => el.remove());
    // Thermal uses the same fit checks and must render as exactly one 4×6 page.
    await page.locator('select').filter({ has: page.locator('option[value="thermal_4x6"]') }).selectOption('thermal_4x6');
    await page.getByRole('button', { name: /থার্মাল স্টিকার প্রিন্ট|Thermal.*Print/i }).click();
    const thermalFrame = page.frameLocator('iframe[title="Print preview"]');
    await thermalFrame.locator('body[data-print-invoked="yes"]').waitFor({ timeout: 15000 });
    const tFrame = page.frames().find(f => f.parentFrame() && f.url() === 'about:blank');
    assert.equal(await tFrame.locator('.print-thermal-sheet').count(), 1);
    const thermalPage = await context.newPage();
    await thermalPage.setContent(await tFrame.content(), { waitUntil: 'load' });
    const thermalPdf = await thermalPage.pdf({ preferCSSPageSize: true, printBackground: true });
    assert.equal((thermalPdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length, 1, 'thermal output must contain one page');
    await thermalPage.close();
    await page.locator('iframe[title="Print preview"]').evaluate(el => el.remove());
    // An oversized slip must fail clearly rather than silently dropping lines.
    await page.locator('select').filter({ has: page.locator('option[value="a4_3part"]') }).selectOption('a4_3part');
    await page.locator('.print-a4-sheet').first().evaluate(sheet => {
      const oversized = document.createElement('div');
      oversized.style.height = '4000px';
      oversized.textContent = 'Long content fixture';
      sheet.appendChild(oversized);
    });
    await printButton.click();
    await page.getByText(/Too much content to fit legibly|এক পৃষ্ঠায় স্পষ্টভাবে দেখানোর জন্য তথ্য বেশি/).waitFor({ timeout: 15000 });
    assert.equal(await page.locator('iframe[title="Print preview"]').count(), 0);
    await context.close();
  } finally { await browser.close(); }
});
