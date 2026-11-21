import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const CHROME_PATH =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell';

const VIEWPORTS = [
  { name: '360x800', width: 360, height: 800, mobile: true },
  { name: '390x844', width: 390, height: 844, mobile: true },
  { name: '430x932', width: 430, height: 932, mobile: true },
  { name: '844x390-landscape', width: 844, height: 390, mobile: true },
  { name: '768x1024', width: 768, height: 1024, mobile: false },
  { name: '1024x768', width: 1024, height: 768, mobile: false },
  { name: '1280x800', width: 1280, height: 800, mobile: false },
  { name: '1440x900', width: 1440, height: 900, mobile: false },
  { name: '1920x1080', width: 1920, height: 1080, mobile: false },
];

async function openSidebarIfCollapsed(page) {
  const mobileMenuBtn = page
    .locator('header button[aria-label*="Sidebar" i], header button[aria-label*="মেনু" i]')
    .first();
  if (await mobileMenuBtn.isVisible().catch(() => false)) {
    await mobileMenuBtn.click();
    await page.waitForTimeout(250);
  }
}

async function navigateToProductStudio(page) {
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(450);

  let sidebarCatalogBtn = page
    .locator('aside button', { hasText: /Product Studio|প্রোডাক্ট স্টুডিও/i })
    .first();

  if (!(await sidebarCatalogBtn.isVisible().catch(() => false))) {
    await openSidebarIfCollapsed(page);
  }
  if (!(await sidebarCatalogBtn.isVisible().catch(() => false))) {
    const groupBtn = page
      .locator('aside button', { hasText: /03\. Catalog|০৩\. ক্যাটালগ|Products & Catalog/i })
      .first();
    if (await groupBtn.isVisible().catch(() => false)) {
      await groupBtn.click();
      await page.waitForTimeout(250);
    }
  }
  await sidebarCatalogBtn.waitFor({ state: 'visible', timeout: 10000 });
  await sidebarCatalogBtn.click();
  await page
    .locator('main h1', { hasText: /Product & Category Studio|প্রোডাক্ট ও ক্যাটাগরি স্টুডিও/i })
    .first()
    .waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(350);
}

async function runAxe(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  if (results.violations.length > 0) {
    const summary = results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      count: v.nodes.length,
      sample: v.nodes.slice(0, 2).map((n) => n.target.join(' ')),
    }));
    throw new Error(`Axe violations on ${label}: ${JSON.stringify(summary, null, 2)}`);
  }
  console.log(`  [PASS] Axe WCAG 2.1 AA (${label}): 0 violations`);
}

async function checkDialogBannerClearance(page, label, failures) {
  const bannerCheck = await page.evaluate(() => {
    const banner = document.querySelector('body > [role="status"]');
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'));
    const dialog = dialogs[dialogs.length - 1];
    if (!dialog) return { ok: false, reason: 'no-dialog' };
    if (!banner) return { ok: true, reason: 'no-banner' };
    const b = banner.getBoundingClientRect();
    const d = dialog.getBoundingClientRect();
    return {
      ok: d.top >= b.bottom - 1,
      bannerBottom: Math.round(b.bottom),
      dialogTop: Math.round(d.top),
    };
  });
  if (!bannerCheck.ok) {
    failures.push(`${label} clipped by sticky preview banner: ${JSON.stringify(bannerCheck)}`);
  } else {
    console.log(`  [PASS] ${label} banner clearance OK (${JSON.stringify(bannerCheck)})`);
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
  });
  const failures = [];

  try {
    // 1. 9-viewport responsive sweep
    console.log('1) Responsive 9-viewport sweep on Product & Category Studio...');
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await context.newPage();
      const errors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
      });
      page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
      page.on('response', (res) => {
        if (res.status() >= 400 && !res.url().includes('favicon')) {
          errors.push(`HTTP ${res.status()} ${res.url()}`);
        }
      });

      await navigateToProductStudio(page);

      const metrics = await page.evaluate(() => {
        const overflowPx = Math.max(
          0,
          Math.round(document.documentElement.scrollWidth - window.innerWidth)
        );
        const smallInputs = [];
        if (window.innerWidth <= 900) {
          document.querySelectorAll('input, select, textarea').forEach((el) => {
            const type = (el.getAttribute('type') || '').toLowerCase();
            if (['checkbox', 'radio', 'range', 'file', 'hidden'].includes(type)) return;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            const fs = parseFloat(getComputedStyle(el).fontSize);
            if (fs < 15.9) smallInputs.push({ tag: el.tagName, id: el.id, fs });
          });
        }
        return { overflowPx, smallInputs };
      });

      if (metrics.overflowPx > 0) {
        failures.push(`${vp.name}: horizontal overflow ${metrics.overflowPx}px`);
      }
      if (metrics.smallInputs.length > 0) {
        failures.push(`${vp.name}: mobile inputs < 16px: ${JSON.stringify(metrics.smallInputs)}`);
      }
      if (errors.length > 0) {
        failures.push(`${vp.name}: runtime errors: ${errors.join(' | ')}`);
      }
      console.log(
        `  [${
          metrics.overflowPx === 0 && metrics.smallInputs.length === 0 && errors.length === 0
            ? 'PASS'
            : 'FAIL'
        }] ${vp.name}: overflow=${metrics.overflowPx}px, smallInputs=${metrics.smallInputs.length}, errors=${errors.length}`
      );
      await context.close();
    }

    // 2. Desktop Functional, Modal & Axe WCAG 2.1 AA checks
    console.log('2) Desktop 1440x900 Functional, 4-Tab, CSV Import, and 4-Modal Axe checks...');
    const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await desktopCtx.newPage();
    let nativeDialogFired = false;
    page.on('dialog', async (d) => {
      nativeDialogFired = true;
      await d.dismiss();
    });

    await navigateToProductStudio(page);

    // Tab 1: All Products Catalog
    await runAxe(page, 'tab-all-products-catalog');

    const catalogText = await page.locator('[role="tabpanel"]').innerText();
    if (/\b1\s+variants\b/i.test(catalogText)) {
      failures.push('Catalog table still shows "1 variants" instead of singular "1 variant"');
    } else {
      console.log('  [PASS] Variant count pluralization verified (no "1 variants")');
    }

    // Search XSS probe + Clear filters recovery
    const searchInput = page.locator('input[id$="-filter-search"]');
    await searchInput.fill('<img src=x onerror=alert(1)>');
    await page.waitForTimeout(250);
    const clearBtn = page.locator('button', { hasText: /Clear filters|ফিল্টার রিসেট/i }).first();
    if (!(await clearBtn.isVisible())) {
      failures.push('Catalog empty filter state did not show Clear filters button');
    } else {
      await clearBtn.click();
      await page.waitForTimeout(250);
      console.log('  [PASS] Search XSS probe inert + Clear filters recovery verified');
    }

    // Collapsible CSV Import Panel
    const csvSummary = page.locator('summary', { hasText: /Import draft products from CSV|CSV থেকে ড্রাফট/i }).first();
    await csvSummary.click();
    await page.waitForTimeout(250);
    await runAxe(page, 'catalog-csv-import-expanded');
    await csvSummary.click();
    await page.waitForTimeout(200);

    // Modal 1: Product Editor on existing product
    const editProductBtn = page
      .locator('table tbody button[aria-label^="Edit "], table tbody button[aria-label*="এডিট করুন"]')
      .first();
    await editProductBtn.click();
    const editorDialog = page.locator('[role="dialog"]').last();
    await editorDialog.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(250);
    await checkDialogBannerClearance(page, 'Product Editor drawer', failures);
    await runAxe(page, 'modal-product-editor');

    const editorText = await editorDialog.innerText();
    if (/\bRevoke\b/.test(editorText)) {
      failures.push('Product Editor still shows mistranslated "Revoke" button');
    }
    if (!/Save Product & Variants|পণ্য ও ভ্যারিয়েন্ট সংরক্ষণ/i.test(editorText)) {
      failures.push('Product Editor save button copy missing or unlocalized');
    }
    const existingStockReadOnly = await editorDialog
      .locator('input[id$="-stock"]')
      .first()
      .evaluate((el) => el.hasAttribute('readonly'));
    if (!existingStockReadOnly) {
      failures.push('Existing variant stock input in Product Editor is not read-only');
    } else {
      console.log('  [PASS] Existing variant stock input is read-only with audit hint');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Modal 2: Product Linkage Snapshot
    const linkageBtn = page
      .locator('table tbody button[aria-label*="linkage" i], table tbody button[aria-label*="সংযোগের তথ্য"]')
      .first();
    await linkageBtn.click();
    const linkageDialog = page.locator('[role="dialog"]').last();
    await linkageDialog.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(200);
    await checkDialogBannerClearance(page, 'Product Linkage Snapshot modal', failures);
    await runAxe(page, 'modal-product-linkage');
    const linkageText = await linkageDialog.innerText();
    if (!/Vendor ID:/i.test(linkageText) || !/Category ID:/i.test(linkageText)) {
      failures.push('Product Linkage Snapshot missing vendor/category details');
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Modal 3: Archive Confirmation Dialog (must NOT trigger window.confirm)
    const archiveBtn = page
      .locator('table tbody button[aria-label^="Archive "], table tbody button[aria-label*="আর্কাইভ করুন"]')
      .first();
    await archiveBtn.click();
    const archiveDialog = page.locator('[role="dialog"]').last();
    await archiveDialog.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(200);
    await checkDialogBannerClearance(page, 'Archive Confirmation modal', failures);
    await runAxe(page, 'modal-archive-confirm');
    if (nativeDialogFired) {
      failures.push('Native window.confirm/alert dialog was triggered during Archive click');
    } else {
      console.log('  [PASS] Inline Archive Confirmation dialog opened with zero native confirm/alert');
    }
    await archiveDialog.locator('button', { hasText: /^Cancel$|^বাতিল$/i }).first().click();
    await page.waitForTimeout(200);

    // Tab 2: Category Manager + Modal 4: Create/Edit Category
    await page.locator('[role="tab"]', { hasText: /Category Manager|ক্যাটাগরি ম্যানেজার/i }).click();
    await page.waitForTimeout(250);
    await runAxe(page, 'tab-category-manager');

    await page.locator('button', { hasText: /New Category|নতুন ক্যাটাগরি/i }).first().click();
    const catDialog = page.locator('[role="dialog"]').last();
    await catDialog.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(200);
    await checkDialogBannerClearance(page, 'Category modal', failures);
    await runAxe(page, 'modal-category-editor');
    const catText = await catDialog.innerText();
    if (/\bCancelled\b/.test(catText)) {
      failures.push('Category modal still shows mistranslated "Cancelled" button');
    }
    await catDialog.locator('button', { hasText: /^Cancel$|^বাতিল$/i }).first().click();
    await page.waitForTimeout(200);

    // Tab 3: Review Moderation
    await page.locator('[role="tab"]', { hasText: /Review Moderation|রিভিউ মডারেশন/i }).click();
    await page.waitForTimeout(250);
    await runAxe(page, 'tab-review-moderation');

    // Tab 4: Product Linkage Review
    await page.locator('[role="tab"]', { hasText: /Product Linkage Review|পণ্য সংযোগ পর্যালোচনা/i }).click();
    await page.waitForTimeout(250);
    await runAxe(page, 'tab-product-linkage-review');

    await desktopCtx.close();

    if (failures.length > 0) {
      console.error('\nFAILURES:\n - ' + failures.join('\n - '));
      process.exitCode = 1;
    } else {
      console.log('\nALL PRODUCT & CATEGORY STUDIO BROWSER, RESPONSIVE & AXE CHECKS PASSED!');
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
