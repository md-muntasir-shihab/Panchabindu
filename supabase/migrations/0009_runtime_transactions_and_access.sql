BEGIN;

CREATE TABLE public.erp_runtime_state (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  documents JSONB NOT NULL CHECK (jsonb_typeof(documents) = 'object'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.erp_runtime_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY erp_runtime_service_only ON public.erp_runtime_state TO service_role USING (TRUE) WITH CHECK (TRUE);
REVOKE ALL ON public.erp_runtime_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.erp_runtime_state TO service_role;

CREATE FUNCTION public.erp_read_runtime_state()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object('revision', revision::text, 'documents', documents)
  FROM public.erp_runtime_state WHERE id = TRUE;
$$;

CREATE FUNCTION public.erp_validate_runtime_values(value JSONB, field_name TEXT DEFAULT '')
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
DECLARE pair RECORD; child JSONB;
BEGIN
  IF jsonb_typeof(value) = 'object' THEN
    FOR pair IN SELECT * FROM jsonb_each(value) LOOP
      PERFORM public.erp_validate_runtime_values(pair.value, pair.key);
    END LOOP;
  ELSIF jsonb_typeof(value) = 'array' THEN
    FOR child IN SELECT * FROM jsonb_array_elements(value) LOOP PERFORM public.erp_validate_runtime_values(child); END LOOP;
  ELSIF value <> 'null'::jsonb AND field_name ~* '(poisha|quantity|reservedQty|stockOnHand|stockReserved|stockAvailable|stockInTransit|stockDamaged)$' THEN
    IF jsonb_typeof(value) <> 'number' THEN RAISE EXCEPTION 'INVALID_INTEGER_VALUE'; END IF;
    IF (value #>> '{}')::numeric <> trunc((value #>> '{}')::numeric) OR abs((value #>> '{}')::numeric) > 9007199254740991 THEN
      RAISE EXCEPTION 'INVALID_INTEGER_VALUE';
    END IF;
  END IF;
END;
$$;

CREATE FUNCTION public.erp_validate_runtime_documents(documents JSONB)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
DECLARE
  required_name TEXT;
  product JSONB;
  variant JSONB;
  journal JSONB;
  journal_line JSONB;
  debit_sum NUMERIC;
  credit_sum NUMERIC;
  shape RECORD;
  property TEXT;
BEGIN
  FOREACH required_name IN ARRAY ARRAY[
    'erp-store.json', 'erp-admin-store.json', 'erp-security-sessions.json',
    'erp-phase3-store.json', 'erp-phase4b-store.json', 'erp-phase4c-store.json',
    'erp-phase4-gl-store.json', 'erp-phase5-courier-notif-store.json',
    'erp-phase6-store.json', 'erp-phase7-store.json'
  ] LOOP
    IF jsonb_typeof(documents -> required_name) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'INVALID_RUNTIME_DOCUMENT';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_object_keys(documents)) <> 10 THEN
    RAISE EXCEPTION 'UNKNOWN_RUNTIME_DOCUMENT';
  END IF;
  PERFORM public.erp_validate_runtime_values(documents);
  FOR shape IN SELECT * FROM (VALUES
    ('erp-store.json', ARRAY['products','categories','reviews','orders','orderLines'], ARRAY['siteSettings','idempotencyKeys']),
    ('erp-admin-store.json', ARRAY['users','roles','auditLogs'], ARRAY['orderMeta','blacklistedPhones']),
    ('erp-security-sessions.json', ARRAY['customerPrincipals','adminSessions','customerSessions'], ARRAY['customerOtpChallenges']),
    ('erp-phase3-store.json', ARRAY['warehouses','stockMovements','stockReservations','transitionHistory','returnInspections'], ARRAY['fulfillmentGroupsByOrder','orthogonalOrderStates']),
    ('erp-phase4b-store.json', ARRAY['pickupBatches','courierRemittanceLedger','courierClaims','vendors','vendorLedger','payoutRequests','returnResolutions'], ARRAY['printConfig','districtRateOverrides']),
    ('erp-phase4c-store.json', ARRAY['expenses','messageTemplates','messageLogs','automationRules','automationLogs','sheetsSyncHistory','scheduledJobs'], ARRAY['encryptedCredentialsVault']),
    ('erp-phase4-gl-store.json', ARRAY['periods','journals','disputeHolds','reconciliations'], ARRAY[]::TEXT[]),
    ('erp-phase5-courier-notif-store.json', ARRAY['shipmentBookings','webhookEvents','inAppNotifications','notificationLogs'], ARRAY[]::TEXT[]),
    ('erp-phase6-store.json', ARRAY['abandonedCarts','webhookEvents','backupSnapshots'], ARRAY['reviewModerationStatus']),
    ('erp-phase7-store.json', ARRAY['consignmentLots','priceProposals','flashCampaigns','maturityBatches'], ARRAY[]::TEXT[])
  ) AS definitions(name, arrays, objects) LOOP
    FOREACH property IN ARRAY shape.arrays LOOP
      IF jsonb_typeof(documents -> shape.name -> property) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_RUNTIME_SHAPE'; END IF;
    END LOOP;
    FOREACH property IN ARRAY shape.objects LOOP
      IF jsonb_typeof(documents -> shape.name -> property) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_RUNTIME_SHAPE'; END IF;
    END LOOP;
  END LOOP;
  IF jsonb_typeof(documents -> 'erp-phase4c-store.json' -> 'automationKillSwitchActive') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'INVALID_RUNTIME_SHAPE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(documents -> 'erp-admin-store.json' -> 'users') u
    WHERE u ->> 'roleSlug' NOT IN ('super_admin','vendor','marketing_manager','packaging_manager')
       OR coalesce(u ->> 'passwordHash', '') NOT LIKE 'scrypt$%'
       OR coalesce(u ->> 'totpSecretEncrypted', '') NOT LIKE 'enc:v1:%'
       OR u ? 'passwordPlainDemo' OR u ? 'totpSecretDemo'
  ) THEN RAISE EXCEPTION 'INVALID_RUNTIME_IDENTITY'; END IF;
  FOR product IN SELECT value FROM jsonb_array_elements(documents -> 'erp-store.json' -> 'products') LOOP
    FOR variant IN SELECT value FROM jsonb_array_elements(product -> 'variants') LOOP
      IF NOT variant ?& ARRAY['supplierCostPoisha','supplierProfitPoisha','supplierPayablePoisha','platformMarginPoisha','salePricePoisha','stockOnHand','stockReserved','stockAvailable'] THEN
        RAISE EXCEPTION 'INVALID_RUNTIME_PRICE_OR_STOCK';
      END IF;
      IF EXISTS (SELECT 1 FROM unnest(ARRAY['supplierCostPoisha','supplierProfitPoisha','supplierPayablePoisha','platformMarginPoisha','salePricePoisha','stockOnHand','stockReserved','stockAvailable']) required(key)
                 WHERE jsonb_typeof(variant -> required.key) IS DISTINCT FROM 'number') THEN
        RAISE EXCEPTION 'INVALID_RUNTIME_PRICE_OR_STOCK';
      END IF;
      IF (variant ->> 'supplierCostPoisha')::numeric < 0
         OR (variant ->> 'supplierProfitPoisha')::numeric < 0
         OR (variant ->> 'platformMarginPoisha')::numeric < 0
         OR (variant ->> 'supplierCostPoisha')::numeric + (variant ->> 'supplierProfitPoisha')::numeric
            <> (variant ->> 'supplierPayablePoisha')::numeric
         OR (variant ->> 'supplierPayablePoisha')::numeric + (variant ->> 'platformMarginPoisha')::numeric
            <> (variant ->> 'salePricePoisha')::numeric
         OR (variant ->> 'stockOnHand')::numeric < 0 OR (variant ->> 'stockReserved')::numeric < 0
         OR (variant ->> 'stockAvailable')::numeric < 0
         OR (variant ->> 'stockReserved')::numeric > (variant ->> 'stockOnHand')::numeric THEN
        RAISE EXCEPTION 'INVALID_RUNTIME_PRICE_OR_STOCK';
      END IF;
    END LOOP;
  END LOOP;
  IF (SELECT count(*) <> count(DISTINCT value ->> 'journalNo') FROM jsonb_array_elements(documents -> 'erp-phase4-gl-store.json' -> 'journals')) THEN
    RAISE EXCEPTION 'DUPLICATE_JOURNAL';
  END IF;
  FOR journal IN SELECT value FROM jsonb_array_elements(documents -> 'erp-phase4-gl-store.json' -> 'journals') LOOP
    IF jsonb_typeof(journal -> 'totalDebitPoisha') IS DISTINCT FROM 'number'
       OR jsonb_typeof(journal -> 'totalCreditPoisha') IS DISTINCT FROM 'number'
       OR jsonb_typeof(journal -> 'lines') IS DISTINCT FROM 'array'
       OR coalesce(journal ->> 'status', '') NOT IN ('PENDING_APPROVAL','POSTED','REVERSED','REJECTED') THEN
      RAISE EXCEPTION 'INVALID_JOURNAL';
    END IF;
    debit_sum := 0;
    credit_sum := 0;
    FOR journal_line IN SELECT value FROM jsonb_array_elements(journal -> 'lines') LOOP
      IF jsonb_typeof(journal_line -> 'debitPoisha') IS DISTINCT FROM 'number'
         OR jsonb_typeof(journal_line -> 'creditPoisha') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'INVALID_JOURNAL_LINE'; END IF;
      IF (journal_line ->> 'debitPoisha')::numeric < 0 OR (journal_line ->> 'creditPoisha')::numeric < 0
         OR ((journal_line ->> 'debitPoisha')::numeric > 0) = ((journal_line ->> 'creditPoisha')::numeric > 0) THEN
        RAISE EXCEPTION 'INVALID_JOURNAL_LINE';
      END IF;
      debit_sum := debit_sum + (journal_line ->> 'debitPoisha')::numeric;
      credit_sum := credit_sum + (journal_line ->> 'creditPoisha')::numeric;
    END LOOP;
    IF debit_sum <> credit_sum OR debit_sum <= 0 OR debit_sum <> (journal ->> 'totalDebitPoisha')::numeric
       OR credit_sum <> (journal ->> 'totalCreditPoisha')::numeric THEN
      RAISE EXCEPTION 'UNBALANCED_JOURNAL';
    END IF;
  END LOOP;
END;
$$;

CREATE FUNCTION public.erp_initialize_runtime_state(initial_documents JSONB)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.erp_validate_runtime_documents(initial_documents);
  INSERT INTO public.erp_runtime_state (id, documents) VALUES (TRUE, initial_documents);
  RETURN '1';
END;
$$;

CREATE FUNCTION public.erp_commit_runtime_state(expected_revision BIGINT, changes JSONB)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  current_state public.erp_runtime_state;
  next_documents JSONB;
  old_journal JSONB;
  next_journal JSONB;
  old_record JSONB;
  new_records JSONB;
  collection TEXT;
BEGIN
  SELECT * INTO current_state FROM public.erp_runtime_state WHERE id = TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DATABASE_INITIALIZATION_REQUIRED'; END IF;
  IF current_state.revision <> expected_revision THEN RAISE EXCEPTION 'DATABASE_WRITE_CONFLICT'; END IF;
  IF jsonb_typeof(changes) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_RUNTIME_DOCUMENT'; END IF;
  next_documents := current_state.documents || changes;
  PERFORM public.erp_validate_runtime_documents(next_documents);
  FOR old_journal IN SELECT value FROM jsonb_array_elements(current_state.documents -> 'erp-phase4-gl-store.json' -> 'journals') LOOP
    IF old_journal ->> 'status' IN ('POSTED', 'REVERSED') THEN
      SELECT value INTO next_journal FROM jsonb_array_elements(next_documents -> 'erp-phase4-gl-store.json' -> 'journals')
        WHERE value ->> 'journalNo' = old_journal ->> 'journalNo';
      IF next_journal IS NULL OR (next_journal - 'status' - 'reversedByJournalNo') <> (old_journal - 'status' - 'reversedByJournalNo')
         OR (next_journal ->> 'status' <> old_journal ->> 'status' AND
             NOT (old_journal ->> 'status' = 'POSTED' AND next_journal ->> 'status' = 'REVERSED'
                  AND EXISTS (SELECT 1 FROM jsonb_array_elements(next_documents -> 'erp-phase4-gl-store.json' -> 'journals') r
                    WHERE r ->> 'journalNo' = next_journal ->> 'reversedByJournalNo'
                      AND r ->> 'reversesJournalNo' = old_journal ->> 'journalNo' AND r ->> 'status' = 'POSTED'))) THEN
        RAISE EXCEPTION 'POSTED_JOURNAL_IMMUTABLE';
      END IF;
    END IF;
  END LOOP;
  FOREACH collection IN ARRAY ARRAY['auditLogs', 'stockMovements', 'vendorLedger'] LOOP
    IF collection = 'auditLogs' THEN
      new_records := next_documents -> 'erp-admin-store.json' -> collection;
      FOR old_record IN SELECT value FROM jsonb_array_elements(current_state.documents -> 'erp-admin-store.json' -> collection) LOOP
        IF NOT new_records @> jsonb_build_array(old_record) THEN RAISE EXCEPTION 'AUDIT_IMMUTABLE'; END IF;
      END LOOP;
    ELSIF collection = 'stockMovements' THEN
      new_records := next_documents -> 'erp-phase3-store.json' -> collection;
      FOR old_record IN SELECT value FROM jsonb_array_elements(current_state.documents -> 'erp-phase3-store.json' -> collection) LOOP
        IF NOT new_records @> jsonb_build_array(old_record) THEN RAISE EXCEPTION 'STOCK_MOVEMENT_IMMUTABLE'; END IF;
      END LOOP;
    ELSE
      new_records := next_documents -> 'erp-phase4b-store.json' -> collection;
      FOR old_record IN SELECT value FROM jsonb_array_elements(current_state.documents -> 'erp-phase4b-store.json' -> collection) LOOP
        IF NOT new_records @> jsonb_build_array(old_record) THEN RAISE EXCEPTION 'VENDOR_LEDGER_IMMUTABLE'; END IF;
      END LOOP;
    END IF;
  END LOOP;
  UPDATE public.erp_runtime_state SET documents = next_documents, revision = revision + 1, updated_at = now() WHERE id = TRUE;
  RETURN (current_state.revision + 1)::text;
END;
$$;

REVOKE ALL ON FUNCTION public.erp_read_runtime_state() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.erp_validate_runtime_documents(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.erp_validate_runtime_values(JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.erp_initialize_runtime_state(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.erp_commit_runtime_state(BIGINT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_read_runtime_state(), public.erp_initialize_runtime_state(JSONB), public.erp_commit_runtime_state(BIGINT, JSONB) TO service_role;

ALTER TABLE public.customers ADD COLUMN auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.fn_current_customer_phone()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$ SELECT phone FROM public.customers WHERE auth_user_id = auth.uid(); $$;

CREATE OR REPLACE FUNCTION public.fn_current_role_slug()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT r.slug FROM public.users_profile up JOIN public.roles r ON r.id = up.role_id
  WHERE up.id = auth.uid() AND up.is_active AND NOT up.must_change_password
    AND (NOT r.require_2fa OR (up.totp_enrolled AND auth.jwt() ->> 'aal' = 'aal2'));
$$;

CREATE OR REPLACE FUNCTION public.fn_current_vendor_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT up.vendor_id FROM public.users_profile up
  WHERE up.id = auth.uid() AND public.fn_current_role_slug() = 'vendor';
$$;

REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.v_vendor_masked_orders WITH (security_barrier = true) AS
SELECT oi.id AS order_item_id, oi.order_id, o.order_no, o.status AS order_status,
  oi.vendor_id, oi.product_name_bn_snapshot, oi.variant_title_snapshot, oi.internal_vendor_sku_snapshot,
  oi.quantity, oi.snap_unit_supplier_cost_poisha, oi.snap_unit_supplier_profit_poisha,
  oi.snap_unit_supplier_payable_poisha, oi.line_supplier_payable_poisha, oi.escrow_hold_days_snapshot,
  CASE WHEN v.mask_customer_pii THEN concat(substring(o.customer_phone FROM 1 FOR 3), '****', right(o.customer_phone, 3)) ELSE o.customer_phone END AS customer_phone_display,
  CASE WHEN v.mask_customer_pii THEN 'ঠিকানা গোপন রাখা হয়েছে (অ্যাডমিন নিয়ন্ত্রিত)' ELSE o.street_address END AS customer_address_display,
  d.name_bn AS district_name_bn, u.name_bn AS upazila_name_bn, o.delivered_at, o.created_at
FROM public.order_items oi JOIN public.orders o ON o.id = oi.order_id
JOIN public.vendors v ON v.id = oi.vendor_id JOIN public.districts d ON d.id = o.district_id
JOIN public.upazilas u ON u.id = o.upazila_id
WHERE public.fn_current_role_slug() = 'super_admin'
   OR (public.fn_current_role_slug() = 'vendor' AND oi.vendor_id = public.fn_current_vendor_id());

DROP POLICY IF EXISTS pol_product_images_public_read ON public.product_images;
ALTER TABLE public.product_images ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected'));
CREATE POLICY pol_product_images_public_read ON public.product_images FOR SELECT
  USING (approval_status = 'approved' AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.status = 'active'));

ALTER TABLE public.journal_entries ADD COLUMN posting_transaction xid8 NOT NULL DEFAULT pg_current_xact_id();

CREATE FUNCTION public.erp_validate_journal_lines()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  entry_id UUID;
  debit_sum NUMERIC;
  credit_sum NUMERIC;
  header public.journal_entries;
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN entry_id := NEW.id; ELSE entry_id := NEW.journal_entry_id; END IF;
  SELECT * INTO header FROM public.journal_entries WHERE id = entry_id;
  SELECT coalesce(sum(debit_poisha), 0), coalesce(sum(credit_poisha), 0) INTO debit_sum, credit_sum
    FROM public.journal_lines WHERE journal_entry_id = entry_id;
  IF debit_sum <> credit_sum OR debit_sum <> header.total_debit_poisha OR credit_sum <> header.total_credit_poisha THEN
    RAISE EXCEPTION 'UNBALANCED_JOURNAL';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.erp_seal_journal_lines()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE id = NEW.journal_entry_id AND posting_transaction = pg_current_xact_id()) THEN
    RAISE EXCEPTION 'POSTED_JOURNAL_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER erp_journal_lines_sealed BEFORE INSERT ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION public.erp_seal_journal_lines();
CREATE CONSTRAINT TRIGGER erp_journal_header_balanced AFTER INSERT ON public.journal_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.erp_validate_journal_lines();
CREATE CONSTRAINT TRIGGER erp_journal_lines_balanced AFTER INSERT ON public.journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.erp_validate_journal_lines();
REVOKE ALL ON FUNCTION public.erp_validate_journal_lines(), public.erp_seal_journal_lines() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT SELECT ON public.districts, public.upazilas, public.categories, public.delivery_rates,
  public.v_public_site_settings, public.v_storefront_products TO anon, authenticated;
GRANT SELECT ON public.v_vendor_masked_orders TO authenticated;

COMMIT;
