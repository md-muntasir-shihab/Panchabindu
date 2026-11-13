import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CATALOG_IMPORT_COLUMNS, parseCatalogCsv, planCatalogImport, commitCatalogImport } from './catalog-import';
import { getActorSecurityContext } from '../admin/phase4a-service';
import { readPhase4BStore } from '../admin/phase4b-service';
import { readErpState } from '../db/repository';
import { withRuntimePersistence } from '../db/runtime-persistence';

test('CSV parsing respects quoted commas and newlines and rejects unclosed or excessive input', () => {
  assert.deepEqual(parseCatalogCsv('name,description\n"A, B","line 1\nline 2"'), [['name', 'description'], ['A, B', 'line 1\nline 2']]);
  assert.deepEqual(parseCatalogCsv('name\n"a""b"'), [['name'], ['a"b']]);
  assert.throws(() => parseCatalogCsv('name\n"unclosed'), /INVALID_CSV/);
  assert.throws(() => parseCatalogCsv('name\n"closed"extra'), /INVALID_CSV/);
  assert.throws(() => parseCatalogCsv('name\n' + 'x\n'.repeat(201)), /ROW_LIMIT/);
});

test('catalog import requires a current preview, rejects duplicates and creates drafts without invented stock', async () => {
  const state = readErpState();
  const vendor = readPhase4BStore().vendors.find(vendor => vendor.status === 'active')!;
  const actor = getActorSecurityContext('usr-super-admin')!;
  const originalFile = fs.readFileSync('.data/erp-store.json', 'utf8');
  const csv = CATALOG_IMPORT_COLUMNS.join(',') + '\n' + [vendor.vendorId, state.categories[0].id,
    'সিনথেটিক পণ্য', 'Synthetic import product', 'SYNTHETIC-CSV-01', 'লাল', 'Red', '100.25', '20.50', '150.99', '500'].join(',');
  const preview = planCatalogImport(csv, actor.userId);
  assert.equal(preview.errors.length, 0);
  assert.equal(fs.readFileSync('.data/erp-store.json', 'utf8'), originalFile);
  assert.throws(() => commitCatalogImport(actor, csv, 'invalid'), /REVIEW_REQUIRED/);
  const result = await withRuntimePersistence(() => commitCatalogImport(actor, csv, preview.previewHash));
  assert.equal(result.imported, 1);
  const product = readErpState().products.find(product => product.productId === result.productIds[0])!;
  assert.equal(product.status, 'draft');
  assert.equal(product.variants[0].stockAvailable, 0);
  assert.equal(product.variants[0].supplierCostPoisha, 10025);
  assert.equal(product.variants[0].supplierPayablePoisha, 12075);
  assert.equal(product.variants[0].salePricePoisha, 15099);
  assert.equal(planCatalogImport(csv, actor.userId).errors[0].code, 'DUPLICATE_CATALOG_ITEM');
  assert.throws(() => commitCatalogImport({ ...actor, roleSlug: 'vendor' }, csv, preview.previewHash), /FORBIDDEN/);
});
