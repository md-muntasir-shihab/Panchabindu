// src/lib/admin/phase5.test.ts
// Unit tests for Phase 5 (Module Q): Pre-Launch Security Audit, Role Sanitization Inspector & E2E Lifecycle Simulator

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSqlMigrationsManifest,
  runConsignmentLifecycleDryRun,
  runPhase5PreLaunchAudit,
  simulateRoleFieldSanitization,
} from './phase5-service';

describe('Phase 5 — Pre-Launch Readiness, Security Audit & E2E Lifecycle Verification', () => {
  it('passes all 13 automated pre-launch security, money math, and operational checks', () => {
    const report = runPhase5PreLaunchAudit();
    assert.equal(report.totalChecks, 13);
    assert.equal(report.passedChecks, 13);
    assert.equal(report.failedChecks, 0);
    assert.equal(report.readinessScorePercent, 100);
    assert.equal(report.readyForProduction, false);

    for (const check of report.checks) {
      assert.equal(
        check.passed,
        true,
        `Expected check ${check.checkId} (${check.titleEn}) to pass`
      );
    }
  });

  it('enforces strict role-based DTO field stripping and PII masking across all 5 roles', () => {
    const publicDto = simulateRoleFieldSanitization('public_customer');
    assert.equal(publicDto.canAccessAdminErp, false);
    assert.equal(publicDto.costAndMarginHidden, true);
    assert.ok(publicDto.strippedProductFields.includes('supplierCostPoisha'));
    assert.ok(publicDto.strippedProductFields.includes('platformMarginPoisha'));
    assert.equal(
      'supplierCostPoisha' in publicDto.sanitizedProductPreview,
      false
    );

    const vendorDto = simulateRoleFieldSanitization('vendor');
    assert.equal(vendorDto.canAccessAdminErp, true);
    assert.equal(vendorDto.piiMasked, true);
    assert.equal(vendorDto.crossVendorBlocked, true);
    assert.ok(vendorDto.customerPhoneSample.includes('****'));
    assert.ok(vendorDto.strippedProductFields.includes('platformMarginPoisha'));
    assert.equal(
      'platformMarginPoisha' in vendorDto.sanitizedProductPreview,
      false
    );

    const marketingDto = simulateRoleFieldSanitization('marketing_manager');
    assert.equal(marketingDto.canAccessAdminErp, true);
    assert.equal(marketingDto.costAndMarginHidden, true);
    assert.ok(
      marketingDto.strippedProductFields.includes('supplierCostPoisha')
    );
    assert.ok(marketingDto.strippedOrderFields.includes('netProfitPoisha'));
    assert.equal(
      'supplierCostPoisha' in marketingDto.sanitizedProductPreview,
      false
    );

    const superDto = simulateRoleFieldSanitization('super_admin');
    assert.equal(superDto.canAccessAdminErp, true);
    assert.equal(superDto.costAndMarginHidden, false);
    assert.equal(superDto.strippedProductFields.length, 0);
    assert.ok('platformMarginPoisha' in superDto.sanitizedProductPreview);
  });

  it('executes 9-stage consignment order lifecycle dry-run with exact integer Poisha math', () => {
    const sim = runConsignmentLifecycleDryRun({
      districtId: 1, // Dhaka
      promoDiscountPoisha: 15000, // ৳150 promo discount
    });

    assert.equal(sim.stages.length, 9);
    assert.equal(sim.invariantsVerified.threeTierIdentityHolds, true);
    assert.equal(sim.invariantsVerified.vendorPayableProtectedFromPromo, true);
    assert.equal(sim.invariantsVerified.appendOnlyLedgerBalanced, true);

    const p = sim.pricingBreakdown;
    assert.equal(
      p.supplierCostPoisha + p.supplierProfitPoisha,
      p.supplierPayablePoisha
    );
    assert.equal(
      p.supplierPayablePoisha + p.platformMarginPoisha,
      p.salePricePoisha
    );
    assert.equal(
      p.effectivePlatformMarginPoisha,
      p.platformMarginPoisha - p.promoDiscountPoisha
    );
    assert.equal(
      p.netVendorDisbursedPoisha,
      p.supplierPayablePoisha - p.bkashCashoutFee185BpPoisha
    );
  });

  it('provides all 10 PostgreSQL migration manifests with RLS enforcement', () => {
    const migrations = getSqlMigrationsManifest();
    assert.equal(migrations.length, 10);
    assert.ok(migrations.every((m) => m.rlsEnforced));
  });
});
