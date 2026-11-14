import test from 'node:test';
import assert from 'node:assert/strict';
import { prioritizeApprovedImage } from './product-gallery';

test('newly approved images become the cover without deleting the existing gallery', () => {
  const old = ['https://example.com/old.jpg', 'https://example.com/new.webp'];
  assert.deepEqual(prioritizeApprovedImage(old, 'https://example.com/new.webp'), ['https://example.com/new.webp', 'https://example.com/old.jpg']);
  assert.deepEqual(old, ['https://example.com/old.jpg', 'https://example.com/new.webp']);
  assert.deepEqual(prioritizeApprovedImage([], 'https://example.com/new.webp'), ['https://example.com/new.webp']);
});
