# BACKUP & DISASTER RECOVERY RUNBOOK
## পঞ্চগড় (PANCHAGARH) — Operational Data Protection & Restore Procedure

**Document Status:** `IMPLEMENTED` & `TESTED`  
**Core Service File:** `src/lib/admin/phase6-service.ts` (`createDisasterRecoverySnapshot`, `verifyAndRestoreSnapshot`)

---

## ১. Pre-Migration Backup Checklist (Mandatory)

Per `00_CUSTOM_INSTRUCTION.md` Section 4.4, before running any database migration or bulk operational change:
1. Verify current backup status in **Admin Dashboard → System & Security → Backup & Disaster Recovery**.
2. Trigger a fresh **Full System Disaster Recovery Snapshot**.
3. Record the snapshot ID, UTC timestamp, entity counts (`orders`, `products`, `vendors`, `vendorLedger`, `auditLogs`), and **SHA-256 Integrity Checksum**.
4. Confirm that the snapshot passes checksum verification (`verifyAndRestoreSnapshot` in dry-run/verify mode).

---

## ২. Cryptographic SHA-256 Snapshot Architecture

- **Scope:** Captures complete state across Storefront & Catalog (`erp-store.json`), Staff & RBAC (`erp-admin-store.json`), Vendors, Ledgers & Couriers (`erp-phase4b-store.json`), Automation & Vault (`erp-phase4c-store.json`), CRM & Reviews (`erp-phase6-store.json`), and Consignment Lots & Accounting (`erp-phase7-store.json`).
- **Secret Stripping:** Raw API secrets in the Credentials Vault are automatically stripped/masked inside exportable backup manifests to prevent credential leakage.
- **Tamper Detection:** On restore or verification, the engine recomputes the SHA-256 digest of the payload and rejects any snapshot whose checksum does not match.

---

## ৩. Restore Procedure

1. Authenticate as `super_admin` with TOTP 2FA verified.
2. Select the target verified snapshot in the Disaster Recovery panel (or pass the snapshot manifest to `verifyAndRestoreSnapshot` with `dryRun: false`).
3. Provide a mandatory audit reason (`reasonBn`).
4. System validates SHA-256 checksum, restores state atomically, and appends an immutable `SYSTEM_BACKUP_RESTORED` event to `audit_logs`.
