-- ============================================================================
-- 0002_core_tables.sql
-- Geo (64 Districts, Upazilas), Roles, Field-Level Permissions, Users,
-- Vendors (18-Point Consignment Policy), Site Settings, Encrypted Credentials
-- ============================================================================

-- 1. Bangladesh Geo Tables (Seeded from nuhil/bangladesh-geocode)
CREATE TABLE districts (
  id INTEGER PRIMARY KEY,
  division_id INTEGER NOT NULL,
  name_en TEXT NOT NULL,
  name_bn TEXT NOT NULL,
  lat TEXT,
  lon TEXT,
  url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE upazilas (
  id INTEGER PRIMARY KEY,
  district_id INTEGER NOT NULL REFERENCES districts(id) ON DELETE RESTRICT,
  name_en TEXT NOT NULL,
  name_bn TEXT NOT NULL,
  url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_upazilas_district_id ON upazilas(district_id);

-- 2. Roles (4 System Roles + Custom Roles Support)
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_bn TEXT NOT NULL DEFAULT '',
  max_discount_bp INTEGER NOT NULL DEFAULT 0 CHECK (max_discount_bp >= 0 AND max_discount_bp <= 10000),
  require_2fa BOOLEAN NOT NULL DEFAULT TRUE,
  session_timeout_minutes INTEGER NOT NULL DEFAULT 480 CHECK (session_timeout_minutes > 0),
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Granular Permission Matrix (Module + Action + Field-Level Hiding/Masking)
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  can_read BOOLEAN NOT NULL DEFAULT FALSE,
  can_create BOOLEAN NOT NULL DEFAULT FALSE,
  can_update BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_fields TEXT[] NOT NULL DEFAULT '{}',
  hidden_fields TEXT[] NOT NULL DEFAULT '{}',
  masked_fields TEXT[] NOT NULL DEFAULT '{}',
  UNIQUE (role_id, module_key)
);

-- 4. Vendors / Suppliers (Consignment Model — No Advance, Ownership Until Sold)
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  business_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  address TEXT NOT NULL DEFAULT '',
  default_commission_bp INTEGER NOT NULL DEFAULT 1500 CHECK (default_commission_bp >= 0 AND default_commission_bp <= 10000),
  hold_days_override INTEGER CHECK (hold_days_override IS NULL OR (hold_days_override >= 0 AND hold_days_override <= 90)),
  min_payout_poisha BIGINT CHECK (min_payout_poisha IS NULL OR min_payout_poisha >= 0),
  mask_customer_pii BOOLEAN NOT NULL DEFAULT TRUE,
  onboarding_answers_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  payout_method_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status vendor_status NOT NULL DEFAULT 'pending_onboarding',
  contract_accepted_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  closure_audit_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Staff & Vendor User Profiles (Username -> Internal Email Alias + Forced 2FA Gate)
CREATE TABLE users_profile (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE CHECK (username = lower(username)),
  internal_email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  phone TEXT,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  vendor_id UUID REFERENCES vendors(id) ON DELETE RESTRICT,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  totp_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
  require_2fa_override BOOLEAN,
  max_discount_bp_override INTEGER CHECK (max_discount_bp_override IS NULL OR (max_discount_bp_override >= 0 AND max_discount_bp_override <= 10000)),
  custom_permission_overrides_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  last_login_ip TEXT,
  last_login_user_agent TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_profile_role_id ON users_profile(role_id);
CREATE INDEX idx_users_profile_vendor_id ON users_profile(vendor_id);

-- 6. Site Settings (Singleton Admin-Controlled Configuration — Zero Hardcoded Values)
CREATE TABLE site_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  brand_name_bn TEXT NOT NULL DEFAULT 'বঙ্গকনসাইন',
  brand_name_en TEXT NOT NULL DEFAULT 'BongoConsign',
  tagline_bn TEXT NOT NULL DEFAULT 'বিশ্বস্ত কনসাইনমেন্ট ই-কমার্স স্টোর',
  tagline_en TEXT NOT NULL DEFAULT 'Trusted Consignment Marketplace',
  logo_url TEXT,
  favicon_url TEXT,
  accent_color_hex TEXT NOT NULL DEFAULT '#2563EB' CHECK (accent_color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  support_phone TEXT NOT NULL DEFAULT '01700000000',
  support_email TEXT NOT NULL DEFAULT 'support@example.com',
  whatsapp_number TEXT NOT NULL DEFAULT '8801700000000',
  facebook_page_url TEXT,
  default_locale TEXT NOT NULL DEFAULT 'bn' CHECK (default_locale IN ('bn', 'en')),
  free_delivery_threshold_poisha BIGINT NOT NULL DEFAULT 150000 CHECK (free_delivery_threshold_poisha >= 0),
  global_free_delivery BOOLEAN NOT NULL DEFAULT FALSE,
  bd_post_default_per_kg_poisha BIGINT NOT NULL DEFAULT 1000 CHECK (bd_post_default_per_kg_poisha >= 0),
  global_default_commission_bp INTEGER NOT NULL DEFAULT 1500 CHECK (global_default_commission_bp >= 0 AND global_default_commission_bp <= 10000),
  global_escrow_hold_days INTEGER NOT NULL DEFAULT 7 CHECK (global_escrow_hold_days >= 0 AND global_escrow_hold_days <= 90),
  min_payout_request_poisha BIGINT NOT NULL DEFAULT 50000 CHECK (min_payout_request_poisha >= 0),
  default_packaging_cost_poisha BIGINT NOT NULL DEFAULT 1500 CHECK (default_packaging_cost_poisha >= 0),
  duplicate_order_window_hours INTEGER NOT NULL DEFAULT 24 CHECK (duplicate_order_window_hours >= 1),
  stuck_order_threshold_hours INTEGER NOT NULL DEFAULT 48 CHECK (stuck_order_threshold_hours >= 1),
  risk_advance_mandatory_score INTEGER NOT NULL DEFAULT 70 CHECK (risk_advance_mandatory_score >= 0 AND risk_advance_mandatory_score <= 100),
  risk_weights_json JSONB NOT NULL DEFAULT '{"customer_return_history": 35, "address_incompleteness": 25, "district_return_rate": 15, "high_order_value": 15, "unverified_source": 10}'::jsonb,
  bkash_manual_number TEXT NOT NULL DEFAULT '01700000000',
  bkash_instruction_bn TEXT NOT NULL DEFAULT 'বিকাশ Send Money বা Payment করে নিচের বক্সে Transaction ID দিন।',
  bkash_instruction_en TEXT NOT NULL DEFAULT 'Send payment to our bKash number and enter the Transaction ID below.',
  trust_badges_json JSONB NOT NULL DEFAULT '[{"id":"cod","label_bn":"ক্যাশ অন ডেলিভারি সুবিধা","label_en":"Cash on Delivery Available"},{"id":"return","label_bn":"৭ দিনের সহজ রিটার্ন নীতি","label_en":"7-Day Easy Return Policy"},{"id":"verified","label_bn":"১০০% যাচাইকৃত পণ্য","label_en":"100% Quality Checked"}]'::jsonb,
  homepage_sections_json JSONB NOT NULL DEFAULT '[{"id":"hero","type":"hero","enabled":true,"order":1},{"id":"trust_strip","type":"trust_strip","enabled":true,"order":2},{"id":"categories","type":"categories","enabled":true,"order":3},{"id":"featured","type":"featured_products","enabled":true,"order":4},{"id":"promo_banner","type":"promo_banner","enabled":true,"order":5},{"id":"new_arrivals","type":"new_arrivals","enabled":true,"order":6},{"id":"best_sellers","type":"best_sellers","enabled":true,"order":7}]'::jsonb,
  hero_banners_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  promo_campaign_json JSONB NOT NULL DEFAULT '{"enabled":false,"title_bn":"","title_en":"","starts_at":null,"ends_at":null}'::jsonb,
  delay_banner_json JSONB NOT NULL DEFAULT '{"enabled":false,"message_bn":"","message_en":""}'::jsonb,
  print_config_json JSONB NOT NULL DEFAULT '{"part1_height_mm":99,"part2_height_mm":99,"part3_height_mm":99,"invoice_heading_bn":"কাস্টমার ইনভয়েস","sticker_heading_bn":"কুরিয়ার বক্স স্টিকার","internal_heading_bn":"অ্যাডমিন ও সাপ্লায়ার কপি"}'::jsonb,
  legal_pages_json JSONB NOT NULL DEFAULT '{"about":{"title_bn":"আমাদের সম্পর্কে","content_bn":"আমরা বাংলাদেশের বিশ্বস্ত কনসাইনমেন্ট ই-কমার্স প্ল্যাটফর্ম।"},"privacy":{"title_bn":"গোপনীয়তা নীতি","content_bn":"গ্রাহকের ব্যক্তিগত তথ্য শতভাগ নিরাপদ রাখা হয়।"},"return_policy":{"title_bn":"রিটার্ন ও রিফান্ড নীতি","content_bn":"ডেলিভারি ম্যানের সামনে পণ্য চেক করে নেওয়ার অনুরোধ করা হচ্ছে। ত্রুটিপূর্ণ পণ্য ৭ দিনের মধ্যে রিটার্নযোগ্য।"},"terms":{"title_bn":"শর্তাবলী","content_bn":"অর্ডার কনফার্ম করার মাধ্যমে আপনি আমাদের ডেলিভারি ও রিটার্ন নীতিমালায় সম্মতি দিচ্ছেন।"},"faq":{"title_bn":"সাধারণ জিজ্ঞাসা","content_bn":"১. কীভাবে অর্ডার করব? উত্তর: পণ্য কার্টে যোগ করে নাম, ফোন ও ঠিকানা দিয়ে অর্ডার নিশ্চিত করুন।"}}'::jsonb,
  maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
  maintenance_message_bn TEXT NOT NULL DEFAULT 'সাইটটি বর্তমানে রক্ষণাবেক্ষণের কাজ চলছে। অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।',
  demo_mode BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Server-Side Encrypted Credentials Manager (Never readable by client)
CREATE TABLE encrypted_credentials (
  service_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  masked_preview TEXT NOT NULL,
  config_meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_connected BOOLEAN NOT NULL DEFAULT FALSE,
  last_tested_at TIMESTAMPTZ,
  last_test_error TEXT,
  updated_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_vendors_updated_at BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_users_profile_updated_at BEFORE UPDATE ON users_profile FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_site_settings_updated_at BEFORE UPDATE ON site_settings FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
