# DATABASE MIGRATION LOG & PHASE 2 SOURCE-OF-TRUTH MATRIX
## পঞ্চগড় (PANCHAGARH) — Multi-Vendor Consignment E-Commerce & ERP

**Document Status:** `IMPLEMENTED` & `TESTED` (Phase 2 Verified)  
**Migration Directory:** `/supabase/migrations/`  
**Manifest Source of Truth:** `getSqlMigrationsManifest()` in `/src/lib/admin/phase5-service.ts`  
**Migration & Reconciler Engine:** `/src/lib/db/json-to-supabase-migrator.ts`  
**Governance Rule:** No destructive schema migration or live production data import may be executed without SHA-256 backup verification, zero-conflict dry-run reconciliation, and explicit operator approval.

---

## ১. Version-Controlled SQL Migration Manifests (Single Source of Truth)

All 8 SQL migration files in `/supabase/migrations/` are verified against `getSqlMigrationsManifest()` by automated tests (`src/lib/db/phase2-migration.test.ts`):

| Migration ID | Exact Filename on Disk | Tables & Security Objects Covered | RLS & Immutability | Status |
|---|---|---|---|---|
| **0001** | `0001_enums_and_extensions.sql` | `pgcrypto`, `uuid-ossp`, 13 domain enums (`vendor_status`, `product_status`, `inventory_event_type`, `order_source`, `order_status`, `delivery_method`, `courier_provider`, `payment_method`, `payment_status`, `escrow_bucket`, `vendor_ledger_entry_type`, `return_fault_type`, `payout_status`, `discount_type`, `message_channel`), `fn_prevent_ledger_mutation()`, `fn_set_updated_at()` | Append-only trigger function | `TESTED` |
| **0002** | `0002_core_tables.sql` | `districts`, `upazilas`, `roles`, `role_permissions`, `vendors`, `users_profile`, `site_settings`, `encrypted_credentials` | RLS Enabled | `TESTED` |
| **0003** | `0003_catalog_tables.sql` | `categories`, `products`, `product_variants` (stored generated 3-tier Poisha columns), `inventory_ledger` (immutable), `reviews` | RLS + Immutable `inventory_ledger` | `TESTED` |
| **0004** | `0004_order_and_courier.sql` | `customers`, `abandoned_carts`, `delivery_rates`, `promo_codes`, `pickup_batches`, `orders`, `order_items`, `print_logs` | RLS Enabled | `TESTED` |
| **0005** | `0005_escrow_ledger.sql` | `payout_requests`, `return_cases`, `vendor_ledger` (immutable), `courier_remittance_ledger` (immutable), `courier_claims`, `expenses` | RLS + Immutable `vendor_ledger` & `courier_remittance_ledger` | `TESTED` |
| **0006** | `0006_automation_and_logs.sql` | `audit_logs` (immutable), `message_templates`, `message_trigger_matrix`, `message_logs`, `automation_rules`, `automation_execution_logs`, `idempotency_keys`, `sheets_sync_queue` | RLS + Immutable `audit_logs` | `TESTED` |
| **0007** | `0007_rls_policies.sql` | RLS enablement across initial 35 tables, `fn_current_role_slug()`, `fn_current_vendor_id()`, `v_storefront_products`, `v_vendor_masked_orders` | Column-stripped views + tenant isolation | `TESTED` |
| **0008** | `0008_phase2_schema_rls_and_gl_completion.sql` | `customer_addresses`, `product_images`, `warehouses`, `consignment_dispatch_lots`, `supplier_product_offers`, `vendor_price_proposals`, `vendor_fulfillment_groups`, `manual_payment_submissions`, `ledger_accounts`, `journal_entries` (immutable), `journal_lines` (immutable), `ledger_reversal_requests`, `customer_refund_executions`, `escrow_maturity_batches`, `courier_webhook_events`, `fraud_cases`, `customer_inquiries`, `admin_sessions`, `customer_otp_challenges`, `system_backup_snapshots`, `v_public_site_settings`, `fn_current_customer_phone()`, `SET search_path = public, pg_temp` on all `SECURITY DEFINER` functions, 100% explicit RLS policies across all 53 tables | 53/53 Tables RLS Covered + Immutable GL | `TESTED` |

---

## ২. Business Entity Data Source Matrix (Section 5.1 & 5.2)

| # | Business Entity | Legacy Local JSON Source (`.data/`) | Target PostgreSQL Table | Natural / Primary Key | Immutable? |
|---|---|---|---|---|---|
| 1 | Customers | `erp-store.json` (`orders[]`) | `customers` | `phone` | No |
| 2 | Addresses | `erp-store.json` (`orders[]`) | `customer_addresses` | `customer_id + district_id + upazila_id + street_address` | No |
| 3 | Vendors | `erp-phase4b-store.json` (`vendors[]`) | `vendors` | `code` | No |
| 4 | Vendor Users & Staff | `erp-admin-store.json` (`users[]`) | `users_profile` | `username` | No |
| 5 | Products | `erp-store.json` (`products[]`) | `products` | `slug` | No |
| 6 | Categories | `erp-store.json` (`categories[]`) | `categories` | `slug` | No |
| 7 | Product Variants | `erp-store.json` (`products[].variants[]`) | `product_variants` | `public_sku` | No |
| 8 | Product Images | `erp-store.json` (`products[].images[]`) | `product_images` | `product_id + image_url` | No |
| 9 | Supplier Offers / Cost Records | `erp-phase7-store.json` (`supplierProductOffers[]`, `priceProposals[]`) | `supplier_product_offers`, `vendor_price_proposals` | `offer_code`, `proposal_code` | No |
| 10 | Inventory & Dispatch Lots | `erp-phase7-store.json` (`consignmentLots[]`) | `consignment_dispatch_lots` | `lot_code` | No |
| 11 | Warehouses | `erp-store.json` (`siteSettings.aboutContactPage`) | `warehouses` | `code` | No |
| 12 | Stock Movements | `erp-phase7-store.json` + Order reservations | `inventory_ledger` | `id` | **Yes** |
| 13 | Orders | `erp-store.json` (`orders[]`) | `orders` (`secure_tracking_token` + COD/bKash check) | `order_no` | No |
| 14 | Order Items | `erp-store.json` (`orderLines[]`) | `order_items` | `order_id + variant_id` | No |
| 15 | Vendor Fulfillment Groups | `erp-phase7-store.json` (`fulfillmentGroups[]`) | `vendor_fulfillment_groups` | `group_code` | No |
| 16 | Payments | `erp-store.json` (`orders[]`) | `orders` (`payment_method`, `payment_status`) | `order_no` | No |
| 17 | Manual Payment Submissions | `erp-store.json` (`manualBkashSubmissions[]`) | `manual_payment_submissions` (Unique active `trx_id`) | `submission_code` | No |
| 18 | Shipments & Pickup Batches | `erp-phase4b-store.json` (`pickupBatches[]`) | `pickup_batches` | `batch_code` | No |
| 19 | Courier Events & Claims | `erp-phase4b-store.json` (`courierClaims[]`) | `courier_claims` | `claim_no` | No |
| 20 | Returns (4-Way Fault) | `erp-phase4b-store.json` (`returnResolutions[]`) | `return_cases` | `case_no` | No |
| 21 | Refunds & Reversals | `erp-phase7-store.json` (`customerRefunds[]`, `ledgerReversals[]`) | `customer_refund_executions`, `ledger_reversal_requests` | `refund_code`, `reversal_code` | No |
| 22 | Vendor Payables | `erp-phase4b-store.json` (`vendorLedger[]`) | `vendor_ledger` | `id` | **Yes** |
| 23 | Settlements & Remittances | `erp-phase4b-store.json` (`payoutRequests[]`, `courierRemittanceLedger[]`) | `payout_requests`, `courier_remittance_ledger` | `request_no`, `id` | Remittance **Yes** |
| 24 | Ledger Accounts | `erp-phase7-store.json` (`executiveAccounting`) | `ledger_accounts` | `account_code` | No |
| 25 | Journal Entries & Lines | Derived from `vendor_ledger` & `courier_remittance_ledger` | `journal_entries`, `journal_lines` | `entry_no`, `id` | **Yes** |
| 26 | Expenses | `erp-phase4c-store.json` (`expenses[]`) | `expenses` | `id` | No |
| 27 | Audit Logs | `erp-admin-store.json` (`auditLogs[]`) | `audit_logs` | `id` | **Yes** |
| 28 | Webhook Events | `erp-phase6-store.json` (`webhookEvents[]`) | `courier_webhook_events` | `event_key` | **Yes** |
| 29 | Idempotency Records | `erp-store.json` (`idempotencyKeys{}`) | `idempotency_keys` | `key` | No |
| 30 | Notifications | `erp-phase4c-store.json` (`messageTemplates[]`, `messageLogs[]`) | `message_templates`, `message_trigger_matrix`, `message_logs` | `event_key`, `id` | No |
| 31 | Print Records | `erp-phase4b-store.json` (`printCountsByOrderNo{}`) | `print_logs` | `order_id + print_sequence_number` | No |
| 32 | Fraud Cases | `erp-admin-store.json` (`blacklistedPhones{}`) | `fraud_cases` | `case_code` | No |
| 33 | Store Settings | `erp-store.json` (`siteSettings`) | `site_settings` + `v_public_site_settings` | `id = 1` | No |

---

## ৩. Row-Level Security (RLS) & Function Hardening Summary (Section 5.5)

1. **100% Explicit Policy Coverage (53 / 53 Tables):**
   - Previously, 35 tables had RLS enabled in `0007_rls_policies.sql`, but 18 tables lacked explicit `CREATE POLICY` statements.
   - Migration `0008_phase2_schema_rls_and_gl_completion.sql` adds explicit policies for all 18 previously uncovered tables (`roles`, `role_permissions`, `users_profile`, `encrypted_credentials`, `customers`, `abandoned_carts`, `promo_codes`, `pickup_batches`, `print_logs`, `courier_remittance_ledger`, `courier_claims`, `message_templates`, `message_trigger_matrix`, `message_logs`, `automation_rules`, `automation_execution_logs`, `idempotency_keys`, `sheets_sync_queue`) plus all 18 new Phase 2 tables (`53/53` tables covered).
2. **`site_settings` Public Read Hardening:**
   - Dropped `pol_site_settings_public_read` (`USING (TRUE)`) on `site_settings` so internal parameters (`global_default_commission_bp`, `global_escrow_hold_days`, `min_payout_request_poisha`, `default_packaging_cost_poisha`, `risk_advance_mandatory_score`, `risk_weights_json`, `print_config_json`) are restricted to authenticated staff (`pol_site_settings_staff_read`).
   - Created `v_public_site_settings` view (and `sanitizeSiteSettingsForPublic()` in `repository.ts`) for storefront public read.
3. **`SECURITY DEFINER` Safe `search_path` & Execute Grants:**
   - Hardened `fn_prevent_ledger_mutation()`, `fn_current_role_slug()`, `fn_current_vendor_id()`, and `fn_current_customer_phone()` with `SECURITY DEFINER SET search_path = public, pg_temp` and `REVOKE ALL ON FUNCTION ... FROM PUBLIC`.
4. **Storage Bucket Separation:**
   - Configured `public-catalog-media` (public read for catalog/banner images) and `private-ops-evidence` (private bucket for QC photos, return proofs, payout receipts, and print archives).
