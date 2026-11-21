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

async function navigateToPrintEngine(page, isMobile) {
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  if (isMobile) {
    const mobileNavPrint = page.locator('nav button', { hasText: /Print|প্রিন্ট/i }).first();
    if (await mobileNavPrint.isVisible().catch(() => false)) {
      await mobileNavPrint.click();
      await page.waitForTimeout(450);
      return;
    }
  }

  let sidebarPrint = page.locator('aside button', { hasText: /Print & Invoice|প্রিন্ট ও ইনভয়েস/i }).first();
  if (!(await sidebarPrint.isVisible().catch(() => false))) {
    await openSidebarIfCollapsed(page);
  }
  if (!(await sidebarPrint.isVisible().catch(() => false))) {
    const groupBtn = page.locator('aside button', { hasText: /Orders & Delivery|অর্ডার ও ডেলিভারি/i }).first();
    if (await groupBtn.isVisible().catch(() => false)) {
      await groupBtn.click();
      await page.waitForTimeout(250);
    }
  }
  await sidebarPrint.waitFor({ state: 'visible', timeout: 10000 });
  await sidebarPrint.click();
  await page.waitForTimeout(600);
}

async function navigateToOrdersGrid(page, isMobile) {
  if (isMobile) {
    const mobileNavOrders = page.locator('nav button', { hasText: /^Orders$|^অর্ডার$/i }).first();
    if (await mobileNavOrders.isVisible().catch(() => false)) {
      await mobileNavOrders.click();
      await page.waitForTimeout(450);
      return;
    }
  }
  const ordersBtn = page.locator('aside button', { hasText: /Orders Grid|অর্ডার গ্রিড/i }).first();
  if (!(await ordersBtn.isVisible().catch(() => false))) {
    await openSidebarIfCollapsed(page);
  }
  if (!(await ordersBtn.isVisible().catch(() => false))) {
    const groupBtn = page.locator('aside button', { hasText: /Orders & Delivery|অর্ডার ও ডেলিভারি/i }).first();
    if (await groupBtn.isVisible().catch(() => false)) {
      await groupBtn.click();
      await page.waitForTimeout(250);
    }
  }
  await ordersBtn.waitFor({ state: 'visible', timeout: 10000 });
  await ordersBtn.click();
  await page.waitForTimeout(500);
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

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
  });
  const failures = [];

  try {
    // 1. 9-viewport responsive, overflow, mobile input font-size, and zero-error audit
    console.log('1) Responsive 9-viewport sweep on Print Engine & Invoice Studio...');
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

      await navigateToPrintEngine(page, vp.mobile);
      await page.locator('main h1', { hasText: /Print Engine|প্রিন্ট ইঞ্জিন/i }).first().waitFor({ timeout: 10000 });

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
            if (fs < 15.9) smallInputs.push({ tag: el.tagName, fs });
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
        `  [${metrics.overflowPx === 0 && metrics.smallInputs.length === 0 && errors.length === 0 ? 'PASS' : 'FAIL'}] ${vp.name}: overflow=${metrics.overflowPx}px, smallInputs=${metrics.smallInputs.length}, errors=${errors.length}`
      );
      await context.close();
    }

    // 2. Desktop Functional + Axe WCAG 2.1 AA across all 3 Print Engine tabs + Print Preview drawer
    console.log('2) Desktop 1440x900 Functional + Axe WCAG 2.1 AA checks...');
    const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await desktopCtx.newPage();
    await navigateToPrintEngine(page, false);
    await page.locator('main h1', { hasText: /Print Engine|প্রিন্ট ইঞ্জিন/i }).first().waitFor({ timeout: 10000 });

    // Tab 1: Print Queue
    await runAxe(page, 'print-queue-a4');

    // Verify spacing bug fix ("2 selected", NOT "2selected")
    const queueText = await page.locator('[role="tabpanel"]').innerText();
    if (/\dselected/i.test(queueText)) {
      failures.push('Print Queue still renders missing space ("Nselected")');
    } else {
      console.log('  [PASS] Selection counter spacing verified (no "Nselected")');
    }

    // Switch to 4x6 Thermal & run Axe
    const layoutSelect = page.locator('select[id$="-queue-layout"]');
    await layoutSelect.selectOption('thermal_4x6');
    await page.waitForTimeout(300);
    await runAxe(page, 'print-queue-thermal-4x6');
    await layoutSelect.selectOption('a4_3part');
    await page.waitForTimeout(250);

    // Search XSS probe + Clear filters recovery
    const searchInput = page.locator('input[id$="-queue-search"]');
    await searchInput.fill('<img src=x onerror=alert(1)>');
    await page.waitForTimeout(250);
    const hasEmptyCard = await page.locator('button', { hasText: /Clear filters|ফিল্টার রিসেট/i }).isVisible();
    if (!hasEmptyCard) {
      failures.push('Print Queue did not show empty state + Clear filters button on unmatched search');
    } else {
      await page.locator('button', { hasText: /Clear filters|ফিল্টার রিসেট/i }).click();
      await page.waitForTimeout(250);
      console.log('  [PASS] Search XSS probe inert + empty state & Clear filters verified');
    }

    // Tab 2: Template Settings
    await page.locator('[role="tab"]', { hasText: /Template settings|টেম্পলেট সেটিংস/i }).click();
    await page.waitForTimeout(300);
    await runAxe(page, 'template-settings');

    // Check footer terms input spans full width (> 500px on 1440px screen)
    const footerWidth = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('form input[maxlength="300"]'));
      return inputs[0] ? Math.round(inputs[0].getBoundingClientRect().width) : 0;
    });
    if (footerWidth < 500) {
      failures.push(`Template Settings footer input is still narrow (${footerWidth}px)`);
    } else {
      console.log(`  [PASS] Template Settings footer input spans full width (${footerWidth}px)`);
    }

    // Tab 3: Print History
    await page.locator('[role="tab"]', { hasText: /Print history|প্রিন্ট ইতিহাস/i }).click();
    await page.waitForTimeout(300);
    await runAxe(page, 'print-history');
    const historyText = await page.locator('[role="tabpanel"]').innerText();
    const hasEmptyOrRecords =
      /No print requests recorded yet|এখনো কোনো প্রিন্ট রেকর্ড নেই|print request|প্রিন্ট অনুরোধ/i.test(
        historyText
      );
    if (!hasEmptyOrRecords) {
      failures.push('Print History rendered blank without empty state or records');
    } else {
      console.log('  [PASS] Print History empty state / audit rows verified');
    }

    // 3. Connected Admin Orders Print Preview Drawer + Open Print Engine handoff
    console.log('3) Connected Admin Orders Print Preview drawer + handoff...');
    await navigateToOrdersGrid(page, false);
    const printBtn = page
      .locator('table tbody button[aria-label*="print" i], table tbody button[aria-label*="প্রিন্ট" i]')
      .first();
    await printBtn.waitFor({ state: 'visible', timeout: 10000 });
    await printBtn.click();
    const drawer = page.locator('[data-vaul-drawer], [role="dialog"]').last();
    await drawer.waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('.print-slips').first().waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(350);
    await runAxe(page, 'orders-print-preview-drawer');

    const bannerCheck = await page.evaluate(() => {
      const banner = document.querySelector('body > [role="status"]');
      const dialogs = Array.from(document.querySelectorAll('[data-vaul-drawer], [role="dialog"]'));
      const dialog = dialogs[dialogs.length - 1];
      if (!dialog) return { ok: false, reason: 'no-dialog' };
      if (!banner) return { ok: true, reason: 'no-banner' };
      const b = banner.getBoundingClientRect();
      const d = dialog.getBoundingClientRect();
      return { ok: d.top >= b.bottom - 1, bannerBottom: Math.round(b.bottom), dialogTop: Math.round(d.top) };
    });
    if (!bannerCheck.ok) {
      failures.push(`Orders Print Preview drawer clipped by banner: ${JSON.stringify(bannerCheck)}`);
    } else {
      console.log(`  [PASS] Orders Print Preview drawer banner clearance OK (${JSON.stringify(bannerCheck)})`);
    }

    // Handoff to Print Engine via "Open Print Engine"
    const openEngineBtn = drawer
      .locator('button', { hasText: /Open Print Engine|প্রিন্ট ইঞ্জিনে খুলুন/i })
      .first();
    await openEngineBtn.waitFor({ state: 'visible', timeout: 10000 });
    await openEngineBtn.click();
    await page.waitForTimeout(500);
    const backOnPrintEngine = await page.locator('main h1', { hasText: /Print Engine|প্রিন্ট ইঞ্জিন/i }).first().isVisible();
    if (!backOnPrintEngine) {
      failures.push('Open Print Engine handoff from OrderPrintPreviewSheet failed');
    } else {
      console.log('  [PASS] Open Print Engine handoff from OrderPrintPreviewSheet verified');
    }
    await desktopCtx.close();

    if (failures.length > 0) {
      console.error('\nFAILURES:\n - ' + failures.join('\n - '));
      process.exitCode = 1;
    } else {
      console.log('\nALL PRINT ENGINE BROWSER, RESPONSIVE & AXE CHECKS PASSED!');
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
