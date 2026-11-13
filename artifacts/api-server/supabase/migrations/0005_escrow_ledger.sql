-- ============================================================================
-- 0005_escrow_ledger.sql
-- Payout Requests, 4-Way Return Cases, Immutable Vendor Escrow Ledger,
-- Immutable Courier Remittance Ledger, Courier Claims, and Expenses/Ad Spend
-- ============================================================================

-- 1. Vendor Payout Requests (Only from Available Balance >= Min Threshold)
CREATE TABLE payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no TEXT NOT NULL UNIQUE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  requested_amount_poisha BIGINT NOT NULL CHECK (requested_amount_poisha > 0),
  payout_method_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status payout_status NOT NULL DEFAULT 'requested',
  vendor_note TEXT NOT NULL DEFAULT '',
  rejection_reason TEXT,
  payment_trx_id TEXT,
  payment_proof_url TEXT,
  requested_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payout_requests_vendor_status ON payout_requests(vendor_id, status);

-- 2. Four-Way Return & Damage Cases
CREATE TABLE return_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_no TEXT NOT NULL UNIQUE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  fault_type return_fault_type NOT NULL,
  was_in_hold_period BOOLEAN NOT NULL DEFAULT TRUE,
  was_already_paid_out BOOLEAN NOT NULL DEFAULT FALSE,
  vendor_debit_poisha BIGINT NOT NULL DEFAULT 0 CHECK (vendor_debit_poisha >= 0),
  platform_loss_poisha BIGINT NOT NULL DEFAULT 0 CHECK (platform_loss_poisha >= 0),
  courier_claim_poisha BIGINT NOT NULL DEFAULT 0 CHECK (courier_claim_poisha >= 0),
  restocked_quantity INTEGER NOT NULL DEFAULT 0 CHECK (restocked_quantity >= 0),
  proof_media_urls TEXT[] NOT NULL DEFAULT '{}',
  reason_note TEXT NOT NULL,
  processed_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_return_cases_order_id ON return_cases(order_id);
CREATE INDEX idx_return_cases_vendor_id ON return_cases(vendor_id);

-- 3. Immutable Vendor Escrow Ledger (Pending -> Locked -> Available + Reversals/Clawbacks)
CREATE TABLE vendor_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES orders(id) ON DELETE RESTRICT,
  order_item_id UUID REFERENCES order_items(id) ON DELETE RESTRICT,
  return_case_id UUID REFERENCES return_cases(id) ON DELETE RESTRICT,
  payout_request_id UUID REFERENCES payout_requests(id) ON DELETE RESTRICT,
  entry_type vendor_ledger_entry_type NOT NULL,
  escrow_bucket escrow_bucket NOT NULL,
  amount_poisha BIGINT NOT NULL,
  delivered_at TIMESTAMPTZ,
  matures_at TIMESTAMPTZ,
  description_bn TEXT NOT NULL,
  description_en TEXT NOT NULL,
  created_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vendor_ledger_vendor_bucket ON vendor_ledger(vendor_id, escrow_bucket, matures_at);
CREATE INDEX idx_vendor_ledger_order_id ON vendor_ledger(order_id);

-- Strictly block UPDATE and DELETE on vendor_ledger
CREATE TRIGGER trg_vendor_ledger_immutable
BEFORE UPDATE OR DELETE ON vendor_ledger
FOR EACH ROW EXECUTE FUNCTION fn_prevent_ledger_mutation();

-- 4. Immutable Courier Remittance Ledger (Courier 360 & COD Settlement Tracking)
CREATE TABLE courier_remittance_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  courier_provider courier_provider NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE RESTRICT,
  consignment_id TEXT,
  settlement_batch_ref TEXT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('COD_EXPECTED', 'COD_REMITTED', 'COURIER_FEE_DEDUCTED', 'RETURN_CHARGE_DEDUCTED', 'SHORT_PAYMENT_DISCREPANCY', 'CLAIM_COMPENSATION_RECEIVED')),
  amount_poisha BIGINT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  recorded_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_courier_remittance_provider ON courier_remittance_ledger(courier_provider, created_at DESC);
CREATE INDEX idx_courier_remittance_order ON courier_remittance_ledger(order_id);

-- Strictly block UPDATE and DELETE on courier_remittance_ledger
CREATE TRIGGER trg_courier_remittance_ledger_immutable
BEFORE UPDATE OR DELETE ON courier_remittance_ledger
FOR EACH ROW EXECUTE FUNCTION fn_prevent_ledger_mutation();

-- 5. Courier Negligence Claim Tracker (Fault #4)
CREATE TABLE courier_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_no TEXT NOT NULL UNIQUE,
  courier_provider courier_provider NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  return_case_id UUID REFERENCES return_cases(id) ON DELETE SET NULL,
  consignment_id TEXT NOT NULL,
  claimed_amount_poisha BIGINT NOT NULL CHECK (claimed_amount_poisha > 0),
  settled_amount_poisha BIGINT NOT NULL DEFAULT 0 CHECK (settled_amount_poisha >= 0),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'approved', 'settled', 'rejected')),
  proof_media_urls TEXT[] NOT NULL DEFAULT '{}',
  note TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Financial Expenses & Daily Marketing Ad Spend (ROAS & Auto Net Profit Engine)
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL CHECK (category IN ('facebook_ads', 'instagram_ads', 'whatsapp_marketing', 'packaging_material', 'courier_return_loss', 'warehouse_damage_loss', 'staff_salary', 'software_utility', 'other')),
  custom_category_label TEXT,
  source_channel order_source,
  campaign_name TEXT,
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  amount_poisha BIGINT NOT NULL CHECK (amount_poisha > 0),
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurring_interval TEXT CHECK (recurring_interval IS NULL OR recurring_interval IN ('daily', 'weekly', 'monthly')),
  note TEXT NOT NULL DEFAULT '',
  proof_url TEXT,
  created_by UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_date_category ON expenses(expense_date DESC, category);

CREATE TRIGGER trg_payout_requests_updated_at BEFORE UPDATE ON payout_requests FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_courier_claims_updated_at BEFORE UPDATE ON courier_claims FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
