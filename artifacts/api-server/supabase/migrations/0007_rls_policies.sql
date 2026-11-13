-- ============================================================================
-- 0007_rls_policies.sql
-- Row-Level Security (RLS) on EVERY Table + Field-Level Security Views
-- Enforces:
--   1. Customer/Public NEVER sees vendor_id, vendor SKU, or supplier_cost_poisha
--   2. Vendor ONLY sees own products, own order items, own ledger, and masked customer PII
--   3. Marketing Manager NEVER sees supplier_cost_poisha or net profit
-- ============================================================================

-- Enable RLS across all tables
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE upazilas ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE users_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE encrypted_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE abandoned_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_remittance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_trigger_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheets_sync_queue ENABLE ROW LEVEL SECURITY;

-- Helper functions for current user role & vendor context
CREATE OR REPLACE FUNCTION fn_current_role_slug()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT r.slug
  FROM users_profile up
  JOIN roles r ON r.id = up.role_id
  WHERE up.id = auth.uid()
    AND up.is_active = TRUE
    AND up.must_change_password = FALSE
    AND (r.require_2fa = FALSE OR up.totp_enrolled = TRUE);
$$;

CREATE OR REPLACE FUNCTION fn_current_vendor_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT up.vendor_id
  FROM users_profile up
  JOIN roles r ON r.id = up.role_id
  WHERE up.id = auth.uid()
    AND up.is_active = TRUE
    AND up.must_change_password = FALSE
    AND (r.require_2fa = FALSE OR up.totp_enrolled = TRUE);
$$;

-- 1. Public Read Policies (Geo, Active Categories, Active Delivery Rates, Approved Reviews, Public Site Settings)
CREATE POLICY pol_districts_public_read ON districts FOR SELECT USING (is_active = TRUE);
CREATE POLICY pol_upazilas_public_read ON upazilas FOR SELECT USING (is_active = TRUE);
CREATE POLICY pol_categories_public_read ON categories FOR SELECT USING (is_active = TRUE);
CREATE POLICY pol_delivery_rates_public_read ON delivery_rates FOR SELECT USING (is_active = TRUE);
CREATE POLICY pol_reviews_public_read ON reviews FOR SELECT USING (status = 'approved');
CREATE POLICY pol_site_settings_public_read ON site_settings FOR SELECT USING (TRUE);

-- 2. Super Admin Full Access Policies
CREATE POLICY pol_super_admin_vendors ON vendors FOR ALL USING (fn_current_role_slug() = 'super_admin');
CREATE POLICY pol_super_admin_products ON products FOR ALL USING (fn_current_role_slug() = 'super_admin');
CREATE POLICY pol_super_admin_variants ON product_variants FOR ALL USING (fn_current_role_slug() = 'super_admin');
CREATE POLICY pol_super_admin_orders ON orders FOR ALL USING (fn_current_role_slug() = 'super_admin');
CREATE POLICY pol_super_admin_order_items ON order_items FOR ALL USING (fn_current_role_slug() = 'super_admin');
CREATE POLICY pol_super_admin_vendor_ledger ON vendor_ledger FOR ALL USING (fn_current_role_slug() = 'super_admin');
CREATE POLICY pol_super_admin_payouts ON payout_requests FOR ALL USING (fn_current_role_slug() = 'super_admin');
CREATE POLICY pol_super_admin_expenses ON expenses FOR ALL USING (fn_current_role_slug() = 'super_admin');
CREATE POLICY pol_super_admin_audit_logs ON audit_logs FOR SELECT USING (fn_current_role_slug() = 'super_admin');

-- 3. Vendor Self-Isolation Policies (Strictly restricted to fn_current_vendor_id())
CREATE POLICY pol_vendor_own_profile ON vendors
  FOR SELECT USING (id = fn_current_vendor_id());

CREATE POLICY pol_vendor_own_products ON products
  FOR SELECT USING (vendor_id = fn_current_vendor_id() AND deleted_at IS NULL);

CREATE POLICY pol_vendor_own_variants ON product_variants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_variants.product_id
        AND p.vendor_id = fn_current_vendor_id()
    )
  );

CREATE POLICY pol_vendor_own_inventory_ledger ON inventory_ledger
  FOR SELECT USING (vendor_id = fn_current_vendor_id());

CREATE POLICY pol_vendor_own_order_items ON order_items
  FOR SELECT USING (vendor_id = fn_current_vendor_id());

CREATE POLICY pol_vendor_own_ledger ON vendor_ledger
  FOR SELECT USING (vendor_id = fn_current_vendor_id());

CREATE POLICY pol_vendor_own_payouts_read ON payout_requests
  FOR SELECT USING (vendor_id = fn_current_vendor_id());

CREATE POLICY pol_vendor_own_payouts_insert ON payout_requests
  FOR INSERT WITH CHECK (vendor_id = fn_current_vendor_id());

CREATE POLICY pol_vendor_own_returns ON return_cases
  FOR SELECT USING (vendor_id = fn_current_vendor_id());

-- 4. Staff Role Policies (Marketing Manager & Packaging Manager)
CREATE POLICY pol_staff_orders_read ON orders
  FOR SELECT USING (fn_current_role_slug() IN ('marketing_manager', 'packaging_manager'));

CREATE POLICY pol_marketing_expenses_insert ON expenses
  FOR INSERT WITH CHECK (
    fn_current_role_slug() = 'marketing_manager'
    AND category IN ('facebook_ads', 'instagram_ads', 'whatsapp_marketing')
  );

-- ============================================================================
-- 5. FIELD-LEVEL SECURITY VIEWS (Column-Stripped & Masked Projections)
-- ============================================================================

-- View A: Public Storefront Products & Variants (Strips vendor_id, internal_vendor_sku, supplier_cost_poisha, supplier_profit_poisha, platform_margin_poisha)
CREATE OR REPLACE VIEW v_storefront_products AS
SELECT
  p.id AS product_id,
  p.category_id,
  p.slug,
  p.name_bn,
  p.name_en,
  p.description_bn,
  p.description_en,
  p.specs_json,
  p.variant_axes_json,
  p.images,
  p.is_featured,
  p.is_free_delivery,
  p.low_stock_threshold,
  p.total_sold_count,
  p.rating_avg_bp,
  p.review_count,
  pv.id AS variant_id,
  pv.public_sku,
  pv.title_bn AS variant_title_bn,
  pv.title_en AS variant_title_en,
  pv.attributes_json,
  pv.image_url AS variant_image_url,
  pv.sale_price_poisha,
  pv.compare_at_price_poisha,
  pv.weight_grams,
  pv.stock_available
FROM products p
JOIN product_variants pv ON pv.product_id = p.id
WHERE p.status = 'active'
  AND p.deleted_at IS NULL
  AND pv.is_active = TRUE;

-- View B: Vendor Masked Order Items (Masks Customer Phone & Street Address, Hides Platform Margin & Final Customer Price if needed)
CREATE OR REPLACE VIEW v_vendor_masked_orders AS
SELECT
  oi.id AS order_item_id,
  oi.order_id,
  o.order_no,
  o.status AS order_status,
  oi.vendor_id,
  oi.product_name_bn_snapshot,
  oi.variant_title_snapshot,
  oi.internal_vendor_sku_snapshot,
  oi.quantity,
  oi.snap_unit_supplier_cost_poisha,
  oi.snap_unit_supplier_profit_poisha,
  oi.snap_unit_supplier_payable_poisha,
  oi.line_supplier_payable_poisha,
  oi.escrow_hold_days_snapshot,
  CASE
    WHEN v.mask_customer_pii THEN CONCAT(SUBSTRING(o.customer_phone FROM 1 FOR 3), '****', RIGHT(o.customer_phone, 3))
    ELSE o.customer_phone
  END AS customer_phone_display,
  CASE
    WHEN v.mask_customer_pii THEN 'ঠিকানা গোপন রাখা হয়েছে (অ্যাডমিন নিয়ন্ত্রিত)'
    ELSE o.street_address
  END AS customer_address_display,
  d.name_bn AS district_name_bn,
  u.name_bn AS upazila_name_bn,
  o.delivered_at,
  o.created_at
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN vendors v ON v.id = oi.vendor_id
JOIN districts d ON d.id = o.district_id
JOIN upazilas u ON u.id = o.upazila_id;
