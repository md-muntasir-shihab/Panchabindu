# QUALITY ASSURANCE & AUTOMATED TEST REPORT
## পঞ্চগড় (PANCHAGARH) — Multi-Vendor Consignment F-Commerce

**Document Status:** `TESTED`  
**Total Automated Test Cases:** 56 Passing / 0 Failing  
**Test Runner:** Bun & Node Test Runner (`bun test` / `tsx --test`)

---

## ১. Test Suite Execution Matrix

| Test Suite File | Cases | Coverage Scope | Result |
|---|---:|---|---|
| `src/lib/money.test.ts` | 8 | Exact Poisha math, half-up rounding, commission priority, 3-tier pricing snapshot, promo margin deduction, escrow maturity promotion, 4-way return engine, payout hold guard, partial delivery & auto net profit. | `PASS (8/8)` |
| `src/store/store.test.ts` | 3 | Cart free delivery progress bar in exact Poisha, product-level/global free delivery override, Bengali digit formatting. | `PASS (3/3)` |
| `src/lib/validators/validators.test.ts` | 5 | BD phone normalization (`01[3-9]\d{8}`), address quality check, order risk score engine, 3-tier variant price safeguard, and COD / Manual bKash order validation. | `PASS (5/5)` |
| `src/lib/db/repository.test.ts` | 6 | Storefront DTO zero-leak field stripping, product slug lookup, promo validation against platform margin, idempotent order creation & atomic stock reservation, verified-purchase review, Manual bKash duplicate `TrxID` prevention, and customer order cancellation with stock release. | `PASS (6/6)` |
| `src/lib/db/product-sync.test.ts` | 6 | Vendor resolution by ID/code, automated 3-tier margin calculation, product-vendor metadata & internal SKU sync (`${vendorCode}-${publicSku}`), link validation, catalog-wide batch sync, and order line accrual into vendor ledger. | `PASS (6/6)` |
| `src/lib/admin/phase4a.test.ts` | 5 | TOTP 2FA authentication, 5-attempt lockout, First-Login Gate, 4-Role RBAC isolation, cross-vendor `404` enforcement, Smart Order Entry, and Master Orders Grid one-click/bulk actions. | `PASS (5/5)` |
| `src/lib/admin/phase4b.test.ts` | 6 | A4 3-Part print slip DTO customer-safety, pickup batch & handover manifest, courier 360 remittance settlement, 4-way return engine, payout hold protection & 15Q onboarding, live courier tracking sync. | `PASS (6/6)` |
| `src/lib/admin/phase4c.test.ts` | 5 | Product 360 role sanitization & QC receipt, financial money map & ROAS, bilingual message template interpolation, automation rules engine (simulation & kill-switch), masked credentials vault & Google Sheets sync. | `PASS (5/5)` |
| `src/lib/admin/phase5.test.ts` | 4 | 12-point Pre-Launch Readiness Audit, role-based DTO stripping & PII masking across roles, 9-stage consignment order lifecycle dry-run, and 7 PostgreSQL migration + RLS verification checks. | `PASS (4/4)` |
| `src/lib/admin/phase6.test.ts` | 4 | Abandoned cart recovery (`wa.me` & 1-click conversion), Customer 360 CRM, HMAC-SHA256 courier webhook receiver & CSV remittance reconciliation, verified review moderation, and SHA-256 Disaster Recovery Snapshot. | `PASS (4/4)` |
| `src/lib/admin/phase7.test.ts` | 4 | Self-service consignment stock dispatch lot & warehouse QC approval, vendor cost/retail price proposal, margin-safe campaign guard & automated escrow maturity promoter, and executive BDT double-entry accounting. | `PASS (4/4)` |

---

## ২. What Has Not Been Tested Against Live External Systems (`VERIFY_REQUIRED`)

Per `00_CUSTOM_INSTRUCTION.md` Section 3.2 and Section 14 (Honest Reporting):
- **Live Pathao & Steadfast Production APIs:** Tested via local deterministic adapter and HMAC-SHA256 webhook verification; live HTTP calls against production merchant endpoints require real merchant credentials (`VERIFY_REQUIRED`).
- **Live Supabase Cloud Instance:** SQL migrations (`0001..0007`) and RLS policies are verified structurally and enforced in the server-side DAL; applying migrations to a live production Supabase project requires explicit user approval and credentials (`VERIFY_REQUIRED`).
