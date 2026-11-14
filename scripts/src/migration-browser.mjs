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
  const quoteResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/page-data' && url.searchParams.get('pagePath') === '/checkout' && url.searchParams.has('q');
  });
  await checkoutLink.click();
  await page.waitForURL('**/checkout', { waitUntil: 'domcontentloaded' });
  await page.getByText('Order Summary', { exact: false }).first().waitFor();
  const quoteBody = await (await quoteResponse).json();
  const checkout = quoteBody.data.props.checkout;
  assert.ok(checkout.quote.deliveryQuotes.length === 2);
  for (const method of checkout.paymentMethods) {
    await page.getByRole('button', { name: new RegExp(method.nameEn) }).waitFor();
  }
  let text = await page.locator('body').innerText();
  assert.match(text, /Dhakai Half-Silk/);
  assert.match(text, /2,450/);
  await page.screenshot({ path: path.join(output, 'checkout.jpg') });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByText('Order Summary', { exact: false }).first().waitFor();
  text = await page.locator('body').innerText();
  assert.match(text, /Dhakai Half-Silk/);
  assert.match(text, /2,450/);
  // A changed district requests a fresh server quote; errors block checkout and offer retry.
  let failNextQuote = true;
  let holdQuote = false;
  let releaseQuote;
  let markQuoteHeld;
  const quoteHeld = new Promise(resolve => { markQuoteHeld = resolve; });
  await page.route('**/api/page-data?**', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('pagePath') !== '/checkout' || !url.searchParams.has('q')) return route.continue();
    if (failNextQuote) {
      failNextQuote = false;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false }) });
    }
    if (holdQuote) {
      holdQuote = false;
      await new Promise(resolve => { releaseQuote = resolve; markQuoteHeld(); });
    }
    const response = await route.fetch();
    const body = await response.json();
    // An unknown code proves the list and guidance are rendered from the response.
    const manual = body.data.props.checkout.paymentMethods.find(method => method.kind === 'manual');
    manual.code = 'fixture_manual';
    manual.nameEn = 'Server Fixture Wallet';
    manual.instructionEn = 'Server fixture instructions only';
    return route.fulfill({ response, json: body });
  });
  await page.locator('#checkout-district').selectOption('1');
  await page.getByRole('button', { name: 'Retry', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /confirm order/i }).first().isDisabled(), true);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByRole('button', { name: /Server Fixture Wallet/ }).click();
  await page.getByText('Server fixture instructions only', { exact: true }).waitFor();
  holdQuote = true;
  await page.locator('#checkout-district').selectOption('47');
  await page.getByRole('status').filter({ hasText: 'Loading delivery and payment' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /confirm order/i }).first().isDisabled(), true);
  // Release only after the loading state has been checked.
  await quoteHeld;
  assert.equal(typeof releaseQuote, 'function');
  releaseQuote();
  await page.getByText('Server fixture instructions only', { exact: true }).waitFor();
  // The login return link does not clear the persistent cart.
  await page.getByRole('link', { name: /অ্যাকাউন্টে লগইন করুন|Log in to your account/i }).click();
  await page.waitForURL('**/account?tab=orders&returnTo=checkout', { waitUntil: 'domcontentloaded' });
  await page.goto(`${base}/checkout`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Order Summary', { exact: false }).first().waitFor();
  assert.match(await page.locator('body').innerText(), /Dhakai Half-Silk/);
  await page.unroute('**/api/page-data?**');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/shop`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Dhakai Half-Silk', { exact: false }).first().waitFor();
  await page.screenshot({ path: path.join(output, 'mobile-shop.jpg') });
  assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
  process.stdout.write('Shopping flow passed: cart, server quotes and payment methods, quote error/retry/loading, login return link, refresh persistence, mobile catalog. No order was submitted.\n');
} finally {
  await browser.close();
}
