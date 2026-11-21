import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const BASE_URL = (process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const CHROME_PATH =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell';

const VIEWPORTS = [
  { name: 'mobile-360', width: 360, height: 800, touch: true },
  { name: 'mobile-390', width: 390, height: 844, touch: true },
  { name: 'mobile-430', width: 430, height: 932, touch: true },
  { name: 'mobile-landscape', width: 844, height: 390, touch: true },
  { name: 'tablet-768', width: 768, height: 1024, touch: true },
  { name: 'laptop-1024', width: 1024, height: 768, touch: false },
  { name: 'desktop-1280', width: 1280, height: 800, touch: false },
  { name: 'desktop-1440', width: 1440, height: 900, touch: false },
  { name: 'desktop-1920', width: 1920, height: 1080, touch: false },
];

async function navigateToOrdersGrid(page) {
  await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // Mobile bottom navigation has a direct "Orders" button
  const mobileBottomOrdersBtn = page
    .locator('nav button')
    .filter({ hasText: /^Orders$|^অর্ডার$/i })
    .first();
  if (await mobileBottomOrdersBtn.isVisible().catch(() => false)) {
    await mobileBottomOrdersBtn.click();
  } else {
    // Tablet (< lg) uses a slide-out sidebar drawer
    const mobileMenuBtn = page
      .locator('header button[aria-label*="Sidebar" i], header button[aria-label*="মেনু" i]')
      .first();
    if (await mobileMenuBtn.isVisible().catch(() => false)) {
      await mobileMenuBtn.click();
      await page.waitForTimeout(200);
    }

    const ordersGridBtn = page
      .locator('aside button')
      .filter({ hasText: /Orders Grid|অর্ডার গ্রিড/i })
      .first();
    if (!(await ordersGridBtn.isVisible().catch(() => false))) {
      const groupBtn = page
        .locator('aside button')
        .filter({ hasText: /Orders & Delivery|অর্ডার ও ডেলিভারি/i })
        .first();
      await groupBtn.waitFor({ state: 'visible', timeout: 10000 });
      await groupBtn.click();
      await page.waitForTimeout(200);
    }
    await ordersGridBtn.waitFor({ state: 'visible', timeout: 10000 });
    await ordersGridBtn.click();
  }

  await page
    .locator('input[type="search"], input[placeholder*="Search order" i], input[placeholder*="অর্ডার" i]')
    .first()
    .waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(300);
}

async function checkSheetGeometryAndBanner(page, sheetLabel) {
  const drawer = page.locator('[data-vaul-drawer], [role="dialog"]').last();
  await drawer.waitFor({ state: 'visible', timeout: 8000 });
  await page.waitForTimeout(350);

  const metrics = await page.evaluate(() => {
    const banner = document.querySelector('body > [role="status"]');
    const bannerRect = banner ? banner.getBoundingClientRect() : null;
    const dialogs = Array.from(document.querySelectorAll('[data-vaul-drawer], [role="dialog"]'));
    const activeDialog = dialogs[dialogs.length - 1];
    const dialogRect = activeDialog ? activeDialog.getBoundingClientRect() : null;
    const closeBtn = activeDialog?.querySelector('button[aria-label*="Close" i], button[aria-label*="বন্ধ" i]');
    const closeRect = closeBtn ? closeBtn.getBoundingClientRect() : null;
    const htmlOverflow = document.documentElement.scrollWidth - window.innerWidth;
    const dialogOverflow = activeDialog ? activeDialog.scrollWidth - activeDialog.clientWidth : 0;
    return {
      bannerBottom: bannerRect ? Math.round(bannerRect.bottom) : 0,
      dialogTop: dialogRect ? Math.round(dialogRect.top) : -1,
      closeTop: closeRect ? Math.round(closeRect.top) : -1,
      htmlOverflow,
      dialogOverflow,
    };
  });

  assert.ok(
    metrics.dialogTop >= metrics.bannerBottom - 1,
    `[${sheetLabel}] Drawer top (${metrics.dialogTop}px) is clipped under preview banner bottom (${metrics.bannerBottom}px)`,
  );
  if (metrics.closeTop >= 0) {
    assert.ok(
      metrics.closeTop >= metrics.bannerBottom - 1,
      `[${sheetLabel}] Close button top (${metrics.closeTop}px) is clipped under preview banner bottom (${metrics.bannerBottom}px)`,
    );
  }
  assert.ok(
    metrics.htmlOverflow <= 1,
    `[${sheetLabel}] Horizontal page overflow detected: ${metrics.htmlOverflow}px`,
  );
  return metrics;
}

async function closeActiveSheet(page) {
  const closeBtn = page
    .locator('[data-vaul-drawer] button[aria-label*="Close" i], [data-vaul-drawer] button[aria-label*="বন্ধ" i], [role="dialog"] button[aria-label*="Close" i], [role="dialog"] button[aria-label*="বন্ধ" i]')
    .last();
  await closeBtn.click();
  await page.waitForTimeout(300);
}

async function runAxeAudit(page, surfaceName) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  if (results.violations.length > 0) {
    const summary = results.violations
      .map(
        (v) =>
          `${v.id}(${v.nodes.length}): ${v.help} -> ${v.nodes
            .slice(0, 3)
            .map((n) => n.target.join(' '))
            .join(' | ')}`,
      )
      .join('\n');
    throw new Error(`[Axe WCAG 2.1 AA FAIL on ${surfaceName}]\n${summary}`);
  }
}

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox'],
  });

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  try {
    // 1. Responsive Matrix across all 9 viewports on Orders Grid
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        hasTouch: vp.touch,
      });
      const page = await context.newPage();
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(`[${vp.name}] ${msg.text()}`);
      });
      page.on('pageerror', (err) => {
        pageErrors.push(`[${vp.name}] ${err.message}`);
      });
      page.on('response', (res) => {
        if (res.status() >= 400 && !res.url().includes('/api/admin/workspace')) {
          failedRequests.push(`[${vp.name}] ${res.status()} ${res.url()}`);
        }
      });

      await navigateToOrdersGrid(page);

      const vpMetrics = await page.evaluate((isMobileWidth) => {
        const overflowX = document.documentElement.scrollWidth - window.innerWidth;
        const smallInputs = [];
        if (isMobileWidth) {
          document
            .querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), select, textarea')
            .forEach((el) => {
              const rect = el.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                const fs = parseFloat(getComputedStyle(el).fontSize);
                if (fs < 16) smallInputs.push({ tag: el.tagName, fs });
              }
            });
        }
        return { overflowX, smallInputs };
      }, vp.width <= 900);

      assert.ok(
        vpMetrics.overflowX <= 1,
        `[${vp.name}] Horizontal overflow on Orders Grid: ${vpMetrics.overflowX}px`,
      );
      assert.deepEqual(
        vpMetrics.smallInputs,
        [],
        `[${vp.name}] Inputs/selects with font-size < 16px (causes iOS auto-zoom): ${JSON.stringify(vpMetrics.smallInputs)}`,
      );

      console.log(`PASS viewport ${vp.name} (${vp.width}x${vp.height}): overflow=${vpMetrics.overflowX}px`);
      await context.close();
    }

    // 2. Deep E2E + Banner-Clip + Axe WCAG 2.1 AA across ALL 5 surfaces (Desktop 1440x900)
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(`[desktop-e2e] ${msg.text()}`);
      });
      page.on('pageerror', (err) => pageErrors.push(`[desktop-e2e] ${err.message}`));

      await navigateToOrdersGrid(page);

      // Surface 1: Orders Grid Axe + Search/XSS + Filters
      await runAxeAudit(page, 'Orders Grid (1440x900)');
      console.log('PASS Axe WCAG 2.1 AA: Orders Grid');

      const searchInput = page
        .locator('input[type="search"], input[placeholder*="Search order" i], input[placeholder*="অর্ডার" i]')
        .first();
      await searchInput.fill('<script>window.__xssFired=true</script>');
      await page.waitForTimeout(200);
      const xssFired = await page.evaluate(() => Boolean(window.__xssFired));
      assert.equal(xssFired, false, 'XSS probe in Orders search must never execute');
      await searchInput.fill('');
      await page.waitForTimeout(200);

      // Surface 2: Order Details + Step 1 Advance Form
      await page.locator('table tbody button').filter({ hasText: /^Details$|^বিস্তারিত$/i }).first().click();
      await checkSheetGeometryAndBanner(page, 'Order Details (1440x900)');
      const recordAdvanceBtn = page.locator('button').filter({ hasText: /Record Advance|অগ্রিম যুক্ত/i }).first();
      if (await recordAdvanceBtn.isVisible().catch(() => false)) {
        await recordAdvanceBtn.click();
        await page.waitForTimeout(200);
      }
      await runAxeAudit(page, 'Order Details & Advance Hub (1440x900)');
      console.log('PASS Banner + Axe WCAG 2.1 AA: Order Details & 2-Step Advance Hub');
      await closeActiveSheet(page);

      // Surface 3: Edit Courier & Tracking Link Sheet + URL XSS Defense
      const editCourierBtn = page.locator('table tbody button[title*="Edit courier" i], table tbody button[title*="কুরিয়ার" i]').first();
      await editCourierBtn.click();
      await checkSheetGeometryAndBanner(page, 'Edit Courier & Tracking Link (1440x900)');
      await runAxeAudit(page, 'Edit Courier & Tracking Link (1440x900)');

      const urlInput = page.locator('#dispatch-tracking-url');
      await urlInput.fill('javascript:alert(1)');
      await page.locator('button').filter({ hasText: /Save Changes|সংরক্ষণ করুন/i }).first().click();
      await page.locator('[role="alert"]').first().waitFor({ state: 'visible', timeout: 5000 });
      const unsafeHrefCount = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href]')).filter((a) =>
          (a.getAttribute('href') || '').trim().toLowerCase().startsWith('javascript:'),
        ).length,
      );
      assert.equal(unsafeHrefCount, 0, 'Rendered DOM must never contain javascript: href');
      console.log('PASS Banner + Axe + URL XSS guard: Edit Courier & Tracking Link');
      await closeActiveSheet(page);

      // Surface 4: Courier Bulk CSV Export & Auto-Sync Studio
      await page.locator('button').filter({ hasText: /Courier CSV|কুরিয়ার CSV/i }).first().click();
      await checkSheetGeometryAndBanner(page, 'Courier Bulk CSV Studio (1440x900)');
      // Verify blocked couriers removed from dropdown
      const courierOptions = await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('[data-vaul-drawer] select, [role="dialog"] select'));
        return selects.flatMap((s) => Array.from(s.options).map((o) => o.value));
      });
      assert.ok(!courierOptions.includes('redx'), 'Blocked redx option must not exist in Courier Bulk CSV');
      assert.ok(!courierOptions.includes('sundarban'), 'Non-canonical sundarban option must not exist in Courier Bulk CSV');
      assert.ok(courierOptions.includes('manual'), 'Custom Courier (manual) option must exist in Courier Bulk CSV');

      await runAxeAudit(page, 'Courier Bulk CSV Studio (1440x900)');
      // Switch format tabs Pathao -> Steadfast -> BD Post
      await page.locator('button').filter({ hasText: /Steadfast Courier/i }).first().click();
      await page.waitForTimeout(150);
      await page.locator('button').filter({ hasText: /Bangladesh Post/i }).first().click();
      await page.waitForTimeout(150);
      console.log('PASS Banner + Axe + Canonical Providers: Courier Bulk CSV Studio');
      await closeActiveSheet(page);

      // Surface 5: Order Print Preview Sheet
      await page.locator('table tbody button[aria-label*="print" i], table tbody button[aria-label*="প্রিন্ট" i]').first().click();
      await checkSheetGeometryAndBanner(page, 'Order Print Preview (1440x900)');
      await page.locator('.print-slips').first().waitFor({ state: 'visible', timeout: 10000 });
      await runAxeAudit(page, 'Order Print Preview A4 (1440x900)');
      await page.locator('button').filter({ hasText: /Thermal|থার্মাল/i }).first().click();
      await page.waitForTimeout(250);
      await runAxeAudit(page, 'Order Print Preview 4x6 Thermal (1440x900)');
      console.log('PASS Banner + Axe (A4 + 4x6 Thermal): Order Print Preview');
      await closeActiveSheet(page);

      await context.close();
    }

    // 3. Mobile 390x844 Sheet Banner-Clip & Touch Verification
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
      const page = await context.newPage();
      await navigateToOrdersGrid(page);

      // Open Details Sheet on mobile
      await page.locator('article button').filter({ hasText: /^Details$|^বিস্তারিত$/i }).first().click();
      await checkSheetGeometryAndBanner(page, 'Order Details (mobile-390)');
      await closeActiveSheet(page);

      // Open Print Preview Sheet on mobile
      await page.locator('article button[aria-label*="Print" i], article button[aria-label*="প্রিন্ট" i]').first().click();
      await checkSheetGeometryAndBanner(page, 'Order Print Preview (mobile-390)');
      await closeActiveSheet(page);

      // Open Courier CSV Sheet on mobile
      await page.locator('button').filter({ hasText: /Courier CSV|কুরিয়ার CSV/i }).first().click();
      await checkSheetGeometryAndBanner(page, 'Courier Bulk CSV (mobile-390)');
      await closeActiveSheet(page);

      console.log('PASS Mobile 390x844 bottom-sheet geometry & banner clearance');
      await context.close();
    }

    assert.deepEqual(consoleErrors, [], `Unexpected console errors:\n${consoleErrors.join('\n')}`);
    assert.deepEqual(pageErrors, [], `Unexpected page errors:\n${pageErrors.join('\n')}`);
    assert.deepEqual(failedRequests, [], `Unexpected failed network requests:\n${failedRequests.join('\n')}`);

    console.log('\nALL ADMIN ORDERS BROWSER, RESPONSIVE, BANNER-CLIP & AXE CHECKS PASSED!');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
