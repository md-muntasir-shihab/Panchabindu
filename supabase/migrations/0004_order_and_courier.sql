-- ============================================================================
-- 0004_order_and_courier.sql
-- Customers (Fraud Score), Abandoned Carts, Delivery Rates, Promo Codes,
-- Pickup Batches, Orders, Order Items (Immutable Price Snapshot), Print Logs
-- ============================================================================

-- 1. Customers & Fraud Prevention Profile
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  default_district_id INTEGER REFERENCES districts(id) ON DELETE SET NULL,
  default_upazila_id INTEGER REFERENCES upazilas(id) ON DELETE SET NULL,
  saved_addresses_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  wishlist_product_ids UUID[] NOT NULL DEFAULT '{}',
  total_orders INTEGER NOT NULL DEFAULT 0 CHECK (total_orders >= 0),
  delivered_orders INTEGER NOT NULL DEFAULT 0 CHECK (delivered_orders >= 0),
  returned_orders INTEGER NOT NULL DEFAULT 0 CHECK (returned_orders >= 0),
  cancelled_orders INTEGER NOT NULL DEFAULT 0 CHECK (cancelled_orders >= 0),
  fraud_score INTEGER NOT NULL DEFAULT 0 CHECK (fraud_score >= 0 AND fraud_score <= 100),
  is_blacklisted BOOLEAN NOT NULL DEFAULT FALSE,
  blacklist_reason TEXT,
  is_repeat_customer BOOLEAN GENERATED ALWAYS AS (delivered_orders >= 2) STORED,
  last_order_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_phone ON customers(phone);

-- 2. Abandoned Carts (Captured on Checkout Phone Input for Automation Engine)
CREATE TABLE abandoned_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone TEXT NOT NULL,
  customer_name TEXT,
  district_id INTEGER REFERENCES districts(id) ON DELETE SET NULL,
  upazila_id INTEGER REFERENCES upazilas(id) ON DELETE SET NULL,
  cart_items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal_poisha BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_poisha >= 0),
  is_recovered BOOLEAN NOT NULL DEFAULT FALSE,
  recovered_order_id UUID,
  reminder_sent_count INTEGER NOT NULL DEFAULT 0,
  last_reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_abandoned_carts_phone ON abandoned_carts(customer_phone, is_recovered);

-- 3. District-Wise Delivery Rate Table (Courier & BD Post Office Per-KG)
CREATE TABLE delivery_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id INTEGER NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  upazila_id INTEGER REFERENCES upazilas(id) ON DELETE CASCADE,
  method delivery_method NOT NULL DEFAULT 'courier',
  base_charge_poisha BIGINT NOT NULL CHECK (base_charge_poisha >= 0),
  per_kg_charge_poisha BIGINT NOT NULL DEFAULT 2000 CHECK (per_kg_charge_poisha >= 0),
  estimated_days_bn TEXT NOT NULL DEFAULT '২-৩ কার্যদিবস',
  estimated_days_en TEXT NOT NULL DEFAULT '2-3 Business Days',
  historical_success_rate_bp INTEGER NOT NULL DEFAULT 9200 CHECK (historical_success_rate_bp >= 0 AND historical_success_rate_bp <= 10000),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (district_id, upazila_id, method)
);

-- 4. Promo & Discount Codes (Deducts from Platform Margin Only)
CREATE TABLE promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code = upper(code)),
  title_bn TEXT NOT NULL,
  discount_type discount_type NOT NULL,
  discount_value BIGINT NOT NULL CHECK (discount_value > 0),
  max_discount_poisha BIGINT CHECK (max_discount_poisha IS NULL OR max_discount_poisha > 0),
  min_order_subtotal_poisha BIGINT NOT NULL DEFAULT 0 CHECK (min_order_subtotal_poisha >= 0),
  allowed_vendor_ids UUID[] NOT NULL DEFAULT '{}',
  is_single_use_per_customer BOOLEAN NOT NULL DEFAULT FALSE,
  usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Courier Pickup Batches & Handover Manifests
CREATE TABLE pickup_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code TEXT NOT NULL UNIQUE,
  courier_provider courier_provider NOT NULL,
  total_parcels INTEGER NOT NULL DEFAULT 0 CHECK (total_parcels >= 0),
  total_cod_poisha BIGINT NOT NULL DEFAULT 0 CHECK (total_cod_poisha >= 0),
  manifest_barcode TEXT NOT NULL,
  rider_name TEXT,
  rider_phone TEXT,
  handover_signed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Master Orders Table
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  district_id INTEGER NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  upazila_id INTEGER NOT NULL REFERENCES upazilas(id) ON DELETE RESTRICT,
  street_address TEXT NOT NULL,
  landmark TEXT NOT NULL DEFAULT '',
  address_quality_score INTEGER NOT NULL DEFAULT 100 CHECK (address_quality_score >= 0 AND address_quality_score <= 100),
  address_flags TEXT[] NOT NULL DEFAULT '{}',
  address_override_reason TEXT,
  source order_source NOT NULL DEFAULT 'storefront',
  status order_status NOT NULL DEFAULT 'pending_confirmation',
  delivery_method delivery_method NOT NULL DEFAULT 'courier',
  courier_provider courier_provider NOT NULL DEFAULT 'manual',
  consignment_id TEXT,
  tracking_code TEXT,
  tracking_url TEXT,
  pickup_batch_id UUID REFERENCES pickup_batches(id) ON DELETE SET NULL,
  total_weight_grams INTEGER NOT NULL DEFAULT 500 CHECK (total_weight_grams > 0),
  subtotal_poisha BIGINT NOT NULL CHECK (subtotal_poisha >= 0),
  discount_poisha BIGINT NOT NULL DEFAULT 0 CHECK (discount_poisha >= 0),
  promo_code_id UUID REFERENCES promo_codes(id) ON DELETE SET NULL,
  discount_approved_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  delivery_charge_poisha BIGINT NOT NULL DEFAULT 0 CHECK (delivery_charge_poisha >= 0),
  total_payable_poisha BIGINT NOT NULL CHECK (total_payable_poisha >= 0),
  advance_paid_poisha BIGINT NOT NULL DEFAULT 0 CHECK (advance_paid_poisha >= 0),
  cod_collectable_poisha BIGINT GENERATED ALWAYS AS (GREATEST(0, total_payable_poisha - advance_paid_poisha)) STORED,
  payment_method payment_method NOT NULL DEFAULT 'cod',
  payment_status payment_status NOT NULL DEFAULT 'unpaid',
  manual_payment_trx_id TEXT,
  manual_payment_sender_phone TEXT,
  payment_verified_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  payment_verified_at TIMESTAMPTZ,
  snap_total_supplier_payable_poisha BIGINT NOT NULL DEFAULT 0 CHECK (snap_total_supplier_payable_poisha >= 0),
  snap_total_platform_margin_poisha BIGINT NOT NULL DEFAULT 0 CHECK (snap_total_platform_margin_poisha >= 0),
  snap_packaging_cost_poisha BIGINT NOT NULL DEFAULT 1500 CHECK (snap_packaging_cost_poisha >= 0),
  estimated_net_profit_poisha BIGINT NOT NULL DEFAULT 0,
  risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
  is_advance_mandatory BOOLEAN NOT NULL DEFAULT FALSE,
  is_duplicate_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  duplicate_override_reason TEXT,
  next_best_action TEXT NOT NULL DEFAULT 'CALL_TO_CONFIRM',
  call_attempts_count INTEGER NOT NULL DEFAULT 0,
  last_call_attempt_at TIMESTAMPTZ,
  callback_scheduled_at TIMESTAMPTZ,
  customer_note TEXT NOT NULL DEFAULT '',
  internal_staff_note TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  print_count INTEGER NOT NULL DEFAULT 0 CHECK (print_count >= 0),
  last_printed_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  packed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX idx_orders_customer_phone ON orders(customer_phone);
CREATE INDEX idx_orders_consignment_id ON orders(consignment_id);
CREATE INDEX idx_orders_next_best_action ON orders(next_best_action);

-- 7. Order Items (Immutable Snapshot of 3-Tier Pricing & Commission at Order Creation)
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  product_name_bn_snapshot TEXT NOT NULL,
  product_name_en_snapshot TEXT NOT NULL,
  variant_title_snapshot TEXT NOT NULL,
  public_sku_snapshot TEXT NOT NULL,
  internal_vendor_sku_snapshot TEXT NOT NULL,
  image_url_snapshot TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  snap_unit_supplier_cost_poisha BIGINT NOT NULL CHECK (snap_unit_supplier_cost_poisha >= 0),
  snap_unit_supplier_profit_poisha BIGINT NOT NULL CHECK (snap_unit_supplier_profit_poisha >= 0),
  snap_unit_supplier_payable_poisha BIGINT NOT NULL CHECK (snap_unit_supplier_payable_poisha >= 0),
  snap_unit_platform_margin_poisha BIGINT NOT NULL CHECK (snap_unit_platform_margin_poisha >= 0),
  snap_unit_sale_price_poisha BIGINT NOT NULL CHECK (snap_unit_sale_price_poisha >= 0),
  snap_commission_bp INTEGER NOT NULL CHECK (snap_commission_bp >= 0 AND snap_commission_bp <= 10000),
  snap_commission_source TEXT NOT NULL CHECK (snap_commission_source IN ('PRODUCT_OVERRIDE', 'VENDOR_DEFAULT', 'GLOBAL_DEFAULT')),
  line_supplier_payable_poisha BIGINT GENERATED ALWAYS AS (snap_unit_supplier_payable_poisha * quantity) STORED,
  line_platform_margin_poisha BIGINT GENERATED ALWAYS AS (snap_unit_platform_margin_poisha * quantity) STORED,
  line_subtotal_poisha BIGINT GENERATED ALWAYS AS (snap_unit_sale_price_poisha * quantity) STORED,
  escrow_hold_days_snapshot INTEGER NOT NULL DEFAULT 7 CHECK (escrow_hold_days_snapshot >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_vendor_id ON order_items(vendor_id);

-- 8. Print Archive & Reprint Audit Logs
CREATE TABLE print_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  print_mode TEXT NOT NULL CHECK (print_mode IN ('A4_THREE_PART', 'THERMAL_4X6', 'MANIFEST')),
  print_sequence_number INTEGER NOT NULL CHECK (print_sequence_number >= 1),
  reprint_reason TEXT,
  printed_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  printed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_abandoned_carts_updated_at BEFORE UPDATE ON abandoned_carts FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
