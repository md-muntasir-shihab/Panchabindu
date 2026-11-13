import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { boundedFormData, processProductImage } from './product-image';

test('uploaded images are decoded, resized, re-encoded and stripped of metadata', async () => {
  const input = await sharp({ create: { width: 3000, height: 1000, channels: 3, background: '#237b57' } }).withMetadata().jpeg().toBuffer();
  const processed = await processProductImage(input, 'photo.jpg', 'image/jpeg');
  const output = await sharp(processed.bytes).metadata();
  assert.equal(output.format, 'webp');
  assert.equal(output.width, 2400);
  assert.equal(output.exif, undefined);
  assert.equal(output.icc, undefined);
});

test('forged, truncated, oversized and excessive-pixel images are rejected', async () => {
  await assert.rejects(processProductImage(Buffer.from([255, 216, 255, 0, 0]), 'fake.jpg', 'image/jpeg'));
  await assert.rejects(processProductImage(Buffer.alloc(6 * 1024 * 1024), 'large.jpg', 'image/jpeg'));
  const png = await sharp({ create: { width: 4100, height: 4100, channels: 3, background: '#000' } }).png().toBuffer();
  await assert.rejects(processProductImage(png, 'large.png', 'image/png'));
  await assert.rejects(processProductImage(png, 'fake.svg', 'image/svg+xml'));
  await assert.rejects(boundedFormData(new Request('http://localhost/upload', { method: 'POST', body: 'oversized' }), 4), /UPLOAD_TOO_LARGE/);
});
