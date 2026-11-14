import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';

const fixture = mkdtempSync(path.join(tmpdir(), 'panchabindu-page-'));
const original = process.cwd();
process.chdir(fixture);
process.env.NODE_ENV = 'test';
process.env.PANCHABINDU_PERSISTENCE = 'json';
process.env.CREDENTIALS_ENCRYPTION_KEY = 'isolated-test-key-not-for-production';
const { default: handler } = await import('../../api/page-data.mjs');

test('Vercel page loader preserves page and query despite conflicting rewrite parameters', async () => {
  const server = http.createServer(handler).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const [pagePath, expected] of Object.entries({ '/': 'home', '/shop': 'shop', '/search': 'search', '/contact': 'contact', '/account': 'account', '/checkout': 'checkout', '/vendor': 'vendor', '/admin': 'admin', '/legal/terms': 'legal', '/order-tracking/invalid': 'tracking' })) {
      const qs = new URLSearchParams({ path: '', pagePath });
      if (pagePath === '/search') { qs.set('q', 'honey'); qs.set('category', 'organic-food'); }
      const response = await fetch(`${base}/api/page-data?${qs}`);
      const result = await response.json();
      assert.equal(result.data?.page, expected, `${pagePath}: ${response.status}`);
      if (pagePath === '/search') {
        assert.equal(result.data.props.initialQuery, 'honey');
        assert.equal(result.data.props.initialCategorySlug, 'organic-food');
      }
    }
    const home = await (await fetch(`${base}/api/page-data?pagePath=%2F`)).json();
    const product = home.data.props.products[0];
    const category = home.data.props.categories[0];
    for (const [pagePath, expected] of [[`/product/${product.slug}`, 'product'], [`/category/${category.slug}`, 'category']]) {
      const response = await fetch(`${base}/api/page-data?${new URLSearchParams({ path: '', pagePath })}`);
      assert.equal((await response.json()).data.page, expected);
    }
    const removed = await fetch(`${base}/api/page-data?pagePath=%2Fcategories`);
    assert.equal(removed.status, 404);
  } finally {
    server.close(); await once(server, 'close');
    process.chdir(original); rmSync(fixture, { recursive: true, force: true });
  }
});
