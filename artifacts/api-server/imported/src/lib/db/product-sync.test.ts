import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAutomatedMargin,
  resolveVendorProfile,
  syncProductWithVendorProfile,
  validateProductVendorLink,
  syncAllProductsWithVendors,
  recordVendorProductOrderAccrual,
  GLOBAL_DEFAULT_COMMISSION_BP,
} from './product-sync';
import { readErpState, type InternalProductRecord } from './repository';
import { readPhase4BStore } from '@/src/lib/admin/phase4b-service';

test('ProductSync Case 1: resolveVendorProfile finds active vendors by ID and Code', () => {
  const p4b = readPhase4BStore();
  assert.ok(p4b.vendors.length > 0, 'Seed vendors should exist');

  const firstVendor = p4b.vendors[0]!;
  const resolvedById = resolveVendorProfile(firstVendor.vendorId);
  assert.ok(resolvedById);
  assert.equal(resolvedById.vendorId, firstVendor.vendorId);
  assert.equal(resolvedById.businessNameBn, firstVendor.businessNameBn);

  const resolvedByCode = resolveVendorProfile(firstVendor.vendorCode);
  assert.ok(resolvedByCode);
  assert.equal(resolvedByCode.vendorId, firstVendor.vendorId);

  const nonExistent = resolveVendorProfile('non-existent-vendor-xyz');
  assert.equal(nonExistent, null);
});

test('ProductSync Case 2: calculateAutomatedMargin computes exact 3-tier prices & commission priorities', () => {
  // Scenario A: Auto-derived margin from global default commission (1500 bp = 15%)
  // Cost: 1000 BDT (100,000 Poisha), Profit: 200 BDT (20,000 Poisha)
  // Payable: 120,000 Poisha (1,200 BDT)
  // Margin @ 15%: 120,000 * 0.15 = 18,000 Poisha (180 BDT)
  // Sale: 120,000 + 18,000 = 138,000 Poisha (1,380 BDT)
  const autoMargin = calculateAutomatedMargin({
    supplierCostPoisha: 100000,
    supplierProfitPoisha: 20000,
  });

  assert.equal(autoMargin.supplierCostPoisha, 100000);
  assert.equal(autoMargin.supplierProfitPoisha, 20000);
  assert.equal(autoMargin.supplierPayablePoisha, 120000);
  assert.equal(autoMargin.platformMarginPoisha, 18000);
  assert.equal(autoMargin.salePricePoisha, 138000);
  assert.equal(autoMargin.commissionBp, 1500);
  assert.equal(autoMargin.commissionSource, 'GLOBAL_DEFAULT');

  // Scenario B: Vendor default commission override (e.g. 1000 bp = 10%)
  const vendorMargin = calculateAutomatedMargin({
    supplierCostPoisha: 100000,
    supplierProfitPoisha: 20000,
    vendorDefaultCommissionBp: 1000,
  });
  assert.equal(vendorMargin.platformMarginPoisha, 12000); // 120,000 * 0.10
  assert.equal(vendorMargin.salePricePoisha, 132000);
  assert.equal(vendorMargin.commissionSource, 'VENDOR_DEFAULT');

  // Scenario C: Product commission override (e.g. 2000 bp = 20%) takes highest priority
  const productMargin = calculateAutomatedMargin({
    supplierCostPoisha: 100000,
    supplierProfitPoisha: 20000,
    vendorDefaultCommissionBp: 1000,
    productCommissionOverrideBp: 2000,
  });
  assert.equal(productMargin.platformMarginPoisha, 24000); // 120,000 * 0.20
  assert.equal(productMargin.salePricePoisha, 144000);
  assert.equal(productMargin.commissionSource, 'PRODUCT_OVERRIDE');

  // Scenario D: Explicit sale price provided (e.g. 150,000 Poisha)
  const explicitMargin = calculateAutomatedMargin({
    supplierCostPoisha: 100000,
    supplierProfitPoisha: 20000,
    explicitSalePricePoisha: 150000,
  });
  assert.equal(explicitMargin.supplierPayablePoisha, 120000);
  assert.equal(explicitMargin.platformMarginPoisha, 30000); // 150,000 - 120,000
  assert.equal(explicitMargin.salePricePoisha, 150000);
});

test('ProductSync Case 3: syncProductWithVendorProfile links product, updates vendor metadata and internal SKU', () => {
  const p4b = readPhase4BStore();
  const targetVendor = p4b.vendors[0]!;

  const testProduct: InternalProductRecord = {
    productId: 'test-sync-prod-001',
    vendorId: targetVendor.vendorId,
    vendorCode: 'OLD-CODE',
    vendorBusinessName: 'Old Business Name',
    categoryId: '00000000-0000-4000-8000-000000000001',
    slug: 'test-sync-prod-001',
    nameBn: 'টেস্ট সিঙ্ক সিল্ক শাড়ি',
    nameEn: 'Test Sync Silk Saree',
    descriptionBn: 'টেস্ট বিবরণ',
    descriptionEn: 'Test description',
    specs: [],
    variantAxes: ['Version'],
    images: ['https://picsum.photos/seed/test1/600/600'],
    isFeatured: false,
    isFreeDelivery: false,
    lowStockThreshold: 5,
    leadTimeDays: 2,
    commissionOverrideBp: null,
    totalSoldCount: 0,
    totalReturnedCount: 0,
    ratingAvgBp: 500,
    reviewCount: 0,
    status: 'active',
    variants: [
      {
        variantId: 'var-test-01',
        productId: 'test-sync-prod-001',
        internalVendorSku: 'OLD-SKU-123',
        publicSku: 'BG-TEST-01',
        titleBn: 'স্ট্যান্ডার্ড',
        titleEn: 'Standard',
        attributes: { Version: 'Standard' },
        imageUrl: null,
        supplierCostPoisha: 100000, // 1000 BDT
        supplierProfitPoisha: 20000, // 200 BDT
        supplierPayablePoisha: 120000,
        platformMarginPoisha: 18000,
        salePricePoisha: 138000,
        compareAtPricePoisha: null,
        weightGrams: 500,
        stockOnHand: 20,
        stockReserved: 0,
        stockInTransit: 0,
        stockDamaged: 0,
        stockAvailable: 20,
      },
    ],
  };

  const res = syncProductWithVendorProfile(testProduct, { recordLedgerLinkageAudit: true });
  assert.equal(res.success, true);
  assert.ok(res.product);
  assert.equal(res.product.vendorCode, targetVendor.vendorCode);
  assert.equal(res.product.vendorBusinessName, targetVendor.businessNameBn);

  // Internal vendor SKU must now be prefixed with vendorCode
  const updatedVar = res.product.variants[0]!;
  assert.equal(updatedVar.internalVendorSku, `${targetVendor.vendorCode}-BG-TEST-01`);
  assert.equal(updatedVar.supplierPayablePoisha, 120000);
  assert.equal(updatedVar.salePricePoisha, 120000 + updatedVar.platformMarginPoisha);

  // Verify persistence in erpState
  const erp = readErpState();
  const saved = erp.products.find((p) => p.productId === 'test-sync-prod-001');
  assert.ok(saved);
  assert.equal(saved.vendorCode, targetVendor.vendorCode);
});

test('ProductSync Case 4: validateProductVendorLink verifies integrity and catches non-existent vendors', () => {
  const validCheck = validateProductVendorLink('test-sync-prod-001');
  assert.equal(validCheck.isValid, true);
  assert.equal(validCheck.marginSafeguardPassed, true);

  const missingCheck = validateProductVendorLink('non-existent-product-id');
  assert.equal(missingCheck.isValid, false);
});

test('ProductSync Case 5: syncAllProductsWithVendors scans full catalog and reports sync status', () => {
  const report = syncAllProductsWithVendors();
  assert.ok(report.totalScanned >= 1);
  assert.equal(report.orphanedCount, 0); // All products should be linked to valid vendors
  assert.ok(report.syncedCount + report.repairedCount >= 1);
});

test('ProductSync Case 6: recordVendorProductOrderAccrual connects order line to vendor ledger with exact poisha', () => {
  const accrualRes = recordVendorProductOrderAccrual({
    orderNo: 'ORD-TEST-9901',
    orderItemId: 'item-test-9901',
    productId: 'test-sync-prod-001',
    variantId: 'var-test-01',
    quantity: 3,
    deliveredAtIso: '2026-11-07T12:00:00.000Z',
    operatorUsername: 'test_admin',
  });

  assert.equal(accrualRes.success, true);
  assert.ok(accrualRes.ledgerEntry);
  assert.equal(accrualRes.ledgerEntry.orderNo, 'ORD-TEST-9901');
  assert.equal(accrualRes.ledgerEntry.amountPoisha, 360000); // 120,000 * 3
  assert.equal(accrualRes.ledgerEntry.escrowBucket, 'locked');
  assert.equal(accrualRes.ledgerEntry.entryType, 'EARNING_LOCKED');
  assert.ok(accrualRes.ledgerEntry.maturesAt);

  // Check Phase 4B store ledger
  const p4b = readPhase4BStore();
  const ledgerRecord = p4b.vendorLedger.find((e) => e.orderNo === 'ORD-TEST-9901');
  assert.ok(ledgerRecord);
  assert.equal(ledgerRecord.amountPoisha, 360000);
});
