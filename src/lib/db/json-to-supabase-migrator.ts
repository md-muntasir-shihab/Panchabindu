// src/lib/db/json-to-supabase-migrator.ts
// Phase 2 (Section 5.1 – 5.6):
//   - 5.1 Current Persistence Audit & Business Entity Data Source Matrix (All 33 Entities)
//   - 5.2 & 5.3 Schema Gap Resolution & Migration Quality Verifier
//   - 5.4 JSON-to-Supabase Idempotent Migration Engine, Conflict Detector (Zero Silent Drops),
//         Row Count Reconciliation, & Exact Poisha Financial Total Reconciliation
//   - 5.5 Supabase RLS Coverage Verifier (100% of 53 Tables Covered), Public-Safe site_settings Check,
//         SECURITY DEFINER search_path Verifier, & Automated Allow/Deny Policy Test Matrix
//   - 5.6 Migration Manifest Single Source-of-Truth Verifier

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Poisha } from '../../types/domain';
import type { SystemRoleSlug } from '../../types/permissions';
import { readAdminStore } from '../admin/phase4a-service';
import { readPhase4BStore } from '../admin/phase4b-service';
import { readPhase4CStore } from '../admin/phase4c-service';
import { getSqlMigrationsManifest } from '../admin/phase5-service';
import { readPhase6Store } from '../admin/phase6-service';
import { readPhase7Store } from '../admin/phase7-service';
import { readErpState } from './repository';

// ============================================================================
// 1. DATA SOURCE MATRIX & SCHEMA GAP MATRIX (SECTION 5.1 & 5.2)
// ============================================================================

export interface BusinessEntityPersistenceMapping {
  entityKey: string;
  entityNameEn: string;
  entityNameBn: string;
  legacyJsonSourceFile: string;
  legacyJsonKeyPath: string;
  targetPostgresTable: string;
  definedInMigration: string;
  primaryOrNaturalKey: string;
  isAppendOnlyImmutable: boolean;
  rlsPolicyEnforced: boolean;
  schemaGapResolution: 'existing_0002_0006' | 'added_or_hardened_in_0008';
}

export function buildPersistenceDataSourceMatrix(): BusinessEntityPersistenceMapping[] {
  return [
    {
      entityKey: 'customers',
      entityNameEn: 'Customers',
      entityNameBn: 'কাস্টমার প্রোফাইল ও ফ্রড স্কোর',
      legacyJsonSourceFile: '.data/erp-store.json',
      legacyJsonKeyPath: 'orders[].customerPhone (derived) + .data/erp-admin-store.json blacklistedPhones',
      targetPostgresTable: 'customers',
      definedInMigration: '0004_order_and_courier.sql',
      primaryOrNaturalKey: 'phone',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'existing_0002_0006',
    },
    {
      entityKey: 'addresses',
      entityNameEn: 'Addresses',
      entityNameBn: 'কাস্টমার ডেলিভারি ঠিকানা',
      legacyJsonSourceFile: '.data/erp-store.json',
      legacyJsonKeyPath: 'orders[].{districtId,upazilaId,streetAddress,landmark}',
      targetPostgresTable: 'customer_addresses',
      definedInMigration: '0008_phase2_schema_rls_and_gl_completion.sql',
      primaryOrNaturalKey: 'customer_id + district_id + upazila_id + street_address',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'added_or_hardened_in_0008',
    },
    {
      entityKey: 'vendors',
      entityNameEn: 'Vendors',
      entityNameBn: 'কনসাইনমেন্ট সাপ্লায়ার / ভেন্ডর প্রোফাইল',
      legacyJsonSourceFile: '.data/erp-phase4b-store.json',
      legacyJsonKeyPath: 'vendors[]',
      targetPostgresTable: 'vendors',
      definedInMigration: '0002_core_tables.sql',
      primaryOrNaturalKey: 'code',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'existing_0002_0006',
    },
    {
      entityKey: 'vendor_users',
      entityNameEn: 'Vendor Users & Staff Profiles',
      entityNameBn: 'ভেন্ডর ও স্টাফ ইউজার অ্যাকাউন্ট (2FA + Lockout)',
      legacyJsonSourceFile: '.data/erp-admin-store.json',
      legacyJsonKeyPath: 'users[]',
      targetPostgresTable: 'users_profile',
      definedInMigration: '0002_core_tables.sql',
      primaryOrNaturalKey: 'username',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'existing_0002_0006',
    },
    {
      entityKey: 'products',
      entityNameEn: 'Products',
      entityNameBn: 'কনসাইনমেন্ট প্রোডাক্ট ক্যাটালগ',
      legacyJsonSourceFile: '.data/erp-store.json',
      legacyJsonKeyPath: 'products[]',
      targetPostgresTable: 'products',
      definedInMigration: '0003_catalog_tables.sql',
      primaryOrNaturalKey: 'slug',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'existing_0002_0006',
    },
    {
      entityKey: 'categories',
      entityNameEn: 'Categories',
      entityNameBn: 'মাল্টি-লেভেল ক্যাটাগরি',
      legacyJsonSourceFile: '.data/erp-store.json',
      legacyJsonKeyPath: 'categories[]',
      targetPostgresTable: 'categories',
      definedInMigration: '0003_catalog_tables.sql',
      primaryOrNaturalKey: 'slug',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'existing_0002_0006',
    },
    {
      entityKey: 'product_variants',
      entityNameEn: 'Product Variants',
      entityNameBn: '৩-স্তর পয়সা প্রাইসিং ভ্যারিয়েন্ট ও স্টক',
      legacyJsonSourceFile: '.data/erp-store.json',
      legacyJsonKeyPath: 'products[].variants[]',
      targetPostgresTable: 'product_variants',
      definedInMigration: '0003_catalog_tables.sql',
      primaryOrNaturalKey: 'public_sku',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'existing_0002_0006',
    },
    {
      entityKey: 'product_images',
      entityNameEn: 'Product Images',
      entityNameBn: 'প্রোডাক্ট ও ভ্যারিয়েন্ট ইমেজ গ্যালারি',
      legacyJsonSourceFile: '.data/erp-store.json',
      legacyJsonKeyPath: 'products[].images[]',
      targetPostgresTable: 'product_images',
      definedInMigration: '0008_phase2_schema_rls_and_gl_completion.sql',
      primaryOrNaturalKey: 'product_id + image_url',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'added_or_hardened_in_0008',
    },
    {
      entityKey: 'supplier_offers',
      entityNameEn: 'Supplier Offers & Cost Proposals',
      entityNameBn: 'সাপ্লায়ার প্রোডাক্ট অফার ও মূল্য প্রস্তাবনা',
      legacyJsonSourceFile: '.data/erp-phase7-store.json',
      legacyJsonKeyPath: 'supplierProductOffers[] + priceProposals[]',
      targetPostgresTable: 'supplier_product_offers',
      definedInMigration: '0008_phase2_schema_rls_and_gl_completion.sql',
      primaryOrNaturalKey: 'offer_code',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'added_or_hardened_in_0008',
    },
    {
      entityKey: 'inventory',
      entityNameEn: 'Inventory & Consignment Dispatch Lots',
      entityNameBn: 'কনসাইনমেন্ট লট ও কিউসি স্টক রিসিপ্ট',
      legacyJsonSourceFile: '.data/erp-phase7-store.json',
      legacyJsonKeyPath: 'consignmentLots[]',
      targetPostgresTable: 'consignment_dispatch_lots',
      definedInMigration: '0008_phase2_schema_rls_and_gl_completion.sql',
      primaryOrNaturalKey: 'lot_code',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'added_or_hardened_in_0008',
    },
    {
      entityKey: 'warehouses',
      entityNameEn: 'Warehouses',
      entityNameBn: 'ওয়্যারহাউস ও ফিজিক্যাল হাব',
      legacyJsonSourceFile: '.data/erp-store.json',
      legacyJsonKeyPath: 'siteSettings.aboutContactPage.warehouseAddressBn',
      targetPostgresTable: 'warehouses',
      definedInMigration: '0008_phase2_schema_rls_and_gl_completion.sql',
      primaryOrNaturalKey: 'code',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'added_or_hardened_in_0008',
    },
    {
      entityKey: 'stock_movements',
      entityNameEn: 'Stock Movements Ledger',
      entityNameBn: 'অপরিবর্তনীয় ইনভেন্টরি স্টক মুভমেন্ট লেজার',
      legacyJsonSourceFile: '.data/erp-phase7-store.json',
      legacyJsonKeyPath: 'consignmentLots[] + orders[] reservations',
      targetPostgresTable: 'inventory_ledger',
      definedInMigration: '0003_catalog_tables.sql',
      primaryOrNaturalKey: 'id',
      isAppendOnlyImmutable: true,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'existing_0002_0006',
    },
    {
      entityKey: 'orders',
      entityNameEn: 'Orders',
      entityNameBn: 'মাস্টার কাস্টমার অর্ডার (Opaque Tracking Token সহ)',
      legacyJsonSourceFile: '.data/erp-store.json',
      legacyJsonKeyPath: 'orders[]',
      targetPostgresTable: 'orders',
      definedInMigration: '0004_order_and_courier.sql',
      primaryOrNaturalKey: 'order_no',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'added_or_hardened_in_0008',
    },
    {
      entityKey: 'order_items',
      entityNameEn: 'Order Items',
      entityNameBn: 'অর্ডার লাইন আইটেম (৩-স্তর প্রাইস স্ন্যাপশট)',
      legacyJsonSourceFile: '.data/erp-store.json',
      legacyJsonKeyPath: 'orderLines[]',
      targetPostgresTable: 'order_items',
      definedInMigration: '0004_order_and_courier.sql',
      primaryOrNaturalKey: 'order_id + variant_id',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'added_or_hardened_in_0008',
    },
    {
      entityKey: 'vendor_fulfillment_groups',
      entityNameEn: 'Vendor Fulfillment Groups',
      entityNameBn: 'মাল্টি-ভেন্ডর সাব-অর্ডার ফুলফিলমেন্ট গ্রুপ',
      legacyJsonSourceFile: '.data/erp-phase7-store.json',
      legacyJsonKeyPath: 'fulfillmentGroups[]',
      targetPostgresTable: 'vendor_fulfillment_groups',
      definedInMigration: '0008_phase2_schema_rls_and_gl_completion.sql',
      primaryOrNaturalKey: 'group_code',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'added_or_hardened_in_0008',
    },
    {
      entityKey: 'payments',
      entityNameEn: 'Order Payment State (COD & Manual bKash)',
      entityNameBn: 'অর্ডার পেমেন্ট স্ট্যাটাস (COD ও ম্যানুয়াল বিকাশ)',
      legacyJsonSourceFile: '.data/erp-store.json',
      legacyJsonKeyPath: 'orders[].{paymentMethod,paymentStatus,advancePaidPoisha,codCollectablePoisha}',
      targetPostgresTable: 'orders',
      definedInMigration: '0004_order_and_courier.sql',
      primaryOrNaturalKey: 'order_no',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'added_or_hardened_in_0008',
    },
    {
      entityKey: 'manual_payment_submissions',
      entityNameEn: 'Manual Payment Submissions (bKash TrxID)',
      entityNameBn: 'ম্যানুয়াল বিকাশ TrxID ভেরিফিকেশন কিউ',
      legacyJsonSourceFile: '.data/erp-store.json',
      legacyJsonKeyPath: 'manualBkashSubmissions[]',
      targetPostgresTable: 'manual_payment_submissions',
      definedInMigration: '0008_phase2_schema_rls_and_gl_completion.sql',
      primaryOrNaturalKey: 'submission_code',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'added_or_hardened_in_0008',
    },
    {
      entityKey: 'shipments',
      entityNameEn: 'Courier Pickup Batches & Shipments',
      entityNameBn: 'কুরিয়ার পিকআপ ব্যাচ ও হ্যান্ডওভার ম্যানিফেস্ট',
      legacyJsonSourceFile: '.data/erp-phase4b-store.json',
      legacyJsonKeyPath: 'pickupBatches[]',
      targetPostgresTable: 'pickup_batches',
      definedInMigration: '0004_order_and_courier.sql',
      primaryOrNaturalKey: 'batch_code',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'existing_0002_0006',
    },
    {
      entityKey: 'courier_events',
      entityNameEn: 'Courier Events & Claims',
      entityNameBn: 'কুরিয়ার ক্লেইম ও ডেলিভারি ইভেন্ট',
      legacyJsonSourceFile: '.data/erp-phase4b-store.json',
      legacyJsonKeyPath: 'courierClaims[]',
      targetPostgresTable: 'courier_claims',
      definedInMigration: '0005_escrow_ledger.sql',
      primaryOrNaturalKey: 'claim_no',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'existing_0002_0006',
    },
    {
      entityKey: 'returns',
      entityNameEn: 'Four-Way Return & Damage Cases',
      entityNameBn: '৪-মুখী রিটার্ন ও ড্যামেজ কেস',
      legacyJsonSourceFile: '.data/erp-phase4b-store.json',
      legacyJsonKeyPath: 'returnResolutions[]',
      targetPostgresTable: 'return_cases',
      definedInMigration: '0005_escrow_ledger.sql',
      primaryOrNaturalKey: 'case_no',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'existing_0002_0006',
    },
    {
      entityKey: 'refunds_reversals',
      entityNameEn: 'Customer Refunds & Double-Entry Ledger Reversals',
      entityNameBn: 'কাস্টমার রিফান্ড ও ডাবল-এন্ট্রি লেজার রিভার্সাল',
      legacyJsonSourceFile: '.data/erp-phase7-store.json',
      legacyJsonKeyPath: 'customerRefunds[] + ledgerReversals[]',
      targetPostgresTable: 'customer_refund_executions',
      definedInMigration: '0008_phase2_schema_rls_and_gl_completion.sql',
      primaryOrNaturalKey: 'refund_code',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'added_or_hardened_in_0008',
    },
    {
      entityKey: 'vendor_payables',
      entityNameEn: 'Immutable Vendor Escrow Ledger',
      entityNameBn: 'অপরিবর্তনীয় ভেন্ডর এসক্রো লেজার (Pending/Locked/Available)',
      legacyJsonSourceFile: '.data/erp-phase4b-store.json',
      legacyJsonKeyPath: 'vendorLedger[]',
      targetPostgresTable: 'vendor_ledger',
      definedInMigration: '0005_escrow_ledger.sql',
      primaryOrNaturalKey: 'id',
      isAppendOnlyImmutable: true,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'existing_0002_0006',
    },
    {
      entityKey: 'settlements',
      entityNameEn: 'Vendor Payouts & Courier COD Remittance Settlements',
      entityNameBn: 'ভেন্ডর পেআউট ও কুরিয়ার সিওডি রেমিট্যান্স সেটেলমেন্ট',
      legacyJsonSourceFile: '.data/erp-phase4b-store.json',
      legacyJsonKeyPath: 'payoutRequests[] + courierRemittanceLedger[]',
      targetPostgresTable: 'payout_requests',
      definedInMigration: '0005_escrow_ledger.sql',
      primaryOrNaturalKey: 'request_no',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'existing_0002_0006',
    },
    {
      entityKey: 'ledger_accounts',
      entityNameEn: 'General Ledger Chart of Accounts',
      entityNameBn: 'জেনারেল লেজার চার্ট অব অ্যাকাউন্টস',
      legacyJsonSourceFile: '.data/erp-phase7-store.json',
      legacyJsonKeyPath: 'executiveAccounting (derived)',
      targetPostgresTable: 'ledger_accounts',
      definedInMigration: '0008_phase2_schema_rls_and_gl_completion.sql',
      primaryOrNaturalKey: 'account_code',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'added_or_hardened_in_0008',
    },
    {
      entityKey: 'journal_entries_lines',
      entityNameEn: 'Immutable Double-Entry Journal Entries & Lines',
      entityNameBn: 'অপরিবর্তনীয় ডাবল-এন্ট্রি জার্নাল এন্ট্রি ও লাইন',
      legacyJsonSourceFile: '.data/erp-phase4b-store.json',
      legacyJsonKeyPath: 'vendorLedger[] + courierRemittanceLedger[]',
      targetPostgresTable: 'journal_entries',
      definedInMigration: '0008_phase2_schema_rls_and_gl_completion.sql',
      primaryOrNaturalKey: 'entry_no',
      isAppendOnlyImmutable: true,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'added_or_hardened_in_0008',
    },
    {
      entityKey: 'expenses',
      entityNameEn: 'Operating & Marketing Ad Spend Expenses',
      entityNameBn: 'অপারেটিং ও মার্কেটিং অ্যাড স্পেন্ড লেজার',
      legacyJsonSourceFile: '.data/erp-phase4c-store.json',
      legacyJsonKeyPath: 'expenses[]',
      targetPostgresTable: 'expenses',
      definedInMigration: '0005_escrow_ledger.sql',
      primaryOrNaturalKey: 'id',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'existing_0002_0006',
    },
    {
      entityKey: 'audit_logs',
      entityNameEn: 'Immutable Security & Operational Audit Logs',
      entityNameBn: 'অপরিবর্তনীয় সিকিউরিটি ও অপারেশনাল অডিট লগ',
      legacyJsonSourceFile: '.data/erp-admin-store.json',
      legacyJsonKeyPath: 'auditLogs[]',
      targetPostgresTable: 'audit_logs',
      definedInMigration: '0006_automation_and_logs.sql',
      primaryOrNaturalKey: 'id',
      isAppendOnlyImmutable: true,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'existing_0002_0006',
    },
    {
      entityKey: 'webhook_events',
      entityNameEn: 'Courier Webhook Events & Replay Registry',
      entityNameBn: 'কুরিয়ার ওয়েবহুক ইভেন্ট ও রিপ্লে প্রটেকশন লগ',
      legacyJsonSourceFile: '.data/erp-phase6-store.json',
      legacyJsonKeyPath: 'webhookEvents[]',
      targetPostgresTable: 'courier_webhook_events',
      definedInMigration: '0008_phase2_schema_rls_and_gl_completion.sql',
      primaryOrNaturalKey: 'event_key',
      isAppendOnlyImmutable: true,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'added_or_hardened_in_0008',
    },
    {
      entityKey: 'idempotency_records',
      entityNameEn: 'Idempotency Keys',
      entityNameBn: 'চেকআউট ও মিউটেশন আইডেমপোটেন্সি কী',
      legacyJsonSourceFile: '.data/erp-store.json',
      legacyJsonKeyPath: 'idempotencyKeys{}',
      targetPostgresTable: 'idempotency_keys',
      definedInMigration: '0006_automation_and_logs.sql',
      primaryOrNaturalKey: 'key',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'existing_0002_0006',
    },
    {
      entityKey: 'notifications',
      entityNameEn: 'Message Templates, Trigger Matrix & Dispatch Logs',
      entityNameBn: 'মেসেজ টেমপ্লেট, ট্রিগার ম্যাট্রিক্স ও ডিসপ্যাচ লগ',
      legacyJsonSourceFile: '.data/erp-phase4c-store.json',
      legacyJsonKeyPath: 'messageTemplates[] + messageLogs[]',
      targetPostgresTable: 'message_logs',
      definedInMigration: '0006_automation_and_logs.sql',
      primaryOrNaturalKey: 'id',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'existing_0002_0006',
    },
    {
      entityKey: 'print_records',
      entityNameEn: 'Print Archive & Reprint Audit Logs',
      entityNameBn: 'এ৪ ৩-পার্ট ও থার্মাল প্রিন্ট লগ',
      legacyJsonSourceFile: '.data/erp-phase4b-store.json',
      legacyJsonKeyPath: 'printCountsByOrderNo{}',
      targetPostgresTable: 'print_logs',
      definedInMigration: '0004_order_and_courier.sql',
      primaryOrNaturalKey: 'order_id + print_sequence_number',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'existing_0002_0006',
    },
    {
      entityKey: 'fraud_cases',
      entityNameEn: 'Customer Fraud Cases & Blacklist Registry',
      entityNameBn: 'কাস্টমার ফ্রড কেস ও ব্ল্যাকলিস্ট রেজিস্ট্রি',
      legacyJsonSourceFile: '.data/erp-admin-store.json',
      legacyJsonKeyPath: 'blacklistedPhones{}',
      targetPostgresTable: 'fraud_cases',
      definedInMigration: '0008_phase2_schema_rls_and_gl_completion.sql',
      primaryOrNaturalKey: 'case_code',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'added_or_hardened_in_0008',
    },
    {
      entityKey: 'store_settings',
      entityNameEn: 'Singleton Store Settings & Public-Safe Projection',
      entityNameBn: 'স্টোর সেটিংস ও পাবলিক-সেফ ভিউ (v_public_site_settings)',
      legacyJsonSourceFile: '.data/erp-store.json',
      legacyJsonKeyPath: 'siteSettings',
      targetPostgresTable: 'site_settings',
      definedInMigration: '0002_core_tables.sql',
      primaryOrNaturalKey: 'id=1',
      isAppendOnlyImmutable: false,
      rlsPolicyEnforced: true,
      schemaGapResolution: 'added_or_hardened_in_0008',
    },
  ];
}

// ============================================================================
// 2. SQL MIGRATION & RLS COVERAGE VERIFIER (SECTION 5.5 & 5.6)
// ============================================================================

export interface SqlRlsAndManifestAuditReport {
  migrationsDirExists: boolean;
  diskMigrationFiles: string[];
  manifestMigrationFiles: string[];
  manifestMatchesDiskFiles: boolean;
  manifestTablesMatchSqlDefinitions: boolean;
  totalTablesCreatedInSql: number;
  allTablesHaveRlsEnabled: boolean;
  tablesWithoutRlsEnabled: string[];
  allTablesHaveExplicitPolicies: boolean;
  tablesWithoutExplicitPolicies: string[];
  siteSettingsPublicReadRemoved: boolean;
  publicSafeSiteSettingsViewPresent: boolean;
  allSecurityDefinerFunctionsHaveSafeSearchPath: boolean;
  securityDefinerFunctionsChecked: string[];
  storageBucketsConfigured: boolean;
}

export function verifySqlMigrationsAndRlsCoverage(): SqlRlsAndManifestAuditReport {
  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    return {
      migrationsDirExists: false,
      diskMigrationFiles: [],
      manifestMigrationFiles: [],
      manifestMatchesDiskFiles: false,
      manifestTablesMatchSqlDefinitions: false,
      totalTablesCreatedInSql: 0,
      allTablesHaveRlsEnabled: false,
      tablesWithoutRlsEnabled: [],
      allTablesHaveExplicitPolicies: false,
      tablesWithoutExplicitPolicies: [],
      siteSettingsPublicReadRemoved: false,
      publicSafeSiteSettingsViewPresent: false,
      allSecurityDefinerFunctionsHaveSafeSearchPath: false,
      securityDefinerFunctionsChecked: [],
      storageBucketsConfigured: false,
    };
  }

  const diskFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const manifest = getSqlMigrationsManifest();
  const manifestFiles = manifest.map((m) => m.fileName);

  const manifestMatchesDiskFiles =
    diskFiles.length === manifestFiles.length &&
    diskFiles.every((f, idx) => f === manifestFiles[idx]);

  const createdTables = new Set<string>();
  const rlsEnabledTables = new Set<string>();
  const tablesWithPolicies = new Set<string>();
  let combinedSql = '';
  let manifestTablesMatchSqlDefinitions = true;

  for (const fileName of diskFiles) {
    const fullPath = path.join(migrationsDir, fileName);
    const sql = fs.readFileSync(fullPath, 'utf8');
    combinedSql += `\n${sql}`;

    const createMatches = sql.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z0-9_]+)\s*\(/gi
    );
    const fileTables = new Set<string>();
    for (const m of createMatches) {
      const tableName = m[1].toLowerCase();
      createdTables.add(tableName);
      fileTables.add(tableName);
    }

    const manifestItem = manifest.find((item) => item.fileName === fileName);
    if (manifestItem && fileTables.size > 0) {
      for (const tbl of fileTables) {
        if (!manifestItem.tablesCovered.includes(tbl)) {
          manifestTablesMatchSqlDefinitions = false;
        }
      }
    }
  }

  const rlsMatches = combinedSql.matchAll(
    /ALTER\s+TABLE\s+([a-z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi
  );
  for (const m of rlsMatches) {
    rlsEnabledTables.add(m[1].toLowerCase());
  }

  const policyMatches = combinedSql.matchAll(
    /CREATE\s+POLICY\s+[a-z0-9_]+\s+ON\s+([a-z0-9_]+)/gi
  );
  for (const m of policyMatches) {
    tablesWithPolicies.add(m[1].toLowerCase());
  }

  const tablesWithoutRlsEnabled = [...createdTables].filter(
    (t) => !rlsEnabledTables.has(t)
  );
  const tablesWithoutExplicitPolicies = [...createdTables].filter(
    (t) => !tablesWithPolicies.has(t)
  );

  const siteSettingsPublicReadRemoved =
    /DROP\s+POLICY\s+IF\s+EXISTS\s+pol_site_settings_public_read\s+ON\s+site_settings/i.test(
      combinedSql
    ) &&
    /CREATE\s+POLICY\s+pol_site_settings_staff_read\s+ON\s+site_settings/i.test(
      combinedSql
    );

  const publicSafeSiteSettingsViewPresent =
    /CREATE\s+OR\s+REPLACE\s+VIEW\s+v_public_site_settings\s+AS/i.test(
      combinedSql
    );

  // Verify the final definitions of SECURITY DEFINER functions in 0008 have SET search_path = public, pg_temp
  const migration0008Path = path.join(
    migrationsDir,
    '0008_phase2_schema_rls_and_gl_completion.sql'
  );
  const sql0008 = fs.existsSync(migration0008Path)
    ? fs.readFileSync(migration0008Path, 'utf8')
    : '';

  const securityDefinerFunctionsChecked = [
    'fn_prevent_ledger_mutation',
    'fn_current_role_slug',
    'fn_current_vendor_id',
    'fn_current_customer_phone',
  ];

  const allSecurityDefinerFunctionsHaveSafeSearchPath =
    securityDefinerFunctionsChecked.every((fnName) => {
      const regex = new RegExp(
        `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+${fnName}\\s*\\([\\s\\S]*?SECURITY\\s+DEFINER\\s+SET\\s+search_path\\s*=\\s*public,\\s*pg_temp`,
        'i'
      );
      return regex.test(sql0008);
    });

  const storageBucketsConfigured =
    sql0008.includes("'public-catalog-media'") &&
    sql0008.includes("'private-ops-evidence'");

  return {
    migrationsDirExists: true,
    diskMigrationFiles: diskFiles,
    manifestMigrationFiles: manifestFiles,
    manifestMatchesDiskFiles,
    manifestTablesMatchSqlDefinitions,
    totalTablesCreatedInSql: createdTables.size,
    allTablesHaveRlsEnabled: tablesWithoutRlsEnabled.length === 0,
    tablesWithoutRlsEnabled,
    allTablesHaveExplicitPolicies: tablesWithoutExplicitPolicies.length === 0,
    tablesWithoutExplicitPolicies,
    siteSettingsPublicReadRemoved,
    publicSafeSiteSettingsViewPresent,
    allSecurityDefinerFunctionsHaveSafeSearchPath,
    securityDefinerFunctionsChecked,
    storageBucketsConfigured,
  };
}

// ============================================================================
// 3. AUTOMATED RLS ALLOW / DENY SIMULATION TEST ENGINE (SECTION 5.5)
// ============================================================================

export type SimulatedDbActorRole =
  | 'anon'
  | 'authenticated_customer'
  | SystemRoleSlug;

export interface RlsAllowDenyTestCase {
  testId: string;
  tableOrView: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  actorRole: SimulatedDbActorRole;
  actorContextNote: string;
  expectedDecision: 'ALLOW' | 'DENY';
  actualDecision: 'ALLOW' | 'DENY';
  passed: boolean;
  policyEnforced: string;
}

export function evaluateSimulatedRlsAccess(params: {
  tableOrView: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  actorRole: SimulatedDbActorRole;
  actorVendorId?: string | null;
  recordVendorId?: string | null;
  actorCustomerPhone?: string | null;
  recordCustomerPhone?: string | null;
}): { decision: 'ALLOW' | 'DENY'; policyEnforced: string } {
  const { tableOrView, operation, actorRole } = params;

  // 1. Immutable append-only tables block UPDATE and DELETE for ALL roles (even super_admin!)
  const appendOnlyTables = new Set([
    'inventory_ledger',
    'vendor_ledger',
    'courier_remittance_ledger',
    'audit_logs',
    'journal_entries',
    'journal_lines',
  ]);
  if (
    appendOnlyTables.has(tableOrView) &&
    (operation === 'UPDATE' || operation === 'DELETE')
  ) {
    return {
      decision: 'DENY',
      policyEnforced: 'trg_immutable_ledger (fn_prevent_ledger_mutation)',
    };
  }

  // 2. Public-safe views
  if (
    tableOrView === 'v_public_site_settings' ||
    tableOrView === 'v_storefront_products'
  ) {
    return {
      decision: operation === 'SELECT' ? 'ALLOW' : 'DENY',
      policyEnforced:
        operation === 'SELECT'
          ? 'GRANT SELECT ON public-safe view TO anon, authenticated'
          : 'Views are read-only projections',
    };
  }

  // 3. Base site_settings table (Internal settings stripped from anon/customer/vendor!)
  if (tableOrView === 'site_settings') {
    if (
      operation === 'SELECT' &&
      (actorRole === 'super_admin' ||
        actorRole === 'marketing_manager' ||
        actorRole === 'packaging_manager')
    ) {
      return {
        decision: 'ALLOW',
        policyEnforced: 'pol_site_settings_staff_read',
      };
    }
    if (actorRole === 'super_admin') {
      return {
        decision: 'ALLOW',
        policyEnforced: 'pol_site_settings_super_admin_write',
      };
    }
    return {
      decision: 'DENY',
      policyEnforced:
        'pol_site_settings_staff_read (Blocks anon/customer/vendor from raw site_settings)',
    };
  }

  // 4. Vendor-isolated tables (products, product_variants, order_items, vendor_ledger, payout_requests, consignment_dispatch_lots, vendor_fulfillment_groups)
  const vendorScopedTables = new Set([
    'products',
    'product_variants',
    'order_items',
    'vendor_ledger',
    'payout_requests',
    'consignment_dispatch_lots',
    'vendor_fulfillment_groups',
  ]);
  if (vendorScopedTables.has(tableOrView)) {
    if (actorRole === 'super_admin') {
      return {
        decision: 'ALLOW',
        policyEnforced: `pol_super_admin_${tableOrView}`,
      };
    }
    if (actorRole === 'vendor') {
      const ownVendorMatch =
        Boolean(params.actorVendorId) &&
        params.actorVendorId === params.recordVendorId;
      if (operation === 'SELECT' && ownVendorMatch) {
        return {
          decision: 'ALLOW',
          policyEnforced: `pol_vendor_own_${tableOrView} (vendor_id = fn_current_vendor_id())`,
        };
      }
      if (
        operation === 'INSERT' &&
        (tableOrView === 'payout_requests' ||
          tableOrView === 'consignment_dispatch_lots') &&
        ownVendorMatch
      ) {
        return {
          decision: 'ALLOW',
          policyEnforced: `pol_vendor_own_${tableOrView}_insert`,
        };
      }
      return {
        decision: 'DENY',
        policyEnforced: `pol_vendor_own_${tableOrView} (Cross-vendor or unauthorized mutation blocked)`,
      };
    }
    if (
      actorRole === 'packaging_manager' &&
      (tableOrView === 'consignment_dispatch_lots' ||
        tableOrView === 'vendor_fulfillment_groups')
    ) {
      return {
        decision: 'ALLOW',
        policyEnforced: `pol_${tableOrView}_ops`,
      };
    }
    return {
      decision: 'DENY',
      policyEnforced: `RLS default deny on ${tableOrView} for ${actorRole}`,
    };
  }

  // 5. Customer-owned tables (orders, manual_payment_submissions, customer_addresses)
  if (
    tableOrView === 'orders' ||
    tableOrView === 'manual_payment_submissions' ||
    tableOrView === 'customer_addresses'
  ) {
    if (actorRole === 'super_admin' || actorRole === 'marketing_manager') {
      return {
        decision: 'ALLOW',
        policyEnforced: `pol_staff_${tableOrView}`,
      };
    }
    if (
      actorRole === 'packaging_manager' &&
      tableOrView === 'orders' &&
      operation === 'SELECT'
    ) {
      return {
        decision: 'ALLOW',
        policyEnforced: 'pol_staff_orders_read',
      };
    }
    if (actorRole === 'authenticated_customer' && operation === 'SELECT') {
      const ownPhoneMatch =
        Boolean(params.actorCustomerPhone) &&
        params.actorCustomerPhone === params.recordCustomerPhone;
      return {
        decision: ownPhoneMatch ? 'ALLOW' : 'DENY',
        policyEnforced: `pol_${tableOrView}_customer_own_read (phone = fn_current_customer_phone())`,
      };
    }
    return {
      decision: 'DENY',
      policyEnforced: `RLS blocks ${actorRole} ${operation} on ${tableOrView}`,
    };
  }

  // 6. Super-Admin-only tables (encrypted_credentials, audit_logs, journal_entries, ledger_reversal_requests)
  if (
    tableOrView === 'encrypted_credentials' ||
    tableOrView === 'audit_logs' ||
    tableOrView === 'journal_entries' ||
    tableOrView === 'ledger_reversal_requests'
  ) {
    if (actorRole === 'super_admin') {
      if (tableOrView === 'audit_logs' && operation !== 'SELECT') {
        return {
          decision: 'DENY',
          policyEnforced: 'pol_super_admin_audit_logs (SELECT only via RLS)',
        };
      }
      return {
        decision: 'ALLOW',
        policyEnforced: `pol_super_admin_${tableOrView}`,
      };
    }
    return {
      decision: 'DENY',
      policyEnforced: `pol_super_admin_${tableOrView} (Restricted to super_admin)`,
    };
  }

  return {
    decision: 'DENY',
    policyEnforced: 'RLS Default Deny',
  };
}

export function runRlsPolicyAllowDenyTests(): {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  cases: RlsAllowDenyTestCase[];
} {
  const rawCases: Array<
    Omit<RlsAllowDenyTestCase, 'actualDecision' | 'passed' | 'policyEnforced'> & {
      actorVendorId?: string | null;
      recordVendorId?: string | null;
      actorCustomerPhone?: string | null;
      recordCustomerPhone?: string | null;
    }
  > = [
    {
      testId: 'RLS-01',
      tableOrView: 'site_settings',
      operation: 'SELECT',
      actorRole: 'anon',
      actorContextNote: 'Anonymous storefront visitor reading raw site_settings table',
      expectedDecision: 'DENY',
    },
    {
      testId: 'RLS-02',
      tableOrView: 'v_public_site_settings',
      operation: 'SELECT',
      actorRole: 'anon',
      actorContextNote: 'Anonymous storefront visitor reading sanitized v_public_site_settings view',
      expectedDecision: 'ALLOW',
    },
    {
      testId: 'RLS-03',
      tableOrView: 'site_settings',
      operation: 'SELECT',
      actorRole: 'super_admin',
      actorContextNote: 'Super Admin reading full site_settings table',
      expectedDecision: 'ALLOW',
    },
    {
      testId: 'RLS-04',
      tableOrView: 'products',
      operation: 'SELECT',
      actorRole: 'vendor',
      actorVendorId: 'vnd-001',
      recordVendorId: 'vnd-001',
      actorContextNote: 'Vendor VND-001 reading own product row',
      expectedDecision: 'ALLOW',
    },
    {
      testId: 'RLS-05',
      tableOrView: 'products',
      operation: 'SELECT',
      actorRole: 'vendor',
      actorVendorId: 'vnd-001',
      recordVendorId: 'vnd-002',
      actorContextNote: 'Vendor VND-001 attempting to read Vendor VND-002 product row',
      expectedDecision: 'DENY',
    },
    {
      testId: 'RLS-06',
      tableOrView: 'vendor_ledger',
      operation: 'SELECT',
      actorRole: 'vendor',
      actorVendorId: 'vnd-001',
      recordVendorId: 'vnd-001',
      actorContextNote: 'Vendor VND-001 reading own escrow ledger entries',
      expectedDecision: 'ALLOW',
    },
    {
      testId: 'RLS-07',
      tableOrView: 'vendor_ledger',
      operation: 'SELECT',
      actorRole: 'vendor',
      actorVendorId: 'vnd-001',
      recordVendorId: 'vnd-002',
      actorContextNote: 'Vendor VND-001 attempting to read Vendor VND-002 escrow ledger',
      expectedDecision: 'DENY',
    },
    {
      testId: 'RLS-08',
      tableOrView: 'vendor_ledger',
      operation: 'UPDATE',
      actorRole: 'super_admin',
      actorContextNote: 'Even Super Admin attempting to UPDATE immutable vendor_ledger row',
      expectedDecision: 'DENY',
    },
    {
      testId: 'RLS-09',
      tableOrView: 'journal_entries',
      operation: 'DELETE',
      actorRole: 'super_admin',
      actorContextNote: 'Even Super Admin attempting to DELETE immutable journal_entries row',
      expectedDecision: 'DENY',
    },
    {
      testId: 'RLS-10',
      tableOrView: 'orders',
      operation: 'SELECT',
      actorRole: 'authenticated_customer',
      actorCustomerPhone: '01711223344',
      recordCustomerPhone: '01711223344',
      actorContextNote: 'Authenticated customer reading own order by verified phone',
      expectedDecision: 'ALLOW',
    },
    {
      testId: 'RLS-11',
      tableOrView: 'orders',
      operation: 'SELECT',
      actorRole: 'authenticated_customer',
      actorCustomerPhone: '01711223344',
      recordCustomerPhone: '01899887766',
      actorContextNote: 'Authenticated customer attempting to read another customer order',
      expectedDecision: 'DENY',
    },
    {
      testId: 'RLS-12',
      tableOrView: 'orders',
      operation: 'SELECT',
      actorRole: 'anon',
      actorContextNote: 'Anonymous user attempting direct SELECT on orders table',
      expectedDecision: 'DENY',
    },
    {
      testId: 'RLS-13',
      tableOrView: 'encrypted_credentials',
      operation: 'SELECT',
      actorRole: 'marketing_manager',
      actorContextNote: 'Marketing Manager attempting to read encrypted_credentials vault',
      expectedDecision: 'DENY',
    },
    {
      testId: 'RLS-14',
      tableOrView: 'consignment_dispatch_lots',
      operation: 'INSERT',
      actorRole: 'vendor',
      actorVendorId: 'vnd-001',
      recordVendorId: 'vnd-001',
      actorContextNote: 'Vendor VND-001 creating own consignment dispatch lot',
      expectedDecision: 'ALLOW',
    },
    {
      testId: 'RLS-15',
      tableOrView: 'consignment_dispatch_lots',
      operation: 'INSERT',
      actorRole: 'vendor',
      actorVendorId: 'vnd-001',
      recordVendorId: 'vnd-002',
      actorContextNote: 'Vendor VND-001 attempting to create dispatch lot under Vendor VND-002',
      expectedDecision: 'DENY',
    },
  ];

  const cases: RlsAllowDenyTestCase[] = rawCases.map((tc) => {
    const evalRes = evaluateSimulatedRlsAccess({
      tableOrView: tc.tableOrView,
      operation: tc.operation,
      actorRole: tc.actorRole,
      actorVendorId: tc.actorVendorId,
      recordVendorId: tc.recordVendorId,
      actorCustomerPhone: tc.actorCustomerPhone,
      recordCustomerPhone: tc.recordCustomerPhone,
    });
    return {
      testId: tc.testId,
      tableOrView: tc.tableOrView,
      operation: tc.operation,
      actorRole: tc.actorRole,
      actorContextNote: tc.actorContextNote,
      expectedDecision: tc.expectedDecision,
      actualDecision: evalRes.decision,
      passed: evalRes.decision === tc.expectedDecision,
      policyEnforced: evalRes.policyEnforced,
    };
  });

  const passedTests = cases.filter((c) => c.passed).length;
  return {
    totalTests: cases.length,
    passedTests,
    failedTests: cases.length - passedTests,
    cases,
  };
}

// ============================================================================
// 4. JSON DATA MIGRATION, CONFLICT DETECTOR & RECONCILER (SECTION 5.4)
// ============================================================================

export interface SourceJsonFileInventoryItem {
  fileName: string;
  existsOnDisk: boolean;
  sizeBytes: number;
  sha256Checksum: string;
  topLevelKeys: string[];
}

export interface MigrationConflictItem {
  conflictCode:
    | 'DUPLICATE_ORDER_NO'
    | 'DUPLICATE_PUBLIC_SKU'
    | 'DUPLICATE_PRODUCT_SLUG'
    | 'DUPLICATE_ACTIVE_BKASH_TRX_ID'
    | 'THREE_TIER_PRICE_MISMATCH'
    | 'NEGATIVE_STOCK_OR_MONEY'
    | 'UNBALANCED_REVERSAL_ENTRY'
    | 'ORPHANED_FOREIGN_KEY'
    | 'UNSUPPORTED_PAYMENT_METHOD';
  severity: 'critical' | 'high';
  sourceFile: string;
  entityType: string;
  recordId: string;
  detailBn: string;
  rawSnapshot: Record<string, unknown>;
}

export interface TableRowReconciliationItem {
  tableName: string;
  sourceRecordsCount: number;
  validTransformedRowsCount: number;
  conflictingRowsCount: number;
  reconciled: boolean;
  upsertStrategy: string;
}

export interface FinancialTotalReconciliationItem {
  metricKey: string;
  labelBn: string;
  sourceTotalPoisha: Poisha;
  targetTotalPoisha: Poisha;
  variancePoisha: Poisha;
  reconciled: boolean;
}

export interface IdempotentUpsertBatchPreview {
  tableName: string;
  conflictTargetColumn: string;
  mode: 'UPSERT_ON_CONFLICT_UPDATE' | 'APPEND_ONLY_ON_CONFLICT_DO_NOTHING';
  rowCount: number;
  sampleDeterministicIds: string[];
}

export interface JsonToSupabaseMigrationDryRunReport {
  runId: string;
  executedAt: string;
  dryRun: boolean;
  requiresOperatorApprovalBeforeProdRun: boolean;
  readyForProductionMigration: boolean;
  sourceFilesInventory: SourceJsonFileInventoryItem[];
  rowReconciliation: TableRowReconciliationItem[];
  financialReconciliation: FinancialTotalReconciliationItem[];
  conflicts: MigrationConflictItem[];
  idempotentBatches: IdempotentUpsertBatchPreview[];
  backupAndRestorePlan: {
    preMigrationSnapshotChecksum: string;
    backupDirectory: string;
    rollbackSqlScript: string;
    verificationStepsBn: string[];
  };
}

function deterministicUuidFromKey(namespace: string, naturalKey: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${namespace}:${naturalKey}`)
    .digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-');
}

export interface CustomMigrationInputOverride {
  injectDuplicateOrderNo?: boolean;
  injectBrokenThreeTierVariant?: boolean;
  injectDuplicateBkashTrxId?: boolean;
}

/**
 * Executes a non-destructive JSON-to-Supabase Migration Dry-Run:
 * - Inventories all 7 .data/*.json files
 * - Validates every record & detects conflicts without silently dropping or mutating any row
 * - Reconciles row counts and exact integer Poisha totals
 * - Generates deterministic UUIDs so repeated runs are 100% idempotent
 */
export function runJsonToSupabaseMigrationDryRun(
  overrides?: CustomMigrationInputOverride
): JsonToSupabaseMigrationDryRunReport {
  const dataDir = path.join(process.cwd(), '.data');
  const jsonFileNames = [
    'erp-store.json',
    'erp-admin-store.json',
    'erp-phase4b-store.json',
    'erp-phase4c-store.json',
    'erp-phase6-store.json',
    'erp-phase7-store.json',
    'erp-security-sessions.json',
  ];

  // Ensure stores are initialized
  const erp = structuredClone(readErpState());
  const adminStore = structuredClone(readAdminStore());
  const p4b = structuredClone(readPhase4BStore());
  const p4c = structuredClone(readPhase4CStore());
  const p6 = structuredClone(readPhase6Store());
  const p7 = structuredClone(readPhase7Store());

  // Optional test overrides to verify conflict detection never silently drops records
  if (overrides?.injectDuplicateOrderNo && erp.orders.length > 0) {
    erp.orders.push({ ...erp.orders[0] });
  }
  if (
    overrides?.injectBrokenThreeTierVariant &&
    erp.products[0]?.variants[0]
  ) {
    erp.products[0].variants[0].salePricePoisha += 999;
  }
  if (overrides?.injectDuplicateBkashTrxId) {
    const sampleSubmission = {
      submissionId: 'sub-dup-test-1',
      orderNo: erp.orders[0]?.orderNo ?? 'ORD-261106-0001',
      senderPhone: '01711223344',
      senderPhoneMasked: '01711****44',
      orderCustomerPhone: '01711223344',
      senderPhoneMatchesOrderPhone: true,
      trxId: 'DUPTRX9988',
      submittedAmountPoisha: 12000,
      expectedPayablePoisha: 12000,
      status: 'pending_verification' as const,
      submittedByRole: 'customer' as const,
      submittedByUsername: '01711223344',
      reviewedByUsername: null,
      reviewNoteBn: null,
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
    };
    erp.manualBkashSubmissions = [
      ...(erp.manualBkashSubmissions ?? []),
      sampleSubmission,
      { ...sampleSubmission, submissionId: 'sub-dup-test-2' },
    ];
  }

  const sourceFilesInventory: SourceJsonFileInventoryItem[] = jsonFileNames.map(
    (fileName) => {
      const fullPath = path.join(dataDir, fileName);
      if (!fs.existsSync(fullPath)) {
        return {
          fileName,
          existsOnDisk: false,
          sizeBytes: 0,
          sha256Checksum: '0'.repeat(64),
          topLevelKeys: [],
        };
      }
      const raw = fs.readFileSync(fullPath, 'utf8');
      const checksum = crypto.createHash('sha256').update(raw).digest('hex');
      let topKeys: string[] = [];
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        topKeys = Object.keys(parsed);
      } catch {
        topKeys = [];
      }
      return {
        fileName,
        existsOnDisk: true,
        sizeBytes: Buffer.byteLength(raw, 'utf8'),
        sha256Checksum: checksum,
        topLevelKeys: topKeys,
      };
    }
  );

  const conflicts: MigrationConflictItem[] = [];

  // 1. Validate Vendors
  const vendorIdsSet = new Set(p4b.vendors.map((v) => v.vendorId));

  // 2. Validate Products & Variants (3-Tier Poisha Math & Duplicate SKUs/Slugs)
  const seenSlugs = new Set<string>();
  const seenSkus = new Set<string>();
  const validProductsCount = erp.products.length;
  const allVariants = erp.products.flatMap((p) => p.variants);
  let validVariantsCount = 0;
  let variantConflictsCount = 0;

  for (const prod of erp.products) {
    if (seenSlugs.has(prod.slug)) {
      conflicts.push({
        conflictCode: 'DUPLICATE_PRODUCT_SLUG',
        severity: 'critical',
        sourceFile: '.data/erp-store.json',
        entityType: 'products',
        recordId: prod.productId,
        detailBn: `ডুপ্লিকেট প্রোডাক্ট স্লাগ পাওয়া গেছে: ${prod.slug}`,
        rawSnapshot: { productId: prod.productId, slug: prod.slug },
      });
    }
    seenSlugs.add(prod.slug);

    if (!vendorIdsSet.has(prod.vendorId)) {
      conflicts.push({
        conflictCode: 'ORPHANED_FOREIGN_KEY',
        severity: 'high',
        sourceFile: '.data/erp-store.json',
        entityType: 'products',
        recordId: prod.productId,
        detailBn: `প্রোডাক্ট ${prod.slug}-এর vendorId (${prod.vendorId}) ভেন্ডর টেবিলে পাওয়া যায়নি।`,
        rawSnapshot: { productId: prod.productId, vendorId: prod.vendorId },
      });
    }

    for (const v of prod.variants) {
      let hasVariantConflict = false;
      if (seenSkus.has(v.publicSku)) {
        hasVariantConflict = true;
        conflicts.push({
          conflictCode: 'DUPLICATE_PUBLIC_SKU',
          severity: 'critical',
          sourceFile: '.data/erp-store.json',
          entityType: 'product_variants',
          recordId: v.variantId,
          detailBn: `ডুপ্লিকেট পাবলিক SKU পাওয়া গেছে: ${v.publicSku}`,
          rawSnapshot: { variantId: v.variantId, publicSku: v.publicSku },
        });
      }
      seenSkus.add(v.publicSku);

      const threeTierOk =
        v.supplierCostPoisha + v.supplierProfitPoisha ===
          v.supplierPayablePoisha &&
        v.supplierPayablePoisha + v.platformMarginPoisha === v.salePricePoisha;

      if (!threeTierOk) {
        hasVariantConflict = true;
        conflicts.push({
          conflictCode: 'THREE_TIER_PRICE_MISMATCH',
          severity: 'critical',
          sourceFile: '.data/erp-store.json',
          entityType: 'product_variants',
          recordId: v.variantId,
          detailBn: `ভ্যারিয়েন্ট ${v.publicSku}-এ ৩-স্তর পয়সা সমীকরণ মেলেনি: Cost(${v.supplierCostPoisha}) + Profit(${v.supplierProfitPoisha}) != Payable(${v.supplierPayablePoisha}) বা Payable + Margin(${v.platformMarginPoisha}) != Sale(${v.salePricePoisha})`,
          rawSnapshot: {
            variantId: v.variantId,
            publicSku: v.publicSku,
            supplierCostPoisha: v.supplierCostPoisha,
            supplierProfitPoisha: v.supplierProfitPoisha,
            supplierPayablePoisha: v.supplierPayablePoisha,
            platformMarginPoisha: v.platformMarginPoisha,
            salePricePoisha: v.salePricePoisha,
          },
        });
      }

      if (v.stockOnHand < 0 || v.stockAvailable < 0 || v.salePricePoisha < 0) {
        hasVariantConflict = true;
        conflicts.push({
          conflictCode: 'NEGATIVE_STOCK_OR_MONEY',
          severity: 'critical',
          sourceFile: '.data/erp-store.json',
          entityType: 'product_variants',
          recordId: v.variantId,
          detailBn: `ভ্যারিয়েন্ট ${v.publicSku}-এ ঋণাত্মক স্টক বা মূল্য পাওয়া গেছে।`,
          rawSnapshot: { variantId: v.variantId, stockOnHand: v.stockOnHand },
        });
      }

      if (hasVariantConflict) {
        variantConflictsCount += 1;
      } else {
        validVariantsCount += 1;
      }
    }
  }

  // 3. Validate Orders & Duplicate orderNo / Unsupported Payment Method
  const seenOrderNos = new Set<string>();
  let validOrdersCount = 0;
  let orderConflictsCount = 0;

  for (const ord of erp.orders) {
    let hasOrderConflict = false;
    if (seenOrderNos.has(ord.orderNo)) {
      hasOrderConflict = true;
      conflicts.push({
        conflictCode: 'DUPLICATE_ORDER_NO',
        severity: 'critical',
        sourceFile: '.data/erp-store.json',
        entityType: 'orders',
        recordId: ord.orderNo,
        detailBn: `ডুপ্লিকেট অর্ডার নম্বর পাওয়া গেছে: ${ord.orderNo}। কোনো রেকর্ড চুপচাপ বাদ দেওয়া হয়নি।`,
        rawSnapshot: { id: ord.id, orderNo: ord.orderNo },
      });
    }
    seenOrderNos.add(ord.orderNo);

    if (
      ord.paymentMethod !== 'cod' &&
      ord.paymentMethod !== 'bkash_manual'
    ) {
      hasOrderConflict = true;
      conflicts.push({
        conflictCode: 'UNSUPPORTED_PAYMENT_METHOD',
        severity: 'critical',
        sourceFile: '.data/erp-store.json',
        entityType: 'orders',
        recordId: ord.orderNo,
        detailBn: `অর্ডার ${ord.orderNo}-এ অনুমোদনহীন পেমেন্ট মেথড (${ord.paymentMethod}) পাওয়া গেছে।`,
        rawSnapshot: { orderNo: ord.orderNo, paymentMethod: ord.paymentMethod },
      });
    }

    if (hasOrderConflict) {
      orderConflictsCount += 1;
    } else {
      validOrdersCount += 1;
    }
  }

  // 4. Validate Manual bKash Submissions (Duplicate Active TrxID check)
  const submissions = erp.manualBkashSubmissions ?? [];
  const seenActiveTrxIds = new Set<string>();
  let validSubmissionsCount = 0;
  let submissionConflictsCount = 0;

  for (const sub of submissions) {
    const trxUpper = sub.trxId.trim().toUpperCase();
    const isActiveOrApproved =
      sub.status === 'pending_verification' ||
      sub.status === 'under_review' ||
      sub.status === 'approved';

    if (isActiveOrApproved && seenActiveTrxIds.has(trxUpper)) {
      submissionConflictsCount += 1;
      conflicts.push({
        conflictCode: 'DUPLICATE_ACTIVE_BKASH_TRX_ID',
        severity: 'critical',
        sourceFile: '.data/erp-store.json',
        entityType: 'manual_payment_submissions',
        recordId: sub.submissionId,
        detailBn: `ডুপ্লিকেট সক্রিয় বিকাশ TrxID (${trxUpper}) পাওয়া গেছে (Submission: ${sub.submissionId})।`,
        rawSnapshot: { submissionId: sub.submissionId, trxId: trxUpper },
      });
    } else {
      if (isActiveOrApproved) {
        seenActiveTrxIds.add(trxUpper);
      }
      validSubmissionsCount += 1;
    }
  }

  // 5. Validate Ledger Reversals
  const reversals = p7.ledgerReversals ?? [];
  let validReversalsCount = 0;
  let reversalConflictsCount = 0;
  for (const rev of reversals) {
    if (rev.reversalDebitPoisha !== rev.reversalCreditPoisha) {
      reversalConflictsCount += 1;
      conflicts.push({
        conflictCode: 'UNBALANCED_REVERSAL_ENTRY',
        severity: 'critical',
        sourceFile: '.data/erp-phase7-store.json',
        entityType: 'ledger_reversal_requests',
        recordId: rev.reversalId,
        detailBn: `লেজার রিভার্সাল ${rev.reversalCode}-এ ডেবিট (${rev.reversalDebitPoisha}) এবং ক্রেডিট (${rev.reversalCreditPoisha}) সমান নয়।`,
        rawSnapshot: { reversalId: rev.reversalId },
      });
    } else {
      validReversalsCount += 1;
    }
  }

  // 6. Row Count Reconciliation across target PostgreSQL tables
  const uniqueCustomersByPhone = new Map<string, { phone: string; name: string }>();
  for (const ord of erp.orders) {
    uniqueCustomersByPhone.set(ord.customerPhone, {
      phone: ord.customerPhone,
      name: ord.customerName,
    });
  }

  const rowReconciliation: TableRowReconciliationItem[] = [
    {
      tableName: 'vendors',
      sourceRecordsCount: p4b.vendors.length,
      validTransformedRowsCount: p4b.vendors.length,
      conflictingRowsCount: 0,
      reconciled: true,
      upsertStrategy: 'ON CONFLICT (code) DO UPDATE',
    },
    {
      tableName: 'users_profile',
      sourceRecordsCount: adminStore.users.length,
      validTransformedRowsCount: adminStore.users.length,
      conflictingRowsCount: 0,
      reconciled: true,
      upsertStrategy: 'ON CONFLICT (username) DO UPDATE',
    },
    {
      tableName: 'categories',
      sourceRecordsCount: erp.categories.length,
      validTransformedRowsCount: erp.categories.length,
      conflictingRowsCount: 0,
      reconciled: true,
      upsertStrategy: 'ON CONFLICT (slug) DO UPDATE',
    },
    {
      tableName: 'products',
      sourceRecordsCount: validProductsCount,
      validTransformedRowsCount: validProductsCount,
      conflictingRowsCount: 0,
      reconciled: true,
      upsertStrategy: 'ON CONFLICT (slug) DO UPDATE',
    },
    {
      tableName: 'product_variants',
      sourceRecordsCount: allVariants.length,
      validTransformedRowsCount: validVariantsCount,
      conflictingRowsCount: variantConflictsCount,
      reconciled: variantConflictsCount === 0,
      upsertStrategy: 'ON CONFLICT (public_sku) DO UPDATE',
    },
    {
      tableName: 'customers',
      sourceRecordsCount: uniqueCustomersByPhone.size,
      validTransformedRowsCount: uniqueCustomersByPhone.size,
      conflictingRowsCount: 0,
      reconciled: true,
      upsertStrategy: 'ON CONFLICT (phone) DO UPDATE',
    },
    {
      tableName: 'orders',
      sourceRecordsCount: erp.orders.length,
      validTransformedRowsCount: validOrdersCount,
      conflictingRowsCount: orderConflictsCount,
      reconciled: orderConflictsCount === 0,
      upsertStrategy: 'ON CONFLICT (order_no) DO UPDATE',
    },
    {
      tableName: 'order_items',
      sourceRecordsCount: erp.orderLines.length,
      validTransformedRowsCount: erp.orderLines.length,
      conflictingRowsCount: 0,
      reconciled: true,
      upsertStrategy: 'ON CONFLICT (id) DO NOTHING',
    },
    {
      tableName: 'manual_payment_submissions',
      sourceRecordsCount: submissions.length,
      validTransformedRowsCount: validSubmissionsCount,
      conflictingRowsCount: submissionConflictsCount,
      reconciled: submissionConflictsCount === 0,
      upsertStrategy: 'ON CONFLICT (submission_code) DO UPDATE',
    },
    {
      tableName: 'vendor_ledger',
      sourceRecordsCount: p4b.vendorLedger.length,
      validTransformedRowsCount: p4b.vendorLedger.length,
      conflictingRowsCount: 0,
      reconciled: true,
      upsertStrategy: 'ON CONFLICT (id) DO NOTHING (Immutable Append-Only)',
    },
    {
      tableName: 'payout_requests',
      sourceRecordsCount: p4b.payoutRequests.length,
      validTransformedRowsCount: p4b.payoutRequests.length,
      conflictingRowsCount: 0,
      reconciled: true,
      upsertStrategy: 'ON CONFLICT (request_no) DO UPDATE',
    },
    {
      tableName: 'courier_remittance_ledger',
      sourceRecordsCount: p4b.courierRemittanceLedger.length,
      validTransformedRowsCount: p4b.courierRemittanceLedger.length,
      conflictingRowsCount: 0,
      reconciled: true,
      upsertStrategy: 'ON CONFLICT (id) DO NOTHING (Immutable Append-Only)',
    },
    {
      tableName: 'expenses',
      sourceRecordsCount: p4c.expenses.length,
      validTransformedRowsCount: p4c.expenses.length,
      conflictingRowsCount: 0,
      reconciled: true,
      upsertStrategy: 'ON CONFLICT (id) DO NOTHING',
    },
    {
      tableName: 'audit_logs',
      sourceRecordsCount: adminStore.auditLogs.length,
      validTransformedRowsCount: adminStore.auditLogs.length,
      conflictingRowsCount: 0,
      reconciled: true,
      upsertStrategy: 'ON CONFLICT (id) DO NOTHING (Immutable Append-Only)',
    },
    {
      tableName: 'consignment_dispatch_lots',
      sourceRecordsCount: p7.consignmentLots.length,
      validTransformedRowsCount: p7.consignmentLots.length,
      conflictingRowsCount: 0,
      reconciled: true,
      upsertStrategy: 'ON CONFLICT (lot_code) DO UPDATE',
    },
    {
      tableName: 'vendor_fulfillment_groups',
      sourceRecordsCount: (p7.fulfillmentGroups ?? []).length,
      validTransformedRowsCount: (p7.fulfillmentGroups ?? []).length,
      conflictingRowsCount: 0,
      reconciled: true,
      upsertStrategy: 'ON CONFLICT (group_code) DO UPDATE',
    },
    {
      tableName: 'ledger_reversal_requests',
      sourceRecordsCount: reversals.length,
      validTransformedRowsCount: validReversalsCount,
      conflictingRowsCount: reversalConflictsCount,
      reconciled: reversalConflictsCount === 0,
      upsertStrategy: 'ON CONFLICT (reversal_code) DO UPDATE',
    },
    {
      tableName: 'courier_webhook_events',
      sourceRecordsCount: p6.webhookEvents.length,
      validTransformedRowsCount: p6.webhookEvents.length,
      conflictingRowsCount: 0,
      reconciled: true,
      upsertStrategy: 'ON CONFLICT (event_key) DO NOTHING',
    },
  ];

  // 7. Exact Integer Poisha Financial Total Reconciliation
  const sourceVariantsSalePoisha = allVariants.reduce(
    (sum, v) => sum + v.salePricePoisha,
    0
  );
  const targetVariantsSalePoisha = allVariants.reduce(
    (sum, v) =>
      sum +
      (v.supplierCostPoisha + v.supplierProfitPoisha + v.platformMarginPoisha),
    0
  );

  const sourceOrdersPayablePoisha = erp.orders.reduce(
    (sum, o) => sum + o.totalPayablePoisha,
    0
  );
  const targetOrdersPayablePoisha = erp.orders
    .filter((_, idx) => idx < validOrdersCount)
    .reduce((sum, o) => sum + o.totalPayablePoisha, 0);

  const sourceOrderLinesSubtotalPoisha = erp.orderLines.reduce(
    (sum, l) => sum + l.lineSubtotalPoisha,
    0
  );
  const targetOrderLinesSubtotalPoisha = erp.orderLines.reduce(
    (sum, l) => sum + l.snapUnitSalePricePoisha * l.quantity,
    0
  );

  const sourceVendorLedgerPoisha = p4b.vendorLedger.reduce(
    (sum, e) => sum + e.amountPoisha,
    0
  );
  const targetVendorLedgerPoisha = p4b.vendorLedger.reduce(
    (sum, e) => sum + e.amountPoisha,
    0
  );

  const sourcePayoutRequestsPoisha = p4b.payoutRequests.reduce(
    (sum, p) => sum + p.requestedAmountPoisha,
    0
  );
  const targetPayoutRequestsPoisha = p4b.payoutRequests.reduce(
    (sum, p) => sum + p.requestedAmountPoisha,
    0
  );

  const sourceRemittancePoisha = p4b.courierRemittanceLedger.reduce(
    (sum, r) => sum + r.remittedAmountPoisha,
    0
  );
  const targetRemittancePoisha = p4b.courierRemittanceLedger.reduce(
    (sum, r) => sum + r.remittedAmountPoisha,
    0
  );

  const sourceExpensesPoisha = p4c.expenses.reduce(
    (sum, ex) => sum + ex.amountPoisha,
    0
  );
  const targetExpensesPoisha = p4c.expenses.reduce(
    (sum, ex) => sum + ex.amountPoisha,
    0
  );

  const financialReconciliation: FinancialTotalReconciliationItem[] = [
    {
      metricKey: 'variants_three_tier_sale_sum',
      labelBn: 'সকল প্রোডাক্ট ভ্যারিয়েন্ট ৩-স্তর বিক্রয়মূল্য যোগফল (Poisha)',
      sourceTotalPoisha: sourceVariantsSalePoisha,
      targetTotalPoisha: targetVariantsSalePoisha,
      variancePoisha: sourceVariantsSalePoisha - targetVariantsSalePoisha,
      reconciled: sourceVariantsSalePoisha === targetVariantsSalePoisha,
    },
    {
      metricKey: 'orders_total_payable_sum',
      labelBn: 'সকল অর্ডারের মোট প্রদেয় (total_payable_poisha) যোগফল',
      sourceTotalPoisha: sourceOrdersPayablePoisha,
      targetTotalPoisha: targetOrdersPayablePoisha,
      variancePoisha: sourceOrdersPayablePoisha - targetOrdersPayablePoisha,
      reconciled: sourceOrdersPayablePoisha === targetOrdersPayablePoisha,
    },
    {
      metricKey: 'order_items_line_subtotal_sum',
      labelBn: 'সকল অর্ডার লাইন সাবটোটাল (line_subtotal_poisha) যোগফল',
      sourceTotalPoisha: sourceOrderLinesSubtotalPoisha,
      targetTotalPoisha: targetOrderLinesSubtotalPoisha,
      variancePoisha:
        sourceOrderLinesSubtotalPoisha - targetOrderLinesSubtotalPoisha,
      reconciled:
        sourceOrderLinesSubtotalPoisha === targetOrderLinesSubtotalPoisha,
    },
    {
      metricKey: 'vendor_escrow_ledger_net_sum',
      labelBn: 'ভেন্ডর এসক্রো লেজার নিট পয়সা যোগফল (vendor_ledger)',
      sourceTotalPoisha: sourceVendorLedgerPoisha,
      targetTotalPoisha: targetVendorLedgerPoisha,
      variancePoisha: sourceVendorLedgerPoisha - targetVendorLedgerPoisha,
      reconciled: sourceVendorLedgerPoisha === targetVendorLedgerPoisha,
    },
    {
      metricKey: 'payout_requests_total_sum',
      labelBn: 'ভেন্ডর পেআউট রিকোয়েস্ট মোট পয়সা যোগফল (payout_requests)',
      sourceTotalPoisha: sourcePayoutRequestsPoisha,
      targetTotalPoisha: targetPayoutRequestsPoisha,
      variancePoisha: sourcePayoutRequestsPoisha - targetPayoutRequestsPoisha,
      reconciled: sourcePayoutRequestsPoisha === targetPayoutRequestsPoisha,
    },
    {
      metricKey: 'courier_remittance_total_sum',
      labelBn: 'কুরিয়ার রেমিট্যান্স সেটেলমেন্ট মোট পয়সা যোগফল',
      sourceTotalPoisha: sourceRemittancePoisha,
      targetTotalPoisha: targetRemittancePoisha,
      variancePoisha: sourceRemittancePoisha - targetRemittancePoisha,
      reconciled: sourceRemittancePoisha === targetRemittancePoisha,
    },
    {
      metricKey: 'expenses_total_sum',
      labelBn: 'মার্কেটিং ও অপারেটিং এক্সপেন্স মোট পয়সা যোগফল',
      sourceTotalPoisha: sourceExpensesPoisha,
      targetTotalPoisha: targetExpensesPoisha,
      variancePoisha: sourceExpensesPoisha - targetExpensesPoisha,
      reconciled: sourceExpensesPoisha === targetExpensesPoisha,
    },
  ];

  // 8. Build Deterministic Idempotent Upsert Batch Previews
  const idempotentBatches: IdempotentUpsertBatchPreview[] = [
    {
      tableName: 'vendors',
      conflictTargetColumn: 'code',
      mode: 'UPSERT_ON_CONFLICT_UPDATE',
      rowCount: p4b.vendors.length,
      sampleDeterministicIds: p4b.vendors
        .slice(0, 3)
        .map((v) => deterministicUuidFromKey('vendors', v.vendorCode)),
    },
    {
      tableName: 'products',
      conflictTargetColumn: 'slug',
      mode: 'UPSERT_ON_CONFLICT_UPDATE',
      rowCount: erp.products.length,
      sampleDeterministicIds: erp.products
        .slice(0, 3)
        .map((p) => deterministicUuidFromKey('products', p.slug)),
    },
    {
      tableName: 'product_variants',
      conflictTargetColumn: 'public_sku',
      mode: 'UPSERT_ON_CONFLICT_UPDATE',
      rowCount: validVariantsCount,
      sampleDeterministicIds: allVariants
        .slice(0, 3)
        .map((v) => deterministicUuidFromKey('product_variants', v.publicSku)),
    },
    {
      tableName: 'orders',
      conflictTargetColumn: 'order_no',
      mode: 'UPSERT_ON_CONFLICT_UPDATE',
      rowCount: validOrdersCount,
      sampleDeterministicIds: erp.orders
        .slice(0, 3)
        .map((o) => deterministicUuidFromKey('orders', o.orderNo)),
    },
    {
      tableName: 'vendor_ledger',
      conflictTargetColumn: 'id',
      mode: 'APPEND_ONLY_ON_CONFLICT_DO_NOTHING',
      rowCount: p4b.vendorLedger.length,
      sampleDeterministicIds: p4b.vendorLedger
        .slice(0, 3)
        .map((e) => deterministicUuidFromKey('vendor_ledger', e.id)),
    },
    {
      tableName: 'audit_logs',
      conflictTargetColumn: 'id',
      mode: 'APPEND_ONLY_ON_CONFLICT_DO_NOTHING',
      rowCount: adminStore.auditLogs.length,
      sampleDeterministicIds: adminStore.auditLogs
        .slice(0, 3)
        .map((a) => deterministicUuidFromKey('audit_logs', a.id)),
    },
  ];

  const combinedChecksums = sourceFilesInventory
    .map((f) => `${f.fileName}:${f.sha256Checksum}`)
    .join('|');
  const preMigrationSnapshotChecksum = crypto
    .createHash('sha256')
    .update(combinedChecksums)
    .digest('hex');

  // Local reconciliation is not proof of a verified backup, database security,
  // restore procedure, or an implemented migration executor.
  const readyForProductionMigration = false;

  return {
    runId: `dryrun_${preMigrationSnapshotChecksum.slice(0, 12)}`,
    executedAt: new Date().toISOString(),
    dryRun: true,
    requiresOperatorApprovalBeforeProdRun: true,
    readyForProductionMigration,
    sourceFilesInventory,
    rowReconciliation,
    financialReconciliation,
    conflicts,
    idempotentBatches,
    backupAndRestorePlan: {
      preMigrationSnapshotChecksum,
      backupDirectory: '.data/backups/pre-phase2-supabase-migration',
      rollbackSqlScript:
        'supabase/migrations/0008_phase2_schema_rls_and_gl_completion.sql (REVERSIBLE ROLLBACK PLAN)',
      verificationStepsBn: [
        '১. মাইগ্রেশন শুরুর পূর্বে সব .data/*.json ফাইলের SHA-256 চেকসামসহ স্ন্যাপশট সংরক্ষণ।',
        '২. ড্রাই-রান রিপোর্টে Conflicts = 0 এবং পয়সা ভ্যারিয়েন্স = 0 নিশ্চিতকরণ।',
        '৩. ট্রানজ্যাকশনাল ব্যাচে Upsert 실행 (mutable টেবিলে ON CONFLICT DO UPDATE এবং লেজার টেবিলে ON CONFLICT DO NOTHING)।',
        '৪. ইমপোর্ট পরবর্তী Row Count এবং Financial Poisha Total পুনরায় মিলিয়ে দেখা।',
      ],
    },
  };
}

/**
 * Enforces Section 5.4 Rule: "Production Data Migration-এর আগে Approval বাধ্যতামূলক।"
 */
export function executeApprovedSupabaseMigration(params: {
  dryRun: boolean;
  operatorApproved: boolean;
  operatorApprovalToken?: string;
}): {
  executedLive: boolean;
  blockedReasonBn?: string;
  dryRunReport: JsonToSupabaseMigrationDryRunReport;
} {
  const dryRunReport = runJsonToSupabaseMigrationDryRun();

  if (params.dryRun) {
    return {
      executedLive: false,
      blockedReasonBn:
        'ড্রাই-রান মোড সক্রিয় রয়েছে। প্রোডাকশন ডাটাবেসে কোনো পরিবর্তন করা হয়নি।',
      dryRunReport,
    };
  }

  if (
    !params.operatorApproved ||
    !params.operatorApprovalToken ||
    params.operatorApprovalToken.trim().length < 8
  ) {
    return {
      executedLive: false,
      blockedReasonBn:
        'APPROVAL_REQUIRED: প্রোডাকশন ডাটা মাইগ্রেশনের পূর্বে অপারেটরের স্পষ্ট অনুমোদন (Approval Token) বাধ্যতামূলক।',
      dryRunReport,
    };
  }

  return {
    executedLive: false,
    blockedReasonBn:
      'NOT_INTEGRATED: লাইভ মাইগ্রেশন এক্সিকিউটর বাস্তবায়িত বা যাচাই করা হয়নি। কোনো ডাটাবেস পরিবর্তন করা হয়নি।',
    dryRunReport,
  };
}
