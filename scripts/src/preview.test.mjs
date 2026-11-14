import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const launcher = path.join(root, 'scripts/src/preview.mjs');

test('preview refuses production mode', () => {
  const result = spawnSync(process.execPath, [launcher], { env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /cannot run as a production/);
});

test('preview serves a marked isolated app and same-origin API', { timeout: 70_000 }, async () => {
  const child = spawn(process.execPath, [launcher], {
    cwd: root,
    env: { ...process.env, PORT: '0', NODE_ENV: 'development', PANCHABINDU_PERSISTENCE: 'postgres', SUPABASE_SERVICE_ROLE_KEY: 'fixture-should-not-be-used' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  let browser;
  try {
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Preview startup timed out: ${stderr}`)), 45_000);
      child.once('exit', () => { clearTimeout(timeout); reject(new Error(`Preview exited: ${stderr}`)); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/ready on port (\d+)/);
        if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
      });
    });
    const base = `http://127.0.0.1:${port}`;
    const html = await fetch(`${base}/checkout`, { headers: { accept: 'text/html', host: 'preview.example.test' } });
    assert.equal(html.status, 200);
    assert.match(await html.text(), /Demo preview — sample data/);
    const module = await fetch(`${base}/@vite/client`, { headers: { accept: '*/*', host: 'preview.example.test' } });
    assert.match(module.headers.get('content-type'), /javascript/);
    const response = await fetch(`${base}/api/page-data?pagePath=%2F`, { headers: { host: 'preview.example.test' } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.ok(body.data.props.products.length > 0);
    assert.doesNotMatch(JSON.stringify(body), /fixture-should-not-be-used/);
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium', headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('.storefront-shell').waitFor();
    await page.getByText(/ডেমো প্রিভিউ/).waitFor();
    await page.getByRole('button', { name: /কার্টে যোগ করুন|Add to Cart/ }).first().waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
  }
});
