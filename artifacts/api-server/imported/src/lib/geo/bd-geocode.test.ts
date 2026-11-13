// src/lib/geo/bd-geocode.test.ts
// Locks the Bangladesh geo dataset that checkout, admin order entry and the
// courier adapters depend on. Regenerate with:
//   node scripts/src/generate-bd-geo.mjs <bdAddresses hierarchy snapshot>

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BD_DISTRICTS,
  BD_UPAZILAS,
  BD_GEO_COUNTS,
  getDistrictById,
  getDistrictDeliveryRates,
  getThanasByDistrict,
  getUpazilaById,
  searchThanasByDistrict,
} from './bd-geocode';

const officialUpazilas = BD_UPAZILAS.filter((row) => !row.is_metropolitan_thana);
const metroThanas = BD_UPAZILAS.filter((row) => row.is_metropolitan_thana);

test('covers all 64 districts with at least one delivery destination each', () => {
  assert.equal(BD_DISTRICTS.length, 64);
  assert.equal(BD_GEO_COUNTS.districts, 64);
  const districtIds = new Set(BD_DISTRICTS.map((district) => district.id));
  assert.equal(districtIds.size, 64);
  for (const district of BD_DISTRICTS) {
    assert.ok(district.name_en && district.name_bn, `district ${district.id} needs both names`);
    assert.ok(
      getThanasByDistrict(district.id).length > 0,
      `district ${district.name_en} has no upazila/thana for checkout`
    );
  }
  assert.deepEqual(
    [...new Set(BD_UPAZILAS.map((row) => row.district_id))].sort((a, b) => a - b),
    [...districtIds].sort((a, b) => a - b),
    'every upazila/thana must belong to a seeded district'
  );
});

test('keeps the official upazila baseline plus the five 2026 upazilas', () => {
  assert.equal(officialUpazilas.length, 499, '494 baseline + 5 approved on 2026-05-07');
  assert.equal(BD_GEO_COUNTS.metropolitanThanas, metroThanas.length);
  assert.equal(BD_GEO_COUNTS.thanas, BD_UPAZILAS.length);
  assert.equal(new Set(BD_UPAZILAS.map((row) => row.id)).size, BD_UPAZILAS.length, 'ids must be unique');

  for (const [id, nameEn, nameBn, districtId] of [
    [495, 'Mokamtola', 'মোকামতলা', 14],
    [496, 'Matamuhuri', 'মাতামুহুরী', 9],
    [497, 'Ruhia', 'রুহিয়া', 58],
    [498, 'Bhulli', 'ভুল্লী', 58],
    [499, 'Chandraganj', 'চন্দ্রগঞ্জ', 7],
  ] as const) {
    const upazila = getUpazilaById(id);
    assert.ok(upazila, `missing 2026 upazila ${nameEn}`);
    assert.equal(upazila.name_en, nameEn);
    assert.equal(upazila.name_bn, nameBn);
    assert.equal(upazila.district_id, districtId);
    assert.equal(upazila.is_metropolitan_thana, false);
  }

  // Existing orders/pickups reference these ids; they must never move.
  assert.equal(getUpazilaById(365)?.name_en, 'Savar');
  assert.equal(getUpazilaById(365)?.district_id, 47);
  assert.equal(getUpazilaById(399)?.district_id, 53, 'Panchagarh Sadar keeps its id');
  assert.equal(getDistrictById(47)?.name_bn, 'ঢাকা');
});

test('Dhaka metro customers can pick a metropolitan thana, not only the 5 upazilas', () => {
  const dhaka = getThanasByDistrict(47);
  assert.deepEqual(
    dhaka.filter((row) => !row.is_metropolitan_thana).map((row) => row.name_en),
    ['Savar', 'Dhamrai', 'Keraniganj', 'Nawabganj', 'Dohar']
  );
  assert.ok(dhaka.some((row) => row.name_bn === 'ধানমন্ডি'), 'Dhanmondi thana is selectable');
  assert.ok(dhaka.filter((row) => row.is_metropolitan_thana).length >= 40);
  assert.equal(searchThanasByDistrict(47, 'dhanmondi').length, 1);
  assert.equal(searchThanasByDistrict(47, 'ধানমন্ডি')[0]?.name_en, 'Dhanmondi');
  assert.equal(searchThanasByDistrict(47, 'no-such-thana').length, 0);
  assert.equal(searchThanasByDistrict(53, '').length, 5, 'Panchagarh rural districts keep 5 upazilas');
});

test('district rates still match the seeded Dhaka/outside-Dhaka split', () => {
  assert.deepEqual(getDistrictDeliveryRates(47), {
    isInsideDhaka: true,
    base1KgPoisha: 7000,
    extraPerKgPoisha: 1500,
    bdPostPerKgPoisha: 1000,
  });
  const outside = getDistrictDeliveryRates(53);
  assert.equal(outside.isInsideDhaka, false);
  assert.equal(outside.base1KgPoisha, 13000);
});

test('generated geo artifacts stay identical across api, web, JSON and SQL seeds', () => {
  const apiCopy = fs.readFileSync(new URL('./bd-geocode.ts', import.meta.url), 'utf8');
  const webCopy = fs.readFileSync(
    new URL('../../../../../panchabindu/src/lib/geo/bd-geocode.ts', import.meta.url),
    'utf8'
  );
  assert.equal(webCopy, apiCopy, 'run scripts/src/generate-bd-geo.mjs after editing geo data');

  const upazilaSeed = fs.readFileSync(
    new URL('../../../../supabase/geo/upazilas.json', import.meta.url),
    'utf8'
  );
  const seededRows = upazilaSeed.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(seededRows.length, officialUpazilas.length);
  for (const row of seededRows) {
    const match = getUpazilaById(row.id);
    assert.ok(match, `supabase seed row ${row.id} is not in the app dataset`);
    assert.equal(match.name_bn, row.name_bn);
    assert.equal(match.district_id, row.district_id);
  }

  const seedSql = fs.readFileSync(
    new URL('../../../../supabase/seed.sql', import.meta.url),
    'utf8'
  );
  const upazilaInsert = seedSql.match(/INSERT INTO upazilas[\s\S]*?;/)?.[0] ?? '';
  assert.equal(
    (upazilaInsert.match(/\(\d+, \d+, '/g) ?? []).length,
    BD_UPAZILAS.length,
    'seed.sql must carry every upazila and metropolitan thana'
  );
  assert.match(upazilaInsert, /\(495, 14, 'Mokamtola'/);
  assert.match(upazilaInsert, /\(5064, 47, 'Dhanmondi'/);
});
