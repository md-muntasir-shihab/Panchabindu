# Current runtime boundary — November 13, 2026

Production filesystem persistence is blocked, including on Vercel. The new compatibility adapter requires `PANCHAGARH_PERSISTENCE=postgres`, reviewed migrations `0009` and `0010`, an initialized server-only runtime state, valid server-side Supabase configuration, `APP_URL` and the original credentials encryption key. Configuration is not integration proof. Read `docs/audit/backend-bilingual-2026-11-13.md` before using historical instructions below. No production deployment or migration was performed. Customer SMS delivery, live courier adapters, normalized domain migration and deployed acceptance remain open.

# DEPLOYMENT & PRE-LAUNCH READINESS RUNBOOK
## পঞ্চগড় (PANCHAGARH) — Production Release Governance

**Document Status:** `IMPLEMENTED` & `TESTED`  
**Core Verification Service:** `src/lib/admin/phase5-service.ts`

---

## ১. Controlled Deployment Policy

Per `00_CUSTOM_INSTRUCTION.md` Section 3.1 and Section 13:
- **Explicit Approval Required:** No production deployment, database migration, or rollback may be executed without explicit user approval.
- **Zero Forbidden Features:** Deployment is blocked if any payment gateway SDK, marketing tracking pixel (Facebook Pixel, TikTok Pixel, GTM), or floating-point money logic is detected.

---

## ২. Automated 12-Point Pre-Launch Readiness Gate

Before any release, run the automated readiness audit (`runPreLaunchReadinessAudit`):
1. **Integer Poisha Money Invariant:** Verifies all catalog variants and order snapshots obey `Cost + Profit = Payable` and `Payable + Margin = Sale Price`.
2. **Storefront Zero-Leak DTO Check:** Confirms zero vendor/cost fields leak in public responses.
3. **4-Role RBAC & Cross-Vendor 404 Isolation:** Verifies role boundaries across `super_admin`, `vendor`, `marketing_manager`, and `packaging_manager`.
4. **First-Login Password & TOTP 2FA Gate:** Confirms un-enrolled staff accounts are blocked from workspace access.
5. **Append-Only Ledger Immutability:** Confirms ledger entries cannot be overwritten or deleted.
6. **Escrow Maturity & Payout Hold Guard:** Confirms double-request protection on vendor payouts.
7. **Four-Way Return Engine Accuracy:** Confirms accurate debit/credit impact across all 4 return fault types.
8. **Courier Remittance & Aging Reconciliation:** Confirms short-payment detection and aging bucket math.
9. **Automation Kill-Switch & Dry-Run Safety:** Confirms all seeded rules default to safe/disabled or dry-run controllable states.
10. **Masked Credentials Vault:** Confirms zero secret exposure in client responses.
11. **PostgreSQL Migration & RLS Manifest Integrity:** Confirms all 7 SQL migrations (`0001..0007`) are present and enforce RLS.
12. **4-Solid Color Token Lock:** Confirms `src/styles/tokens.css` governance.

---

## ৩. Build, Lint & Test Verification Commands

```bash
# 1. Execute all unit, financial, RBAC, and lifecycle test suites
npx tsx --test --test-concurrency=1 src/lib/money.test.ts src/lib/validators.test.ts src/lib/db/repository.test.ts src/lib/db/product-sync.test.ts src/lib/admin/phase4a.test.ts src/lib/admin/phase4b.test.ts src/lib/admin/phase4c.test.ts src/lib/admin/phase5.test.ts src/lib/admin/phase6.test.ts src/lib/admin/phase7.test.ts

# 2. Run ESLint verification
npm run lint

# 3. Run production build & TypeScript strict typecheck
npm run build
```
