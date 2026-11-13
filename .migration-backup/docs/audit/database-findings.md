# Database Architecture & Supabase Audit Findings

> **Historical schema assessment.** The current repository includes migration `0008`, ledger tables and additional policies/projections. SQL presence and JavaScript policy simulations do not establish applied migrations, effective grants or RLS safety. See `f:\CODE\Panchagarh\docs\audit\phase-0-reaudit-2026-11-11.md`; no local/remote database acceptance is claimed.
**Project**: Panchagarh (পঞ্চগড়) — Bangladesh Multi-Vendor Consignment F-Commerce & ERP  
**Assessment Date**: 2026-11-08  
**Scope**: Schema Integrity, Migrations, Row-Level Security (RLS), Field-Level Views, Triggers, and Persistence Architecture  

---

## 1. Database Architecture Overview

The database layer is designed for PostgreSQL with Supabase extensions (`pgcrypto`, `uuid-ossp`). The database specifications are defined across 7 sequential SQL migration files in `supabase/migrations/`:

| Migration File | Primary Responsibilities | Tables Created |
| :--- | :--- | :--- |
| `0001_enums_and_extensions.sql` | PostgreSQL extensions, ENUM types, and immutable ledger guard trigger | Enums only |
| `0002_core_tables.sql` | Geo (64 Districts, Upazilas), Roles, Permissions, Users, Vendors, Site Settings, Encrypted Credentials | 8 tables |
| `0003_catalog_tables.sql` | Categories, Consignment Products, Variants, Inventory Ledger, Reviews | 5 tables |
| `0004_order_and_courier.sql` | Customers, Abandoned Carts, Delivery Rates, Promo Codes, Pickup Batches, Orders, Order Items, Print Logs | 8 tables |
| `0005_escrow_ledger.sql` | Payout Requests, Return Cases, Vendor Escrow Ledger, Courier Remittance Ledger, Courier Claims, Expenses | 6 tables |
| `0006_automation_and_logs.sql` | Audit Logs, Message Templates, Trigger Matrix, Message Logs, Automation Rules & Logs, Idempotency Keys, Sheets Sync Queue | 8 tables |
| `0007_rls_policies.sql` | RLS enable statements, security helper functions, role policies, and field-level sanitized views | Views & Policies |

**Total Relational Tables Defined**: 35 Tables.

---

## 2. Core Architectural Finding: Complete Persistence Disconnect

```text
[Current Runtime Flow]
Next.js Client (Browser)
       │
       ▼
Next.js API Routes / Server Actions
       │
       ▼ (100% of data reads & writes)
Local Filesystem (.data/*.json)
       │
   [DISCONNECTED]
       │
Supabase PostgreSQL Database (Defined in SQL migrations, but NOT queried at runtime)
```

1. **Zero Database Integration at Runtime**:
   - `src/lib/supabase/client.ts`, `server.ts`, and `admin.ts` define Supabase client initializers.
   - However, **no service, repository, or API route imports or invokes any Supabase client**.
   - 100% of the active storefront catalog, checkout, orders, admin ERP, inventory movements, and ledger updates read and write directly to `.data/*.json` files.
2. **Current Status**: **NOT INTEGRATED** (in accordance with Phase 0 execution rules).
3. **Phase 2 Requirement**: The production source of truth must be migrated from `.data/*.json` to Supabase PostgreSQL with ACID transaction guarantees, atomic stock locks, and full referential integrity.

---

## 3. Row-Level Security (RLS) Deep-Dive

### 3.1 Policy Coverage Statistics
- **Total Tables with `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`**: 35
- **Tables with at Least One Explicit Policy**: 17
- **Tables with Zero Policies (Default Deny)**: 18

### 3.2 Breakdown of RLS Policies by Table

| Table Name | RLS Enabled | Policies Defined | Permitted Roles | Policy Analysis / Assessment |
| :--- | :---: | :---: | :--- | :--- |
| `districts` | YES | `pol_districts_public_read` | Public / Anon | Active districts readable by public (OK) |
| `upazilas` | YES | `pol_upazilas_public_read` | Public / Anon | Active upazilas readable by public (OK) |
| `categories` | YES | `pol_categories_public_read` | Public / Anon | Active categories readable by public (OK) |
| `delivery_rates` | YES | `pol_delivery_rates_public_read`| Public / Anon | Active delivery rates readable by public (OK) |
| `reviews` | YES | `pol_reviews_public_read` | Public / Anon | Approved reviews readable by public (OK) |
| `site_settings` | YES | `pol_site_settings_public_read` | Public / Anon | **VULNERABLE**: Uses `USING (TRUE)` which exposes all site settings |
| `vendors` | YES | 2 policies | Super Admin, Vendor | Super Admin full; Vendor reads own profile (OK) |
| `products` | YES | 2 policies | Super Admin, Vendor | Super Admin full; Vendor reads own products (OK) |
| `product_variants`| YES | 2 policies | Super Admin, Vendor | Super Admin full; Vendor reads own variants (OK) |
| `inventory_ledger`| YES | 1 policy | Vendor | Vendor reads own ledger entries (Super Admin policy missing) |
| `orders` | YES | 2 policies | Super Admin, Staff | Super Admin full; Staff reads orders (Customer policy missing) |
| `order_items` | YES | 2 policies | Super Admin, Vendor | Super Admin full; Vendor reads own items (OK) |
| `vendor_ledger` | YES | 2 policies | Super Admin, Vendor | Super Admin full; Vendor reads own ledger (OK) |
| `payout_requests` | YES | 3 policies | Super Admin, Vendor | Super Admin full; Vendor reads & inserts own requests (OK) |
| `return_cases` | YES | 1 policy | Vendor | Vendor reads own returns (Super Admin policy missing) |
| `expenses` | YES | 2 policies | Super Admin, Marketing | Super Admin full; Marketing inserts ad expenses (OK) |
| `audit_logs` | YES | 1 policy | Super Admin | Super Admin read-only (OK) |
| **18 Other Tables**| YES | **0 policies** | None (Default Deny) | `roles`, `role_permissions`, `users_profile`, `encrypted_credentials`, `customers`, `abandoned_carts`, `promo_codes`, `pickup_batches`, `print_logs`, `courier_remittance_ledger`, `courier_claims`, `message_templates`, `message_trigger_matrix`, `message_logs`, `automation_rules`, `automation_execution_logs`, `idempotency_keys`, `sheets_sync_queue` |

### 3.3 Security Issues in SQL Functions
1. **Missing `search_path` on SECURITY DEFINER Functions**:
   ```sql
   CREATE OR REPLACE FUNCTION fn_current_role_slug() ... SECURITY DEFINER;
   CREATE OR REPLACE FUNCTION fn_current_vendor_id() ... SECURITY DEFINER;
   ```
   Both functions run with the privileges of the creator without fixing `search_path`. This allows potential privilege escalation via search path manipulation.
   **Fix**: Append `SET search_path = public, pg_temp;`.

2. **Insecure `site_settings` Public Read**:
   ```sql
   CREATE POLICY pol_site_settings_public_read ON site_settings FOR SELECT USING (TRUE);
   ```
   **Fix**: Separate public storefront configurations (branding, contact phone) from private system thresholds, or filter columns using a dedicated view `v_storefront_settings`.

---

## 4. Field-Level Security Views

Two critical database views are implemented in `0007_rls_policies.sql`:
1. `v_storefront_products`:
   - Strips `vendor_id`, `internal_vendor_sku`, `supplier_cost_poisha`, `supplier_profit_poisha`, and `platform_margin_poisha`.
   - Only projects public consumer fields.
2. `v_vendor_masked_orders`:
   - Masks customer phone (`017****678`) and street address (`ঠিকানা গোপন রাখা হয়েছে`) when `mask_customer_pii` is enabled.
   - Conceals internal platform margins.

---

## 5. Double-Entry General Ledger Schema Gap Analysis

While Migration `0005_escrow_ledger.sql` contains `vendor_ledger` and `courier_remittance_ledger`, it **does not yet implement a complete Double-Entry General Ledger** (as mandated in Section 7 of the Master Prompt):

### Missing Schema Entities:
- `chart_of_accounts`: Ledger account definitions (Asset, Liability, Equity, Revenue, Expense).
- `journal_entries`: Transaction header (Entry Number, Reference, Date, Status, Maker, Checker).
- `journal_entry_lines`: Debits and Credits with integer Poisha precision.
- `accounting_invariants_trigger`: Trigger ensuring $\sum \text{Debit} = \sum \text{Credit}$ before commit.

*Phase 4 must supply these formal accounting tables.*

---

## 6. Migration & Seeding Status

- `supabase/config.toml`: Configured for local Supabase CLI (port 54321).
- `supabase/seed.sql`: Contains base seed records for Bangladesh districts, upazilas, default roles, and initial categories.
- **Production Status**: **NOT APPLIED** to any production or remote database. All migrations remain version-controlled and verified locally.
