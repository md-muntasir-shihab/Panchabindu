# Courier 360 (courier_360) — Page Trace Findings — 2026-11-24

Page: Courier 360, Manifest & Rates · route `/admin` tab `courier_360` · role super_admin (panel hard-gates non-super-admins with an inline notice) · components: `Courier360AndRatesPanel` (courier-and-escrow-panel.tsx), `CourierReceivablesPanel`, `CourierBulkCsvPanel`.
Input: 1 screenshot read [EXECUTED] (production URL panchabindu.vercel.app — NOTE: no functional/security tests were run against production; code-trace only).

## Element inventory (Step A) [TRACED]
- 3 sub-tabs: Courier accounts (overview) / Bulk Courier CSV Export / District rates (super_admin-only form).
- Overview (CourierReceivablesPanel): 4 headline cards (In-Transit COD, Delivered COD Collectable + fees+adj, Total Received, Net Receivable Owed), per-courier clickable provider cards (Steadfast/Pathao/BD Post/Manual), Add Parcel Dispatch form, Record Courier Remittance form (short-payment auto-detect), parcel quick-status buttons, courier/stage filters, search, Logged Parcels / Unlinked Orders counters, remittance history.
- Server ops (workspace route, all super_admin-gated or policy-gated): `upsert_manual_courier_parcel`, `record_manual_courier_remittance` (both hard-locked to super_admin in workspace-policy.ts), `upsert_district_rate`, legacy `create_pickup_batch`/`confirm_batch_handover`/`settle_courier_remittance` (schema present; quarantined fail-closed per known-limitations), `reconcile_courier_csv`, `preview_courier_bulk_csv`.
- Money: integer poisha end-to-end; taka↔poisha via Math.round(x*100); proof-URL scheme allowlist client+server; `isSafeProofUrl` checks https/http//.
- External: courier tracking links via `getLiveCourierTrackingUrl`; no courier API integration (NOT_INTEGRATED by design).

## Threat matrix (Step B, page-type: financial reconciliation admin page)
| Threat | Applies? | Verdict |
| --- | --- | --- |
| BOLA/IDOR (editing others' parcels) | Low | Single-tenant super-admin surface; parcel upsert keyed by parcelId server-side [TRACED] |
| Money tampering (client-sent amounts) | Guarded | amounts validated int-poisha server-side; remittance amounts admin-entered by design (manual tracker) [TRACED] |
| CSV formula injection (bulk export) | Guarded elsewhere | bulk CSV exporter hardened in prior round (LEDGER §2) [EXECUTED prior] |
| XSS via proof URLs | Guarded | scheme allowlist client + server [TRACED] |
| Status workflow skips | Partially quarantined | legacy pickup/remittance paths fail closed; manual parcel path is by-design manual |

## Findings

```
ID: CR-01
Severity: P2 | Category: Data-integrity (display) / UX
Where: courier-receivables-panel.tsx — headline card 4 ("Net Courier Receivable Owed", sub-label 'ডেলিভারড COD − ফি − প্রাপ্ত টাকা' / 'Delivered COD − fees − receipts'); value courierAccountsSummary.totals.netReceivablePoisha
What: The card's stated formula does not match the displayed value. Screenshot [EXECUTED]: Delivered COD ৳6,230 − fees+adj ৳230 − receipts ৳11,250 = −৳5,250 per the label, but the card shows ৳1,330. The actual number matches the per-courier "Net Owed" sum with negatives clamped at 0 (Steadfast 0 + Pathao 1,330), i.e. per-provider net receivable, not a global subtraction.
Root cause: label describes a naive global formula; server computes clamped per-provider net (phase4b-service ManualCourierAccountsSummary [TRACED for interface; exact clamp line ASSUMED — file too large to read whole]).
Impact: an accountant reconciling by the printed formula gets −৳5,250 instead of ৳1,330; reconciliation confusion and mistrust of the money dashboard.
Evidence: screenshot values + panel source label [EXECUTED/TRACED].
In scope? YES — fix: relabel to 'জেলা/কুরিয়ার-ভিত্তিক পাওনার যোগফল (প্রতি কুরিয়ারে ঋণাত্মক শূন্যে ক্ল্যাম্পড)' / 'Sum of per-courier net owed (negative balances clamped to 0)'. Needs user-run retest after edit.
```

```
ID: CR-02
Severity: P3 | Category: UX / i18n
Where: courier-receivables-panel.tsx provider cards + card 1 subtext; ui-messages.ts 'টি পার্সেল' → 'parcels'
What: English pluralization broken: "Pathao (1 parcels)", "4 total parcels sent" (screenshot [EXECUTED]). The BN string 'টি পার্সেল' maps to a fixed English plural with no count-awareness.
Fix: use a count-aware EN string (count === 1 ? 'parcel' : 'parcels') in the two render sites; keep BN unchanged.
In scope? YES.
```

```
ID: CR-03
Severity: P4 | Category: Code-quality / dead interface
Where: Courier360AndRatesPanelProps (courier-and-escrow-panel.tsx)
What: props `courier360`, `brandNameBn`, `availableOrderNos` are declared in the interface but never destructured/used by Courier360AndRatesPanel after the refactor to CourierReceivablesPanel/CourierBulkCsvPanel [TRACED — destructuring omits them; render references absent from traced slices].
Fix: remove the three unused fields from the interface + the call site in admin-erp-client.tsx (verify with a grep for `courier360=` before deleting; keep behavior identical).
In scope? YES (same page).
```

```
ID: CR-04
Severity: P1 (process) | Category: Safety
What: The provided screenshot is from PRODUCTION (panchabindu.vercel.app). All prior and future functional/security tests must run against local dev only, never against this URL. This round performed zero requests against production (read-only code trace + image read). [EXECUTED]
In scope? Standing rule — re-asserted in LEDGER.
```

## Test plan (user runs, local dev only)
```powershell
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm --filter @workspace/scripts test:payments   # manual-courier-vendor.test.ts covers parcel/remittance math
pnpm --filter @workspace/scripts test:security
# after CR-01/CR-02/CR-03 patch: visual re-check of Courier accounts tab at 360/768/1280px
```
