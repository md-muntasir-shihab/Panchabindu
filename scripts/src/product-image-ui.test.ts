import test from 'node:test';
import assert from 'node:assert/strict';
import { productImageUrl, productImageFallback } from '../../artifacts/panchabindu/src/lib/storefront/product-image';
import { getStorefrontConfig } from '../../artifacts/panchabindu/src/lib/storefront/storefront-config';

test('image links resolve google result pages safely and fall back without loops', () => {
  const direct = 'https://example.com/photo.jpg?size=large';
  assert.equal(productImageUrl(`https://www.google.com/imgres?imgurl=${encodeURIComponent(direct)}`), direct);
  assert.equal(productImageUrl('https://www.google.com/imgres?imgurl=javascript%3Aalert(1)'), '/assets/product-placeholder.svg');
  assert.equal(productImageUrl('/uploads/photo.webp'), '/uploads/photo.webp');
  assert.equal(productImageUrl(null), '/assets/product-placeholder.svg');
  const image = { onerror: () => {}, src: '' } as unknown as HTMLImageElement;
  productImageFallback({ currentTarget: image });
  assert.equal(image.onerror, null);
  assert.equal(image.src, '/assets/product-placeholder.svg');
});

test('old saved category index links are hidden without modifying saved settings', () => {
  const original = getStorefrontConfig({});
  const category = { id: 'categories', labelBn: 'ক্যাটাগরি', labelEn: 'Categories', href: '/categories', enabled: true };
  const saved = { ...original, navigation: [...original.navigation, category], footerLinks: [...original.footerLinks, category] };
  const result = getStorefrontConfig({ storefront: saved });
  assert.ok(!result.navigation.some(link => link.href === '/categories'));
  assert.ok(!result.footerLinks.some(link => link.href === '/categories'));
  assert.ok(saved.navigation.some(link => link.href === '/categories'));
});
