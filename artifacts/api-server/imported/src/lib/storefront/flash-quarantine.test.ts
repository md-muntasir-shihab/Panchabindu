import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ApiRequest } from '../http';
import { getStorefrontConfig, storefrontConfigSchema } from './storefront-config';
import { getPublicProductBySlug, getPublicStorefrontData, readErpState, writeErpState } from '../db/repository';
import { getActorSecurityContext, readAdminStore } from '../admin/phase4a-service';
import { createMarginSafeFlashCampaign, getPhase7WorkspaceOverview, readPhase7Store } from '../admin/phase7-service';
import { createAdminSession } from '../security/crypto-session';
import { POST as workspacePost } from '../../../app/api/admin/workspace/route';

function flashKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => [
    ...(/flash|countdown/i.test(key) ? [`${prefix}.${key}`] : []),
    ...flashKeys(child, `${prefix}.${key}`),
  ]);
}

test('default-off blocks direct and HTTP creation without changing campaigns, ERP or audit records', async () => {
  const actor = getActorSecurityContext('usr-super-admin')!;
  assert.equal(getStorefrontConfig({}).flashCampaignsEnabled, false);
  assert.equal(getStorefrontConfig(readErpState().siteSettings).flashCampaignsEnabled, false);
  assert.equal(storefrontConfigSchema.safeParse({ ...getStorefrontConfig({}), flashCampaignsEnabled: 'true' }).success, false);
  const campaigns = structuredClone(readPhase7Store().flashCampaigns);
  assert.ok(campaigns.length > 0, 'legacy campaign fixture must exist');
  const diskBefore = readFileSync('.data/erp-phase7-store.json', 'utf8');
  const erpBefore = structuredClone(readErpState());
  const auditBefore = structuredClone(readAdminStore().auditLogs);
  const input = { campaignCode: 'QUARANTINE-TEST', titleBn: 'পরীক্ষা',
    variantId: erpBefore.products[0].variants[0].variantId, flashDiscountPoisha: 100, maxUnitsQuota: 1 };
  assert.equal(createMarginSafeFlashCampaign(actor, input).success, false);
  const session = createAdminSession(actor);
  const response = await workspacePost(new ApiRequest('http://localhost/api/admin/workspace', {
    method: 'POST', headers: { origin: 'http://localhost', 'content-type': 'application/json',
      cookie: `bg_admin_session=${session.token}`, 'x-csrf-token': session.csrfToken },
    body: JSON.stringify({ operation: 'create_flash_campaign', ...input }),
  }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'FEATURE_QUARANTINED');
  const overview = getPhase7WorkspaceOverview(actor);
  assert.equal(overview.flashCampaignsEnabled, false);
  assert.deepEqual(overview.flashCampaigns, []);
  assert.ok(Array.isArray(overview.maturityBatches), 'unrelated escrow data remains available');
  assert.deepEqual(readPhase7Store().flashCampaigns, campaigns);
  assert.equal(readFileSync('.data/erp-phase7-store.json', 'utf8'), diskBefore);
  assert.deepEqual(readErpState(), erpBefore);
  assert.deepEqual(readAdminStore().auditLogs, auditBefore);
});

test('public catalog and product DTOs omit nested legacy flash/countdown fields, without removing normal coupons', () => {
  const original = structuredClone(readErpState());
  const state = structuredClone(original);
  state.siteSettings.storefront = { ...getStorefrontConfig(state.siteSettings), flashCampaignsEnabled: false };
  Object.assign(state.siteSettings, { flashCampaigns: [{ countdown: 123 }] });
  Object.assign(state.siteSettings.promoCampaign, { countdown: 123, countdownEndsAt: '2099-01-01', flashSalePricePoisha: 100 });
  Object.assign(state.products[0], { flashCampaigns: [{ countdown: 123 }] });
  Object.assign(state.products[0].variants[0], { flashSalePricePoisha: 100 });
  try {
    writeErpState(state);
    const catalog = getPublicStorefrontData();
    const detail = getPublicProductBySlug(catalog.products[0].slug);
    assert.deepEqual(flashKeys(catalog), []);
    assert.deepEqual(flashKeys(detail), []);
    assert.deepEqual(flashKeys(getPublicProductBySlug('missing-product')), []);
    assert.equal(catalog.siteSettings.promoCampaign.code, original.siteSettings.promoCampaign.code);
    assert.ok('discountLabelBn' in catalog.siteSettings.promoCampaign);
    assert.ok('countdown' in readErpState().siteSettings.promoCampaign, 'sanitization must not mutate stored legacy fields');
  } finally { writeErpState(original); }
});

test('explicit internal opt-in preserves the retained margin guard and campaign engine', () => {
  const original = structuredClone(readErpState());
  const state = structuredClone(original);
  state.siteSettings.storefront = { ...getStorefrontConfig(state.siteSettings), flashCampaignsEnabled: true };
  try {
    writeErpState(state);
    const actor = getActorSecurityContext('usr-super-admin')!;
    const variant = state.products[0].variants[0];
    const input = { campaignCode: 'RETAINED-ENGINE', titleBn: 'পরীক্ষা', variantId: variant.variantId, maxUnitsQuota: 1 };
    assert.equal(createMarginSafeFlashCampaign(actor, { ...input, flashDiscountPoisha: variant.platformMarginPoisha }).success, false);
    const created = createMarginSafeFlashCampaign(actor, { ...input, flashDiscountPoisha: 100 });
    assert.equal(created.success, true);
    assert.equal(created.campaign?.supplierPayablePoisha, variant.supplierPayablePoisha);
    assert.equal(getPhase7WorkspaceOverview(actor).flashCampaignsEnabled, true);
    assert.ok(getPhase7WorkspaceOverview(actor).flashCampaigns.length > 0);
    // The separate strict-exclusion HTTP policy remains in force even on opt-in.
    assert.deepEqual(flashKeys(getPublicStorefrontData()), []);
  } finally { writeErpState(original); }
});
