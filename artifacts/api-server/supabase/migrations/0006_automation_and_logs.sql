-- ============================================================================
-- 0006_automation_and_logs.sql
-- Immutable Audit Logs, Messaging Templates & Trigger Matrix, Message Logs,
-- Automation Rules Engine (with DRY-RUN & Kill-Switch), Idempotency Keys,
-- and Google Sheets One-Way Sync Queue
-- ============================================================================

-- 1. Immutable Audit Logs (Every Sensitive Read/Write/Override/Auth Event)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users_profile(id) ON DELETE SET NULL,
  actor_username TEXT,
  actor_role_slug TEXT,
  action_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  before_snapshot_json JSONB,
  after_snapshot_json JSONB,
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_user_id, created_at DESC);

-- Strictly block UPDATE and DELETE on audit_logs
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION fn_prevent_ledger_mutation();

-- 2. Messaging Templates (Bilingual bn/en with Dynamic Variables)
CREATE TABLE message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  name_bn TEXT NOT NULL,
  body_bn TEXT NOT NULL,
  body_en TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Admin Trigger Matrix (Event x Channel -> On/Off + Delay)
CREATE TABLE message_trigger_matrix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL REFERENCES message_templates(event_key) ON DELETE CASCADE,
  channel message_channel NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  delay_minutes INTEGER NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
  UNIQUE (event_key, channel)
);

-- 4. Message Delivery Logs & Opt-Out Registry
CREATE TABLE message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  recipient_phone_masked TEXT NOT NULL,
  event_key TEXT NOT NULL,
  channel message_channel NOT NULL,
  rendered_body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'deep_link_ready', 'sent', 'failed', 'skipped_not_connected')),
  provider_response_json JSONB,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Automation Rules Engine ("If X happens and Y condition holds, do Z")
CREATE TABLE automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code TEXT NOT NULL UNIQUE,
  name_bn TEXT NOT NULL,
  name_en TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  is_dry_run BOOLEAN NOT NULL DEFAULT TRUE,
  rate_limit_per_hour INTEGER NOT NULL DEFAULT 100 CHECK (rate_limit_per_hour > 0),
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE automation_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  was_dry_run BOOLEAN NOT NULL,
  matched_conditions_json JSONB NOT NULL,
  executed_actions_json JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('dry_run_logged', 'executed', 'rate_limited', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Free-Tier Idempotency & Rate-Limit Table (Protects Checkout, Booking & Payouts)
CREATE TABLE idempotency_keys (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body_json JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);

-- 7. Google Sheets One-Way Mirror Sync Queue
CREATE TABLE sheets_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_name TEXT NOT NULL CHECK (tab_name IN ('Orders', 'OrderItems', 'Inventory', 'VendorLedger', 'Payouts', 'Expenses', 'AdSpend', 'Customers')),
  record_id TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'synced', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
