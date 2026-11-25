# Audit Progress

- **Current Phase**: CONTROL-CENTER-01 — Control Center & Security (`control_center` tab, `Phase6OpsPanel`) Step A/B trace committed on `audit/control-center-2026-11-25`; doc: `docs/audit/pages/control-center-trace-2026-11-25.md`. Remaining: line-level inventory of `phase6-ops-panel.tsx` (62 KB), dynamic abuse tests T1–T5, osv/gitleaks run — all need shell or file attach.
- **Active Branch**: `audit/control-center-2026-11-25`, base `audit/account-2026-11-24` @ 696d009 (branch created from it; `main` untouched).
- **Environment note (2026-11-25)**: audit agent has repo read/write via GitHub connector but **no shell** — no `npm`/lint/test executed. Findings tagged `[TRACED]`; user must run the verification commands before `PASS` is claimed. Browser extension unpaired — no live web threat research this session.

## CONTROL-CENTER-01 state (2026-11-25)

- Step A chain traced end-to-end: `admin-erp-client.tsx` nav (`settings` group, key `control_center`) → `phase6-ops-panel.tsx` → `/api/admin/workspace` ops (`save_or_revoke_credential`, `update_branding_thresholds`, `update_about_contact_settings`, `run_scheduled_job_now` hard-denied, `create_system_backup_snapshot`, `run_phase5_audit`, `run_consignment_lifecycle_dry_run`) → `workspace-policy.ts` dual gates → service layer.
- Positive controls confirmed `[TRACED]`: fail-closed unknown-op policy, 5 quarantined ops hard-denied for all roles, super_admin-only vault/backup/branding matrix (7-role RBAC snapshot), per-op Zod schemas, signed session + CSRF + 4KB body cap.
- Open gaps `[ASSUMED]`: G1 panel element inventory; G2 secret-exposure/audit-log/branding-XSS verdicts; G3 supply-chain scan; G4 no live threat-source freshness. Details in the trace doc §5.
- Verification commands in trace doc §6 — run before merge.

## AUTH-01 fix state (carried from prior branch — still pending)

1. `36b95b2` (main, prior session) — server: login body no longer echoes `sessionToken`.
2. `7cf87e6` — `admin-fetch.ts` (×2 byte-identical copies): sessionStorage `bg_admin_session_token` read + `x-admin-session-token` header injection removed; `bg_admin_csrf_token` double-submit kept.
3. `8f09ebc` — `admin-fetch-origin.test.ts`: asserts `x-admin-session-token` is **never sent**; CSRF header same-origin scoped.

**Still to do (needs shell or Cursor — 241 KB file exceeds agent whole-file write limit):** follow `docs/audit/modules/auth01-frontend-cleanup.md` §2 (exact edits for `admin-erp-client.tsx` + byte-identical copy under `api-server/imported` if present). After edit, `git grep -n bg_admin_session_token -- artifacts | grep -v test` must return no code hits.

**Verification commands (must be run before merge):**
```bash
npm run typecheck
node --test artifacts/api-server/imported/src/lib/admin/admin-fetch-origin.test.ts
node --test artifacts/api-server/imported/src/lib/security/self-service-security.test.ts
node --test artifacts/api-server/imported/src/lib/security/phase1-reconciliation.test.ts
node --test artifacts/api-server/imported/src/lib/security/phase1-security.test.ts
npm run audit:eslint && npm run audit:eslint:orders && npm run audit:eslint:print && npm run audit:eslint:catalog
```

## Storefront shared pages pass (prior branch)

| Page | File | Fixes | Status |
|---|---|---|---|
| Loading | `pages/loading.tsx` | hardcoded hex → semantic tokens (LOAD-01) | COMMITTED `3a0e446` |
| 404 | `pages/not-found.tsx` | hardcoded palette → tokens, locale-aware, 44px CTA (NF-01) | COMMITTED `3aaee02`+`dc0e176` |
| Error | `pages/error-page.tsx` | locale-aware text (ERR-01) | COMMITTED `3aaee02` |

## Completed Pages
1. `/` — Homepage (`audit/home-2026-11-21`)
2. `/admin` — Orders Grid & 4 Attached Sheets (`audit/admin-orders-2026-11-21`)
3. `/` — Print Engine & Invoice Studio (`audit/admin-print-engine-2026-11-21`)
4. `/admin` — Product & Category Studio (`audit/admin-product-studio-2026-11-21`)
5. `/admin` — Vendors & Payouts money-core security trace (`audit/admin-panel-2026-11-24`, `[TRACED]`) — doc: `modules/vendors-payouts-security-trace-2026-11-24.md`
6. Storefront shared pages (loading/404/error) + AUTH-01 frontend cleanup phase 1 (`audit/account-2026-11-24`)
7. `/admin` — **Control Center & Security** — Step A/B trace (`audit/control-center-2026-11-25`) — doc: `pages/control-center-trace-2026-11-25.md` — dynamic tests pending

## Open findings
- **CONTROL-CENTER-01 (P1, meta)**: dynamic abuse tests T1–T5 + osv/gitleaks + panel line-inventory blocked on shell/browser/file-attach. → RESOLVED when user runs verification commands or attaches `phase6-ops-panel.tsx` to chat.
- **AUTH-01 (P1)**: `admin-fetch.ts` + test committed; `admin-erp-client.tsx` cleanup pending (needs shell/Cursor).
- **ACCT-BLOCK (P1, meta)**: `account-client.tsx` is 107 KB — exceeds agent whole-file read/write limit; Account page core redesign requires the file attached to the chat, browser-extension pairing, or a shell. Backend auth chain verified `[TRACED]` in its place.
- **VEN-01 (P3)**: `resetVendorControls()` discards `actorUsername` — deferred.

## Next
1. User runs CONTROL-CENTER verification commands (trace doc §6) or attaches `phase6-ops-panel.tsx` to chat for the element-level audit (G1).
2. Apply AUTH-01 `admin-erp-client.tsx` patch (modules doc §2) in Cursor.
3. Then Account page core redesign, then Checkout responsive pass.
