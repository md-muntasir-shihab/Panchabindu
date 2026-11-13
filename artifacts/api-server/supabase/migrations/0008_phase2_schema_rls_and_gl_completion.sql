-- ============================================================================
-- 0008_phase2_schema_rls_and_gl_completion.sql
-- Phase 2: Complete PostgreSQL Source-of-Truth Schema, Double-Entry General
-- Ledger, Multi-Vendor Fulfillment Groups, Manual bKash Submissions,
-- Consignment Dispatch Lots, RLS Policy Completion (100% Table Coverage),
-- Public-Safe site_settings Projection, Storage Policies, & Function Hardening
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HARDEN EXISTING ORDERS TABLE (Opaque Tracking Token & Payment Method Guard)
-- ----------------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS secure_tracking_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS tracking_token_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_secure_tracking_token
  ON orders(secure_tracking_token);

-- Enforce Phase 1/2 Scope Freeze at DB Level: Only COD and Manual bKash allowed
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS chk_orders_approved_payment_methods;

ALTER TABLE orders
  ADD CONSTRAINT chk_orders_approved_payment_methods
  CHECK (payment_method IN ('cod', 'bkash_manual'));

-- ----------------------------------------------------------------------------
-- 2. NORMALIZED CUSTOMER ADDRESSES & PRODUCT IMAGES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label_bn TEXT NOT NULL DEFAULT 'বাসা',
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  district_id INTEGER NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  upazila_id INTEGER NOT NULL REFERENCES upazilas(id) ON DELETE RESTRICT,
  street_address TEXT NOT NULL,
  landmark TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_id
  ON customer_addresses(customer_id);

CREATE TABLE IF NOT EXISTS product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  image_url TEXT NOT NULL,
  alt_text_bn TEXT NOT NULL DEFAULT '',
  alt_text_en TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id
  ON product_images(product_id, sort_order);

-- ----------------------------------------------------------------------------
-- 3. WAREHOUSES, CONSIGNMENT DISPATCH LOTS, SUPPLIER OFFERS & PRICE PROPOSALS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  district_id INTEGER NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  address_bn TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consignment_dispatch_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_code TEXT NOT NULL UNIQUE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  warehouse_id UUID REFERENCES warehouses(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  dispatched_qty INTEGER NOT NULL CHECK (dispatched_qty > 0),
  qc_accepted_qty INTEGER CHECK (qc_accepted_qty IS NULL OR qc_accepted_qty >= 0),
  qc_rejected_qty INTEGER CHECK (qc_rejected_qty IS NULL OR qc_rejected_qty >= 0),
  unit_supplier_cost_poisha BIGINT NOT NULL CHECK (unit_supplier_cost_poisha >= 0),
  challan_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_qc' CHECK (status IN ('pending_qc', 'approved_stocked', 'rejected')),
  note_bn TEXT NOT NULL DEFAULT '',
  reviewed_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  reviewed_by_username TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_consignment_lot_qc_quantities CHECK (
    (qc_accepted_qty IS NULL AND qc_rejected_qty IS NULL)
    OR (COALESCE(qc_accepted_qty, 0) + COALESCE(qc_rejected_qty, 0) = dispatched_qty)
  )
);

CREATE INDEX IF NOT EXISTS idx_consignment_lots_vendor_status
  ON consignment_dispatch_lots(vendor_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS supplier_product_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_code TEXT NOT NULL UNIQUE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  internal_vendor_sku TEXT NOT NULL,
  supplier_cost_poisha BIGINT NOT NULL CHECK (supplier_cost_poisha >= 0),
  supplier_profit_poisha BIGINT NOT NULL CHECK (supplier_profit_poisha >= 0),
  supplier_payable_poisha BIGINT GENERATED ALWAYS AS (supplier_cost_poisha + supplier_profit_poisha) STORED,
  platform_margin_poisha BIGINT NOT NULL CHECK (platform_margin_poisha >= 0),
  sale_price_poisha BIGINT GENERATED ALWAYS AS (supplier_cost_poisha + supplier_profit_poisha + platform_margin_poisha) STORED,
  stock_available INTEGER NOT NULL DEFAULT 0 CHECK (stock_available >= 0),
  lead_time_days INTEGER NOT NULL DEFAULT 3 CHECK (lead_time_days >= 0),
  priority_rank INTEGER NOT NULL DEFAULT 1 CHECK (priority_rank >= 1),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (variant_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_offers_variant_priority
  ON supplier_product_offers(variant_id, is_active, priority_rank ASC);

CREATE TABLE IF NOT EXISTS vendor_price_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_code TEXT NOT NULL UNIQUE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  current_supplier_cost_poisha BIGINT NOT NULL CHECK (current_supplier_cost_poisha >= 0),
  current_sale_price_poisha BIGINT NOT NULL CHECK (current_sale_price_poisha >= 0),
  proposed_supplier_cost_poisha BIGINT NOT NULL CHECK (proposed_supplier_cost_poisha >= 0),
  proposed_sale_price_poisha BIGINT NOT NULL CHECK (proposed_sale_price_poisha >= 0),
  proposed_commission_bp INTEGER NOT NULL CHECK (proposed_commission_bp >= 0 AND proposed_commission_bp <= 10000),
  projected_platform_margin_poisha BIGINT NOT NULL CHECK (projected_platform_margin_poisha >= 0),
  reason_bn TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  reviewed_by_username TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_price_proposals_vendor_status
  ON vendor_price_proposals(vendor_id, status);

-- ----------------------------------------------------------------------------
-- 4. MULTI-VENDOR FULFILLMENT GROUPS & MANUAL BKASH SUBMISSIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_fulfillment_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code TEXT NOT NULL UNIQUE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_no TEXT NOT NULL,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  allocation_policy_used TEXT NOT NULL DEFAULT 'priority_rank'
    CHECK (allocation_policy_used IN ('priority_rank', 'lowest_payable_highest_margin', 'highest_stock')),
  fulfillment_status TEXT NOT NULL DEFAULT 'allocated'
    CHECK (fulfillment_status IN ('allocated', 'packed', 'shipped', 'delivered', 'returned', 'cancelled')),
  total_units INTEGER NOT NULL CHECK (total_units > 0),
  group_sale_subtotal_poisha BIGINT NOT NULL CHECK (group_sale_subtotal_poisha >= 0),
  group_supplier_cost_poisha BIGINT NOT NULL CHECK (group_supplier_cost_poisha >= 0),
  group_supplier_profit_poisha BIGINT NOT NULL CHECK (group_supplier_profit_poisha >= 0),
  group_supplier_payable_poisha BIGINT NOT NULL CHECK (group_supplier_payable_poisha >= 0),
  group_platform_margin_poisha BIGINT NOT NULL CHECK (group_platform_margin_poisha >= 0),
  consignment_id TEXT,
  tracking_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_vfg_three_tier_math CHECK (
    group_supplier_cost_poisha + group_supplier_profit_poisha = group_supplier_payable_poisha
    AND group_supplier_payable_poisha + group_platform_margin_poisha = group_sale_subtotal_poisha
  )
);

CREATE INDEX IF NOT EXISTS idx_vfg_order_id ON vendor_fulfillment_groups(order_id);
CREATE INDEX IF NOT EXISTS idx_vfg_vendor_id ON vendor_fulfillment_groups(vendor_id, fulfillment_status);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS fulfillment_group_id UUID REFERENCES vendor_fulfillment_groups(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS manual_payment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_code TEXT NOT NULL UNIQUE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_no TEXT NOT NULL,
  sender_phone TEXT NOT NULL,
  sender_phone_masked TEXT NOT NULL,
  order_customer_phone TEXT NOT NULL,
  sender_phone_matches_order BOOLEAN NOT NULL DEFAULT TRUE,
  trx_id TEXT NOT NULL CHECK (trx_id = upper(trx_id) AND length(trx_id) >= 6),
  submitted_amount_poisha BIGINT NOT NULL CHECK (submitted_amount_poisha > 0),
  expected_payable_poisha BIGINT NOT NULL CHECK (expected_payable_poisha > 0),
  status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification', 'under_review', 'approved', 'rejected', 'reversed')),
  submitted_by_role TEXT NOT NULL,
  submitted_by_username TEXT NOT NULL,
  reviewed_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  reviewed_by_username TEXT,
  review_note_bn TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT chk_manual_bkash_maker_checker CHECK (
    reviewed_by_username IS NULL OR reviewed_by_username <> submitted_by_username
  )
);

-- Prevent duplicate active/approved TrxID reuse across orders
CREATE UNIQUE INDEX IF NOT EXISTS uq_manual_payment_active_trx_id
  ON manual_payment_submissions(trx_id)
  WHERE status IN ('pending_verification', 'under_review', 'approved');

CREATE INDEX IF NOT EXISTS idx_manual_payment_order_no
  ON manual_payment_submissions(order_no, status);

-- ----------------------------------------------------------------------------
-- 5. DOUBLE-ENTRY GENERAL LEDGER, REVERSALS, REFUNDS & ESCROW MATURITY BATCHES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code TEXT NOT NULL UNIQUE,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
  normal_balance TEXT NOT NULL CHECK (normal_balance IN ('DEBIT', 'CREDIT')),
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_no TEXT NOT NULL UNIQUE,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  description_bn TEXT NOT NULL,
  description_en TEXT NOT NULL DEFAULT '',
  total_debit_poisha BIGINT NOT NULL CHECK (total_debit_poisha > 0),
  total_credit_poisha BIGINT NOT NULL CHECK (total_credit_poisha > 0),
  posted_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  posted_by_username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_journal_entry_balanced CHECK (total_debit_poisha = total_credit_poisha)
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_ref
  ON journal_entries(reference_type, reference_id, created_at DESC);

CREATE TRIGGER trg_journal_entries_immutable
BEFORE UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION fn_prevent_ledger_mutation();

CREATE TABLE IF NOT EXISTS journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
  vendor_id UUID REFERENCES vendors(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES orders(id) ON DELETE RESTRICT,
  debit_poisha BIGINT NOT NULL DEFAULT 0 CHECK (debit_poisha >= 0),
  credit_poisha BIGINT NOT NULL DEFAULT 0 CHECK (credit_poisha >= 0),
  memo_bn TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_journal_line_single_sided CHECK (
    (debit_poisha > 0 AND credit_poisha = 0)
    OR (credit_poisha > 0 AND debit_poisha = 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_id ON journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_id ON journal_lines(account_id, created_at DESC);

CREATE TRIGGER trg_journal_lines_immutable
BEFORE UPDATE OR DELETE ON journal_lines
FOR EACH ROW EXECUTE FUNCTION fn_prevent_ledger_mutation();

CREATE TABLE IF NOT EXISTS ledger_reversal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reversal_code TEXT NOT NULL UNIQUE,
  original_ledger_entry_id UUID NOT NULL REFERENCES vendor_ledger(id) ON DELETE RESTRICT,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  order_no TEXT,
  original_amount_poisha BIGINT NOT NULL,
  reversal_debit_poisha BIGINT NOT NULL CHECK (reversal_debit_poisha > 0),
  reversal_credit_poisha BIGINT NOT NULL CHECK (reversal_credit_poisha > 0),
  corrected_credit_poisha BIGINT NOT NULL DEFAULT 0 CHECK (corrected_credit_poisha >= 0),
  reason_bn TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_checker_approval'
    CHECK (status IN ('pending_checker_approval', 'approved_posted', 'rejected')),
  created_by_username TEXT NOT NULL,
  approved_by_username TEXT,
  used_emergency_override BOOLEAN NOT NULL DEFAULT FALSE,
  emergency_override_reason_bn TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT chk_reversal_double_entry_balanced CHECK (reversal_debit_poisha = reversal_credit_poisha),
  CONSTRAINT chk_reversal_maker_checker CHECK (
    used_emergency_override = TRUE
    OR approved_by_username IS NULL
    OR approved_by_username <> created_by_username
  )
);

CREATE TABLE IF NOT EXISTS customer_refund_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_code TEXT NOT NULL UNIQUE,
  order_id UUID REFERENCES orders(id) ON DELETE RESTRICT,
  order_no TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  refund_channel TEXT NOT NULL CHECK (refund_channel IN ('bkash_manual', 'bank_transfer')),
  refund_amount_poisha BIGINT NOT NULL CHECK (refund_amount_poisha > 0),
  vendor_clawback_poisha BIGINT NOT NULL DEFAULT 0 CHECK (vendor_clawback_poisha >= 0),
  platform_subsidy_poisha BIGINT NOT NULL DEFAULT 0 CHECK (platform_subsidy_poisha >= 0),
  refund_trx_id TEXT,
  reason_bn TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved_paid', 'rejected')),
  requested_by_username TEXT NOT NULL,
  approved_by_username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT chk_refund_split_sum CHECK (
    vendor_clawback_poisha + platform_subsidy_poisha = refund_amount_poisha
  ),
  CONSTRAINT chk_refund_maker_checker CHECK (
    approved_by_username IS NULL OR approved_by_username <> requested_by_username
  )
);

CREATE TABLE IF NOT EXISTS escrow_maturity_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code TEXT NOT NULL UNIQUE,
  promoted_entries_count INTEGER NOT NULL CHECK (promoted_entries_count >= 0),
  total_promoted_poisha BIGINT NOT NULL CHECK (total_promoted_poisha >= 0),
  affected_vendor_codes TEXT[] NOT NULL DEFAULT '{}',
  executed_by_username TEXT NOT NULL,
  summary_bn TEXT NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. WEBHOOK EVENTS, FRAUD CASES, INQUIRIES, SESSIONS & BACKUP SNAPSHOTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courier_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  courier_provider courier_provider NOT NULL,
  consignment_id TEXT NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  order_no TEXT NOT NULL,
  raw_status TEXT NOT NULL,
  mapped_status order_status NOT NULL,
  collected_cod_poisha BIGINT NOT NULL DEFAULT 0 CHECK (collected_cod_poisha >= 0),
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  escrow_promoted BOOLEAN NOT NULL DEFAULT FALSE,
  remittance_recorded BOOLEAN NOT NULL DEFAULT FALSE,
  rejected_reason_bn TEXT,
  summary_bn TEXT NOT NULL DEFAULT '',
  raw_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courier_webhook_events_order_no
  ON courier_webhook_events(order_no, received_at DESC);

CREATE TABLE IF NOT EXISTS fraud_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_code TEXT NOT NULL UNIQUE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_phone TEXT NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  fraud_flags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'blacklisted', 'cleared')),
  reason_bn TEXT NOT NULL,
  reported_by_username TEXT NOT NULL,
  resolved_by_username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fraud_cases_phone ON fraud_cases(customer_phone, status);

CREATE TABLE IF NOT EXISTS customer_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'replied', 'resolved')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  role_slug TEXT NOT NULL,
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL DEFAULT 'unknown',
  user_agent TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id ON admin_sessions(user_id, revoked_at);

CREATE TABLE IF NOT EXISTS customer_otp_challenges (
  phone TEXT PRIMARY KEY,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  resend_available_at TIMESTAMPTZ NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_backup_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  created_by_username TEXT NOT NULL,
  sha256_checksum TEXT NOT NULL CHECK (length(sha256_checksum) = 64),
  total_orders_count INTEGER NOT NULL CHECK (total_orders_count >= 0),
  total_products_count INTEGER NOT NULL CHECK (total_products_count >= 0),
  total_vendors_count INTEGER NOT NULL CHECK (total_vendors_count >= 0),
  total_ledger_entries_count INTEGER NOT NULL CHECK (total_ledger_entries_count >= 0),
  total_audit_logs_count INTEGER NOT NULL CHECK (total_audit_logs_count >= 0),
  payload_size_bytes BIGINT NOT NULL CHECK (payload_size_bytes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 7. HARDEN ALL SECURITY DEFINER FUNCTIONS (Fixed Safe search_path + Grants)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_prevent_ledger_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_LEDGER_VIOLATION: Table "%" is append-only. UPDATE and DELETE operations are strictly prohibited. Insert an offsetting reversal entry instead.', TG_TABLE_NAME;
END;
$$;

CREATE OR REPLACE FUNCTION fn_current_role_slug()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT r.slug
  FROM public.users_profile up
  JOIN public.roles r ON r.id = up.role_id
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
SET search_path = public, pg_temp
AS $$
  SELECT up.vendor_id
  FROM public.users_profile up
  JOIN public.roles r ON r.id = up.role_id
  WHERE up.id = auth.uid()
    AND up.is_active = TRUE
    AND up.must_change_password = FALSE
    AND (r.require_2fa = FALSE OR up.totp_enrolled = TRUE);
$$;

CREATE OR REPLACE FUNCTION fn_current_customer_phone()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() ->> 'phone', ''),
    NULLIF(auth.jwt() -> 'user_metadata' ->> 'phone', '')
  );
$$;

REVOKE ALL ON FUNCTION fn_prevent_ledger_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_current_role_slug() FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_current_vendor_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_current_customer_phone() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION fn_current_role_slug() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_current_vendor_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION fn_current_customer_phone() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. FIX site_settings PUBLIC READ EXPOSURE & CREATE PUBLIC-SAFE VIEW
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS pol_site_settings_public_read ON site_settings;

CREATE POLICY pol_site_settings_staff_read ON site_settings
  FOR SELECT USING (
    fn_current_role_slug() IN ('super_admin', 'marketing_manager', 'packaging_manager')
  );

CREATE POLICY pol_site_settings_super_admin_write ON site_settings
  FOR ALL USING (fn_current_role_slug() = 'super_admin')
  WITH CHECK (fn_current_role_slug() = 'super_admin');

-- Public-safe storefront settings projection (Strips commission, hold days, min payout, packaging cost, risk weights, print config)
CREATE OR REPLACE VIEW v_public_site_settings AS
SELECT
  id,
  brand_name_bn,
  brand_name_en,
  tagline_bn,
  tagline_en,
  logo_url,
  favicon_url,
  accent_color_hex,
  support_phone,
  support_email,
  whatsapp_number,
  facebook_page_url,
  default_locale,
  free_delivery_threshold_poisha,
  global_free_delivery,
  bd_post_default_per_kg_poisha,
  bkash_manual_number,
  bkash_instruction_bn,
  bkash_instruction_en,
  trust_badges_json,
  homepage_sections_json,
  hero_banners_json,
  promo_campaign_json,
  delay_banner_json,
  legal_pages_json,
  maintenance_mode,
  maintenance_message_bn,
  updated_at
FROM site_settings
WHERE id = 1;

GRANT SELECT ON v_public_site_settings TO anon, authenticated, service_role;
GRANT SELECT ON v_storefront_products TO anon, authenticated, service_role;
GRANT SELECT ON v_vendor_masked_orders TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9. ENABLE RLS & EXPLICIT POLICIES FOR ALL PREVIOUSLY UNCOVERED + NEW TABLES
-- ----------------------------------------------------------------------------
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE consignment_dispatch_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_product_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_price_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_fulfillment_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_payment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_reversal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_refund_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_maturity_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE courier_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_backup_snapshots ENABLE ROW LEVEL SECURITY;

-- 9.1 Previously uncovered 18 tables from 0007_rls_policies.sql:
-- (1) roles
CREATE POLICY pol_roles_authenticated_read ON roles
  FOR SELECT USING (fn_current_role_slug() IS NOT NULL);
CREATE POLICY pol_roles_super_admin_all ON roles
  FOR ALL USING (fn_current_role_slug() = 'super_admin')
  WITH CHECK (fn_current_role_slug() = 'super_admin');

-- (2) role_permissions
CREATE POLICY pol_role_permissions_authenticated_read ON role_permissions
  FOR SELECT USING (fn_current_role_slug() IS NOT NULL);
CREATE POLICY pol_role_permissions_super_admin_all ON role_permissions
  FOR ALL USING (fn_current_role_slug() = 'super_admin')
  WITH CHECK (fn_current_role_slug() = 'super_admin');

-- (3) users_profile
CREATE POLICY pol_users_profile_self_read ON users_profile
  FOR SELECT USING (id = auth.uid() OR fn_current_role_slug() = 'super_admin');
CREATE POLICY pol_users_profile_super_admin_all ON users_profile
  FOR ALL USING (fn_current_role_slug() = 'super_admin')
  WITH CHECK (fn_current_role_slug() = 'super_admin');

-- (4) encrypted_credentials (Strictly service_role / super_admin metadata only)
CREATE POLICY pol_encrypted_credentials_super_admin ON encrypted_credentials
  FOR ALL USING (fn_current_role_slug() = 'super_admin')
  WITH CHECK (fn_current_role_slug() = 'super_admin');

-- (5) customers (Customer owns own phone record; Staff/Admin read/manage)
CREATE POLICY pol_customers_own_read ON customers
  FOR SELECT USING (
    phone = fn_current_customer_phone()
    OR fn_current_role_slug() IN ('super_admin', 'marketing_manager', 'packaging_manager')
  );
CREATE POLICY pol_customers_staff_write ON customers
  FOR ALL USING (fn_current_role_slug() IN ('super_admin', 'marketing_manager'))
  WITH CHECK (fn_current_role_slug() IN ('super_admin', 'marketing_manager'));

-- (6) abandoned_carts
CREATE POLICY pol_abandoned_carts_staff_all ON abandoned_carts
  FOR ALL USING (fn_current_role_slug() IN ('super_admin', 'marketing_manager'))
  WITH CHECK (fn_current_role_slug() IN ('super_admin', 'marketing_manager'));

-- (7) promo_codes
CREATE POLICY pol_promo_codes_staff_read ON promo_codes
  FOR SELECT USING (fn_current_role_slug() IN ('super_admin', 'marketing_manager'));
CREATE POLICY pol_promo_codes_staff_write ON promo_codes
  FOR ALL USING (fn_current_role_slug() IN ('super_admin', 'marketing_manager'))
  WITH CHECK (fn_current_role_slug() IN ('super_admin', 'marketing_manager'));

-- (8) pickup_batches
CREATE POLICY pol_pickup_batches_ops_all ON pickup_batches
  FOR ALL USING (fn_current_role_slug() IN ('super_admin', 'packaging_manager'))
  WITH CHECK (fn_current_role_slug() IN ('super_admin', 'packaging_manager'));

-- (9) print_logs
CREATE POLICY pol_print_logs_ops_read_insert ON print_logs
  FOR SELECT USING (fn_current_role_slug() IN ('super_admin', 'packaging_manager'));
CREATE POLICY pol_print_logs_ops_insert ON print_logs
  FOR INSERT WITH CHECK (fn_current_role_slug() IN ('super_admin', 'packaging_manager'));

-- (10) courier_remittance_ledger (Append-only: SELECT + INSERT for super_admin)
CREATE POLICY pol_courier_remittance_super_admin_read ON courier_remittance_ledger
  FOR SELECT USING (fn_current_role_slug() = 'super_admin');
CREATE POLICY pol_courier_remittance_super_admin_insert ON courier_remittance_ledger
  FOR INSERT WITH CHECK (fn_current_role_slug() = 'super_admin');

-- (11) courier_claims
CREATE POLICY pol_courier_claims_ops_all ON courier_claims
  FOR ALL USING (fn_current_role_slug() IN ('super_admin', 'packaging_manager'))
  WITH CHECK (fn_current_role_slug() IN ('super_admin', 'packaging_manager'));

-- (12) message_templates
CREATE POLICY pol_message_templates_staff_read ON message_templates
  FOR SELECT USING (fn_current_role_slug() IN ('super_admin', 'marketing_manager', 'packaging_manager'));
CREATE POLICY pol_message_templates_admin_write ON message_templates
  FOR ALL USING (fn_current_role_slug() IN ('super_admin', 'marketing_manager'))
  WITH CHECK (fn_current_role_slug() IN ('super_admin', 'marketing_manager'));

-- (13) message_trigger_matrix
CREATE POLICY pol_message_trigger_matrix_staff_read ON message_trigger_matrix
  FOR SELECT USING (fn_current_role_slug() IN ('super_admin', 'marketing_manager'));
CREATE POLICY pol_message_trigger_matrix_super_admin_write ON message_trigger_matrix
  FOR ALL USING (fn_current_role_slug() = 'super_admin')
  WITH CHECK (fn_current_role_slug() = 'super_admin');

-- (14) message_logs
CREATE POLICY pol_message_logs_staff_read_insert ON message_logs
  FOR SELECT USING (fn_current_role_slug() IN ('super_admin', 'marketing_manager', 'packaging_manager'));
CREATE POLICY pol_message_logs_staff_insert ON message_logs
  FOR INSERT WITH CHECK (fn_current_role_slug() IN ('super_admin', 'marketing_manager', 'packaging_manager'));

-- (15) automation_rules
CREATE POLICY pol_automation_rules_super_admin_all ON automation_rules
  FOR ALL USING (fn_current_role_slug() = 'super_admin')
  WITH CHECK (fn_current_role_slug() = 'super_admin');

-- (16) automation_execution_logs
CREATE POLICY pol_automation_exec_logs_super_admin_read ON automation_execution_logs
  FOR SELECT USING (fn_current_role_slug() = 'super_admin');
CREATE POLICY pol_automation_exec_logs_super_admin_insert ON automation_execution_logs
  FOR INSERT WITH CHECK (fn_current_role_slug() = 'super_admin');

-- (17) idempotency_keys (Server-side service_role or super_admin inspection only)
CREATE POLICY pol_idempotency_keys_super_admin_read ON idempotency_keys
  FOR SELECT USING (fn_current_role_slug() = 'super_admin');

-- (18) sheets_sync_queue
CREATE POLICY pol_sheets_sync_queue_super_admin_all ON sheets_sync_queue
  FOR ALL USING (fn_current_role_slug() = 'super_admin')
  WITH CHECK (fn_current_role_slug() = 'super_admin');

-- 9.2 Customer Ownership & New Table Policies:
CREATE POLICY pol_orders_customer_own_read ON orders
  FOR SELECT USING (customer_phone = fn_current_customer_phone());

CREATE POLICY pol_customer_addresses_own_all ON customer_addresses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = customer_addresses.customer_id
        AND c.phone = fn_current_customer_phone()
    )
    OR fn_current_role_slug() IN ('super_admin', 'marketing_manager', 'packaging_manager')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM customers c
      WHERE c.id = customer_addresses.customer_id
        AND c.phone = fn_current_customer_phone()
    )
    OR fn_current_role_slug() IN ('super_admin', 'marketing_manager', 'packaging_manager')
  );

CREATE POLICY pol_product_images_public_read ON product_images
  FOR SELECT USING (TRUE);
CREATE POLICY pol_product_images_admin_write ON product_images
  FOR ALL USING (fn_current_role_slug() = 'super_admin')
  WITH CHECK (fn_current_role_slug() = 'super_admin');

CREATE POLICY pol_warehouses_staff_read ON warehouses
  FOR SELECT USING (fn_current_role_slug() IS NOT NULL);
CREATE POLICY pol_warehouses_super_admin_write ON warehouses
  FOR ALL USING (fn_current_role_slug() = 'super_admin')
  WITH CHECK (fn_current_role_slug() = 'super_admin');

CREATE POLICY pol_consignment_lots_vendor_own ON consignment_dispatch_lots
  FOR SELECT USING (
    vendor_id = fn_current_vendor_id()
    OR fn_current_role_slug() IN ('super_admin', 'packaging_manager')
  );
CREATE POLICY pol_consignment_lots_vendor_insert ON consignment_dispatch_lots
  FOR INSERT WITH CHECK (
    vendor_id = fn_current_vendor_id()
    OR fn_current_role_slug() IN ('super_admin', 'packaging_manager')
  );
CREATE POLICY pol_consignment_lots_qc_update ON consignment_dispatch_lots
  FOR UPDATE USING (fn_current_role_slug() IN ('super_admin', 'packaging_manager'))
  WITH CHECK (fn_current_role_slug() IN ('super_admin', 'packaging_manager'));

CREATE POLICY pol_supplier_offers_vendor_own_read ON supplier_product_offers
  FOR SELECT USING (
    vendor_id = fn_current_vendor_id()
    OR fn_current_role_slug() = 'super_admin'
  );
CREATE POLICY pol_supplier_offers_super_admin_all ON supplier_product_offers
  FOR ALL USING (fn_current_role_slug() = 'super_admin')
  WITH CHECK (fn_current_role_slug() = 'super_admin');

CREATE POLICY pol_vendor_price_proposals_vendor_own ON vendor_price_proposals
  FOR SELECT USING (
    vendor_id = fn_current_vendor_id()
    OR fn_current_role_slug() = 'super_admin'
  );
CREATE POLICY pol_vendor_price_proposals_vendor_insert ON vendor_price_proposals
  FOR INSERT WITH CHECK (
    vendor_id = fn_current_vendor_id()
    OR fn_current_role_slug() = 'super_admin'
  );
CREATE POLICY pol_vendor_price_proposals_super_admin_update ON vendor_price_proposals
  FOR UPDATE USING (fn_current_role_slug() = 'super_admin')
  WITH CHECK (fn_current_role_slug() = 'super_admin');

CREATE POLICY pol_vfg_vendor_own_read ON vendor_fulfillment_groups
  FOR SELECT USING (
    vendor_id = fn_current_vendor_id()
    OR fn_current_role_slug() IN ('super_admin', 'packaging_manager')
  );
CREATE POLICY pol_vfg_ops_write ON vendor_fulfillment_groups
  FOR ALL USING (fn_current_role_slug() IN ('super_admin', 'packaging_manager'))
  WITH CHECK (fn_current_role_slug() IN ('super_admin', 'packaging_manager'));

CREATE POLICY pol_manual_payment_submissions_customer_own ON manual_payment_submissions
  FOR SELECT USING (
    order_customer_phone = fn_current_customer_phone()
    OR fn_current_role_slug() IN ('super_admin', 'marketing_manager')
  );
CREATE POLICY pol_manual_payment_submissions_staff_all ON manual_payment_submissions
  FOR ALL USING (fn_current_role_slug() IN ('super_admin', 'marketing_manager'))
  WITH CHECK (fn_current_role_slug() IN ('super_admin', 'marketing_manager'));

CREATE POLICY pol_ledger_accounts_super_admin ON ledger_accounts
  FOR ALL USING (fn_current_role_slug() = 'super_admin')
  WITH CHECK (fn_current_role_slug() = 'super_admin');

CREATE POLICY pol_journal_entries_super_admin_read ON journal_entries
  FOR SELECT USING (fn_current_role_slug() = 'super_admin');
CREATE POLICY pol_journal_entries_super_admin_insert ON journal_entries
  FOR INSERT WITH CHECK (fn_current_role_slug() = 'super_admin');

CREATE POLICY pol_journal_lines_super_admin_or_vendor ON journal_lines
  FOR SELECT USING (
    fn_current_role_slug() = 'super_admin'
    OR vendor_id = fn_current_vendor_id()
  );
CREATE POLICY pol_journal_lines_super_admin_insert ON journal_lines
  FOR INSERT WITH CHECK (fn_current_role_slug() = 'super_admin');

CREATE POLICY pol_ledger_reversals_super_admin ON ledger_reversal_requests
  FOR ALL USING (fn_current_role_slug() = 'super_admin')
  WITH CHECK (fn_current_role_slug() = 'super_admin');

CREATE POLICY pol_customer_refunds_staff ON customer_refund_executions
  FOR ALL USING (fn_current_role_slug() IN ('super_admin', 'marketing_manager'))
  WITH CHECK (fn_current_role_slug() IN ('super_admin', 'marketing_manager'));

CREATE POLICY pol_escrow_maturity_batches_super_admin ON escrow_maturity_batches
  FOR ALL USING (fn_current_role_slug() = 'super_admin')
  WITH CHECK (fn_current_role_slug() = 'super_admin');

CREATE POLICY pol_courier_webhook_events_ops_read ON courier_webhook_events
  FOR SELECT USING (fn_current_role_slug() IN ('super_admin', 'packaging_manager'));

CREATE POLICY pol_fraud_cases_staff_all ON fraud_cases
  FOR ALL USING (fn_current_role_slug() IN ('super_admin', 'marketing_manager'))
  WITH CHECK (fn_current_role_slug() IN ('super_admin', 'marketing_manager'));

CREATE POLICY pol_customer_inquiries_staff_all ON customer_inquiries
  FOR ALL USING (fn_current_role_slug() IN ('super_admin', 'marketing_manager'))
  WITH CHECK (fn_current_role_slug() IN ('super_admin', 'marketing_manager'));

CREATE POLICY pol_admin_sessions_super_admin_read ON admin_sessions
  FOR SELECT USING (fn_current_role_slug() = 'super_admin');

CREATE POLICY pol_customer_otp_challenges_service_only ON customer_otp_challenges
  FOR SELECT USING (fn_current_role_slug() = 'super_admin');

CREATE POLICY pol_system_backup_snapshots_super_admin ON system_backup_snapshots
  FOR ALL USING (fn_current_role_slug() = 'super_admin')
  WITH CHECK (fn_current_role_slug() = 'super_admin');

-- ----------------------------------------------------------------------------
-- 10. STORAGE BUCKET SEPARATION (PUBLIC CATALOG vs PRIVATE OPS EVIDENCE)
-- ----------------------------------------------------------------------------
-- Note: Executed safely when Supabase storage schema is present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES
      ('public-catalog-media', 'public-catalog-media', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
      ('private-ops-evidence', 'private-ops-evidence', FALSE, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ============================================================================
-- REVERSIBLE ROLLBACK PLAN (DOWN MIGRATION REFERENCE)
-- ============================================================================
-- DROP VIEW IF EXISTS v_public_site_settings;
-- DROP TABLE IF EXISTS system_backup_snapshots;
-- DROP TABLE IF EXISTS customer_otp_challenges;
-- DROP TABLE IF EXISTS admin_sessions;
-- DROP TABLE IF EXISTS customer_inquiries;
-- DROP TABLE IF EXISTS fraud_cases;
-- DROP TABLE IF EXISTS courier_webhook_events;
-- DROP TABLE IF EXISTS escrow_maturity_batches;
-- DROP TABLE IF EXISTS customer_refund_executions;
-- DROP TABLE IF EXISTS ledger_reversal_requests;
-- DROP TABLE IF EXISTS journal_lines;
-- DROP TABLE IF EXISTS journal_entries;
-- DROP TABLE IF EXISTS ledger_accounts;
-- DROP TABLE IF EXISTS manual_payment_submissions;
-- ALTER TABLE order_items DROP COLUMN IF EXISTS fulfillment_group_id;
-- DROP TABLE IF EXISTS vendor_fulfillment_groups;
-- DROP TABLE IF EXISTS vendor_price_proposals;
-- DROP TABLE IF EXISTS supplier_product_offers;
-- DROP TABLE IF EXISTS consignment_dispatch_lots;
-- DROP TABLE IF EXISTS warehouses;
-- DROP TABLE IF EXISTS product_images;
-- DROP TABLE IF EXISTS customer_addresses;
-- ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_orders_approved_payment_methods;
-- ALTER TABLE orders DROP COLUMN IF EXISTS tracking_token_expires_at;
-- ALTER TABLE orders DROP COLUMN IF EXISTS secure_tracking_token;
