import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { copySource, syntheticEnvironment } from './isolated-baseline.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'panchagarh-http-smoke-'));
const workspace = path.join(output, 'workspace');
copySource(root, workspace);
fs.symlinkSync(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
const port = 3104;
const base = `http://127.0.0.1:${port}`;
const environment = { ...syntheticEnvironment(), PANCHAGARH_ENABLE_SANDBOX_AUTH: '1', APP_URL: base };
const bootstrap = `import fs from 'node:fs';
import { readAdminStore } from './src/lib/admin/phase4a-service.ts';
import { createAdminSession } from './src/lib/security/crypto-session.ts';
import { getPublicStorefrontData } from './src/lib/db/repository.ts';
getPublicStorefrontData();
const user = readAdminStore().users.find(user => user.roleSlug === 'super_admin');
fs.writeFileSync('synthetic-session.json',JSON.stringify(createAdminSession({userId:user.userId,username:user.username,roleSlug:user.roleSlug})),{mode:0o600});`;
const seed = spawnSync(process.execPath, ['--import', path.join(workspace, 'scripts/tooling/register-typescript.mjs'), '--input-type=module', '-e', bootstrap], { cwd: workspace, env: environment, encoding: 'utf8' });
if (seed.status !== 0) throw new Error('SYNTHETIC_BOOTSTRAP_FAILED');
const session = JSON.parse(fs.readFileSync(path.join(workspace, 'synthetic-session.json'), 'utf8'));
environment.NODE_ENV = 'development';
for (const key of ['HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','NO_PROXY','https_proxy','http_proxy','all_proxy','no_proxy','SSL_CERT_FILE','NODE_EXTRA_CA_CERTS']) {
  if (process.env[key]) environment[key] = process.env[key];
}
const server = spawn(process.execPath, [path.join(workspace, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: workspace, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', data => { serverLog += data; });
server.stderr.on('data', data => { serverLog += data; });
const results = [];
async function check(url, expectedStatus, options, inspect) {
  const response = await fetch(base + url, { ...options, signal: AbortSignal.timeout(60_000) });
  const body = await response.text();
  if (response.status !== expectedStatus) throw new Error(`${url}: expected ${expectedStatus}, received ${response.status}`);
  if (inspect) inspect(body);
  results.push({ path: url, status: response.status });
  console.log(`PASS ${url} (${response.status})`);
}
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (serverLog.includes('Ready in')) break;
    if (server.exitCode !== null) throw new Error('HTTP_TEST_SERVER_STOPPED');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  for (const url of ['/api/admin/brand-media', '/api/orders', '/api/media', '/api/catalog/import', '/api/print/unknown']) {
    await check(url, 401, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: '{}' });
  }
  await check('/api/orders', 413, { method: 'POST', headers: { origin: base }, body: 'x'.repeat(70 * 1024) });
  await check('/api/admin/workspace', 200, { headers: { cookie: `bg_admin_session=${session.token}` } }, body => {
    if (!JSON.parse(body).currentUser) throw new Error('AUTHENTICATED_WORKSPACE_MISSING');
  });
  await check('/api/vendor/overview', 403, { headers: { cookie: `bg_admin_session=${session.token}` } });
  const workspaceResponse = await fetch(base + '/api/admin/workspace', { headers: { cookie: `bg_admin_session=${session.token}` } });
  const workspaceData = await workspaceResponse.json();
  const original = workspaceData.siteSettings;
  const storefrontModule = await import(path.join(workspace, 'src/lib/storefront/storefront-config.ts'));
  const content = { ...original, brandNameBn: 'পরীক্ষার স্টোর', brandNameEn: 'Review Store', maintenanceMessageEn: 'Back soon',
    promoCampaign: { ...original.promoCampaign, enabled: false },
    storefront: { ...storefrontModule.getStorefrontConfig(original), logoUrl: '/assets/product-placeholder.svg', seoTitleBn: 'পরীক্ষার শিরোনাম', footerTextEn: 'Managed footer', navigation: [{ id: 'managed', labelBn: 'নিয়ন্ত্রিত মেনু', labelEn: 'Managed menu', href: '/shop', enabled: true }] },
    heroBanners: original.heroBanners.map(hero => ({ ...hero, titleBn: 'পরিবর্তিত ব্যানার' })),
    homepageSections: original.homepageSections.map(section => ({ ...section, enabled: section.type !== 'hero' })),
  };
  const options = { method: 'POST', headers: { cookie: `bg_admin_session=${session.token}`, origin: base, 'x-csrf-token': session.csrfToken, 'content-type': 'application/json' } };
  await check('/api/admin/workspace', 403, { ...options, headers: { ...options.headers, 'x-csrf-token': 'invalid' }, body: JSON.stringify({ operation: 'update_storefront_content', content }) });
  await check('/api/admin/workspace', 200, { ...options, body: JSON.stringify({ operation: 'update_storefront_content', content }) }, body => { if (!JSON.parse(body).success) throw new Error('CONTENT_SAVE_FAILED'); });
  await check('/', 200, undefined, body => { if (!body.includes('পরীক্ষার শিরোনাম') || !body.includes('পরীক্ষার স্টোর') || !body.includes('নিয়ন্ত্রিত মেনু')) throw new Error('MANAGED_BRANDING_NOT_RENDERED'); if (body.includes('<h1 class=') && body.includes('পরিবর্তিত ব্যানার</h1>')) throw new Error('DISABLED_HERO_RENDERED'); });
  await check('/manifest.webmanifest', 200, undefined, body => { if (JSON.parse(body).short_name !== 'Review Store') throw new Error('MANIFEST_BRANDING_STALE'); });
  await check('/admin', 200, undefined, body => { if (!body.includes('Review Store')) throw new Error('ADMIN_BRANDING_STALE'); });
  for (const url of ['/vendor', '/categories', '/shop', '/admin', '/account', '/sitemap.xml', '/manifest.webmanifest', '/api/storefront']) {
    await check(url, 200, undefined, body => {
      if (url === '/api/storefront' && /"supplierCostPoisha"|"platformMarginPoisha"/.test(body)) throw new Error('PUBLIC_FINANCE_LEAK');
    });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'HTTP_SMOKE_FAILED');
  process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
  fs.writeFileSync(path.join(output, 'server.log'), serverLog);
  fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify({ checks: results, exitCode: process.exitCode ?? 0 }, null, 2));
  console.log(`HTTP verification logs: ${output}`);
}
