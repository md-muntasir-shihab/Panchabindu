import test from 'node:test';
import assert from 'node:assert/strict';
import { getStorefrontConfig, safeStoreUrl, storefrontContentSchema } from './storefront-config';
import { getPublicStorefrontData, readErpState } from '../db/repository';
import { getActorSecurityContext, readAdminStore } from '../admin/phase4a-service';
import { updateStorefrontContent } from '../admin/storefront-settings-service';
import { withRuntimePersistence } from '../db/runtime-persistence';
import { canExecuteWorkspaceAction } from '../security/workspace-policy';
import { getStoreMetadata } from './store-metadata';

test('editable links reject script schemes, protocol relative URLs and control characters', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '//evil.test', '/\\evil.test', 'https://name:secret@example.com', 'https://example.com/\nscript']) assert.equal(safeStoreUrl(url), false, url);
  for (const url of ['/shop', '#unified-catalog', 'https://example.com/help', '']) assert.equal(safeStoreUrl(url), true, url);
});

test('appearance requires readable accents and unique navigation and sections', () => {
  const settings = getPublicStorefrontData().siteSettings;
  const config = getStorefrontConfig(settings);
  const content = { ...settings, storefront: config, maintenanceMessageEn: '' };
  assert.equal(storefrontContentSchema.safeParse(content).success, true);
  assert.equal(storefrontContentSchema.safeParse({ ...content, storefront: { ...config, accentColor: '#ffffff' } }).success, false);
  assert.equal(storefrontContentSchema.safeParse({ ...content, homepageSections: [...settings.homepageSections, settings.homepageSections[0]] }).success, false);
  assert.equal(storefrontContentSchema.safeParse({ ...content, storefront: { ...config, navigation: [config.navigation[0], config.navigation[0]] } }).success, false);
});

test('saved branding, sections and policy content reach safe public data and metadata without financial mutation', async () => {
  const actor = getActorSecurityContext('usr-super-admin')!;
  const settings = readErpState().siteSettings;
  const previousFinancial = settings.bkashManualNumber;
  const content = { ...settings, brandNameBn: 'আমার স্টোর', brandNameEn: 'My Store', maintenanceMessageEn: '',
    storefront: { ...getStorefrontConfig(settings), logoUrl: 'https://cdn.example.com/logo.webp', seoTitleBn: 'আমার নিজস্ব শিরোনাম', faviconUrl: '/assets/icon.png', privateToken: 'not-public' },
    heroBanners: [{ ...settings.heroBanners[0], titleEn: 'Edited banner', ctaHref: '/shop' }],
    homepageSections: settings.homepageSections.map(section => ({ ...section, enabled: section.type !== 'hero', order: 7 - section.order })),
    legalPages: { returns: { titleBn: 'ফেরত নীতি', titleEn: 'Returns', contentBn: 'সম্পাদিত নীতি', contentEn: 'Edited policy' } },
    bkashManualNumber: 'must-not-change' };
  const result = await withRuntimePersistence(() => updateStorefrontContent(actor, content));
  assert.equal(result.success, true);
  const stored = readErpState().siteSettings;
  assert.equal(stored.bkashManualNumber, previousFinancial);
  assert.equal(getPublicStorefrontData().siteSettings.brandNameEn, 'My Store');
  assert.equal(getPublicStorefrontData().siteSettings.storefront?.logoUrl, content.storefront.logoUrl);
  assert.equal('privateToken' in getPublicStorefrontData().siteSettings.storefront!, false);
  assert.equal(getPublicStorefrontData().siteSettings.homepageSections.find(v => v.type === 'hero')?.enabled, false);
  const metadata = await getStoreMetadata();
  assert.equal(metadata.title, 'আমার নিজস্ব শিরোনাম');
  assert.ok(readAdminStore().auditLogs.some(log => log.actionCode === 'STOREFRONT_CONTENT_UPDATED'));
});

test('staff cannot publish store changes and invalid images or coupon claims do not mutate settings', async () => {
  const actor = getActorSecurityContext('usr-super-admin')!;
  const staff = getActorSecurityContext('usr-marketing-01')!;
  const state = readErpState();
  const content = { ...state.siteSettings, storefront: getStorefrontConfig(state.siteSettings), maintenanceMessageEn: '' };
  assert.equal(canExecuteWorkspaceAction(staff, 'update_storefront_content'), false);
  assert.equal(updateStorefrontContent(staff, content).success, false);
  assert.equal(updateStorefrontContent(actor, { ...content, storefront: { ...content.storefront, logoUrl: 'javascript:alert(1)' } }).success, false);
  assert.equal(updateStorefrontContent(actor, { ...content, promoCampaign: { ...content.promoCampaign, enabled: true, code: 'NOT_A_REAL_COUPON' } }).success, false);
  assert.deepEqual(readErpState().siteSettings, state.siteSettings);
});
