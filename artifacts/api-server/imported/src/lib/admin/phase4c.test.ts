// src/lib/admin/phase4c.test.ts
// Automated Unit Tests for Phase 4C:
//   - Case 1: Product 360 Role Sanitization & Consignment Stock QC Receipt (Proof URL Required)
//   - Case 2: Financial Money Map, Ad Spend ROAS & Role-Restricted Auto Net Profit
//   - Case 3: Bilingual Message Template Variable Interpolation & Customer Blacklist Registry
//   - Case 4: Automation Rules Engine (Dry-Run Simulation & Global Kill-Switch)
//   - Case 5: Masked Credentials Vault (Never Leak Secret), Google Sheets One-Way Sync & Dynamic Branding

import test from 'node:test';
import assert from 'node:assert/strict';
import { getActorSecurityContext } from './phase4a-service';
import {
  addExpenseOrAdSpendEntry,
  computeFinancialMoneyMapAndPnl,
  computeProduct360List,
  executeAutomationRuleSimulation,
  getMaskedCredentialsList,
  receiveConsignmentStockWithQc,
  renderOrderMessagePreview,
  saveOrRevokeEncryptedCredential,
  toggleAutomationRuleOrKillSwitch,
  triggerGoogleSheetsOneWaySync,
  updateSiteBrandingAndThresholds,
  upsertCustomerBlacklist,
} from './phase4c-service';

test('Phase 4C Case 1: Product 360 Role Sanitization & Consignment Stock QC Receipt', () => {
  const superCtx = getActorSecurityContext('usr-super-admin')!;
  const marketCtx = getActorSecurityContext('usr-marketing-01')!;
  const packCtx = getActorSecurityContext('usr-packaging-01')!;

  const superP360 = computeProduct360List(superCtx);
  assert.equal(superP360.length >= 2, true);
  assert.equal(typeof superP360[0]?.supplierCostPoisha, 'number');
  assert.equal(typeof superP360[0]?.platformMarginPoisha, 'number');

  const marketP360 = computeProduct360List(marketCtx);
  assert.equal('supplierCostPoisha' in (marketP360[0] ?? {}), false);
  assert.equal('platformMarginPoisha' in (marketP360[0] ?? {}), false);

  // QC Stock Receipt requires proof URL
  const missingProof = receiveConsignmentStockWithQc(packCtx, {
    variantId: '00000000-0000-4000-8000-000000000201',
    addedUnits: 5,
    qcProofUrl: '',
    noteBn: 'নতুন লট',
  });
  assert.equal(missingProof.success, false);

  const validQc = receiveConsignmentStockWithQc(packCtx, {
    variantId: '00000000-0000-4000-8000-000000000201',
    addedUnits: 5,
    qcProofUrl: 'https://picsum.photos/seed/qcvideo/400/300',
    noteBn: '৫ পিস জামদানি ১০০% কিউসি পাস',
  });
  assert.equal(validQc.success, true);
  assert.equal((validQc.newStockAvailable ?? 0) >= 5, true);
});

test('Phase 4C Case 2: Financial Money Map, Ad Spend ROAS & Role-Restricted Auto Net Profit', () => {
  const superCtx = getActorSecurityContext('usr-super-admin')!;
  const marketCtx = getActorSecurityContext('usr-marketing-01')!;

  // Marketing Manager can add Ad Spend, but not office_ops
  const blockedNonAd = addExpenseOrAdSpendEntry(marketCtx, {
    category: 'office_ops',
    sourceChannel: 'general',
    campaignName: 'Office Rent',
    amountPoisha: 50000,
    expenseDate: '2026-11-06',
    isRecurring: true,
    noteBn: 'ভাড়া',
  });
  assert.equal(blockedNonAd.success, false);

  const allowedAd = addExpenseOrAdSpendEntry(marketCtx, {
    category: 'ad_spend',
    sourceChannel: 'facebook',
    campaignName: 'Winter Shawl Retargeting',
    amountPoisha: 30000,
    expenseDate: '2026-11-06',
    isRecurring: false,
    noteBn: 'ফেসবুক কনভার্সন অ্যাড',
  });
  assert.equal(allowedAd.success, true);

  // Marketing Manager sees ROAS but NEVER sees autoNetProfitPoisha or totalSupplierPayablePoisha
  const marketPnl = computeFinancialMoneyMapAndPnl(marketCtx)!;
  assert.equal(marketPnl.channelRoas.length, 4);
  assert.equal('autoNetProfitPoisha' in marketPnl, false);
  assert.equal('totalSupplierPayablePoisha' in marketPnl, false);

  // Super Admin sees full Auto Net Profit & Money Map
  const superPnl = computeFinancialMoneyMapAndPnl(superCtx)!;
  assert.equal(typeof superPnl.autoNetProfitPoisha, 'number');
  assert.equal(typeof superPnl.totalSupplierPayablePoisha, 'number');
});

test('Phase 4C Case 3: Bilingual Message Template Interpolation & Customer Blacklist Registry', () => {
  const superCtx = getActorSecurityContext('usr-super-admin')!;

  const msgRes = renderOrderMessagePreview(superCtx, {
    orderNo: 'ORD-261106-0001',
    eventKey: 'ORDER_CONFIRMED',
    locale: 'bn',
  });
  assert.equal(msgRes.success, true);
  assert.equal(msgRes.renderedText?.includes('ORD-261106-0001'), true);
  assert.equal(msgRes.waMeUrl?.startsWith('https://wa.me/8801'), true);
  assert.equal(msgRes.smsUrl?.startsWith('sms:01'), true);

  const blRes = upsertCustomerBlacklist(superCtx, {
    phone: '০১৭৯৯১১২২৩৩',
    reasonBn: 'টানা ৩ বার ফেক অর্ডার',
  });
  assert.equal(blRes.success, true);
  assert.equal(blRes.normalizedPhone, '01799112233');
});

test('Phase 4C Case 4: Automation Rules Engine (Dry-Run Simulation & Global Kill-Switch)', () => {
  const superCtx = getActorSecurityContext('usr-super-admin')!;

  // Execute Dry-Run simulation
  const simRes = executeAutomationRuleSimulation(superCtx, {
    ruleId: 'RULE-01',
    sampleOrderNo: 'ORD-261106-0001',
  });
  assert.equal(simRes.success, true);
  assert.equal(simRes.log?.mode, 'DRY_RUN');
  assert.equal(simRes.log?.outcomeSummaryBn.includes('[DRY-RUN প্রিভিউ]'), true);

  // Activate Global Kill-Switch -> blocks enabling any rule
  const killOn = toggleAutomationRuleOrKillSwitch(superCtx, {
    globalKillSwitchActive: true,
  });
  assert.equal(killOn.killSwitchActive, true);

  const tryEnableWhileKilled = toggleAutomationRuleOrKillSwitch(superCtx, {
    ruleId: 'RULE-01',
    isEnabled: true,
  });
  assert.equal(tryEnableWhileKilled.success, false);

  // Turn off Kill-Switch
  const killOff = toggleAutomationRuleOrKillSwitch(superCtx, {
    globalKillSwitchActive: false,
  });
  assert.equal(killOff.killSwitchActive, false);
});

test('Phase 4C Case 5: Masked Credentials Vault (Never Leak Secret), Google Sheets One-Way Sync & Branding', () => {
  const superCtx = getActorSecurityContext('usr-super-admin')!;

  const rawSecret = 'sk_live_SUPER_SECRET_KEY_9876';
  const credRes = saveOrRevokeEncryptedCredential(superCtx, {
    keyName: 'STEADFAST_API_KEY',
    rawSecretValue: rawSecret,
  });
  assert.equal(credRes.success, true);

  const allCredsJson = JSON.stringify(getMaskedCredentialsList());
  // Raw secret MUST NEVER appear in serialized response
  assert.equal(allCredsJson.includes(rawSecret), false);
  assert.equal(allCredsJson.includes('••••••••••••9876'), true);

  const syncRes = triggerGoogleSheetsOneWaySync(superCtx, 'full_resync');
  assert.equal(syncRes.success, true);
  assert.equal(syncRes.job?.tabsSynced.length, 8);

  const brandRes = updateSiteBrandingAndThresholds(superCtx, {
    brandNameBn: 'বঙ্গকনসাইন',
  });
  assert.equal(brandRes.success, true);
});
