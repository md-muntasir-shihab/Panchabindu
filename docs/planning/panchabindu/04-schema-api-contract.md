# 04 — Schema ও API Contract Reconciliation

**নিয়ম:** additive only; duplicate টেবিল/endpoint নয়; কোনো migration চালানো হয়নি; Payment addendum = proposed logical contract, অনুমোদিত migration নয়।

## 1. তিন স্তরের ডেটা বাস্তবতা

| স্তর | কী আছে | কে ব্যবহার করে |
|---|---|---|
| **Local JSON fixtures** (`.data/erp-*.json`, ১০ document) | dev runtime truth | dev workflow |
| **Runtime document persistence** (`erp_runtime_state` JSONB, RPC commit, revision) | prod runtime truth | prod (`PANCHABINDU_PERSISTENCE=postgres`) |
| **Normalized PostgreSQL** (sql/0001–0008: 15 enums, 53 tables, RLS, views; 0009 triggers; 0010 storage) | target schema + migrator (`json-to-supabase-migrator.ts`) | runtime path **নয়** |

Spec-এর "Database Constraint এবং Application Validation দুটোই" (BE §3.2 #10) বর্তমানে শুধু application + RPC integer validation। Normalized adoption = Decision D-11।

## 2. Payment addendum বনাম বিদ্যমান

| PAY entity | বিদ্যমান equivalent | Overlap | Proposal |
|---|---|---|---|
| `payment_methods` (registry) | **নেই**; `siteSettings.bkashManualNumber/bkashInstruction*`; SQL enum `payment_method` (cod, bkash_manual, nagad_manual, rocket_manual); CHECK `chk_orders_approved_payment_methods` (cod, bkash_manual) | settings fields ≈ এক provider-এর registry row | **নতুন** `payment_methods` (normalized) + runtime document `paymentMethods[]` additive। Seed: `cod` (enabled, `none`), `bkash_manual` (enabled, `manual`, receiver from settings), `nagad_manual`/`rocket_manual` (**disabled**, `not_configured`), `national_*` (**undefined** until D-01)। `enabled=false` default সর্বত্র ছাড়া cod/bkash। |
| `payment_submissions` | `manual_payment_submissions` (sql/0008) + runtime `manualBkashSubmissions[]` | উচ্চ — fields: sender_phone(+masked), trx_id, submitted_amount_poisha, expected_payable_poisha, status, submitted_by_role/username, reviewed_*, review_note_bn | **নতুন টেবিল নয়।** Additive columns: `payment_method_id` (default bkash_manual), `transaction_at`, `evidence_object_path` (private bucket), `sender_reference_masked` (alias of `sender_phone_masked`), `idempotency_key`। Unique index scope → `(payment_method_id, trx_id)` partial (replace `uq_manual_payment_active_trx_id` with method-scoped version, same semantics for bKash)। |
| `payment_transactions` (verified) | নেই আলাদা; approval → `orders.advancePaidPoisha` বৃদ্ধি + journal | approved submission ≈ transaction | **নতুন** `payment_transactions` (1:1 nullable to submission; COD collection ও future API verified রেকর্ডও এখানে)। `orders.advancePaidPoisha` derived হবে (`SUM(transactions.amount) - refunds`); transitional period-এ দুটোই লেখা, reconciliation check। |
| `payment_verifications` (audit) | `audit_logs` entry `MANUAL_BKASH_<DECISION>`; `reviewed_by*`, `review_note_bn` on submission | মাঝারি | **নতুন** append-only `payment_verifications` (review_action, reviewer, reason, amount_match, receiver_match, reference_match, evidence_ref)। বিদ্যমান audit log বজায়। |
| `payment_provider_events` | `courier_webhook_events` (courier only) | pattern একই, domain আলাদা | **নতুন** টেবিল, কিন্তু `courier_webhook_events`-এর schema/dedupe logic reuse (shared `provider_events` নয় — spec আলাদা চায়, courier আলাদা থাকুক)। শুধু official API phase (E) অনুমোদিত হলে প্রয়োজন; Phase D-তে DDL only, কোনো writer নেই। |
| `payment_allocations`, `payment_refunds` | `customer_refund_executions` (sql/0008), phase3 reversal | refunds আংশিক | `payment_refunds` = `customer_refund_executions` extend (rename নয়); allocations Phase G। |
| reconciliation (`runs`, `rows`, `discrepancies`, `bank_statement_*`) | courier remittance reconciliation (phase6), `courier_remittance_ledger` | domain ভিন্ন | Phase G; bank statement import **শুধু D-01 bank transfer নিশ্চিত হলে**। |
| `outbox_events`, `idempotency_keys` | `idempotency_keys` (sql/0006) ✓; runtime `idempotencyKeys{}` + `idempotencyPayloadHashes{}` ✓; outbox ✗ | — | `outbox_events` নতুন (Phase C), doc-store equivalent `outbox[]` document। |
| `payment_provider_credentials` | `encrypted_credentials` (sql/0002), phase4c masked credential manager | উচ্চ | **নতুন নয়** — বিদ্যমান registry-তে `scope='payment_provider'`। |

**Naming (D-07):** বিদ্যমান `*_poisha` canonical থাকবে; addendum-এর `*_paisa` column নামগুলো `*_poisha` হিসেবে তৈরি হবে। Spec-এর `currency='BDT'` CHECK additive।

## 3. ERD delta (additive)

```
orders ──1:N── manual_payment_submissions ──N:1── payment_methods (NEW)
   │                 │ 1:0..1
   │                 └──── payment_transactions (NEW) ──N:1── payment_methods
   │                              │ 1:N
   │                              └── journal_entries (existing; reference_type='payment_transaction')
   │                 └──1:N── payment_verifications (NEW, append-only)
   ├──1:N── customer_refund_executions (existing → payment_refunds semantics)
   └──1:N── order_status_history (NEW, see §4)
payment_provider_events (NEW; no FK to orders until matched)
outbox_events (NEW)
customers ──1:N── customer_addresses (existing sql, runtime adoption NEW)
customers ──1:N── customer_wishlist_items (NEW; FE-V2 2.7)
```

## 4. State machines — mapping (rename নয়)

### 4.1 Order status

| Spec (BE §9.2, 23) | বিদ্যমান SQL `order_status` (9) | Runtime orthogonal dims (phase3) | Mapping |
|---|---|---|---|
| placed, awaiting_payment, payment_under_review | `pending_confirmation` | order=pending + payment dim | derived label by payment dim |
| confirmed, allocation_pending, processing | `confirmed` | fulfillment dim (allocated/processing) | derived |
| packed, ready_to_dispatch | `packed` | fulfillment=packed/ready | derived |
| dispatched, in_transit | `shipped` | shipment dim | derived |
| partially_delivered | — | VFG partial | derived from groups |
| delivered | `delivered` | — | direct |
| delivery_failed | — (courier status) | shipment dim `failed` | **additive shipment state** |
| cancellation_requested, cancelled | `cancelled` (+ `orders/cancellation-request`) | — | request state additive |
| return_* , returned, refund_*, refunded | `return_initiated`, `returned` + `return_cases` | settlement dim | derived from return_cases |
| closed | — | — | derived (settled + no open cases) |

Proposal: `order_status_history` (prev, new, actor, ts, reason, event) **additive**; public/admin DTO-তে spec label = view/derivation function, DB enum অপরিবর্তিত → backward compatible।

### 4.2 Payment status (per order)

| Spec (BE-V2 F) | Runtime submission status | SQL `payment_status` | Derivation |
|---|---|---|---|
| not_required_cod | — | `unpaid` + method cod | method=cod |
| awaiting_submission | no submission | `unpaid` | bkash & none |
| submitted_pending | `pending_verification` | `unpaid` | latest submission |
| under_review | `under_review` | `unpaid` | |
| verified | `approved` | `partial_verified`/`paid_verified` | sum(transactions) vs payable |
| rejected | `rejected` | `unpaid` | |
| needs_clarification, verification_failed | **MISSING** | — | additive submission statuses (Phase D) |
| reversed | `reversed` | — | |
| partially_refunded, refunded | refund executions | `refunded` | |
| disputed | **MISSING** | — | additive |
| (courier) remitted | — | `remitted` | **move to courier collection status** — SQL enum value রাখা, derivation-এ অগ্রাহ্য |

### 4.3 Courier collection status (BE §9.3)
Expected → Collected → Remittance Pending → Remitted → Reconciled → Disputed: phase4b/phase6 remittance ledger এ data আছে; explicit per-order field MISSING → derived view (Phase G)।

### 4.4 Provider verification state
`not_configured | manual_only | api_requested | sandbox | approved | connected | tested | production_ready | suspended` → `payment_methods.capability_status`। Seed: cod=`manual_only`(n/a), bkash=`manual_only`, nagad/rocket=`not_configured`, national=undefined।

## 5. Event / idempotency map (MAP §3 ↔ বিদ্যমান)

| Event | Producer (এখন) | Consumer (এখন) | Idempotency | Retry | Failure state | Gap |
|---|---|---|---|---|---|---|
| customer.registered | `verify_otp` | — | phone unique | — | — | implicit |
| cart.validated | `createStorefrontOrder` stock check | same tx | — | — | 422 | implicit |
| order.created | `createStorefrontOrder` | VFG build, reservation reconcile, state compute (same request) | key+hash | client retry | 422/409 | no outbox |
| inventory.reserved | phase3 | — | per order | — | reservation expiry job `UNVERIFIED` | job runner |
| payment.submitted | `submitManualBkashPayment` | admin queue | `bkash_sub_<key>` | client | DUPLICATE_TRX_ID | — |
| payment.verified/rejected | `reviewManualBkashSubmission` | journal post (same tx) | status guard | — | error → no change | needs_clarification missing |
| ledger.journal_posted | GL engine | escrow ledger | reference id | — | tx abort | DB trigger inactive (doc-store) |
| shipment.created / courier.* | phase4b/phase5 adapters, webhook | order shipment dim, remittance ledger | webhook event id | durable webhook queue + DLQ (phase5) | `LIVE_COURIER_BOOKING_LOCKED` | live `UNVERIFIED` |
| supplier.payable_matured | phase7 promoter | vendor ledger | batch id | — | — | scheduler `UNVERIFIED` |
| supplier.settlement_* | phase4b payout | ledger | request id + maker-checker | — | hold | — |
| return.*/refund.* | phase3/phase6 | ledger reversal | case id | — | — | — |
| ledger.reversal_posted | `ledger_reversal_requests` | GL | linked entry | — | — | — |

Doc-store-এ সব consumer same-commit হওয়ায় "DB tx fails → no downstream event" (MAP §6) **by construction** পূরণ হয়। Normalized adoption হলে `outbox_events` + idempotent worker আবশ্যক।

## 6. API contract migration (BE-V2 §5) — backward compatible

| Target endpoint | বিদ্যমান | Plan |
|---|---|---|
| `GET /api/payments/methods` | `siteSettings` public keys (bKash number/instructions) | **নতুন read endpoint** registry থেকে public-safe fields; `siteSettings` keys বজায় (deprecate later) |
| `POST /api/payments/submissions` | `POST /api/payments/manual-bkash/submissions` | নতুন generic endpoint `payment_method_code` সহ; পুরোনো path **thin alias** → `bkash_manual` fixed; same response shape (`success`, `error{code,message,field_errors}`, `request_id`) |
| `GET /api/account/payments[/id]` | `get_orders` action-এ order DTO | নতুন action `get_payments` in `/api/account/orders` (একই cookie/CSRF) অথবা নতুন GET; প্রথমটি কম surface |
| `GET /api/admin/payments`, `POST /api/admin/payments/:id/review` | `workspace` operations (manual-bKash review, `MFS_INPUT_*`) | বিদ্যমান operations বজায়; নতুন REST path শুধু যদি admin UI split হয় — **duplicate নয়**, আগে না |
| `POST /api/internal/payments/:provider/verify`, `POST /api/webhooks/payments/:provider` | নেই | Phase E only after D-02; `webhooks/courier` pattern reuse |
| `POST /api/admin/payments/reconcile`, `GET .../reconciliation` | courier remittance reconciliation operations | Phase G |
| `POST /api/admin/refunds` | refund operations (workspace) | বজায় |

Standard response format (BE §21.3): `payments` route ইতিমধ্যে `{success, error:{code,message,field_errors}, request_id}`; অন্য route `{success, errorBn, errorEn, code}` (`backendRoute` code injection)। **Unify করা হবে না** এই roadmap-এ (client-breaking); নতুন endpoint গুলো payments shape অনুসরণ করবে।

## 7. Migration proposal checklist (Phase C, local only)

- নতুন SQL file `0011_payment_registry_additive.sql`: `payment_methods`, `payment_transactions`, `payment_verifications`, `payment_provider_events`, `order_status_history`, `outbox_events`, `customer_wishlist_items`; `manual_payment_submissions` ALTER ADD (nullable) ; RLS policies same pattern; seed registry rows (cod, bkash enabled)।
- Runtime document additive keys: `paymentMethods`, `paymentTransactions`, `paymentVerifications`, `orderStatusHistory`, `outbox`, `wishlists` — `readErpState` optionalArrays extension; `erp_validate_runtime_documents` RPC allowlist update (0009 function replace, additive)।
- `json-to-supabase-migrator.ts` entity matrix extend (33 → +7)।
- Dry-run: migration test (`test:migration` style) local Postgres **না থাকলে** SQL lint/parse only → `STATIC_VERIFIED`; Supabase apply = Owner approval + backup + rollback script (`DROP` of new objects only)।
