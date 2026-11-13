-- ============================================================================
-- 0001_enums_and_extensions.sql
-- Extensions, Enum Types, and Immutable Append-Only Ledger Guard Trigger
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Vendor Lifecycle Status
CREATE TYPE vendor_status AS ENUM (
  'pending_onboarding',
  'active',
  'suspended',
  'closing_audit',
  'closed'
);

-- 2. Product Status
CREATE TYPE product_status AS ENUM (
  'draft',
  'active',
  'archived'
);

-- 3. Inventory Ledger Event Type (Append-Only)
CREATE TYPE inventory_event_type AS ENUM (
  'CONSIGNMENT_IN',
  'ORDER_RESERVED',
  'ORDER_RESERVATION_RELEASED',
  'ORDER_SHIPPED',
  'RETURN_RESTOCKED',
  'DAMAGE_WRITE_OFF',
  'VENDOR_RETURN_OUT',
  'MANUAL_AUDIT'
);

-- 4. Order Acquisition Source
CREATE TYPE order_source AS ENUM (
  'storefront',
  'facebook',
  'whatsapp',
  'instagram',
  'phone_call',
  'other'
);

-- 5. Order Lifecycle Status
CREATE TYPE order_status AS ENUM (
  'pending_confirmation',
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'return_initiated',
  'returned',
  'cancelled'
);

-- 6. Delivery Method
CREATE TYPE delivery_method AS ENUM (
  'courier',
  'post_office',
  'free'
);

-- 7. Courier Provider
CREATE TYPE courier_provider AS ENUM (
  'manual',
  'steadfast',
  'pathao',
  'redx',
  'bd_post'
);

-- 8. Payment Method & Verification Status (No Gateway — Manual Only)
CREATE TYPE payment_method AS ENUM (
  'cod',
  'bkash_manual',
  'nagad_manual',
  'rocket_manual'
);

CREATE TYPE payment_status AS ENUM (
  'unpaid',
  'partial_verified',
  'paid_verified',
  'remitted',
  'refunded'
);

-- 9. Escrow Bucket & Vendor Ledger Entry Types (Append-Only)
CREATE TYPE escrow_bucket AS ENUM (
  'pending',
  'locked',
  'available'
);

CREATE TYPE vendor_ledger_entry_type AS ENUM (
  'EARNING_PENDING',
  'EARNING_LOCKED',
  'EARNING_MATURED',
  'HOLD_PERIOD_RETURN_REVERSAL',
  'POST_PAYOUT_CLAWBACK',
  'PAYOUT_HOLD',
  'PAYOUT_HOLD_RELEASE',
  'PAYOUT_DISBURSED',
  'MANUAL_ADJUSTMENT'
);

-- 10. Four-Way Return & Damage Fault Types
CREATE TYPE return_fault_type AS ENUM (
  'WAREHOUSE_PACKAGING_FAULT',
  'SUPPLIER_DEFECT',
  'CUSTOMER_INTACT_RETURN',
  'COURIER_NEGLIGENCE'
);

-- 11. Payout Request Status
CREATE TYPE payout_status AS ENUM (
  'requested',
  'approved',
  'rejected',
  'paid'
);

-- 12. Promo Discount Type
CREATE TYPE discount_type AS ENUM (
  'fixed_poisha',
  'percentage_bp'
);

-- 13. Messaging Channel
CREATE TYPE message_channel AS ENUM (
  'wa_deep_link',
  'sms_deep_link',
  'email_resend',
  'sms_textbee',
  'sms_http_gateway',
  'whatsapp_cloud_api',
  'in_app'
);

-- 14. Immutable Table Guard Function (Blocks UPDATE and DELETE on Ledgers/Logs)
CREATE OR REPLACE FUNCTION fn_prevent_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_LEDGER_VIOLATION: Table "%" is append-only. UPDATE and DELETE operations are strictly prohibited. Insert an offsetting reversal entry instead.', TG_TABLE_NAME;
END;
$$;

-- 15. Auto-update updated_at timestamp helper
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
