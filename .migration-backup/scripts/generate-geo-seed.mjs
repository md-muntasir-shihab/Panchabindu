// scripts/generate-geo-seed.mjs
// Programmatically generates supabase/seed.sql and src/lib/geo/bd-geocode.ts
// from the official nuhil/bangladesh-geocode dataset downloaded in supabase/geo/*.json.
// Rule A2: NEVER type out the Bangladesh geo dataset from memory — import from source.

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const districtsRaw = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'supabase/geo/districts.json'), 'utf8')
);
const upazilasRaw = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'supabase/geo/upazilas.json'), 'utf8')
);

const districtsTable = districtsRaw.find((entry) => entry.type === 'table' && entry.name === 'districts');
const upazilasTable = upazilasRaw.find((entry) => entry.type === 'table' && entry.name === 'upazilas');

if (!districtsTable || !upazilasTable) {
  throw new Error('Invalid nuhil/bangladesh-geocode JSON structure');
}

const districts = districtsTable.data.map((d) => ({
  id: Number(d.id),
  division_id: Number(d.division_id),
  name_en: String(d.name).trim(),
  name_bn: String(d.bn_name).trim(),
  lat: d.lat ? String(d.lat).trim() : null,
  lon: d.lon ? String(d.lon).trim() : null,
  url: d.url ? String(d.url).trim() : null,
}));

const validDistrictIds = new Set(districts.map((d) => d.id));

const upazilas = upazilasTable.data
  .filter((u) => validDistrictIds.has(Number(u.district_id)))
  .map((u) => ({
    id: Number(u.id),
    district_id: Number(u.district_id),
    name_en: String(u.name).trim(),
    name_bn: String(u.bn_name).trim(),
    url: u.url ? String(u.url).trim() : null,
  }));

const esc = (str) => (str === null ? 'NULL' : `'${String(str).replace(/'/g, "''")}'`);

const districtValuesSql = districts
  .map(
    (d) =>
      `  (${d.id}, ${d.division_id}, ${esc(d.name_en)}, ${esc(d.name_bn)}, ${esc(d.lat)}, ${esc(d.lon)}, ${esc(d.url)}, TRUE)`
  )
  .join(',\n');

const upazilaValuesSql = upazilas
  .map(
    (u) =>
      `  (${u.id}, ${u.district_id}, ${esc(u.name_en)}, ${esc(u.name_bn)}, ${esc(u.url)}, TRUE)`
  )
  .join(',\n');

const seedSql = `-- ============================================================================
-- supabase/seed.sql
-- Auto-generated from official nuhil/bangladesh-geocode repository +
-- Default Roles, Granular Permission Matrix, Disabled Automation Rules,
-- Message Templates, and Demo Mode Consignment Catalog
-- ============================================================================

-- 1. Seed 64 Districts (${districts.length} rows from nuhil/bangladesh-geocode)
INSERT INTO districts (id, division_id, name_en, name_bn, lat, lon, url, is_active)
VALUES
${districtValuesSql}
ON CONFLICT (id) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_bn = EXCLUDED.name_bn;

-- 2. Seed Upazilas (${upazilas.length} rows from nuhil/bangladesh-geocode)
INSERT INTO upazilas (id, district_id, name_en, name_bn, url, is_active)
VALUES
${upazilaValuesSql}
ON CONFLICT (id) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_bn = EXCLUDED.name_bn;

-- 3. Seed Default District-Wise Delivery Rates (Dhaka District ID 47 = 70 BDT, Others = 130 BDT; BD Post = 10 BDT/kg)
INSERT INTO delivery_rates (district_id, upazila_id, method, base_charge_poisha, per_kg_charge_poisha, estimated_days_bn, estimated_days_en, historical_success_rate_bp)
SELECT
  d.id,
  NULL,
  'courier'::delivery_method,
  CASE WHEN d.id = 47 THEN 7000 ELSE 13000 END,
  2000,
  CASE WHEN d.id = 47 THEN '১-২ কার্যদিবস' ELSE '২-৪ কার্যদিবস' END,
  CASE WHEN d.id = 47 THEN '1-2 Business Days' ELSE '2-4 Business Days' END,
  CASE WHEN d.id = 47 THEN 9500 ELSE 8900 END
FROM districts d
ON CONFLICT DO NOTHING;

INSERT INTO delivery_rates (district_id, upazila_id, method, base_charge_poisha, per_kg_charge_poisha, estimated_days_bn, estimated_days_en, historical_success_rate_bp)
SELECT
  d.id,
  NULL,
  'post_office'::delivery_method,
  2000,
  1000,
  '৪-৭ কার্যদিবস',
  '4-7 Business Days',
  9200
FROM districts d
ON CONFLICT DO NOTHING;

-- 4. Seed 4 Core System Roles (Super Admin, Vendor, Marketing Manager, Supply & Packaging Manager)
INSERT INTO roles (id, slug, name_bn, name_en, description_bn, max_discount_bp, require_2fa, is_system)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'super_admin', 'সুপার অ্যাডমিন', 'Super Admin', 'সব সেটিংস, ভেন্ডর পেআউট, প্রফিট এবং পারমিশন নিয়ন্ত্রণকারী', 10000, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000002', 'vendor', 'ভেন্ডর / সাপ্লায়ার', 'Vendor / Supplier', 'নিজস্ব কনসাইনমেন্ট পণ্য, স্টক এবং এসক্রো লেজার প্যানেল', 0, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000003', 'marketing_manager', 'মার্কেটিং ম্যানেজার', 'Marketing Manager', 'অর্ডার এন্ট্রি এবং দৈনিক অ্যাড খরচ এন্ট্রি (কেনা দাম ও নেট প্রফিট গোপন)', 500, TRUE, TRUE),
  ('00000000-0000-0000-0000-000000000004', 'packaging_manager', 'সাপ্লাই ও প্যাকেজিং ম্যানেজার', 'Supply & Packaging Manager', 'পণ্য গ্রহণ, স্টক যাচাই, স্লিপ প্রিন্ট এবং কুরিয়ার হ্যান্ডওভার', 0, TRUE, TRUE)
ON CONFLICT (slug) DO NOTHING;

-- 5. Seed Granular Role Permissions (Enforcing Field-Level Hiding & Customer PII Masking)
INSERT INTO role_permissions (role_id, module_key, can_read, can_create, can_update, can_delete, allowed_fields, hidden_fields, masked_fields)
VALUES
  -- Marketing Manager: Can create orders & ad spend, NEVER sees supplier_cost_poisha or net_profit
  ('00000000-0000-0000-0000-000000000003', 'orders', TRUE, TRUE, TRUE, FALSE, ARRAY['order_no','customer_name','customer_phone','sale_price_poisha','status'], ARRAY['snap_unit_supplier_cost_poisha','snap_unit_supplier_profit_poisha','snap_unit_platform_margin_poisha','estimated_net_profit_poisha','internal_vendor_sku'], ARRAY[]::TEXT[]),
  ('00000000-0000-0000-0000-000000000003', 'expenses', TRUE, TRUE, FALSE, FALSE, ARRAY['expense_date','category','source_channel','campaign_name','amount_poisha'], ARRAY['net_profit_summary'], ARRAY[]::TEXT[]),
  -- Vendor: Sees own products, own ledger, masked customer phone/address
  ('00000000-0000-0000-0000-000000000002', 'orders', TRUE, FALSE, FALSE, FALSE, ARRAY['order_no','product_name_bn_snapshot','quantity','snap_unit_supplier_payable_poisha','line_supplier_payable_poisha'], ARRAY['snap_unit_platform_margin_poisha','snap_unit_sale_price_poisha','estimated_net_profit_poisha'], ARRAY['customer_phone','street_address']),
  ('00000000-0000-0000-0000-000000000002', 'vendor_ledger', TRUE, TRUE, FALSE, FALSE, ARRAY['entry_type','escrow_bucket','amount_poisha','matures_at'], ARRAY[]::TEXT[], ARRAY[]::TEXT[]),
  -- Packaging Manager: Can receive stock, print slips, create pickup batches
  ('00000000-0000-0000-0000-000000000004', 'orders', TRUE, FALSE, TRUE, FALSE, ARRAY['order_no','customer_name','customer_phone','street_address','status','consignment_id'], ARRAY['snap_unit_supplier_cost_poisha','estimated_net_profit_poisha'], ARRAY[]::TEXT[]),
  ('00000000-0000-0000-0000-000000000004', 'inventory', TRUE, TRUE, TRUE, FALSE, ARRAY['stock_on_hand','stock_reserved','stock_damaged','proof_media_urls'], ARRAY['supplier_cost_poisha','platform_margin_poisha'], ARRAY[]::TEXT[])
ON CONFLICT (role_id, module_key) DO NOTHING;

-- 6. Seed Singleton Site Settings
INSERT INTO site_settings (id, brand_name_bn, brand_name_en, demo_mode)
VALUES (1, 'বঙ্গকনসাইন', 'BongoConsign', TRUE)
ON CONFLICT (id) DO NOTHING;

-- 7. Seed Bilingual Message Templates (Module I)
INSERT INTO message_templates (event_key, name_bn, body_bn, body_en)
VALUES
  ('ORDER_CONFIRMED', 'অর্ডার কনফার্মড', 'প্রিয় {customer_name}, {brand_name}-এ আপনার অর্ডার #{order_id} নিশ্চিত হয়েছে। মোট পরিশোধযোগ্য: {cod_amount}। ডেলিভারি সময়: {delivery_days}। প্রয়োজনে: {support_phone}', 'Dear {customer_name}, your order #{order_id} at {brand_name} is confirmed. Payable: {cod_amount}. Delivery: {delivery_days}.'),
  ('ORDER_PACKED', 'অর্ডার প্যাকড', 'প্রিয় {customer_name}, আপনার অর্ডার #{order_id} প্যাকিং সম্পন্ন হয়েছে এবং কুরিয়ারে দেওয়ার জন্য প্রস্তুত।', 'Dear {customer_name}, your order #{order_id} is packed and ready for dispatch.'),
  ('ORDER_SHIPPED', 'অর্ডার শিপড', 'প্রিয় {customer_name}, আপনার অর্ডার #{order_id} কুরিয়ারে পাঠানো হয়েছে। ট্র্যাকিং আইডি: {tracking_id} ({tracking_link})। ক্যাশ অন ডেলিভারি: {cod_amount}।', 'Dear {customer_name}, your order #{order_id} has been shipped. Tracking: {tracking_id} ({tracking_link}). COD: {cod_amount}.'),
  ('ORDER_DELIVERED', 'অর্ডার ডেলিভার্ড', 'প্রিয় {customer_name}, আপনার অর্ডার #{order_id} সফলভাবে ডেলিভারি হয়েছে। {brand_name}-এর সাথে থাকার জন্য ধন্যবাদ!', 'Dear {customer_name}, your order #{order_id} has been delivered. Thank you for shopping with {brand_name}!'),
  ('RETURN_INITIATED', 'রিটার্ন প্রক্রিয়া শুরু', 'প্রিয় {customer_name}, আপনার অর্ডার #{order_id}-এর রিটার্ন রিকোয়েস্ট গ্রহণ করা হয়েছে। আমাদের প্রতিনিধি শীঘ্রই যোগাযোগ করবেন।', 'Dear {customer_name}, return process for order #{order_id} has been initiated.'),
  ('PAYOUT_APPROVED_PAID', 'ভেন্ডর পেআউট পরিশোধিত', 'প্রিয় সাপ্লায়ার, আপনার পেআউট রিকোয়েস্ট অনুমোদিত ও পরিশোধিত হয়েছে। পরিমাণ: {total}। রেফারেন্স: {tracking_id}।', 'Dear Supplier, your payout of {total} has been approved and disbursed. Ref: {tracking_id}.')
ON CONFLICT (event_key) DO NOTHING;

-- 8. Seed Default Automation Rules (Module K — ALL DISABLED & DRY-RUN ON BY DEFAULT)
INSERT INTO automation_rules (rule_code, name_bn, name_en, trigger_event, conditions_json, actions_json, is_enabled, is_dry_run)
VALUES
  ('AUTO_CONFIRM_MSG', 'অর্ডার কনফার্ম হলে হোয়াটসঅ্যাপ মেসেজ কিউ তৈরি', 'Queue WhatsApp Message on Order Confirmed', 'ORDER_STATUS_CHANGED', '{"to_status":"confirmed"}'::jsonb, '[{"action":"QUEUE_WA_DEEP_LINK","template":"ORDER_CONFIRMED"}]'::jsonb, FALSE, TRUE),
  ('STUCK_UNCONFIRMED_REMINDER', '২৪ ঘণ্টা আনকনফার্মড থাকলে স্টাফ কল রিমাইন্ডার', 'Staff Reminder for 24h Unconfirmed Orders', 'SCHEDULED_HOURLY', '{"status":"pending_confirmation","older_than_hours":24}'::jsonb, '[{"action":"ADD_TAG","tag":"CALL_OVERDUE"},{"action":"NOTIFY_STAFF"}]'::jsonb, FALSE, TRUE),
  ('HIGH_RISK_HOLD', 'রিস্ক স্কোর ৭০+ হলে অর্ডার হোল্ড এবং অগ্রিম পেমেন্ট টাস্ক', 'Hold High-Risk Orders & Require Advance', 'ORDER_CREATED', '{"min_risk_score":70}'::jsonb, '[{"action":"REQUIRE_ADVANCE"},{"action":"SET_NEXT_ACTION","value":"CALL_FOR_ADVANCE"}]'::jsonb, FALSE, TRUE),
  ('LOW_STOCK_ALERT', 'স্টক থ্রেশহোল্ডের নিচে নামলে ভেন্ডর ও অ্যাডমিন অ্যালার্ট', 'Alert Vendor & Admin on Low Stock', 'STOCK_CHANGED', '{"below_threshold":true}'::jsonb, '[{"action":"NOTIFY_VENDOR_AND_ADMIN"}]'::jsonb, FALSE, TRUE),
  ('DAILY_CLOSING_BATCH', 'প্রতিদিন সন্ধ্যায় পিকআপ ব্যাচ ও ডেইলি সেলস সামারি', 'Daily Pickup Batch & Closing Sales Summary', 'SCHEDULED_DAILY', '{"hour_bd":18}'::jsonb, '[{"action":"GENERATE_DAILY_SUMMARY"}]'::jsonb, FALSE, TRUE)
ON CONFLICT (rule_code) DO NOTHING;
`;

fs.writeFileSync(path.join(rootDir, 'supabase/seed.sql'), seedSql, 'utf8');

const tsGeoModule = `// src/lib/geo/bd-geocode.ts
// Auto-generated from official nuhil/bangladesh-geocode repository.
// Rule A2: Never type out Bangladesh geo dataset from memory.

export interface BdDistrict {
  id: number;
  division_id: number;
  name_en: string;
  name_bn: string;
}

export interface BdUpazila {
  id: number;
  district_id: number;
  name_en: string;
  name_bn: string;
}

export const BD_DISTRICTS: readonly BdDistrict[] = ${JSON.stringify(
  districts.map(({ id, division_id, name_en, name_bn }) => ({
    id,
    division_id,
    name_en,
    name_bn,
  })),
  null,
  2
)} as const;

export const BD_UPAZILAS: readonly BdUpazila[] = ${JSON.stringify(
  upazilas.map(({ id, district_id, name_en, name_bn }) => ({
    id,
    district_id,
    name_en,
    name_bn,
  })),
  null,
  2
)} as const;

export function getUpazilasByDistrict(districtId: number): BdUpazila[] {
  return BD_UPAZILAS.filter((u) => u.district_id === districtId);
}

export function getDistrictById(districtId: number): BdDistrict | undefined {
  return BD_DISTRICTS.find((d) => d.id === districtId);
}

export function getUpazilaById(upazilaId: number): BdUpazila | undefined {
  return BD_UPAZILAS.find((u) => u.id === upazilaId);
}
`;

fs.mkdirSync(path.join(rootDir, 'src/lib/geo'), { recursive: true });
fs.writeFileSync(path.join(rootDir, 'src/lib/geo/bd-geocode.ts'), tsGeoModule, 'utf8');

console.log(
  `Generated supabase/seed.sql and src/lib/geo/bd-geocode.ts with ${districts.length} districts and ${upazilas.length} upazilas.`
);
