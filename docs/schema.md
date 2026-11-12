# Panchagarh Database Schema Specification (Single Source of Truth)

**Database Engine:** PostgreSQL (Supabase Compatible)  
**Timezone:** UTC (Display: `Asia/Dhaka`)  
**Currency:** BDT. Pure integer Poisha (`1 BDT = 100 poisha`)  
**Basis Points:** Percentages as integers (`1% = 100 bp`, `100% = 10000 bp`)  
**Auditing:** Append-only ledgers and audit logs; mutations blocked on ledger records.

---

## 1. Core Tables

### `vendors` (Consignment Suppliers)
- `vendor_id`: UUID (PK)
- `vendor_code`: TEXT UNIQUE (e.g. `VND-001`)
- `business_name`: TEXT
- `owner_name`: TEXT
- `contact_phone`: TEXT
- `contact_email`: TEXT
- `district`: TEXT, `upazila`: TEXT, `address_details`: TEXT
- `bank_name`: TEXT, `bank_account_no`: TEXT, `bank_routing_no`: TEXT
- `bkash_merchant_or_personal_no`: TEXT
- `default_commission_bp`: INTEGER (Default: 1500 = 15%)
- `hold_days_override`: INTEGER (Nullable; default null to use global 3 days)
- `min_payout_amount_poisha`: BIGINT (Default: 50,000 poisha = 500 BDT)
- `status`: `pending_onboarding` | `active` | `suspended` | `closing_audit` | `closed`
- `created_at`, `updated_at`: TIMESTAMPTZ

### `categories` (Nested Catalog)
- `category_id`: TEXT (PK)
- `parent_id`: TEXT (Nullable FK -> categories.category_id)
- `name_bn`: TEXT, `name_en`: TEXT
- `slug`: TEXT UNIQUE
- `banner_url`: TEXT, `icon_name`: TEXT
- `sort_order`: INTEGER
- `is_active`: BOOLEAN

### `products` (Parent Catalog Items)
- `product_id`: UUID (PK)
- `vendor_id`: UUID (FK -> vendors.vendor_id)
- `category_id`: TEXT (FK -> categories.category_id)
- `name_bn`: TEXT, `name_en`: TEXT
- `slug`: TEXT UNIQUE
- `description_bn`: TEXT, `description_en`: TEXT
- `specs`: JSONB (`Array<{ labelBn, labelEn, valueBn, valueEn }>`)
- `images`: TEXT[] (Supabase Storage URLs)
- `is_featured`: BOOLEAN, `is_free_delivery`: BOOLEAN
- `low_stock_threshold`: INTEGER
- `lead_time_days`: INTEGER
- `commission_override_bp`: INTEGER (Nullable)
- `total_sold_count`: INTEGER, `rating_avg_bp`: INTEGER, `review_count`: INTEGER
- `status`: `draft` | `active` | `archived`
- `created_at`, `updated_at`: TIMESTAMPTZ

### `product_variants` (SKU & Multi-Tier Pricing)
- `variant_id`: UUID (PK)
- `product_id`: UUID (FK -> products.product_id)
- `internal_vendor_sku`: TEXT (Format: `${vendorCode}-${publicSku}`, warehouse only)
- `public_sku`: TEXT UNIQUE (e.g. `BG-JAM-201`, customer visible)
- `title_bn`: TEXT, `title_en`: TEXT
- `attributes`: JSONB (`{ "Color": "...", "Size": "..." }`)
- `image_url`: TEXT
- `supplier_cost_poisha`: BIGINT (Confidential)
- `supplier_profit_poisha`: BIGINT (Confidential)
- `supplier_payable_poisha`: BIGINT (`Cost + Profit`, Confidential)
- `platform_margin_poisha`: BIGINT (`Sale - Payable`, Confidential)
- `sale_price_poisha`: BIGINT (Public store price)
- `stock_available`: INTEGER, `stock_reserved`: INTEGER
- `weight_grams`: INTEGER (Courier estimation)
- `created_at`, `updated_at`: TIMESTAMPTZ

### `orders` (Consignment Orders)
- `order_id`: UUID (PK)
- `order_number`: TEXT UNIQUE (e.g. `ORD-20261108-1001`)
- `tracking_code`: TEXT UNIQUE (Customer tracking token)
- `customer_name`: TEXT, `customer_phone`: TEXT
- `delivery_district`: TEXT, `delivery_upazila`: TEXT, `delivery_address`: TEXT
- `order_source`: `storefront` | `facebook` | `whatsapp` | `instagram` | `phone_call`
- `order_status`: `pending_confirmation` | `confirmed` | `packed` | `shipped` | `out_for_delivery` | `delivered` | `return_initiated` | `returned` | `cancelled`
- `delivery_method`: `courier` | `post_office` | `free`
- `courier_provider`: `manual` | `steadfast` | `pathao` | `redx` | `bd_post`
- `courier_consignment_id`: TEXT, `courier_tracking_url`: TEXT
- `payment_method`: `cod` | `bkash_manual` | `nagad_manual` | `rocket_manual`
- `payment_status`: `unpaid` | `partial_verified` | `paid_verified` | `remitted` | `refunded`
- `total_item_count`: INTEGER
- `subtotal_poisha`: BIGINT
- `delivery_charge_poisha`: BIGINT
- `discount_poisha`: BIGINT (Strictly deducted from platform margin)
- `total_payable_poisha`: BIGINT
- `cod_collectable_poisha`: BIGINT
- `risk_score`: INTEGER, `risk_level`: `low` | `medium` | `high` | `critical`
- `created_at`, `updated_at`: TIMESTAMPTZ

### `order_items` (Order Item Line & Pricing Snapshot)
- `item_id`: UUID (PK)
- `order_id`: UUID (FK -> orders.order_id)
- `product_id`: UUID, `variant_id`: UUID, `vendor_id`: UUID
- `product_name_bn`: TEXT, `variant_title_bn`: TEXT
- `public_sku`: TEXT
- `quantity`: INTEGER
- `pricing_snapshot`: JSONB (`ThreeTierPriceSnapshot` containing unit/line cost, profit, payable, margin, sale price, commission bp, escrow hold days)
- `vendor_fulfillment_status`: TEXT

### `vendor_ledger` (Immutable Double-Entry Holding Liability)
- `ledger_id`: UUID (PK)
- `vendor_id`: UUID (FK -> vendors.vendor_id)
- `entry_type`: `EARNING_PENDING` | `EARNING_LOCKED` | `EARNING_MATURED` | `HOLD_PERIOD_RETURN_REVERSAL` | `POST_PAYOUT_CLAWBACK` | `PAYOUT_HOLD` | `PAYOUT_HOLD_RELEASE` | `PAYOUT_DISBURSED` | `MANUAL_ADJUSTMENT`
- `escrow_bucket`: `pending` | `locked` | `available`
- `amount_poisha`: BIGINT (Positive for credit/earning, negative for clawback/payout)
- `reference_type`: `order` | `payout_request` | `return_case` | `admin_adjustment`
- `reference_id`: TEXT
- `order_item_id`: UUID (Nullable)
- `hold_until`: TIMESTAMPTZ (Nullable, for escrow lock period)
- `is_matured`: BOOLEAN
- `description_bn`: TEXT
- `created_at`: TIMESTAMPTZ (Append-only, no update/delete)

### `courier_remittance_ledger` (Courier COD Reconciliations)
- `remittance_id`: UUID (PK)
- `courier_provider`: `steadfast` | `pathao` | `redx` | `bd_post`
- `consignment_id`: TEXT
- `order_id`: UUID (FK -> orders.order_id)
- `collected_amount_poisha`: BIGINT
- `courier_fee_poisha`: BIGINT
- `cod_charge_poisha`: BIGINT
- `remitted_amount_poisha`: BIGINT
- `discrepancy_amount_poisha`: BIGINT
- `reconciliation_status`: `pending` | `reconciled` | `discrepancy` | `settled`
- `created_at`: TIMESTAMPTZ

### `audit_logs` (Append-Only Governance Log)
- `log_id`: UUID (PK)
- `actor_id`: UUID, `actor_role`: TEXT, `actor_name`: TEXT
- `action`: TEXT, `target_type`: TEXT, `target_id`: TEXT
- `ip_address`: TEXT, `user_agent`: TEXT
- `changes`: JSONB (`{ before, after }` sanitized of secrets)
- `created_at`: TIMESTAMPTZ
