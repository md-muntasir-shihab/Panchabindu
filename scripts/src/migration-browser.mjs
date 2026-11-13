import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = process.env.TEST_APP_URL || 'http://127.0.0.1:80';
const output = path.resolve(import.meta.dirname, '../../generated-artifacts/migration');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/repl/tools/bin/chromium',
  headless: true, args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/product/dhakai-half-silk-jamdani-saree`, { waitUntil: 'domcontentloaded' });
  await page.getByText('EN', { exact: true }).click();
  await page.getByRole('button', { name: 'Add to Cart', exact: true }).first().click();
  // Adding an item opens the original cart drawer automatically.
  await page.getByText('Your Shopping Cart', { exact: false }).waitFor();
  await page.screenshot({ path: path.join(output, 'cart.jpg') });
  const checkoutLink = page.getByRole('link', { name: /checkout/i });
  await checkoutLink.click();
  await page.waitForURL('**/checkout', { waitUntil: 'domcontentloaded' });
  await page.getByText('Order Summary', { exact: false }).first().waitFor();
  let text = await page.locator('body').innerText();
  assert.match(text, /Dhakai Half-Silk/);
  assert.match(text, /2,450/);
  await page.screenshot({ path: path.join(output, 'checkout.jpg') });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Order Summary', { exact: false }).first().waitFor();
  text = await page.locator('body').innerText();
  assert.match(text, /Dhakai Half-Silk/);
  assert.match(text, /2,450/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/shop`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Dhakai Half-Silk', { exact: false }).first().waitFor();
  await page.screenshot({ path: path.join(output, 'mobile-shop.jpg') });
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
  process.stdout.write('Shopping flow passed: add to cart, checkout, refresh persistence, mobile catalog. No order was submitted.\n');
} finally {
  await browser.close();
}
