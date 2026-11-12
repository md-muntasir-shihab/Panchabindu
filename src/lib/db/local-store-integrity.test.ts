import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readLocalJsonStore, writeLocalJsonStore } from './local-json-store';

function fixture(run: (directory: string) => void): void {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'panchagarh-integrity-'));
  try { run(directory); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

// Every business-module test runs in its own empty working directory. Never read source .data/.env.
function inChild(code: string): void {
  fixture((directory) => {
    const names = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP'];
    const env: NodeJS.ProcessEnv = {
      ...Object.fromEntries(names.filter((name) => process.env[name]).map((name) => [name, process.env[name]])),
      NODE_ENV: 'test', CREDENTIALS_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
    };
    const result = spawnSync(process.execPath, ['-e', code], {
      cwd: directory, env, encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
  });
}

const moduleUrl = (relative: string) => JSON.stringify(new URL(relative, import.meta.url).href);

test('local storage distinguishes a missing file from invalid or incomplete existing data', () => {
  fixture((directory) => {
    const file = path.join(directory, 'store.json');
    const shape = { arrays: ['rows'], objects: ['settings'], booleans: ['enabled'], optionalArrays: ['history'] };
    assert.equal(readLocalJsonStore(file, shape), null);
    for (const raw of ['{broken', 'null', '[]', '{}', '{"rows":[],"settings":{},"enabled":true,"history":null}']) {
      fs.writeFileSync(file, raw);
      assert.throws(() => readLocalJsonStore(file, shape), /LOCAL_STORE_INVALID/);
      assert.equal(fs.readFileSync(file, 'utf8'), raw);
    }
    fs.mkdirSync(path.join(directory, 'unreadable.json'));
    assert.throws(() => readLocalJsonStore(path.join(directory, 'unreadable.json'), shape), /LOCAL_STORE_READ_FAILED/);
  });
});

test('local writes replace complete files, propagate failure and preserve prior data', () => {
  fixture((directory) => {
    const file = path.join(directory, 'store.json');
    writeLocalJsonStore(file, { rows: ['original'] });
    const original = fs.readFileSync(file, 'utf8');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    assert.throws(() => writeLocalJsonStore(file, circular), /LOCAL_STORE_WRITE_FAILED/);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
    const blocked = path.join(directory, 'blocked.json');
    fs.mkdirSync(blocked);
    fs.writeFileSync(path.join(blocked, 'keep.txt'), 'keep');
    assert.throws(() => writeLocalJsonStore(blocked, { rows: [] }), /LOCAL_STORE_WRITE_FAILED/);
    assert.equal(fs.readFileSync(path.join(blocked, 'keep.txt'), 'utf8'), 'keep');
    assert.equal(fs.readdirSync(directory).some((name) => name.includes('.tmp-')), false);
    writeLocalJsonStore(file, { rows: ['replacement'] });
    assert.deepEqual(readLocalJsonStore(file, { arrays: ['rows'] }), { rows: ['replacement'] });
  });
});

const stores = [
  ['../admin/phase4b-service.ts', 'readPhase4BStore', 'writePhase4BStore', 'erp-phase4b-store.json'],
  ['../admin/phase4c-service.ts', 'readPhase4CStore', 'writePhase4CStore', 'erp-phase4c-store.json'],
  ['../admin/phase6-service.ts', 'readPhase6Store', 'writePhase6Store', 'erp-phase6-store.json'],
  ['../admin/phase7-service.ts', 'readPhase7Store', 'writePhase7Store', 'erp-phase7-store.json'],
  ['../finance/phase4-general-ledger-engine.ts', 'readPhase4GLStore', 'writePhase4GLStore', 'erp-phase4-gl-store.json'],
  ['../inventory/phase3-inventory-order-engine.ts', 'readPhase3Store', 'writePhase3Store', 'erp-phase3-store.json'],
  ['../courier/phase5-courier-notification-engine.ts', 'readPhase5Store', 'writePhase5Store', 'erp-phase5-courier-notif-store.json'],
  ['./repository.ts', 'readErpState', 'writeErpState', 'erp-store.json'],
] as const;

for (const [module, read, write, filename] of stores) {
  test(`${read}: corrupt/partial files fail closed; production read/write cannot initialize data`, () => {
    inChild(`
      const assert = (await import('node:assert/strict')).default;
      const fs = await import('node:fs');
      const service = await import(${moduleUrl(module)});
      fs.mkdirSync('.data');
      const file = '.data/${filename}';
      for (const raw of ['{broken', '{}', 'null', '[]']) {
        fs.writeFileSync(file, raw);
        assert.throws(() => service.${read}(), /LOCAL_STORE_INVALID/);
        assert.equal(fs.readFileSync(file, 'utf8'), raw);
      }
      fs.unlinkSync(file);
      fs.rmdirSync('.data');
      process.env.NODE_ENV = 'production';
      assert.throws(() => service.${read}(), /PRODUCTION_PERSISTENCE_GUARD/);
      assert.throws(() => service.${write}({}), /PRODUCTION_PERSISTENCE_GUARD/);
      assert.equal(fs.existsSync('.data'), false);
    `);
  });
}

test('ERP reads preserve valid snapshots and never silently repair invalid historical money', () => {
  inChild(`
    const assert = (await import('node:assert/strict')).default;
    const fs = await import('node:fs');
    const repository = await import(${moduleUrl('./repository.ts')});
    const state = repository.readErpState();
    const file = '.data/erp-store.json';
    const original = fs.readFileSync(file, 'utf8');
    repository.readErpState();
    assert.equal(fs.readFileSync(file, 'utf8'), original);
    const valid = JSON.parse(original);
    for (const field of ['snapSupplierPayablePoisha', 'snapUnitSalePricePoisha', 'lineSubtotalPoisha']) {
      const invalid = structuredClone(valid);
      invalid.orderLines[0][field] += 1;
      const raw = JSON.stringify(invalid);
      fs.writeFileSync(file, raw);
      assert.throws(() => repository.readErpState(), /ORDER_PRICE_SNAPSHOT_INVALID/);
      assert.equal(fs.readFileSync(file, 'utf8'), raw);
    }
    delete state.orders[0].secureTrackingToken;
    delete state.manualBkashSubmissions;
    repository.writeErpState(state);
    const legacy = fs.readFileSync(file, 'utf8');
    const reread = repository.readErpState();
    assert.equal(reread.orders[0].secureTrackingToken, undefined);
    assert.deepEqual(reread.manualBkashSubmissions, []);
    assert.equal(fs.readFileSync(file, 'utf8'), legacy);
  `);
});

test('legacy phase7 optional collections do not fabricate offers, refunds or reversal records', () => {
  inChild(`
    const assert = (await import('node:assert/strict')).default;
    const fs = await import('node:fs');
    const service = await import(${moduleUrl('../admin/phase7-service.ts')});
    fs.mkdirSync('.data');
    const raw = JSON.stringify({ consignmentLots: [], priceProposals: [], flashCampaigns: [], maturityBatches: [] });
    fs.writeFileSync('.data/erp-phase7-store.json', raw);
    const state = service.readPhase7Store();
    for (const key of ['supplierProductOffers', 'fulfillmentGroups', 'ledgerReversals', 'customerRefunds']) {
      assert.deepEqual(state[key], []);
    }
    assert.equal(fs.readFileSync('.data/erp-phase7-store.json', 'utf8'), raw);
  `);
});

test('admin order price edits preserve contracted payable, reconcile margin and reject invented variants', () => {
  inChild(`
    const assert = (await import('node:assert/strict')).default;
    const fs = await import('node:fs');
    const repository = await import(${moduleUrl('./repository.ts')});
    const service = await import(${moduleUrl('../admin/phase4a-service.ts')});
    const state = repository.readErpState();
    const order = state.orders[0];
    const line = state.orderLines.find((entry) => entry.orderId === order.id);
    const product = state.products.find((entry) => entry.productId === line.productId);
    const variant = product.variants.find((entry) => entry.variantId === line.variantId);
    variant.supplierCostPoisha += 1000;
    variant.supplierPayablePoisha += 1000;
    variant.salePricePoisha += 1000;
    repository.writeErpState(state);
    const actor = service.getActorSecurityContext('usr-super-admin');
    const payload = {
      ...order, discountPoisha: 0, deliveryChargePoisha: 6000, advancePaidPoisha: 0,
      paymentMethod: 'cod', paymentStatus: 'unpaid', status: 'pending_confirmation',
      items: [{ variantId: line.variantId, quantity: 1, unitSalePricePoisha: 239000 }],
    };
    const result = service.updateFullOrderDetails(actor, payload);
    assert.equal(result.success, true);
    const updated = repository.readErpState().orderLines.find((entry) => entry.orderId === order.id);
    assert.equal(updated.snapSupplierPayablePoisha, line.snapSupplierPayablePoisha);
    assert.equal(updated.snapSupplierCostPoisha, line.snapSupplierCostPoisha);
    assert.equal(updated.snapSupplierProfitPoisha, line.snapSupplierProfitPoisha);
    assert.equal(updated.snapPlatformMarginPoisha, 239000 - line.snapSupplierPayablePoisha);
    const persisted = fs.readFileSync('.data/erp-store.json', 'utf8');
    for (const item of [
      { variantId: 'unknown-variant', quantity: 1 },
      { variantId: line.variantId, quantity: 1.5 },
      { variantId: line.variantId, quantity: 1, unitSalePricePoisha: 239000.5 },
      { variantId: line.variantId, quantity: 1, unitSalePricePoisha: line.snapSupplierPayablePoisha - 1 },
    ]) {
      assert.equal(service.updateFullOrderDetails(actor, { ...payload, items: [item] }).success, false);
      assert.equal(fs.readFileSync('.data/erp-store.json', 'utf8'), persisted);
    }
    assert.equal(service.updateFullOrderDetails({ ...actor, roleSlug: 'marketing_manager' }, payload).success, false);
    assert.equal(fs.readFileSync('.data/erp-store.json', 'utf8'), persisted);
  `);
});

test('integrity test module paths point at real source files', () => {
  for (const [relative] of stores) assert.equal(fs.existsSync(fileURLToPath(new URL(relative, import.meta.url))), true);
});