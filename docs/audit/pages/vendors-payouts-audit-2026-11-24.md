# Vendors, Profiles & Approvals + Vendor Payouts & Escrow Ledger — Audit (2026-11-24)

> Page: `/admin` → `VendorsHubPanel` (vendors_hub) + `VendorPayoutsLedgerPanel` / `VendorPayoutRegisterPanel` (vendor_payouts), role: super_admin
> Builds on: `docs/audit/modules/vendors-payouts-security-trace-2026-11-24.md` (money-core trace) and `test:vendors` (15 cases).
> All claims `[TRACED]` unless tagged otherwise. Screenshots provided were unreadable by the environment — code is the source of truth.

## 1. VEN-01 — re-assessed: CLOSED (premise incorrect)

Prior claim: "resetVendorControls() discards actorUsername — no audit attribution on capability reset."

Corrected finding: attribution EXISTS. `adminResetVendorCapabilities` (vendor-admin-service.ts) writes an immutable audit record — `VENDOR_CAPABILITIES_RESET` with actorUserId/actorUsername/actorRole, targetId vendor.vendorCode, and post-reset capabilities in metadata. The `void actorUsername` in `resetVendorControls` is cosmetic dead code only, with zero behavioral impact.

Residual: P4 cleanup — remove the dead `actorUsername` parameter from `resetVendorControls` and its single call site in `adminResetVendorCapabilities` (typecheck-enforced pair, one commit for both files).

## 2. Findings

| ID | Severity | Category | Where | What | Action |
|---|---|---|---|---|---|
| VEN-02 | P4 | Duplicate/dead code | `artifacts/panchabindu/src/components/admin/vendor-control-panel.tsx` | Knip-listed unused file [EXECUTED]; repo-wide grep confirmed zero imports — only a self-referencing comment [EXECUTED by owner]; VendorsHubPanel provides the same functions | Safe to `git rm` in a tiny PR |
| VEN-03 | — | Design review (no action) | `adminResolveVendorPayout` selfApprovalOverrideReasonBn path | Maker-checker override with >=5-char reason is a deliberate, audit-trailed privilege | Keep; documented |

## 3. Money path verified [TRACED] (end-to-end)

- Payout state machine: approve from requested, reject from requested|approved, mark_paid from approved; TrxID required for mark_paid; reject reason >= 3 chars.
- All lifecycle actions funnel through `resolveVendorPayoutRequest` — single source of truth for hold/release/escrow bookkeeping and audit writes.
- Escrow integrity: PAYOUT_HOLD deducts at request; PAYOUT_DISBURSED is 0-net; PAYOUT_HOLD_RELEASE restores on reject. No double-spend path found.
- Maker-checker: `blocksCurrentUser` computed server-side; UI hides rather than 403s.
- Account numbers masked in row DTOs; fees server-computed (185 bp), actual feePoisha overrides estimate.
- `adminDirectPayout` → `adminDirectVendorSettlement`; `adminCreateVendorPayout` → `requestVendorPayout` (server-side capability + balance enforcement).

## 4. Threat Matrix (this page)

| Threat | Verdict |
|---|---|
| BOLA — payout acted on behalf of another vendor | SECURE [TRACED] |
| Broken Function Level Auth — vendor calling admin payout ops | SECURE [TRACED] |
| Mass assignment — role/status via payout/profile payloads | SECURE [TRACED] (whitelisted fields, bp bounds 0-5000, hold 1-30d) |
| Race — double approve / double mark_paid | SECURE [TRACED]; re-test via test:vendors once env is up |
| Payout-hold totals overstated (zero-amount PAYOUT_DISBURSED) | OPEN (owner decision, pre-existing P3) |
| Escrow math duplication (DUP-01 family) | WATCH: add parity test |
| XSS in payout account / note / proof URL | SECURE [TRACED] |
| Self-approval abuse | ACCEPTED RISK, documented (VEN-03) |

## 5. Owner commands (dynamic verification)

```powershell
nvm use 22.20.0
npm run dev
npm run test:vendors                   # 15 money cases
npm run test:orders:api ; npm run test:print:api
git rm artifacts/panchabindu/src/components/admin/vendor-control-panel.tsx   # VEN-02
npm run typecheck
```

## 6. Status

**PASS WITH KNOWN RISKS** (trace-level): VEN-01 closed as incorrect premise; VEN-02 dead-code cleanup pending; no P0/P1 on this page's money paths. AUTH-01 (P1, shared admin auth) remains open globally. Dynamic suites BLOCKED on the Node 22 environment fix.
