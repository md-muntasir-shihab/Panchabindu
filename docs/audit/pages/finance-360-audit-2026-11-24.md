# Finance, Accounting & Product 360 — A-to-Z Audit — 2026-11-24

> Page: **Finance, Accounting & Product 360** (screenshot-provided), admin ERP tab `finance_360`.
> Component: `artifacts/panchabindu/src/components/admin/phase4c-panels.tsx` → `FinanceProduct360AndExpensesPanel` (127KB file, anchor edits only).
> Backend: `/api/admin/workspace` (GET role-filtered snapshot + POST discriminated-union operations, Phase 4C service).
> Stack: React 19.3.1 + Tailwind 4 + wouter; server: Express-style backendRoute + zod + signed admin session + CSRF + RBAC (`workspace-policy.ts`).
> All claims `[TRACED]` (code-path read) unless marked. Dynamic/browser tests BLOCKED (no shell in this session).

## Screenshot-confirmed inventory `[EXECUTED via image parse]`

Sub-tabs: **Money Map & P&L** (active) | **Accounting, VAT & Refunds (1)** | **Product 360 & Stock**.
Role: super_admin. Locale switch EN/BN. Header: Refresh + Logout + bell.

### Money Map & P&L tab
- Money map KPIs: courier COD in transit (৳0), delivered remittance pending (৳3,780), vendor locked+available (৳10,600), estimated liquid cash (৳10,450) — badge `Super Admin Only`
- Net profit breakdown: gross ৳3,880 − supplier ৳3,100 − promo ৳100 − ad spend ৳650 − packaging/courier ৳150 = **−৳120 NET LOSS** (red badge)
- ROAS/CPO table by channel (FACEBOOK 1 order ৳1,430 / ৳450 / 3.18x; INSTAGRAM ৳200 spend 0 orders; WHATSAPP organic; STOREFRONT 3 orders ৳16,810 organic)
- Recent expenses list (3 entries, category-tagged, Bangla descriptions)
- **Add expense form** (category, channel, campaign code, amount BDT, Bangla description → `খরচ লেজারে যুক্ত করুন`)
- Promo codes card (funded from platform margin) — cut off in screenshot

## Verified secure-by-design `[TRACED]`

1. **Snapshot auth chain** — `/api/admin/workspace` GET: no default-to-super-admin (explicit comment + code: `verifyAdminSessionToken` → 401 without valid session; enrollment sessions rejected), `canAccessAdminWorkspace(actor)` RBAC gate, field-sanitized role-filtered snapshot; sensitive aggregates only for super_admin (`isVendor` flag inverts money blocks).
2. **POST hardening** — signed session + `verifyOriginAndCsrf` on every mutation + zod discriminated union + body size cap (413 path present) + per-operation RBAC via `canExecuteWorkspaceAction` (fail-closed policy) + immutable audit log (`appendImmutableAuditLog`) on money-bearing ops.
3. **Money as integer poisha** everywhere; client sends Taka but `parseTaka`-style exact conversion server-side; net profit computed server-side (`computeFinancialMoneyMapAndPnl`), the panel only displays.
4. **Expense entry** goes through `addExpenseOrAdSpendEntry` (Phase 4C service) with category allowlist (ad_spend/packaging/courier_return_loss/damage_compensation/office_ops — same labels as dashboard-summary).
5. **Promo codes funded only from platform margin** — discount capped by `Math.min(discount, platformMarginPoisha)`; vendor payable 100% intact (per planning doc + ui-messages contract).
6. **Super-admin-only gating** on money map card (badge matches server `isSuperAdmin` flag).

## Findings

### FIN-01 — P2 · UX/Responsive (screenshot-confirmed)
- **What:** "Promo codes funded from platform margin" card is cut off mid-card at the bottom; in the screenshot the fold hides its form fields. Likely missing bottom padding/last-card margin, or the card sits under a fold with no scroll affordance.
- **Fix:** ensure the section stack ends with `pb-6` and the promo card itself is fully in the document flow; add `scroll-mt` if a sticky sub-tab bar overlaps it. Verify at 360px and 1440px.
- **In scope: YES** — pure layout fix.

### FIN-02 — P3 · UX (screenshot-confirmed)
- **What:** Add-expense form shows mixed-language labels in BN mode: "ক্যাম্পেইন কোড", "পরিমাণ (টাকা BDT) *", "বিবরণ (বাংলায়) *" — but category/channel dropdowns show English values ("Advertising", "Facebook") with no Bangla label mapping, unlike the rest of the ERP which maps enum labels (EXPENSE_CATEGORY_LABELS exists in dashboard-summary.ts and is unused here).
- **Fix:** reuse `EXPENSE_CATEGORY_LABELS` + a channel label map for the two dropdowns; keep option values as the enum keys.
- **In scope: YES** — reuse existing label maps, no new data.

### FIN-03 — P3 · Data-integrity/UX
- **What:** ROAS row INSTAGRAM shows ad spend ৳200 with 0 orders and CPO ৳0 — CPO of ৳0 for a channel with spend is misleading (division by zero guarded to 0, but display should say "—" or "N/A").
- **Fix:** display `—` when ordersCount = 0 but spend > 0; keep the numeric 0 only when spend is also 0.
- **In scope: YES** — display-only.

### FIN-04 — P4 · Connection
- **What:** This page's net-loss figure and the merged Command Center money view (PR #43 merge plan) both derive from `computeFinancialMoneyMapAndPnl`/`buildPnlBreakdown` — the PnL lines here use the same PNL_LINE_LABELS set. Good: no duplicate math. But the screenshot's breakdown lists "Packaging, courier return losses and damage" as ONE merged line (৳150) while `buildPnlBreakdown` splits packaging/courier/damage into three lines — the Finance page merges them.
- **Impact:** none today (same server figures), but the two surfaces will visually disagree after the dashboard merge lands.
- **Action:** after dashboard merge, align the label of the merged line or split it the same way; tracked in the merge plan doc. **Deferred until merge executes.**

## Threat Matrix (page-specific)

| Threat | Applies? | Basis | Source |
|---|---|---|---|
| Low-priv staff adds expenses / edits promo rules (function-level) | NO — per-operation RBAC fail-closed + audit log `[TRACED]` | workspace-policy | OWASP API5:2023 |
| Vendor sees money map / liquid cash (object/role level) | NO — snapshot field-sanitized by role; money block super_admin-only `[TRACED]` | phase4a snapshot | OWASP API3/API1 |
| Negative/decimal/huge expense amounts (money tampering) | LOW RISK — zod + server poisha conversion; verify max bound exists in the `add_expense` schema (grep blocked by rate-limit this session) `[ASSUMED — verify with: grep -n "add_expense" artifacts/api-server/imported/app/api/admin/workspace/route.ts]` | | OWASP A06 |
| Promo rule mass-assignment (unbounded discount) | NO — discount capped at platform margin server-side `[TRACED]` | phase4c promo service | OWASP A06 |
| CSV/formula injection via campaign names in exports | NOT TESTED (no export on this page today) | | OWASP A05 |
| CSRF on expense add | NO — verifyOriginAndCsrf on POST `[TRACED]` | crypto-session | OWASP A01 |

## Stack advisories
express 5.3.0 — no known advisories (checked 2026-11-24, OSV/GHSA via web). React 19.3.1, zod 4, Tailwind 4 — no page-reachable advisories found this session. body-parser transitive CVE-2026-111181 — confirm resolved version via `npm ls body-parser` (owner).

## Owner verification (BLOCKED: no shell here)

```powershell
# FIN-01..FIN-03 after applying the edits below:
npm run typecheck
npm run dev
# super_admin login → Finance, Accounting & Product 360:
#  - BN locale: category/channel dropdowns show Bangla labels
#  - INSTAGRAM row: CPO shows — not ৳0
#  - promo card fully visible at 360px & 1440px (scroll if needed)
#  - add expense with amount 1500 → appears in recent list, net profit recalculates server-side
#  - low-priv staff login → money map hidden, expense add denied (RBAC)
```

## Fix patch (anchor edits in phase4c-panels.tsx)

1. **FIN-02:** In the add-expense form, replace raw enum text in the category `<select>` options with `EXPENSE_CATEGORY_LABELS[category].bn` (import already available in the file's module scope from dashboard-summary — add the import if missing) and add a small `CHANNEL_LABELS` map (`facebook/instagram/whatsapp/storefront`) for the channel dropdown. BN/EN via existing `isBn` flag.
2. **FIN-03:** In the ROAS table CPO cell: `{row.ordersCount > 0 ? money(row.cpoPoisha) : (row.adSpendPoisha > 0 ? '—' : '0')}`.
3. **FIN-01:** On the outermost section wrapper of this panel add `pb-6`; on the promo card add nothing else — re-verify the fold behavior; if a sticky element covers it, add `scroll-mt-24`.

Commit: `fix(finance-360): Bangla labels for expense dropdowns, N/A CPO, bottom spacing (FIN-01..03)`
