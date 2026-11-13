import test from 'node:test';
import assert from 'node:assert/strict';

const base = process.env.TEST_APP_URL || 'http://localhost:80';
async function page(path) {
  const result = await fetch(`${base}/api/page-data?path=${encodeURIComponent(path)}`);
  const body = await result.json();
  assert.equal(body.success, true, `${path}: ${JSON.stringify(body)}`);
  return { result, data: body.data };
}

test('all original public and protected page loaders remain reachable', async () => {
  for (const [path, expected] of Object.entries({
    '/': 'home', '/shop': 'shop', '/search': 'search', '/categories': 'categories',
    '/checkout': 'checkout', '/account': 'account', '/contact': 'contact',
    '/admin': 'admin', '/vendor': 'vendor', '/order-tracking/invalid-token': 'tracking',
  })) {
    const { result, data } = await page(path);
    assert.equal(result.status, 200, path);
    assert.equal(data.page, expected, path);
    assert.ok(data.metadata.title, path);
    assert.match(result.headers.get('cache-control'), /no-store/);
  }
});

test('catalog details, categories and legal pages use the original data', async () => {
  const { data: home } = await page('/');
  assert.ok(home.props.products.length > 0);
  const product = home.props.products[0];
  const { data: detail } = await page(`/product/${product.slug}`);
  assert.equal(detail.props.product.id, product.id);
  assert.equal(typeof detail.props.leadTimeDays, 'number');
  assert.ok(detail.jsonLd);
  const category = home.props.categories[0];
  const { data: categoryPage } = await page(`/category/${category.slug}`);
  assert.equal(categoryPage.props.currentCategory.id, category.id);
  const legalSlug = Object.keys(home.props.siteSettings.legalPages)[0];
  const { data: legal } = await page(`/legal/${legalSlug}`);
  assert.equal(legal.page, 'legal');
  assert.ok(legal.props.page.contentEn);
  for (const p of [...home.props.products, detail.props.product]) {
    const serialized = JSON.stringify(p);
    for (const field of ['supplierCostPoisha', 'supplierProfitPoisha', 'platformMarginPoisha', 'vendorId', 'internalVendorSku']) {
      assert.ok(!serialized.includes(`"${field}"`), `private field ${field} leaked`);
    }
  }
});

test('unknown products, categories, policies and routes render not-found', async () => {
  for (const path of ['/missing-route', '/product/nonexistent-product', '/category/nonexistent-category', '/legal/nonexistent-policy']) {
    const { result, data } = await page(path);
    assert.equal(result.status, 404);
    assert.equal(data.page, 'not-found');
    assert.deepEqual(data.props, {});
  }
});

test('sensitive endpoints retain original auth and validation guards', async () => {
  for (const path of ['/api/admin/workspace', '/api/vendor/overview']) {
    const response = await fetch(`${base}${path}`);
    assert.ok([400, 401, 403].includes(response.status), `${path}: ${response.status}`);
  }
  const print = await fetch(`${base}/api/print/ORD-000001`, { method: 'POST' });
  assert.equal(print.status, 401);
  const account = await fetch(`${base}/api/account/orders`);
  const guest = await account.json();
  assert.equal(guest.authenticated, false);
  assert.deepEqual(guest.orders, []);
  const track = await fetch(`${base}/api/orders/track/ORD-000001`);
  assert.equal(track.status, 403);
  const malformedOrder = await fetch(`${base}/api/orders`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  assert.ok([400, 403, 422].includes(malformedOrder.status));
  const wrongMethod = await fetch(`${base}/api/storefront`, { method: 'DELETE' });
  assert.equal(wrongMethod.status, 405);
});

test('storefront, manifest, robots and sitemap are served by the shared proxy', async () => {
  const storefront = await fetch(`${base}/api/storefront`);
  assert.equal(storefront.status, 200);
  assert.equal((await storefront.json()).success, true);
  const manifest = await fetch(`${base}/manifest.webmanifest`);
  assert.equal((await manifest.json()).start_url, '/');
  const robots = await fetch(`${base}/robots.txt`);
  assert.match(await robots.text(), /Disallow: \/admin/);
  const sitemap = await fetch(`${base}/sitemap.xml`);
  assert.match(await sitemap.text(), /<urlset/);
  assert.equal((await fetch(`${base}/api/healthz`)).status, 200);
});
