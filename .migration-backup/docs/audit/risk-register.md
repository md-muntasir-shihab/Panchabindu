# Project Risk Register & Mitigation Strategy

> **November 11 Phase 1 update:** scoped HTTP/SSR/identity/reset containment and local test evidence: `f:\CODE\Panchagarh\docs\audit\v3-phase-1-security-identity.md`. Historical register below is not a current exploit inventory. Production identity, SQL/RLS/storage, JSON concurrency, finance and restore risks remain open; local guards are not full closure.

> **Current risk register:** `f:\CODE\Panchagarh\docs\audit\v3-phase-0-reconciliation.md` supersedes the dated entries below. Historical vulnerabilities and phase mappings may no longer be accurate; signed-session/vendor guards and tracking protections exist in the present source, but are not full security certification. No risk closure or implementation authorization is implied.
**Project**: Panchagarh (পঞ্চগড়) — Bangladesh Multi-Vendor Consignment F-Commerce & ERP  
**Assessment Date**: 2026-11-08  
**Phase**: Phase 0 — Re-Audit & Baseline  

---

## Risk Scoring Matrix
- **Likelihood**: 1 (Rare), 2 (Unlikely), 3 (Possible), 4 (Likely), 5 (Almost Certain)
- **Impact**: 1 (Negligible), 2 (Minor), 3 (Moderate), 4 (Major), 5 (Catastrophic)
- **Severity**: Score = $\text{Likelihood} \times \text{Impact}$. (Critical: 20–25, High: 12–19, Medium: 6–11, Low: 1–5)

---

## 1. Risk Register

| Risk ID | Category | Risk Description | Likelihood | Impact | Score | Severity | Mitigation Strategy | Phase Owner | Status |
| :---: | :---: | :--- | :---: | :---: | :---: | :---: | :--- | :---: | :---: |
| **RSK-01** | Security | **Admin API Default User Takeover**: Omitting session cookie gives full Super Admin access. | 5 | 5 | 25 | **P0 Critical** | Reject all unauthenticated requests with 401; require verified server session. | Phase 1 | Open |
| **RSK-02** | Security | **Session Cookie Forgery**: Session cookie contains raw unsigned `userId`. | 5 | 5 | 25 | **P0 Critical** | Implement cryptographically secure session IDs stored server-side with Secure/HttpOnly flags. | Phase 1 | Open |
| **RSK-03** | Security | **Hardcoded Plaintext Passwords & Demo 2FA**: Static passwords and `'123456'` TOTP code in code. | 5 | 4 | 20 | **P0 Critical** | Salted hashing for passwords; real RFC 6238 TOTP verification using `otpauth`. | Phase 1 | Open |
| **RSK-04** | Privacy | **Mass Customer PII Harvest via Tracking**: Predictable order numbers reveal full address & landmark. | 5 | 4 | 20 | **P0 Critical** | Replace order number lookup with opaque high-entropy random token; mask address on public API. | Phase 1 & 6 | Open |
| **RSK-05** | Privacy | **Customer Order History Scraping**: Account lookup uses static OTP `'123456'` without real verification. | 5 | 4 | 20 | **P0 Critical** | Implement real transactional OTP flow with rate limiting and secure session tokens. | Phase 1 & 6 | Open |
| **RSK-06** | Data Integrity | **JSON File Concurrent Write Corruption**: Multiple checkouts or updates corrupting `.data/*.json`. | 4 | 5 | 20 | **P0 Critical** | Migrate production data source of truth to PostgreSQL / Supabase with ACID transactions. | Phase 2 | Open |
| **RSK-07** | Security | **Courier Webhook Forgery & Escalation**: Webhook skips HMAC when secret missing and runs as Super Admin. | 4 | 4 | 16 | **P1 High** | Fail closed on missing/invalid secret; process webhook under restricted service role context. | Phase 1 & 5 | Open |
| **RSK-08** | Security | **Database RLS Gaps**: 18 of 35 tables have zero policies; `site_settings` allows public read. | 4 | 4 | 16 | **P1 High** | Define comprehensive policies for all tables; restrict `site_settings` to public columns only. | Phase 2 | Open |
| **RSK-09** | Financial | **Overselling / Race Conditions in Concurrent Checkout**: Two users purchasing last item simultaneously. | 3 | 4 | 12 | **P1 High** | Implement PostgreSQL atomic decrement with `FOR UPDATE` row lock and negative stock check. | Phase 2 & 3 | Open |
| **RSK-10** | Financial | **Double-Entry General Ledger Gaps**: Unbalanced journal entries or unverified financial adjustments. | 3 | 4 | 12 | **P1 High** | Add formal Chart of Accounts and database trigger enforcing Total Debit = Total Credit. | Phase 4 | Open |
| **RSK-11** | Operations | **Steadfast / Pathao API Downtime**: Courier API rate limits or outages blocking order dispatch. | 3 | 3 | 9 | **P2 Medium** | Build resilient adapter with fallback to offline CSV batch export and manual tracking numbers. | Phase 5 | Open |
| **RSK-12** | Business | **Inconsistent Payment Options (Nagad in UI)**: UI displays Nagad despite strict COD + bKash policy. | 4 | 2 | 8 | **P2 Medium** | Clean up UI references and enforce COD + Manual bKash exclusively. | Phase 1 & 7 | Open |
| **RSK-13** | Storefront | **Storefront Gaps (`/shop`, `/search`)**: Customer unable to browse all catalog items or view search URLs. | 4 | 2 | 8 | **P2 Medium** | Add dedicated `/shop` and `/search` App Router pages with responsive filters. | Phase 6 | Open |
| **RSK-14** | Architecture | **Monolithic Admin Component**: `admin-erp-client.tsx` has 6,020 lines, increasing maintenance risk. | 3 | 2 | 6 | **P3 Low** | Incrementally extract modular tab components during Phase 7 without breaking UI behavior. | Phase 7 | Open |

---

## 2. Risk Mitigation Plan & Phase Gates

Each identified risk is mapped to a specific phase in the 12-phase Master Plan. Under the Master Protocol, no subsequent phase will be initiated until the current phase's risks are resolved and verified with automated test evidence:

1. **Phase 1 Gate**: RSK-01, RSK-02, RSK-03, RSK-04, RSK-05, RSK-07, RSK-12 must be resolved and confirmed with negative security tests.
2. **Phase 2 Gate**: RSK-06, RSK-08, RSK-09 must be resolved with Supabase PostgreSQL migration and RLS verification.
3. **Phase 3 Gate**: RSK-09 must be verified with concurrent checkout and stock reservation tests.
4. **Phase 4 Gate**: RSK-10 must be verified with balanced journal entry and financial reconciliation tests.
5. **Phase 5 Gate**: RSK-11 must be verified with courier adapter fallback tests.
6. **Phase 6 Gate**: RSK-13 must be verified with storefront routing and filter tests.
7. **Phase 7 Gate**: RSK-14 must be verified with modular admin ERP tests.
