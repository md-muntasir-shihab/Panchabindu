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
