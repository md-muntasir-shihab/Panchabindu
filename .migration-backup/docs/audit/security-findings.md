# Security Findings & Vulnerability Assessment

> **Historical November 8 evidence.** Do not treat the old unsigned-cookie/default-admin, TOTP, guest-route or SMS descriptions as current exploit confirmations. Current static findings and remaining verification limits are in `f:\CODE\Panchagarh\docs\audit\phase-0-reaudit-2026-11-11.md`. This document is retained for traceability, not live configuration/production certification.
**Project**: Panchagarh (পঞ্চগড়) — Bangladesh Multi-Vendor Consignment F-Commerce & ERP  
**Assessment Date**: 2026-11-08  
**Audit Scope**: Authentication, Authorization, Session Management, Order Tracking Privacy, API Endpoints, Webhook Handlers, Cryptography, and Secrets Management  

---

## Severity Classification
- **P0 Critical**: Direct authentication bypass, full administrative takeover, mass customer PII harvesting, or unauthorized financial modification.
- **P1 High**: Serious authorization gaps, insecure database RLS, missing CSRF/Rate limiting on state-changing operations, or sensitive data leakage in files.
- **P2 Medium**: Policy inconsistencies, non-cryptographic demo secrets, or optional provider misconfigurations.
- **P3 Low**: Code quality warnings, informational headers, or UI image optimizations.

---

## 1. P0 — Critical Vulnerabilities

### SEC-01: Admin API Authentication Bypass via Default User Fallback
- **Location**: `app/api/admin/workspace/route.ts` (lines 103–106 and lines 865–867)
- **Code**:
  ```typescript
  // GET:
  const userId = req.cookies.get(SESSION_COOKIE_NAME)?.value || 'usr-super-admin';
  // POST:
  const userId = req.cookies.get(SESSION_COOKIE_NAME)?.value || 'usr-super-admin';
  ```
- **Description**: If a request to `/api/admin/workspace` is sent without any session cookie (e.g., from an unauthenticated curl request or web crawler), the handler defaults `userId` to `'usr-super-admin'`. It immediately resolves the security context of the root Super Admin, granting full access to read and mutate all financial records, payout requests, users, orders, and system settings.
- **Impact**: Any anonymous visitor can execute full administrative takeover of the ERP.
- **Remediation**: Remove the fallback immediately. If `SESSION_COOKIE_NAME` is missing or invalid, return `401 Unauthorized` with `{ success: false, errorBn: 'অনুমতি নেই। অনুগ্রহ করে লগইন করুন।' }`.

---

### SEC-02: Insecure Unsigned/Unencrypted Session Cookie
- **Location**: `app/api/admin/auth/route.ts` (lines 69–74, lines 91–96)
- **Code**:
  ```typescript
  res.cookies.set(SESSION_COOKIE_NAME, result.user.userId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60,
  });
  ```
- **Description**: The session cookie `bg_admin_session_uid` stores the raw, plaintext `userId` (e.g., `'usr-super-admin'`). It lacks cryptographic signing (HMAC) or server-side session token verification. Additionally, the `secure: true` flag is not set, allowing transmission over cleartext HTTP.
- **Impact**: An attacker who knows or guesses a target user's ID can trivially forge the cookie and impersonate any user or role without credentials or 2FA.
- **Remediation**: Generate cryptographically random session tokens (32 bytes hex) stored in a secure server session store (or signed JWT / HMAC token), verify token authenticity on every request, and set `secure: process.env.NODE_ENV === 'production'`.

---

### SEC-03: Hardcoded Admin & Staff Credentials in Source Code
- **Location**: `src/lib/admin/phase4a-service.ts` (lines 324, 345, 408)
- **Code**:
  ```typescript
  passwordPlainDemo: 'Admin#2026' // Super Admin
  passwordPlainDemo: 'Vendor#2026' // Vendor
  passwordPlainDemo: 'Temp#2026'   // Staff First-Login
  ```
- **Description**: Initial user accounts have plaintext passwords hardcoded directly in repository code. The passwords are saved into `.data/erp-admin-store.json` in plaintext.
- **Impact**: Anyone with repository read access or access to server files can immediately login as Super Admin or Vendor.
- **Remediation**: Replace plaintext demo passwords with salted hashes (bcrypt/argon2 or PBKDF2 with crypto.subtle), or manage users via Supabase Auth. Never store plaintext passwords in source files or JSON databases.

---

### SEC-04: Static Hardcoded 2FA TOTP Bypass
- **Location**: `src/lib/admin/phase4a-service.ts` (lines 652 and 717)
- **Code**:
  ```typescript
  if (!input.totpCode || input.totpCode.trim() !== '123456') {
    return { success: false, errorBn: 'সঠিক ৬ সংখ্যার Google Authenticator TOTP কোড দিন (ডেমো কোড: 123456)।' };
  }
  ```
- **Description**: Although the application claims strict Google Authenticator 2FA, the server does not compute time-based OTP using the RFC 6238 algorithm. Instead, it compares the code against the static string `'123456'`.
- **Impact**: 2FA provides zero actual security; any attacker who knows the demo code `'123456'` bypasses the second factor entirely.
- **Remediation**: Integrate real RFC 6238 TOTP verification (using the installed `otpauth` package) against the user's secret key, and implement replay protection for consumed TOTP tokens.

---

### SEC-05: Customer PII & Full Address Harvest via Public Tracking API
- **Location**: `app/api/orders/track/[secureToken]/route.ts` & `src/lib/db/repository.ts` (lines 1599–1607)
- **Code**:
  ```typescript
  // route.ts:
  const { secureToken } = await params;
  const orderNo = decodeURIComponent(secureToken || '').trim();
  const tracking = getPublicOrderTracking(orderNo);

  // repository.ts:
  return {
    orderNo: order.orderNo,
    status: order.status,
    customerName: order.customerName,
    customerPhoneMasked: maskBdPhone(order.customerPhone),
    districtNameBn: order.districtNameBn,
    upazilaNameBn: order.upazilaNameBn,
    streetAddress: order.streetAddress, // EXPOSED FULL STREET ADDRESS!
    landmark: order.landmark,           // EXPOSED LANDMARK!
  ```
- **Description**: 
  1. The `[secureToken]` URL parameter is directly treated as an `orderNo`.
  2. Order numbers follow a predictable sequential format (`ORD-261106-0001`, `ORD-261106-0002`).
  3. The response returns the customer's full unmasked street address, landmark, customer name, and item details to unauthenticated callers.
- **Impact**: Anyone can enumerate sequential order numbers and scrape a complete database of customer names, precise home/office addresses, landmarks, and purchase histories across Bangladesh.
- **Remediation**: 
  1. Decouple tracking tokens from order numbers. Issue a high-entropy cryptographically random token (e.g. 128-bit UUID or nanoid) generated upon order creation.
  2. Redact `streetAddress` and `landmark` from public tracking responses; only display minimal district/upazila and shipment status. Full address details must require authenticated customer session.

---

### SEC-06: Customer Account Order History Takeover via Static OTP
- **Location**: `app/api/account/orders/route.ts` (lines 30–39)
- **Code**:
  ```typescript
  if (parsed.data.otpCode !== '123456') {
    return NextResponse.json({ success: false, errorBn: 'ওটিপি কোডটি সঠিক নয়...' }, { status: 401 });
  }
  const orders = getCustomerOrdersByPhone(parsed.data.customerPhone);
  ```
- **Description**: The customer account order lookup accepts any phone number and tests against static OTP `'123456'`. Upon entering `'123456'`, it immediately dumps all historical orders, items, prices, and addresses for that phone number.
- **Impact**: Any customer's complete lifetime purchase history can be accessed by anyone who knows or guesses their phone number.
- **Remediation**: Integrate a secure transactional OTP mechanism with rate limiting, attempt throttling, expiration (3–5 minutes), and secure session cookie generation upon verification.

---

### SEC-07: Courier Webhook Fail-Open on Missing Secret & Super Admin Impersonation
- **Location**: `app/api/webhooks/courier/route.ts` (lines 56–77)
- **Code**:
  ```typescript
  const configuredSecret = secretEnvMap[payload.provider];
  if (configuredSecret && configuredSecret.trim().length > 0) {
    // validates signature only if secret is present
  }
  // Runs webhook as Super Admin:
  const systemCtx = getActorSecurityContext('usr-super-admin')!;
  const result = processCourierWebhookPayload(systemCtx, ...);
  ```
- **Description**: If the webhook secret environment variable (e.g., `STEADFAST_WEBHOOK_SECRET`) is unset or empty, the webhook skips HMAC validation entirely (fails open). Furthermore, the handler creates a security context impersonating `usr-super-admin`.
- **Impact**: An attacker can send forged webhook payloads to mark arbitrary orders as `delivered`, trigger courier remittance payouts, or promote vendor escrow balances without authorization.
- **Remediation**: Fail closed: if the provider secret is not configured or signature header does not match, immediately reject with `401 Unauthorized`. Use a dedicated restricted system service context rather than root Super Admin.

---

## 2. P1 — High Severity Findings

### SEC-08: Database RLS Gaps & Insecure `site_settings` Public Policy
- **Location**: `supabase/migrations/0007_rls_policies.sql`
- **Description**: 
  - Of the 35 tables with `ENABLE ROW LEVEL SECURITY`, 18 tables have zero policies defined (meaning default deny if accessed directly via PostgREST, but leaving access control undocumented and unverified).
  - The policy for `site_settings` is:
    ```sql
    CREATE POLICY pol_site_settings_public_read ON site_settings FOR SELECT USING (TRUE);
    ```
    If internal configuration or sensitive thresholds are stored in `site_settings`, this exposes all configuration rows to anonymous callers.
- **Remediation**: Restrict `site_settings` public SELECT to public storefront columns only, or create a sanitized view `v_public_site_settings`. Define explicit policies for all 35 tables.

---

### SEC-09: Insecure `search_path` in SECURITY DEFINER Functions
- **Location**: `supabase/migrations/0007_rls_policies.sql` (lines 48–76)
- **Code**:
  ```sql
  CREATE OR REPLACE FUNCTION fn_current_role_slug()
  RETURNS TEXT
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  AS $$ ... $$;
  ```
- **Description**: Both `fn_current_role_slug` and `fn_current_vendor_id` are defined as `SECURITY DEFINER` without setting an explicit `SET search_path = public, pg_temp;`.
- **Impact**: Enables privilege escalation via `search_path` hijacking if schema manipulation is possible.
- **Remediation**: Add `SET search_path = public, pg_temp;` to all PostgreSQL `SECURITY DEFINER` functions.

---

### SEC-10: File-Based Production Persistence (`.data/*.json`)
- **Location**: `.data/` directory
- **Description**: Storing active production orders, financial ledgers, audit logs, and user credentials in local `.json` files is unsafe for multiple concurrent requests (race conditions, file corruption on simultaneous writes, lack of transactional ACID guarantees, and potential disk exposure).
- **Remediation**: Migrate production source of truth to Supabase PostgreSQL with transactions, row locking, and ACID constraints as planned in Phase 2.

---

### SEC-11: Missing Anti-CSRF Protection for Cookie-Based Mutating Endpoints
- **Location**: `app/api/admin/workspace/route.ts`
- **Description**: The workspace API relies on cookies (`bg_admin_session_uid`) with `sameSite: 'lax'`. State-mutating POST operations do not validate an anti-CSRF token or verify origin/referrer headers.
- **Remediation**: Require custom headers (e.g., `x-requested-with` or dedicated CSRF tokens) or verify Origin/Referer headers against the application host for all state-changing requests.

---

### SEC-12: Missing Rate Limiting on Authentication and Financial Submission Endpoints
- **Location**: `/api/admin/auth`, `/api/account/orders`, `/api/payments/manual-bkash/submissions`
- **Description**: None of the public or authentication endpoints enforce request rate limiting or brute-force prevention at the HTTP handler level.
- **Remediation**: Implement IP and identifier-based rate limiting (in-memory sliding window or Redis-backed) to prevent automated credential stuffing and TrxID collision attacks.

---

## 3. P2 — Medium Severity Findings

### SEC-13: Inconsistent Prohibited Payment Channels in Admin UI
- **Location**: `src/components/admin/courier-and-escrow-panel.tsx` (lines 1112, 1808)
- **Description**: The Master Prompt strictly permits only Cash on Delivery (COD) and Manual bKash, prohibiting Nagad/Rocket and other payment gateways. However, the admin payout UI lists `Nagad Merchant (নগদ)` and `nagad_merchant_150bp`.
- **Remediation**: Remove Nagad options from the UI and backend types to enforce strict adherence to the business payment policy.

---

### SEC-14: RedX Courier References Present Without Explicit Approval
- **Location**: `app/api/webhooks/courier/route.ts`, `src/types/database.types.ts`, `src/lib/admin/phase4b-service.ts`
- **Description**: RedX is included in enums and webhook mappings alongside Pathao, Steadfast, and BD Post. Master Prompt states: "অনুমোদন ছাড়া RedX বা অন্য Courier Integration যোগ করবে না।"
- **Remediation**: Keep RedX disabled/quarantined or mark `VERIFY_REQUIRED` until user confirms if RedX should be retained or pruned.

---

### SEC-15: Static Reused Demo TOTP Secret
- **Location**: `src/lib/admin/phase4a-service.ts` (lines 328, 349)
- **Description**: The Base32 secret `'JBSWY3DPEHPK3PXP'` is shared across multiple demo accounts.
- **Remediation**: Generate unique, high-entropy Base32 secrets per user upon enrollment.

---

## 4. P3 — Low Severity Findings

### SEC-16: Next.js Unoptimized Image Tags in Admin Panels
- **Location**: `src/components/admin/courier-and-escrow-panel.tsx` (line 1672), `src/components/admin/product-studio-panel.tsx` (lines 585, 1425)
- **Description**: ESLint warning `@next/next/no-img-element`: `<img>` elements used for proof URLs and product previews instead of `<Image />` or optimized loaders.
- **Remediation**: Replace with standard Next.js `<Image />` with `referrerPolicy="no-referrer"`.

---

### SEC-17: Generic Error Information Disclosure
- **Location**: Error responses in API route handlers
- **Description**: Some handlers may return raw exception messages in development mode.
- **Remediation**: Ensure all production error responses use sanitized, localized user-facing error messages with unique request tracking IDs.
