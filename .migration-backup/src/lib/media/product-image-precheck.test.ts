import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PRODUCT_IMAGE_BYTES, precheckProductImage } from './product-image-precheck.ts';

const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

test('recognizes allowlisted signatures only when extension and declared MIME agree', () => {
  for (const [filename, declaredMime, header] of [
    ['photo.JPG', 'image/jpeg', jpeg],
    ['photo.png', 'image/png', png],
    ['photo.webp', 'image/webp', webp],
  ] as const) {
    assert.deepEqual(precheckProductImage({ filename, declaredMime, sizeBytes: MAX_PRODUCT_IMAGE_BYTES, header }), { ok: true, mime: declaredMime });
  }
});

test('rejects unsupported extensions, spoofed content and truncated signatures', () => {
  assert.equal(precheckProductImage({ filename: 'image.svg', declaredMime: 'image/svg+xml', sizeBytes: 20, header: png }).ok, false);
  assert.equal(precheckProductImage({ filename: 'image.html', declaredMime: 'image/png', sizeBytes: 20, header: png }).ok, false);
  assert.equal(precheckProductImage({ filename: 'image.png', declaredMime: 'image/png', sizeBytes: 20, header: jpeg }).ok, false);
  assert.equal(precheckProductImage({ filename: 'image.jpg', declaredMime: 'image/png', sizeBytes: 20, header: jpeg }).ok, false);
  assert.equal(precheckProductImage({ filename: 'image.webp', declaredMime: 'image/webp', sizeBytes: 20, header: webp.slice(0, 11) }).ok, false);
  assert.equal(precheckProductImage({ filename: 'image.constructor', declaredMime: 'image/png', sizeBytes: 20, header: png }).ok, false);
  assert.equal(precheckProductImage({ filename: 'png', declaredMime: 'image/png', sizeBytes: 20, header: png }).ok, false);
});

test('rejects invalid and oversized declared sizes', () => {
  for (const sizeBytes of [0, -1, 1.5, 3, Infinity, NaN, MAX_PRODUCT_IMAGE_BYTES + 1]) {
    assert.deepEqual(precheckProductImage({ filename: 'image.jpg', declaredMime: 'image/jpeg', sizeBytes, header: jpeg }), { ok: false, reason: 'invalid_size' });
  }
});