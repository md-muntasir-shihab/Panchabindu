// src/lib/db/phase2-migration.test.ts
// Phase 2 Verification Suite:
//   - Section 5.1 & 5.2: 33-Entity Data Source Matrix & Production Persistence Guard
//   - Section 5.3 & 5.6: SQL Migration Manifest Single Source-of-Truth & Schema Constraints
//   - Section 5.4: JSON-to-Supabase Dry-Run Reconciler, Poisha Math Reconciliation, Conflict Detector & Idempotency
//   - Section 5.5: 100% Table RLS Policy Coverage (53/53 tables), site_settings Public Sanitization,
//                  SECURITY DEFINER search_path Hardening, & Allow/Deny Test Matrix

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPersistenceDataSourceMatrix,
  executeApprovedSupabaseMigration,
  runJsonToSupabaseMigrationDryRun,
  runRlsPolicyAllowDenyTests,
  verifySqlMigrationsAndRlsCoverage,
} from './json-to-supabase-migrator';
import {
  readErpState,
  sanitizeSiteSettingsForPublic,
} from './repository';
import {
  assertProductionPersistenceAllowed,
  getPersistenceRuntimeMode,
} from '../supabase/admin';

describe('Phase 2 — Database Source of Truth, RLS Coverage & JSON-to-Supabase Migration', () => {
  it('1. maps all 33 required business entities to PostgreSQL tables with RLS and natural keys (5.1 & 5.2)', () => {
    const matrix = buildPersistenceDataSourceMatrix();
    assert.equal(matrix.length, 33);

    const requiredKeys = [
      'customers',
      'addresses',
      'vendors',
      'vendor_users',
      'products',
      'categories',
      'product_variants',
      'product_images',
      'supplier_offers',
      'inventory',
      'warehouses',
      'stock_movements',
      'orders',
      'order_items',
      'vendor_fulfillment_groups',
      'payments',
      'manual_payment_submissions',
      'shipments',
      'courier_events',
      'returns',
      'refunds_reversals',
      'vendor_payables',
      'settlements',
      'ledger_accounts',
      'journal_entries_lines',
      'expenses',
      'audit_logs',
      'webhook_events',
      'idempotency_records',
      'notifications',
      'print_records',
      'fraud_cases',
      'store_settings',
    ];

    for (const key of requiredKeys) {
      const found = matrix.find((m) => m.entityKey === key);
      assert.ok(found, `Missing entity mapping for ${key}`);
      assert.equal(found.rlsPolicyEnforced, true);
      assert.ok(found.targetPostgresTable.length > 0);
    }
  });

  it('2. never mistakes credentials for a database cutover and blocks production JSON writes (5.2)', () => {
    assert.equal(
      getPersistenceRuntimeMode({
        nodeEnv: 'development',
        strictProduction: false,
        supabaseConfigured: false,
      }),
      'local_json_dev_fallback'
    );

    assert.equal(
      getPersistenceRuntimeMode({
        nodeEnv: 'production',
        strictProduction: true,
        supabaseConfigured: true,
      }),
      'blocked_production_json'
    );

    assert.equal(
      getPersistenceRuntimeMode({
        nodeEnv: 'production',
        strictProduction: true,
        supabaseConfigured: false,
      }),
      'blocked_production_json'
    );
    assert.equal(getPersistenceRuntimeMode({ nodeEnv: 'production', strictProduction: false, supabaseConfigured: true }), 'blocked_production_json');
    assert.equal(getPersistenceRuntimeMode({ nodeEnv: 'development', supabaseConfigured: true }), 'local_json_dev_fallback');

    assert.throws(
      () =>
        assertProductionPersistenceAllowed({
          nodeEnv: 'production',
          strictProduction: true,
          supabaseConfigured: false,
        }),
      /PRODUCTION_PERSISTENCE_GUARD/
    );
    const env = process.env as Record<string, string | undefined>;
    const previous = env.NODE_ENV;
    try {
      env.NODE_ENV = 'production';
      assert.throws(() => readErpState(), /PRODUCTION_PERSISTENCE_GUARD/);
    } finally {
      if (previous === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = previous;
    }
  });

  it('3. verifies 100% SQL migration manifest consistency, 100% RLS policy coverage across all 53 tables, and SECURITY DEFINER search_path (5.5 & 5.6)', () => {
    const audit = verifySqlMigrationsAndRlsCoverage();

    assert.equal(audit.migrationsDirExists, true);
    assert.equal(audit.diskMigrationFiles.length, 8);
    assert.equal(
      audit.manifestMatchesDiskFiles,
      true,
      'getSqlMigrationsManifest() filenames must match /supabase/migrations/*.sql on disk'
    );
    assert.equal(
      audit.manifestTablesMatchSqlDefinitions,
      true,
      'Every CREATE TABLE in SQL migrations must be listed in getSqlMigrationsManifest()'
    );
    assert.equal(
      audit.totalTablesCreatedInSql,
      55,
      `Expected 55 total PostgreSQL tables across 0002..0008, got ${audit.totalTablesCreatedInSql}`
    );
    assert.equal(
      audit.allTablesHaveRlsEnabled,
      true,
      `Tables missing ENABLE ROW LEVEL SECURITY: ${audit.tablesWithoutRlsEnabled.join(', ')}`
    );
    assert.equal(
      audit.allTablesHaveExplicitPolicies,
      true,
      `Tables missing explicit CREATE POLICY: ${audit.tablesWithoutExplicitPolicies.join(', ')}`
    );
    assert.equal(audit.siteSettingsPublicReadRemoved, true);
    assert.equal(audit.publicSafeSiteSettingsViewPresent, true);
    assert.equal(audit.allSecurityDefinerFunctionsHaveSafeSearchPath, true);
    assert.equal(audit.storageBucketsConfigured, true);
  });

  it('4. strips internal ERP commission, escrow hold, min payout, packaging cost, and risk settings from public site_settings DTO (5.5)', () => {
    const state = readErpState();
    const publicSafe = sanitizeSiteSettingsForPublic(
      state.siteSettings
    ) as Record<string, unknown>;

    assert.equal('globalDefaultCommissionBp' in publicSafe, false);
    assert.equal('globalEscrowHoldDays' in publicSafe, false);
    assert.equal('minPayoutRequestPoisha' in publicSafe, false);
    assert.equal('defaultPackagingCostPoisha' in publicSafe, false);
    assert.equal('riskAdvanceMandatoryScore' in publicSafe, false);

    // Public branding & checkout delivery threshold remain intact
    assert.equal(publicSafe.brandNameBn, state.siteSettings.brandNameBn);
    assert.equal(
      publicSafe.freeDeliveryThresholdPoisha,
      state.siteSettings.freeDeliveryThresholdPoisha
    );
  });

  it('5. passes all 15 RLS Allow/Deny simulation tests across anon, customer, vendor, staff, and super_admin (5.5)', () => {
    const rlsTests = runRlsPolicyAllowDenyTests();
    assert.equal(rlsTests.totalTests, 15);
    assert.equal(rlsTests.passedTests, 15);
    assert.equal(rlsTests.failedTests, 0);

    for (const tc of rlsTests.cases) {
      assert.equal(
        tc.passed,
        true,
        `${tc.testId} (${tc.actorContextNote}) expected ${tc.expectedDecision} but got ${tc.actualDecision}`
      );
    }
  });

  it('6. runs idempotent JSON-to-Supabase dry-run with zero conflicts and 0-Poisha financial variance on clean state (5.4)', () => {
    const run1 = runJsonToSupabaseMigrationDryRun();
    const run2 = runJsonToSupabaseMigrationDryRun();

    assert.equal(run1.dryRun, true);
    assert.equal(run1.requiresOperatorApprovalBeforeProdRun, true);
    assert.equal(
      run1.conflicts.length,
      0,
      `Expected 0 conflicts on clean state, got: ${JSON.stringify(run1.conflicts)}`
    );

    for (const rowRec of run1.rowReconciliation) {
      assert.equal(
        rowRec.reconciled,
        true,
        `Row count reconciliation failed for ${rowRec.tableName}: ${JSON.stringify(rowRec)}`
      );
    }

    for (const finRec of run1.financialReconciliation) {
      assert.equal(
        finRec.variancePoisha,
        0,
        `Financial variance non-zero for ${finRec.metricKey}: ${JSON.stringify(finRec)}`
      );
      assert.equal(finRec.reconciled, true);
    }

    // Reconciliation alone cannot establish production migration readiness.
    assert.equal(run1.readyForProductionMigration, false);

    // Verify deterministic UUID generation across repeated runs (Idempotency)
    assert.deepEqual(run1.idempotentBatches, run2.idempotentBatches);
  });

  it('7. detects duplicate OrderNo, broken 3-tier Poisha pricing, and duplicate active bKash TrxID without silently dropping records (5.4)', () => {
    const conflictRun = runJsonToSupabaseMigrationDryRun({
      injectDuplicateOrderNo: true,
      injectBrokenThreeTierVariant: true,
      injectDuplicateBkashTrxId: true,
    });

    assert.equal(conflictRun.readyForProductionMigration, false);
    const conflictCodes = conflictRun.conflicts.map((c) => c.conflictCode);
    assert.ok(conflictCodes.includes('DUPLICATE_ORDER_NO'));
    assert.ok(conflictCodes.includes('THREE_TIER_PRICE_MISMATCH'));
    assert.ok(conflictCodes.includes('DUPLICATE_ACTIVE_BKASH_TRX_ID'));

    // Also verify Production Migration Approval Gate blocks unapproved or conflicted runs
    const unapproved = executeApprovedSupabaseMigration({
      dryRun: false,
      operatorApproved: false,
    });
    assert.equal(unapproved.executedLive, false);
    assert.ok(unapproved.blockedReasonBn?.includes('APPROVAL_REQUIRED'));

    const approvedButUnimplemented = executeApprovedSupabaseMigration({
      dryRun: false,
      operatorApproved: true,
      operatorApprovalToken: 'test-approval-token',
    });
    assert.equal(approvedButUnimplemented.executedLive, false);
    assert.ok(approvedButUnimplemented.blockedReasonBn?.includes('NOT_INTEGRATED'));
  });
});
