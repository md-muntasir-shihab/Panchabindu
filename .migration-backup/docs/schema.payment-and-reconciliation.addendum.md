# SCHEMA ADDENDUM — PAYMENT PROVIDER REGISTRY & RECONCILIATION
**Status:** Proposed logical contract; NOT a migration. Reconcile against all existing SQL migrations and generated database types before implementation.

## Provider registry
`payment_methods`
- `id UUID PK`
- `code TEXT UNIQUE`
- `provider_type TEXT CHECK IN ('cod','mfs','bank_transfer')`
- `display_name_bn TEXT`, `display_name_en TEXT`
- `enabled BOOLEAN NOT NULL DEFAULT false`
- `verification_mode TEXT CHECK IN ('manual','official_api','statement_import','none')`
- `capability_status TEXT`
- `receiver_display TEXT` (masked/public-safe)
- `instructions_bn TEXT`, `instructions_en TEXT`
- `min_amount_paisa BIGINT`, `max_amount_paisa BIGINT`
- `created_at`, `updated_at`, `updated_by`

## Submission
`payment_submissions`
- `id UUID PK`
- `order_id UUID FK`
- `customer_id UUID FK`
- `payment_method_id UUID FK`
- `sender_reference_masked TEXT`
- `sender_phone_normalized TEXT NULL`
- `transaction_reference_normalized TEXT`
- `amount_paisa BIGINT CHECK (amount_paisa > 0)`
- `currency TEXT CHECK (currency = 'BDT')`
- `transaction_at TIMESTAMPTZ NULL`
- `evidence_object_path TEXT NULL` (private bucket)
- `status TEXT`
- `submitted_at TIMESTAMPTZ`
- `idempotency_key TEXT`
- `created_by UUID`

Unique constraint proposal: `(payment_method_id, transaction_reference_normalized)` when reference is not null. Cross-provider duplicate review may be added as a fraud signal, not as a false-positive hard constraint.

## Verified transaction
`payment_transactions`
- `id UUID PK`
- `payment_submission_id UUID UNIQUE NULL`
- `order_id UUID FK`
- `payment_method_id UUID FK`
- `provider_transaction_id TEXT NULL`
- `amount_paisa BIGINT CHECK (amount_paisa > 0)`
- `currency TEXT`
- `verified_source TEXT CHECK IN ('manual_statement','official_api','statement_import')`
- `verified_at TIMESTAMPTZ`
- `verified_by UUID NULL`
- `provider_evidence_ref TEXT NULL`
- `status TEXT`
- `created_at TIMESTAMPTZ`

Unique provider transaction ID per provider where available. Only verified transactions can be allocated to an order and posted to the ledger.

## Verification audit
`payment_verifications`
- `id UUID PK`
- `submission_id UUID FK`
- `review_action TEXT`
- `reviewer_id UUID`
- `reason TEXT`
- `amount_match BOOLEAN`
- `receiver_match BOOLEAN NULL`
- `reference_match BOOLEAN`
- `evidence_ref TEXT NULL`
- `created_at TIMESTAMPTZ`

## Provider event inbox / idempotency
`payment_provider_events`
- `id UUID PK`
- `provider_code TEXT`
- `external_event_id TEXT`
- `received_at TIMESTAMPTZ`
- `signature_valid BOOLEAN`
- `payload_hash TEXT`
- `normalized_status TEXT`
- `processed_at TIMESTAMPTZ NULL`
- `processing_error_code TEXT NULL`

Unique `(provider_code, external_event_id)` where external event ID exists. Store minimal necessary payload; do not persist secrets or unnecessary PII.

## Reconciliation
`payment_reconciliation_runs`, `payment_reconciliation_rows`, `payment_discrepancies`, `bank_statement_imports`, `bank_statement_rows`.

Never use a mutable `is_paid` boolean as the sole source of truth. Payment status is derived from immutable verified transactions, allocations, refunds and reversals. Every journal posting is atomic, idempotent and balanced.
