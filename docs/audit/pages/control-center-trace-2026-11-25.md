# Control Center & Security — Page Trace + Threat Matrix (2026-11-25)

> Agent: Ashna-X1 audit (GitHub connector mode, no shell). All findings `[TRACED]` unless marked.
> Page: **Control Center & Security (কন্ট্রোল সেন্টার ও সিকিউরিটি)** — Admin ERP nav group `settings` → tab key `control_center`.
> Route: `/admin` (SPA `AdminErpClient`), panel: `Phase6OpsPanel`. Role: Super Admin only.
> Branch: `audit/control-center-2026-11-25` (base: `audit/account-2026-11-24` @ 696d009).

## 1. Identity & chain `[TRACED]`

| Layer | File | Notes |
| --- | --- | --- |
| Nav entry | `artifacts/panchabindu/src/components/admin/admin-erp-client.tsx` | `ADMIN_NAV_GROUPS` → group `settings` ("সিস্টেম ও নিরাপত্তা / System & Security") → key `control_center`. Role filtering on original nav items, not presentation groups (source comment). |
| Panel UI | `artifacts/panchabindu/src/components/admin/phase6-ops-panel.tsx` (62.7 KB) | Full control-center UI. Exact section/element map still requires line-level read — file exceeds agent context budget for full read this session. |
| Help copy | `artifacts/panchabindu/src/components/admin/operational-help-modal.tsx` | `control_center` help entry confirms purpose: dynamic store branding, maintenance-mode toggle, encrypted credentials vault, cron jobs. |
| Client calls | `artifacts/panchabindu/src/lib/security/workspace-policy.ts` (mirror) + `phase4c-panels.tsx` fetch sites | `save_or_revoke_credential` (credential vault), `update_branding_thresholds` (branding + bKash manual number + free-delivery threshold in poisha), `run_scheduled_job_now` (cron jobs). |
| API route | `artifacts/api-server/imported/app/api/admin/workspace/route.ts` | Zod schema per operation (e.g. `save_or_revoke_credential` with `keyName` enum), signed session + `verifyOriginAndCsrf` + 413 body-cap gate, 401/403 handling, `saveOrRevokeEncryptedCredential(ctx, …)`. |
| Server service | `phase4a/4b/4c service layer` (`saveOrRevokeEncryptedCredential`, `updateSiteBrandingAndThresholds`) | Encrypted credential vault; server-side only. |
| RBAC | `artifacts/api-server/imported/src/lib/security/workspace-policy.ts` | `save_or_revoke_credential` → `settings_control_center:update`; `update_branding_thresholds` → `settings_control_center:update`; `run_scheduled_job_now` → **hard-deny for all roles** including `super_admin` (server quarantined). |
| RBAC snapshot | `docs/planning/panchabindu/workspace-rbac-snapshot.md` | `save_or_revoke_credential` / `update_branding_thresholds` / `update_about_contact_settings`: ALLOW only for `super_admin`, DENY for all 6 other roles. |
| Consumers | `admin-command-dashboard.tsx` (emergency banner → "Control center" link), `sync-health-panel.tsx` (same nav group) | Blast radius if panel props/keys change. |

## 2. Controls inventory (from policy + fetch sites + help copy) `[TRACED]`

| Control | API operation | Server gate | RBAC matrix |
| --- | --- | --- | --- |
| Credentials vault (save/revoke encrypted secrets) | `save_or_revoke_credential` | Zod enum on `keyName`, encrypted at rest via `saveOrRevokeEncryptedCredential`, `settings_control_center:update` | super_admin ALLOW, others DENY |
| Store branding + free-delivery threshold + bKash manual number | `update_branding_thresholds` | Zod patch schema, `takaToPoisha` client conversion, `settings_control_center:update` | super_admin ALLOW, others DENY |
| About/contact site settings | `update_about_contact_settings` | `settings_control_center:update` | super_admin ALLOW, others DENY |
| Run scheduled job now (cron trigger) | `run_scheduled_job_now` | **Quarantined: hard-deny in `canExecuteWorkspaceAction` before RBAC check** | DENY for all roles |
| Maintenance mode / emergency stop toggle | global emergency transaction boundary (shared imported API) | audited super-admin recovery (per known-limitations.md) | super_admin only (banner link gated by `isSuperAdmin`) |
| Backup snapshot | `create_system_backup_snapshot` | super_admin-only explicit hard-gate in `canExecuteWorkspaceAction` | super_admin ALLOW |
| Phase5 audit / consignment dry-run | `run_phase5_audit`, `run_consignment_lifecycle_dry_run` | `settings_control_center:read` | super_admin ALLOW |
| Courier webhook simulation | `simulate_courier_webhook` | **Quarantined: hard-deny for all roles** | DENY for all |

## 3. Threat Matrix (Step B) — baseline mapping, marked `[ASSUMED]` for freshness where no live web search was possible (browser extension not paired this session)

| # | Threat | Applies? | Test method | Mapping |
| --- | --- | --- | --- | --- |
| T1 | Non-super-admin invoking vault/branding ops (function-level authz) | Unlikely — dual gate (RBAC + hard role check). VERIFY by replaying op as each staff role with valid CSRF | OWASP A01 / API3 BFLA / CWE-284 |
| T2 | Vault secret plaintext exposure in API response or client bundle | To verify — inspect response shape of `save_or_revoke_credential` + any `secrets` fields in workspace snapshot | A02 Cryptographic / API3 Excessive Data Exposure / CWE-312 |
| T3 | CSRF/origin bypass on `/api/admin/workspace` (control-center ops) | To verify — `verifyOriginAndCsrf` present `[TRACED]`; test forged Origin + missing token | A01 / CWE-352 |
| T4 | Session replay / fixation on signed admin cookie | To verify — post-logout replay of all 6 control-center ops | A07 / CWE-384 |
| T5 | Branding threshold patch: money tampering (negative/zero `freeDeliveryThresholdPoisha`, non-numeric bKash number) | To verify — malformed patches against Zod schema | A05 Injection / A06 Insecure Design / CWE-20 |
| T6 | Denial of service via unbounded vault entries or oversized patch payloads | Partially controlled — 4KB body cap seen `[TRACED]`; check per-field max lengths | API4 Unrestricted Resource Consumption / CWE-400 |
| T7 | Cron job trigger abuse (`run_scheduled_job_now`) | Low — server hard-denies for ALL roles `[TRACED]`. Confirm UI hides/disables button and explains why, not fabricates success | A06 / CWE-284 |
| T8 | Audit-log omission for vault/branding mutations | To verify — check `saveOrRevokeEncryptedCredential` writes audit trail with actor, no secret value | A09 Logging / CWE-778 |
| T9 | Maintenance/emergency stop toggle without step-up auth or with no audit | To verify — confirm emergency toggle requires `isFirstLoginGateCleared`/step-up per print-config precedent, and logs actor | A06 / CWE-284 |
| T10 | Info leakage: verbose errors, secrets in logs/bundle, source maps | To verify — Gitleaks + bundle scan + error responses | A02 / A09 / CWE-532 |
| T11 | Supply chain (React 19.1.0, Express 5.3.0, Vite 7.3.2, TS 5.9.3, Zod) | To verify via `osv-scanner`/`npm audit` — needs shell | A03 Supply Chain / CWE-1104 |
| T12 | XSS via branding fields rendered on storefront (store name, legal copy) | To verify — branding values are user input rendered on `/` (audited homepage consumers) | A03(2025)→A05 Injection class / CWE-79 |

## 4. Verdicts on positive controls `[TRACED]`

1. **Fail-closed policy**: unknown operations and the 5 quarantined ops (`create_flash_campaign`, `promote_matured_escrow`, `run_scheduled_job_now`, `sync_courier_tracking`, `simulate_courier_webhook`) are hard-denied before RBAC — correct defense-in-depth, matches known-limitations quarantine note.
2. **Dual gate on vault + backups**: `settings_control_center:update` RBAC **plus** explicit `super_admin` role check for `create_system_backup_snapshot` — correct blast-radius control.
3. **Deny-by-default RBAC matrix** for all 7 roles confirmed in workspace-rbac-snapshot — control-center mutations are super_admin-only at the server policy layer.
4. **Schema validation**: per-operation Zod schemas with `keyName` enum on vault writes — no free-form secret keys.
5. **Session**: signed server session, cookie-first token reads; AUTH-01 cleanup (removing `x-admin-session-token` header path) already committed on base branch — reduces stale-token replay surface.

## 5. Gaps / open items (require shell, browser pairing, or line-level reads beyond this session's budget)

- G1 `[ASSUMED]`: Exact element-by-element inventory of `phase6-ops-panel.tsx` (62 KB) — tabs, buttons, states, sub-functions not yet line-mapped.
- G2 `[ASSUMED]`: T2/T5/T8/T9/T12 verdicts pending dynamic testing or line reads of route.ts + service layer (86 KB route file exceeds context).
- G3 `[ASSUMED]`: Stack advisories (T11) need `osv-scanner`/`npm audit` run — no shell this session.
- G4: No live web search (browser extension unpaired) — threat matrix freshness is baseline-only; re-run Step B against OWASP/OSV sources when paired.

## 6. Verification commands (run before claiming PASS)

```bash
git checkout audit/control-center-2026-11-25
npm run typecheck
node --test artifacts/api-server/imported/src/lib/security/self-service-security.test.ts
node --test artifacts/api-server/imported/src/lib/security/phase1-security.test.ts
npm run audit:eslint
npx osv-scanner -r .
npx gitleaks detect --source .
```

— Trace committed for review. Dynamic abuse-case execution (T1–T5) still requires the running dev app + low-privilege credentials, or a shell-based Playwright run.
