-- ============================================================================
-- 0003_catalog_tables.sql
-- Multi-level Categories, Consignment Products, 3-Tier Priced Variants,
-- Immutable Inventory Ledger, and Moderated Customer Reviews
-- ============================================================================

-- 1. Unlimited Nested Categories
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_bn TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  banner_url TEXT,
  icon_name TEXT NOT NULL DEFAULT 'Package',
  filter_attributes_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_parent_id ON categories(parent_id);
CREATE INDEX idx_categories_slug ON categories(slug);

-- 2. Products (Vendor ownership is strictly hidden from public & marketing roles)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_bn TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  specs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  variant_axes_json JSONB NOT NULL DEFAULT '["Size", "Color"]'::jsonb,
  images TEXT[] NOT NULL DEFAULT '{}',
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_free_delivery BOOLEAN NOT NULL DEFAULT FALSE,
  allow_custom_inquiry BOOLEAN NOT NULL DEFAULT FALSE,
  low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  lead_time_days INTEGER NOT NULL DEFAULT 3 CHECK (lead_time_days >= 0),
  commission_override_bp INTEGER CHECK (commission_override_bp IS NULL OR (commission_override_bp >= 0 AND commission_override_bp <= 10000)),
  total_sold_count INTEGER NOT NULL DEFAULT 0 CHECK (total_sold_count >= 0),
  total_returned_count INTEGER NOT NULL DEFAULT 0 CHECK (total_returned_count >= 0),
  rating_avg_bp INTEGER NOT NULL DEFAULT 0 CHECK (rating_avg_bp >= 0 AND rating_avg_bp <= 500),
  review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  status product_status NOT NULL DEFAULT 'draft',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_vendor_id ON products(vendor_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_status_featured ON products(status, is_featured);

-- 3. Product Variants — Enforces Exact 3-Tier Consignment Pricing in Poisha
-- Formula:
--   supplier_payable_poisha = supplier_cost_poisha + supplier_profit_poisha
--   sale_price_poisha       = supplier_payable_poisha + platform_margin_poisha
CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  internal_vendor_sku TEXT NOT NULL,
  public_sku TEXT NOT NULL UNIQUE,
  title_bn TEXT NOT NULL,
  title_en TEXT NOT NULL,
  attributes_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  image_url TEXT,
  supplier_cost_poisha BIGINT NOT NULL CHECK (supplier_cost_poisha >= 0),
  supplier_profit_poisha BIGINT NOT NULL CHECK (supplier_profit_poisha >= 0),
  supplier_payable_poisha BIGINT GENERATED ALWAYS AS (supplier_cost_poisha + supplier_profit_poisha) STORED,
  platform_margin_poisha BIGINT NOT NULL CHECK (platform_margin_poisha >= 0),
  sale_price_poisha BIGINT GENERATED ALWAYS AS (supplier_cost_poisha + supplier_profit_poisha + platform_margin_poisha) STORED,
  compare_at_price_poisha BIGINT CHECK (compare_at_price_poisha IS NULL OR compare_at_price_poisha >= 0),
  weight_grams INTEGER NOT NULL DEFAULT 500 CHECK (weight_grams > 0),
  stock_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (stock_on_hand >= 0),
  stock_reserved INTEGER NOT NULL DEFAULT 0 CHECK (stock_reserved >= 0),
  stock_in_transit INTEGER NOT NULL DEFAULT 0 CHECK (stock_in_transit >= 0),
  stock_damaged INTEGER NOT NULL DEFAULT 0 CHECK (stock_damaged >= 0),
  stock_available INTEGER GENERATED ALWAYS AS (GREATEST(0, stock_on_hand - stock_reserved)) STORED,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_product_variants_product_id ON product_variants(product_id);

-- 4. Immutable Inventory Ledger (Tracks Every Consignment Intake, Reservation, Shipment & Damage)
CREATE TABLE inventory_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  event_type inventory_event_type NOT NULL,
  on_hand_delta INTEGER NOT NULL DEFAULT 0,
  reserved_delta INTEGER NOT NULL DEFAULT 0,
  in_transit_delta INTEGER NOT NULL DEFAULT 0,
  damaged_delta INTEGER NOT NULL DEFAULT 0,
  balance_on_hand_after INTEGER NOT NULL,
  balance_reserved_after INTEGER NOT NULL,
  reference_order_id UUID,
  proof_media_urls TEXT[] NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_ledger_variant_id ON inventory_ledger(variant_id, created_at DESC);
CREATE INDEX idx_inventory_ledger_vendor_id ON inventory_ledger(vendor_id, created_at DESC);

-- Block UPDATE and DELETE on inventory_ledger
CREATE TRIGGER trg_inventory_ledger_immutable
BEFORE UPDATE OR DELETE ON inventory_ledger
FOR EACH ROW EXECUTE FUNCTION fn_prevent_ledger_mutation();

-- 5. Product Reviews (Verified Purchase Cross-Checked, Admin Moderated)
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  order_id UUID NOT NULL,
  customer_phone_hash TEXT NOT NULL,
  customer_display_name TEXT NOT NULL,
  is_verified_purchase BOOLEAN NOT NULL DEFAULT TRUE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  media_urls TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  helpful_count INTEGER NOT NULL DEFAULT 0 CHECK (helpful_count >= 0),
  moderated_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  moderated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_product_status ON reviews(product_id, status);

CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_product_variants_updated_at BEFORE UPDATE ON product_variants FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
