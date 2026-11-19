import assert from 'node:assert/strict';
import test from 'node:test';

import { BD_DISTRICTS, BD_UPAZILAS, getThanasByDistrict } from '../geo/bd-geocode';
import {
  resolveGeoCourierDefaults,
  resolveDefaultPostCode,
  getPathaoCities,
  getPathaoZonesByCity,
  getPathaoAreasByZone,
  isValidBdPostCode,
} from '../geo/bd-courier-geo';
import {
  evaluateOrderCourierReadiness,
  buildCourierBulkExportBundle,
  escapeCsvCell,
  PATHAO_CSV_HEADERS,
  STEADFAST_CSV_HEADERS,
  BD_POST_CSV_HEADERS,
} from './bulk-csv-exporter';
import {
  readErpState,
  writeErpState,
  getCustomerDefaultProfileByPhone,
} from '../db/repository';
import fs from 'node:fs';
import {
  getActorSecurityContext,
  updateOrderCourierMeta,
  autoSyncOrdersCourierGeo,
  getSanitizedOrdersForActor,
} from '../admin/phase4a-service';
import { WORKSPACE_ACTIONS } from '../security/workspace-policy';
import {
  generateBulkCourierBookingCsv,
  generateCourierBulkExport,
} from '../admin/phase6-service';

test('All 64 districts and 607 upazilas resolve valid 4-digit postCode, recipientCity, and recipientZone', () => {
  assert.equal(BD_DISTRICTS.length, 64);
  assert.equal(BD_UPAZILAS.length, 607);

  for (const d of BD_DISTRICTS) {
    const thanas = getThanasByDistrict(d.id);
    assert.ok(thanas.length > 0, `District ${d.name_en} must have thanas`);
    for (const u of thanas) {
      const resolved = resolveGeoCourierDefaults({
        districtId: d.id,
        upazilaId: u.id,
        streetAddress: 'House 12, Road 5, Block B',
      });
      assert.equal(
        isValidBdPostCode(resolved.postCode),
        true,
        `Invalid postCode ${resolved.postCode} for ${d.name_en} / ${u.name_en}`,
      );
      assert.ok(resolved.recipientCity.length >= 2, `Empty recipientCity for ${d.name_en}`);
      assert.ok(resolved.recipientZone.length >= 2, `Empty recipientZone for ${u.name_en}`);
    }
  }

  const cities = getPathaoCities();
  assert.ok(cities.includes('Dhaka'));
  assert.ok(cities.includes('Chattogram') || cities.includes('Chittagong'));
  const dhakaZones = getPathaoZonesByCity('Dhaka');
  assert.ok(dhakaZones.length > 10);
  const uttaraAreas = getPathaoAreasByZone('Dhaka', 'Uttara');
  assert.ok(uttaraAreas.length > 0);
  const dhakaDist = BD_DISTRICTS.find((d) => d.name_en === 'Dhaka')!;
  const uttaraUpz = getThanasByDistrict(dhakaDist.id).find((u) =>
    u.name_en.toLowerCase().includes('uttara')
  )!;
  assert.equal(resolveDefaultPostCode(dhakaDist.id, uttaraUpz.id), '1230');
});

test('Pathao 14-column, Steadfast 6-column, and BD Post 18-column CSV schemas & formula-injection escaping', () => {
  const erp = readErpState();

  // Formula injection check: strings starting with =, +, -, @ are prefixed with ', numbers stay clean
  assert.equal(escapeCsvCell('=SUM(A1:A2)'), '"\'=SUM(A1:A2)"');
  assert.equal(escapeCsvCell('+8801711000000'), '"\'+8801711000000"');
  assert.equal(escapeCsvCell('0.5'), '0.5');
  assert.equal(escapeCsvCell(1000), '1000');

  // Export Pathao CSV with forceExportFlagged = true
  const pathaoResult = buildCourierBulkExportBundle({
    orders: erp.orders,
    orderLines: erp.orderLines,
    products: erp.products,
    siteSettings: erp.siteSettings,
    format: 'pathao',
    statuses: ['pending_confirmation', 'confirmed', 'packed', 'shipped', 'delivered'],
    forceExportFlagged: true,
    storeNameOverride: 'Panchabindu Main Store',
  });

  assert.deepEqual(pathaoResult.headers, [...PATHAO_CSV_HEADERS]);
  assert.ok(pathaoResult.csvContent.startsWith('\uFEFFItemType,StoreName,MerchantOrderId,'));
  assert.ok(pathaoResult.previewRows.length > 0);
  for (const row of pathaoResult.previewRows) {
    assert.equal(row.values['StoreName'], 'Panchabindu Main Store');
    const weightNum = Number(row.values['ItemWeight']);
    assert.ok(weightNum >= 0.1 && weightNum <= 10, `Invalid weight ${row.values['ItemWeight']}`);
    const amountNum = Number(row.values['AmountToCollect(*)']);
    assert.ok(Number.isInteger(amountNum) && amountNum >= 0);
  }

  // Export Steadfast 6-column CSV
  const steadfastResult = buildCourierBulkExportBundle({
    orders: erp.orders,
    orderLines: erp.orderLines,
    products: erp.products,
    siteSettings: erp.siteSettings,
    format: 'steadfast',
    statuses: ['pending_confirmation', 'confirmed', 'packed', 'shipped', 'delivered'],
    forceExportFlagged: true,
  });
  assert.deepEqual(steadfastResult.headers, [...STEADFAST_CSV_HEADERS]);

  // Export BD Post 18-column CSV
  const bdPostResult = buildCourierBulkExportBundle({
    orders: erp.orders,
    orderLines: erp.orderLines,
    products: erp.products,
    siteSettings: erp.siteSettings,
    format: 'bd_post',
    statuses: ['pending_confirmation', 'confirmed', 'packed', 'shipped', 'delivered'],
    forceExportFlagged: true,
  });
  assert.deepEqual(bdPostResult.headers, [...BD_POST_CSV_HEADERS]);
  assert.equal(bdPostResult.headers.length, 18);
  assert.equal(bdPostResult.headers[0], 'Order_No');
  assert.equal(bdPostResult.headers[11], 'Post_Code');

  // Backwards-compatible 0-arg generateBulkCourierBookingCsv()
  const legacyCsv = generateBulkCourierBookingCsv();
  assert.ok(legacyCsv.includes('Invoice,Recipient_Name,Recipient_Phone'));
});

test('Missing-field red warning detection, inline updateOrderCourierMeta, and autoSyncOrdersCourierGeo', () => {
  const adminCtx = getActorSecurityContext('usr-super-admin')!;
  assert.ok(adminCtx);

  const erp = readErpState();
  const target = erp.orders.find((o) =>
    ['pending_confirmation', 'confirmed', 'packed'].includes(o.status)
  );
  assert.ok(target, 'Must have at least one editable order');

  // Snapshot original values to restore after test
  const origSnapshot = {
    streetAddress: target.streetAddress,
    postCode: target.postCode,
    recipientCity: target.recipientCity,
    recipientZone: target.recipientZone,
    recipientArea: target.recipientArea,
    totalWeightGrams: target.totalWeightGrams,
    pathaoStoreName: target.pathaoStoreName,
    totalPayablePoisha: target.totalPayablePoisha,
  };

  try {
    // 1. Trigger red missing-field flags by evaluating readiness with empty city, zone, postCode, and short streetAddress
    const lines = erp.orderLines.filter((l) => l.orderId === target.id);
    const brokenOrder = {
      ...target,
      streetAddress: 'Short',
      postCode: '',
      recipientCity: '',
      recipientZone: '',
      pathaoStoreName: '',
    };
    const readinessBefore = evaluateOrderCourierReadiness({
      order: brokenOrder,
      orderLines: lines,
      products: erp.products,
      siteSettings: { ...erp.siteSettings, pathaoDefaultStoreName: '' },
      format: 'pathao',
      storeNameOverride: '',
    });
    assert.equal(readinessBefore.isReady, false);
    assert.equal(readinessBefore.pathaoReady, false);
    assert.ok(readinessBefore.missingCellKeys.includes('RecipientAddress(*)'));
    assert.ok(readinessBefore.missingCellKeys.includes('RecipientCity(*)'));
    assert.ok(readinessBefore.missingCellKeys.includes('RecipientZone(*)'));
    assert.ok(readinessBefore.missingCellKeys.includes('StoreName'));

    // 2. Inline updateOrderCourierMeta fixes address, postCode, city, zone, weight without mutating financial snapshot
    const updateRes = updateOrderCourierMeta(adminCtx, {
      orderNo: target.orderNo,
      districtId: 1,
      upazilaId: 567,
      streetAddress: 'House 14, Road 6, Sector 6, Uttara, Dhaka',
      postCode: '1230',
      recipientCity: 'Dhaka',
      recipientZone: 'Uttara',
      recipientArea: 'Uttara Sector 6',
      totalWeightGrams: 750,
      pathaoStoreName: 'Panchabindu Main',
    });
    assert.equal(updateRes.success, true, updateRes.errorBn);
    assert.ok(updateRes.courierReadiness);
    assert.equal(updateRes.courierReadiness.pathaoReady, true);
    assert.equal(updateRes.courierReadiness.steadfastReady, true);

    const reloaded = readErpState().orders.find((o) => o.orderNo === target.orderNo)!;
    assert.equal(reloaded.totalPayablePoisha, origSnapshot.totalPayablePoisha);
    assert.equal(reloaded.postCode, '1230');
    assert.equal(reloaded.recipientCity, 'Dhaka');
    assert.equal(reloaded.recipientZone, 'Uttara');
    assert.equal(reloaded.totalWeightGrams, 750);

    // 3. Verify autoSyncOrdersCourierGeo batch syncs orders
    const syncRes = autoSyncOrdersCourierGeo(adminCtx, {
      orderNos: [target.orderNo],
    });
    assert.equal(syncRes.success, true);
    assert.equal(syncRes.syncedCount, 1);

    // 4. Verify getSanitizedOrdersForActor includes courierReadiness on ordersGrid
    const rows = getSanitizedOrdersForActor(adminCtx);
    assert.ok(rows.length > 0);
    assert.ok(rows[0].courierReadiness);

    // 5. Verify generateCourierBulkExport service
    const bundle = generateCourierBulkExport({
      format: 'pathao',
      statuses: ['pending_confirmation', 'confirmed', 'packed', 'shipped', 'delivered'],
      forceIncludeFlagged: true,
      storeNameOverride: 'Panchabindu Main',
    });
    assert.ok(bundle.totalMatchedCount > 0);
  } finally {
    // Restore original order fields so persistent store stays clean
    const stateAfter = readErpState();
    const ordToRestore = stateAfter.orders.find((o) => o.orderNo === target.orderNo);
    if (ordToRestore) {
      Object.assign(ordToRestore, origSnapshot);
      writeErpState(stateAfter);
    }
  }
});

test('Customer Default Delivery Area profile lookup & geo auto-sync by phone + WORKSPACE_ACTIONS parity', () => {
  const erp = readErpState();
  const sampleOrder = erp.orders[0];
  assert.ok(sampleOrder);

  const profile = getCustomerDefaultProfileByPhone(sampleOrder.customerPhone);
  assert.ok(profile);
  assert.equal(isValidBdPostCode(profile.postCode), true);
  assert.ok(profile.recipientCity.length >= 2);
  assert.ok(profile.recipientZone.length >= 2);

  // Verify WORKSPACE_ACTIONS parity with app/api/admin/workspace/route.ts
  const routeSource = fs.readFileSync(
    'artifacts/api-server/imported/app/api/admin/workspace/route.ts',
    'utf8',
  );
  const schemaOperations = [
    ...routeSource.matchAll(/operation:\s*z\.literal\('([^']+)'\)/g),
  ]
    .map((m) => m[1])
    .sort();
  assert.deepEqual(Object.keys(WORKSPACE_ACTIONS).sort(), schemaOperations);
});
