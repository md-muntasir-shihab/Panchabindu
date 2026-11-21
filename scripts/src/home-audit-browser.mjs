import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const AxeBuilder = require('@axe-core/playwright').default;

const BASE_URL = (process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const DEFAULT_CHROME_PATH = '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell';

const VIEWPORTS = [
  { name: '360-small-phone', width: 360, height: 800, isTouch: true },
  { name: '390-standard-phone', width: 390, height: 844, isTouch: true },
  { name: '430-large-phone', width: 430, height: 932, isTouch: true },
  { name: '844x390-landscape-phone', width: 844, height: 390, isTouch: true },
  { name: '768-tablet-portrait', width: 768, height: 1024, isTouch: true },
  { name: '1024-tablet-landscape', width: 1024, height: 768, isTouch: false },
  { name: '1280-laptop', width: 1280, height: 800, isTouch: false },
  { name: '1440-desktop', width: 1440, height: 900, isTouch: false },
  { name: '1920-wide-desktop', width: 1920, height: 1080, isTouch: false },
];

function launchOptions() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || DEFAULT_CHROME_PATH;
  return fs.existsSync(executablePath)
    ? { executablePath, headless: true, args: ['--no-sandbox'] }
    : { headless: true, args: ['--no-sandbox'] };
}

async function waitForStorefrontReady(page) {
  await page.waitForSelector('main', { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('article').length > 0, null, { timeout: 15000 });
}

async function inspectViewport(browser, vp) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await waitForStorefrontReady(page);

  const metrics = await page.evaluate((viewportInfo) => {
    const overflowPx = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
    const images = Array.from(document.querySelectorAll('img')).filter((img) => {
      const rect = img.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const brokenImages = images.filter((img) => !img.complete || img.naturalWidth === 0).map((img) => img.src);

    const portalLinks = Array.from(document.querySelectorAll('a[href]'))
      .map((a) => a.getAttribute('href') || '')
      .filter((href) => /^\/(admin|vendor)(\/|$)/i.test(href));

    const articles = Array.from(document.querySelectorAll('article'));
    const productHrefs = articles
      .map((article) => article.querySelector('a[href^="/product/"]')?.getAttribute('href') || '')
      .filter(Boolean);
    const uniqueProductHrefs = new Set(productHrefs).size;

    const smallFontFields = [];
    if (viewportInfo.width <= 900) {
      for (const el of document.querySelectorAll('input, select, textarea')) {
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (['range', 'checkbox', 'radio', 'hidden'].includes(type)) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const fontSize = parseFloat(window.getComputedStyle(el).fontSize || '0');
        if (fontSize < 16) {
          smallFontFields.push({
            tag: el.tagName,
            ariaLabel: el.getAttribute('aria-label') || el.getAttribute('placeholder') || '',
            fontSize,
          });
        }
      }
    }

    const smallTouchTargets = [];
    if (viewportInfo.isTouch) {
      const selector = 'header button, header a, main button, main select';
      for (const el of document.querySelectorAll(selector)) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const style = window.getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        if (rect.height < 43.5 || rect.width < 43.5) {
          smallTouchTargets.push({
            tag: el.tagName,
            text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      }
    }

    return {
      overflowPx,
      imageCount: images.length,
      brokenImages,
      portalLinks,
      articleCount: articles.length,
      uniqueProductHrefs,
      smallFontFields,
      smallTouchTargets,
    };
  }, vp);

  await context.close();
  return {
    viewport: vp.name,
    ...metrics,
    consoleErrors,
    pageErrors,
  };
}

async function runAxeAudit(browser) {
  const results = [];

  // 1. Desktop 1440 initial + Filter Drawer + Cart Drawer
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await waitForStorefrontReady(page);

    const homeDesktop = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    results.push({ surface: 'desktop-1440-initial', violations: homeDesktop.violations });

    // Open Filter Drawer
    await page.getByRole('button', { name: /Filter|ফিল্টার/i }).first().click();
    await page.waitForSelector('aside[aria-modal="true"], [role="dialog"]', { timeout: 5000 });
    const filterDrawer = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    results.push({ surface: 'desktop-1440-filter-drawer', violations: filterDrawer.violations });
    await page.keyboard.press('Escape');

    // Quick-add first product and ensure Cart Drawer is open
    await page.locator('article button').filter({ hasText: /Add|কার্ট|ব্যাগ|যুক্ত/i }).first().click();
    await page.waitForTimeout(250);
    const drawerVisible = await page.locator('[role="dialog"]').first().isVisible().catch(() => false);
    if (!drawerVisible) {
      await page.getByRole('button', { name: /Cart|Bag|কার্ট|ব্যাগ/i }).first().click();
      await page.waitForTimeout(250);
    }
    const cartDrawer = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    results.push({ surface: 'desktop-1440-cart-drawer', violations: cartDrawer.violations });
    await context.close();
  }

  // 2. Mobile 390 initial + Mobile Menu Drawer
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await waitForStorefrontReady(page);

    const homeMobile = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    results.push({ surface: 'mobile-390-initial', violations: homeMobile.violations });

    await page.getByRole('button', { name: /Open menu|মেনু খুলুন/i }).first().click();
    await page.waitForTimeout(250);
    const mobilePortalLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a[href]'))
        .map((a) => a.getAttribute('href') || '')
        .filter((href) => /^\/(admin|vendor)(\/|$)/i.test(href)),
    );
    assert.deepEqual(mobilePortalLinks, [], 'Mobile drawer must not expose /admin or /vendor links');

    const mobileDrawer = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    results.push({ surface: 'mobile-390-nav-drawer', violations: mobileDrawer.violations });
    await context.close();
  }

  return results;
}

async function runFunctionalE2E(browser) {
  const checks = [];

  // Desktop E2E
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    let sawDialog = false;
    page.on('dialog', async (d) => {
      sawDialog = true;
      await d.dismiss();
    });

    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await waitForStorefrontReady(page);

    // 1. Language toggle + reload persistence
    const initialLangAttr = await page.evaluate(() => document.documentElement.lang);
    const langBtn = page.getByRole('button', { name: /Switch language|ভাষা পরিবর্তন/i });
    await langBtn.click();
    await page.waitForTimeout(150);
    const toggledLangAttr = await page.evaluate(() => document.documentElement.lang);
    assert.notEqual(toggledLangAttr, initialLangAttr, 'Language toggle must switch locale');
    await page.reload({ waitUntil: 'networkidle' });
    await waitForStorefrontReady(page);
    const persistedLangAttr = await page.evaluate(() => document.documentElement.lang);
    assert.equal(persistedLangAttr, toggledLangAttr, 'Locale must persist after reload');
    // Switch back to EN for predictable assertions
    if (persistedLangAttr === 'bn') {
      await page.getByRole('button', { name: /Switch language|ভাষা পরিবর্তন/i }).click();
      await page.waitForTimeout(150);
    }
    checks.push('locale-toggle-and-persistence: PASS');

    // 2. Keyboard '/' search shortcut + XSS input probe + Clear + Escape
    await page.keyboard.press('/');
    const searchInput = page.locator('header input[type="search"], header input[placeholder*="Search"]').first();
    await searchInput.waitFor({ state: 'visible', timeout: 3000 });
    await searchInput.fill('<script>alert(1)</script>');
    await page.waitForTimeout(200);
    assert.equal(sawDialog, false, 'XSS probe in search must not execute script');
    await searchInput.fill('Tea');
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    checks.push('search-shortcut-and-xss-safety: PASS');

    // 3. Collection tabs & sort select
    await page.getByRole('button', { name: /Best Sellers/i }).first().click();
    await page.waitForTimeout(100);
    await page.getByRole('button', { name: /All Products/i }).first().click();
    const sortSelect = page.locator('select').first();
    await sortSelect.selectOption('price_asc');
    await sortSelect.selectOption('price_desc');
    await sortSelect.selectOption('popular');
    checks.push('collection-tabs-and-sort: PASS');

    // 4. Filter drawer budget -> 0 empty state -> Reset
    await page.getByRole('button', { name: /Filter/i }).first().click();
    const rangeInput = page.locator('input[type="range"]').first();
    await rangeInput.waitFor({ state: 'visible', timeout: 3000 });
    await rangeInput.fill('0');
    await rangeInput.dispatchEvent('input');
    await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const resetBtn = page.getByRole('button', { name: /Reset All Filters|Reset/i }).first();
    await resetBtn.waitFor({ state: 'visible', timeout: 3000 });
    await resetBtn.click();
    await waitForStorefrontReady(page);
    checks.push('filter-drawer-empty-state-and-reset: PASS');

    // 5. Wishlist toggle + reload persistence
    const wishlistBtn = page.locator('article button[aria-pressed]').first();
    const beforePressed = await wishlistBtn.getAttribute('aria-pressed');
    await wishlistBtn.click();
    await page.waitForTimeout(150);
    const afterPressed = await wishlistBtn.getAttribute('aria-pressed');
    assert.notEqual(afterPressed, beforePressed, 'Wishlist button aria-pressed must toggle');
    await page.reload({ waitUntil: 'networkidle' });
    await waitForStorefrontReady(page);
    const persistedPressed = await page.locator('article button[aria-pressed]').first().getAttribute('aria-pressed');
    assert.equal(persistedPressed, afterPressed, 'Wishlist state must persist after reload');
    checks.push('wishlist-toggle-and-persistence: PASS');

    // 6. Quick-Add + Cart drawer (+, -, remove, undo, reload persistence)
    await page.locator('article button').filter({ hasText: /Add/i }).first().click();
    await page.waitForTimeout(200);
    const cartDialogOpen = await page.locator('[role="dialog"]').first().isVisible().catch(() => false);
    if (!cartDialogOpen) {
      await page.getByRole('button', { name: /Cart|Bag/i }).first().click();
      await page.waitForTimeout(200);
    }
    const increaseBtn = page.getByRole('button', { name: /Increase quantity|পরিমাণ বাড়ান/i }).first();
    await increaseBtn.waitFor({ state: 'visible', timeout: 3000 });
    await increaseBtn.click();
    await page.waitForTimeout(100);
    const removeBtn = page.getByRole('button', { name: /Remove|সরান/i }).first();
    await removeBtn.click();
    await page.waitForTimeout(150);
    const undoBtn = page.getByRole('button', { name: /Undo|ফিরিয়ে আনুন/i }).first();
    await undoBtn.waitFor({ state: 'visible', timeout: 3000 });
    await undoBtn.click();
    await page.waitForTimeout(150);
    await page.reload({ waitUntil: 'networkidle' });
    await waitForStorefrontReady(page);
    const cartTextAfterReload = await page.getByRole('button', { name: /Cart|Bag/i }).first().innerText();
    assert.match(cartTextAfterReload, /[1-9]/, 'Cart count must persist after reload');
    checks.push('cart-quick-add-remove-undo-and-persistence: PASS');

    await context.close();
  }

  // Mobile '/' shortcut opens mobile search sheet
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await waitForStorefrontReady(page);
    await page.keyboard.press('/');
    const mobileSearchInput = page
      .locator('input[placeholder*="Search"], input[placeholder*="খুঁজুন"]')
      .locator('visible=true')
      .first();
    await mobileSearchInput.waitFor({ state: 'visible', timeout: 3000 });
    checks.push('mobile-slash-shortcut-opens-search-sheet: PASS');
    await context.close();
  }

  return checks;
}

async function runConsumerSmokeChecks(browser) {
  const routes = ['/shop', '/checkout', '/order-tracking', '/legal/about'];
  const summary = [];

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Discover first live category slug from homepage
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  const firstCategoryHref = await page.evaluate(
    () => document.querySelector('a[href^="/category/"]')?.getAttribute('href') || null,
  );
  if (firstCategoryHref) routes.push(firstCategoryHref);

  for (const route of routes) {
    const pageErrors = [];
    const consoleErrors = [];
    const onPageError = (err) => pageErrors.push(String(err));
    const onConsole = (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    };
    page.on('pageerror', onPageError);
    page.on('console', onConsole);

    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('main', { timeout: 10000 });
    const info = await page.evaluate(() => ({
      overflowPx: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      portalLinks: Array.from(document.querySelectorAll('a[href]'))
        .map((a) => a.getAttribute('href') || '')
        .filter((href) => /^\/(admin|vendor)(\/|$)/i.test(href)),
      mainTextLength: (document.querySelector('main')?.textContent || '').trim().length,
    }));

    page.off('pageerror', onPageError);
    page.off('console', onConsole);

    summary.push({
      route,
      ...info,
      consoleErrors,
      pageErrors,
    });
  }

  await context.close();
  return summary;
}

async function main() {
  const browser = await chromium.launch(launchOptions());
  try {
    const viewportReports = [];
    for (const vp of VIEWPORTS) {
      viewportReports.push(await inspectViewport(browser, vp));
    }

    const axeReports = await runAxeAudit(browser);
    const e2eChecks = await runFunctionalE2E(browser);
    const consumerReports = await runConsumerSmokeChecks(browser);

    const output = {
      viewportReports,
      axeSummary: axeReports.map((r) => ({
        surface: r.surface,
        violationCount: r.violations.length,
        violations: r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.length,
          sampleTarget: v.nodes[0]?.target,
          sampleSummary: v.nodes[0]?.failureSummary,
        })),
      })),
      e2eChecks,
      consumerReports,
    };

    console.log(JSON.stringify(output, null, 2));

    // Hard assertions
    for (const r of viewportReports) {
      assert.equal(r.overflowPx, 0, `${r.viewport}: horizontal overflow ${r.overflowPx}px`);
      assert.deepEqual(r.brokenImages, [], `${r.viewport}: broken images ${r.brokenImages.join(', ')}`);
      assert.deepEqual(r.portalLinks, [], `${r.viewport}: exposed portal links ${r.portalLinks.join(', ')}`);
      assert.equal(
        r.articleCount,
        r.uniqueProductHrefs,
        `${r.viewport}: duplicate product cards (${r.articleCount} articles vs ${r.uniqueProductHrefs} unique)`,
      );
      assert.deepEqual(r.smallFontFields, [], `${r.viewport}: sub-16px inputs/selects`);
      assert.deepEqual(r.smallTouchTargets, [], `${r.viewport}: sub-44px touch targets`);
      assert.deepEqual(r.consoleErrors, [], `${r.viewport}: console errors`);
      assert.deepEqual(r.pageErrors, [], `${r.viewport}: page errors`);
    }

    for (const r of output.axeSummary) {
      assert.equal(r.violationCount, 0, `Axe violations on ${r.surface}: ${JSON.stringify(r.violations)}`);
    }

    for (const c of consumerReports) {
      assert.equal(c.overflowPx, 0, `${c.route}: horizontal overflow`);
      assert.deepEqual(c.portalLinks, [], `${c.route}: exposed portal links`);
      assert.ok(c.mainTextLength > 20, `${c.route}: main content unexpectedly empty`);
      assert.deepEqual(c.consoleErrors, [], `${c.route}: console errors`);
      assert.deepEqual(c.pageErrors, [], `${c.route}: page errors`);
    }

    console.log('\nALL HOMEPAGE BROWSER, RESPONSIVE, AXE, E2E, AND CONSUMER CHECKS PASSED.');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
