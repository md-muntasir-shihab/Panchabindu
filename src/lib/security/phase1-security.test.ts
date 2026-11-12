// src/lib/security/phase1-security.test.ts
// Comprehensive Phase 1 Security Hardening Test Suite (Positive & Negative Security Tests)
// Covers Master Repair Prompt Sections 4.1 - 4.8:
//   1. Admin Authentication: No usr-super-admin fallback, signed server-verified session tokens, revocation, scrypt password hashing, zero plaintext in .data/erp-admin-store.json
//   2. Real RFC 6238 TOTP: Unique encrypted secrets per user, static '123456' rejected, TOTP replay blocked, one-time backup codes
//   3. Customer OTP & Session Security: Hardcoded '123456' rejected, SHA-256 OTP hashing, 5-attempt lockout, 60s resend cooldown, authenticated ownership check
//   4. Public Order Tracking Privacy: Sequential ORD-... enumeration rejected, secureTrackingToken required, streetAddress/landmark stripped
//   5. Manual bKash Security: Unverified submissions NEVER increase advancePaidPoisha or reduce codCollectablePoisha, balance limit check, Maker-Checker separation
//   6. Courier Webhook Security: Fail-closed when secret or HMAC signature is missing/invalid, replay deduplication, least-privilege WEBHOOK_SERVICE_CONTEXT

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createAdminSession,
  decryptSecretAtRest,
  encryptSecretAtRest,
  generateRecoveryBackupCodes,
  generateTotpCode,
  generateUniqueTotpSecret,
  hashPassword,
  requestCustomerPhoneOtp,
  resetRateLimitsForTest,
  revokeAdminSession,
  verifyAdminSessionToken,
  verifyCustomerPhoneOtp,
  verifyCustomerSessionToken,
  verifyOriginAndCsrf,
  verifyPassword,
  verifyTotpWithReplayGuard,
} from './crypto-session';
import {
  authenticateAdminUser,
  getActorSecurityContext,
  readAdminStore,
  writeAdminStore,
} from '../admin/phase4a-service';
import {
  computeWebhookHmacSignature,
  processCourierWebhookPayload,
  verifyCourierWebhookHmac,
} from '../admin/phase6-service';
import {
  createStorefrontOrder,
  getPublicOrderTrackingByToken,
  reviewManualBkashSubmission,
  submitManualBkashPayment,
} from '../db/repository';
import {
  checkMakerCheckerSeparation,
  hasModulePermission,
  WEBHOOK_SERVICE_CONTEXT,
} from '../../types/permissions';

test('authenticated admin mutations require the session CSRF token', () => {
  const session = createAdminSession({
    userId: 'csrf-test-user',
    username: 'csrf-test',
    roleSlug: 'super_admin',
  });
  const request = (token?: string) => new Request('http://localhost/api/admin/workspace', {
    method: 'POST',
    headers: { host: 'localhost', origin: 'http://localhost', ...(token ? { 'x-csrf-token': token } : {}) },
  });
  assert.equal(verifyOriginAndCsrf(request(), session.session).ok, false);
  assert.equal(verifyOriginAndCsrf(request('wrong'), session.session).ok, false);
  assert.equal(verifyOriginAndCsrf(request(session.csrfToken), session.session).ok, true);
  revokeAdminSession(session.token);
});

test('production OTP never claims delivery based on an API key alone', () => {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = env.NODE_ENV;
  const previousSmsKey = process.env.SMS_API_KEY;
  try {
    env.NODE_ENV = 'production';
    process.env.SMS_API_KEY = 'synthetic-test-value';
    const result = requestCustomerPhoneOtp('01700000000', { allowSandboxInNonProd: true });
    assert.equal(result.success, false);
    assert.equal(result.deliveryStatus, 'NOT_INTEGRATED');
    assert.equal(result.sandboxOtpCode, undefined);
  } finally {
    if (previousNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = previousNodeEnv;
    if (previousSmsKey === undefined) delete process.env.SMS_API_KEY;
    else process.env.SMS_API_KEY = previousSmsKey;
  }
});

test('Phase 1 Security 4.1 & 4.8: Password Hashing (scrypt), AES-256-GCM Secret Encryption & Zero Plaintext in Store', () => {
  // 1. scrypt password hash & constant-time verification
  const hash = hashPassword('MyStrongPass#2026');
  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(verifyPassword('MyStrongPass#2026', hash), true);
  assert.equal(verifyPassword('WrongPass#2026', hash), false);
  assert.equal(verifyPassword('MyStrongPass#2026', 'invalid-hash'), false);

  // 2. AES-256-GCM encryption at rest
  const rawSecret = generateUniqueTotpSecret();
  const encrypted = encryptSecretAtRest(rawSecret);
  assert.ok(encrypted.startsWith('enc:v1:'));
  assert.equal(encrypted.includes(rawSecret), false);
  assert.equal(decryptSecretAtRest(encrypted), rawSecret);

  // 3. Verify .data/erp-admin-store.json has been migrated and stripped of plaintext passwords/TOTP secrets
  const store = readAdminStore();
  writeAdminStore(store);
  const rawDiskJson = fs.readFileSync(
    path.join(process.cwd(), '.data', 'erp-admin-store.json'),
    'utf-8'
  );
  assert.equal(rawDiskJson.includes('passwordPlainDemo'), false);
  assert.equal(rawDiskJson.includes('totpSecretDemo'), false);
  assert.equal(rawDiskJson.includes('Admin#2026'), false);
  assert.equal(rawDiskJson.includes('NB2HI4DTHIXS6Z3P'), false);
});

test('Phase 1 Security 4.1: Signed Admin Session Registry, Tamper Rejection & Revocation', () => {
  // 1. Missing or unsigned raw userId cookie (e.g. 'usr-super-admin') MUST be rejected!
  assert.equal(verifyAdminSessionToken(undefined), null);
  assert.equal(verifyAdminSessionToken('usr-super-admin'), null);
  assert.equal(verifyAdminSessionToken('usr-super-admin.forgedsig'), null);

  // 2. Create a valid signed admin session
  const session = createAdminSession({
    userId: 'usr-super-admin',
    username: 'admin',
    roleSlug: 'super_admin',
    userAgent: 'Phase1TestAgent',
    ip: '127.0.0.1',
  });
  const verified = verifyAdminSessionToken(session.token);
  assert.ok(verified);
  assert.equal(verified.userId, 'usr-super-admin');
  assert.equal(verified.roleSlug, 'super_admin');

  // 3. Tampered signature is rejected
  const tamperedToken = `${session.token}a`;
  assert.equal(verifyAdminSessionToken(tamperedToken), null);

  // 4. Revoked session is immediately rejected
  revokeAdminSession(session.token);
  assert.equal(verifyAdminSessionToken(session.token), null);
});

test('Phase 1 Security 4.1: Real RFC 6238 TOTP Verification, Static 123456 Rejection, Replay Guard & Backup Codes', () => {
  const secret = generateUniqueTotpSecret();
  const backupCodes = generateRecoveryBackupCodes(4);

  // 1. Static '123456' (unless by 1-in-1,000,000 coincidence) is rejected
  const validCode = generateTotpCode(secret);
  const wrongCode = validCode === '123456' ? '654321' : '123456';
  const wrongCheck = verifyTotpWithReplayGuard({
    base32Secret: secret,
    token: wrongCode,
    lastUsedStep: null,
    backupCodeHashes: backupCodes.codeHashes,
  });
  assert.equal(wrongCheck.valid, false);

  // 2. Valid RFC 6238 TOTP code succeeds and returns matchedStep
  const firstCheck = verifyTotpWithReplayGuard({
    base32Secret: secret,
    token: validCode,
    lastUsedStep: null,
    backupCodeHashes: backupCodes.codeHashes,
  });
  assert.equal(firstCheck.valid, true);
  assert.ok(typeof firstCheck.matchedStep === 'number');

  // 3. Replaying the exact same TOTP code in the same 30-second window is rejected!
  const replayCheck = verifyTotpWithReplayGuard({
    base32Secret: secret,
    token: validCode,
    lastUsedStep: firstCheck.matchedStep ?? null,
    backupCodeHashes: backupCodes.codeHashes,
  });
  assert.equal(replayCheck.valid, false);
  assert.ok(replayCheck.reasonBn?.includes('ইতিমধ্যে ব্যবহৃত'));

  // 4. Recovery backup code works once and is consumed
  const firstBackup = backupCodes.plainCodes[0]!;
  const backupUse1 = verifyTotpWithReplayGuard({
    base32Secret: secret,
    token: firstBackup,
    lastUsedStep: firstCheck.matchedStep ?? null,
    backupCodeHashes: backupCodes.codeHashes,
  });
  assert.equal(backupUse1.valid, true);
  assert.ok(backupUse1.usedBackupCodeHash);

  const remainingHashes = backupCodes.codeHashes.filter(
    (h) => h !== backupUse1.usedBackupCodeHash
  );
  const backupReplay = verifyTotpWithReplayGuard({
    base32Secret: secret,
    token: firstBackup,
    lastUsedStep: firstCheck.matchedStep ?? null,
    backupCodeHashes: remainingHashes,
  });
  assert.equal(backupReplay.valid, false);

  // 5. Reset admin lastUsedTotpStep so subsequent tests can authenticate cleanly
  const store = readAdminStore();
  const adminUser = store.users.find((u) => u.username === 'admin')!;
  adminUser.lastUsedTotpStep = null;
  writeAdminStore(store);

  const badAdminLogin = authenticateAdminUser({
    username: 'admin',
    password: 'Admin#2026',
    totpCode: wrongCode,
  });
  assert.equal(badAdminLogin.success, false);

  // Reset failedLoginAttempts after negative login test
  const storeAfter = readAdminStore();
  const adminUserAfter = storeAfter.users.find((u) => u.username === 'admin')!;
  adminUserAfter.failedLoginAttempts = 0;
  adminUserAfter.lockedUntilIso = null;
  adminUserAfter.lastUsedTotpStep = null;
  writeAdminStore(storeAfter);
});

test('Phase 1 Security 4.2: Customer Phone OTP Hashing, Cooldown, 5-Attempt Lockout & Session Ownership', () => {
  resetRateLimitsForTest();
  const testPhone = `017${String(Date.now()).slice(-8)}`;

  // 1. Verify without requesting OTP fails
  const unrequested = verifyCustomerPhoneOtp(testPhone, '123456');
  assert.equal(unrequested.success, false);

  // 2. Request OTP generates a hashed challenge and reports SANDBOX_TEST_ONLY when SMS gateway is not configured
  const req1 = requestCustomerPhoneOtp(testPhone);
  assert.equal(req1.success, true);
  assert.equal(req1.deliveryStatus, 'SANDBOX_TEST_ONLY');
  assert.ok(req1.sandboxOtpCode);
  assert.notEqual(req1.sandboxOtpCode, '123456');

  // 3. Immediate resend within 60s cooldown is blocked
  const reqCooldown = requestCustomerPhoneOtp(testPhone);
  assert.equal(reqCooldown.success, false);

  // 4. Correct sandbox OTP succeeds and issues a signed customer session token
  const verified = verifyCustomerPhoneOtp(testPhone, req1.sandboxOtpCode!);
  assert.equal(verified.success, true);
  assert.ok(verified.sessionToken);

  const custSession = verifyCustomerSessionToken(verified.sessionToken);
  assert.ok(custSession);
  assert.equal(custSession.phone, testPhone);

  // 5. Test 5-attempt lockout on another phone
  const lockoutPhone = `018${String(Date.now() + 99).slice(-8)}`;
  const reqLock = requestCustomerPhoneOtp(lockoutPhone);
  assert.equal(reqLock.success, true);
  const wrongOtp = reqLock.sandboxOtpCode === '000000' ? '999999' : '000000';
  for (let i = 0; i < 5; i++) {
    const attempt = verifyCustomerPhoneOtp(lockoutPhone, wrongOtp);
    assert.equal(attempt.success, false);
  }
  // Even with the real OTP after 5 failed attempts, challenge is locked out!
  const afterLockout = verifyCustomerPhoneOtp(
    lockoutPhone,
    reqLock.sandboxOtpCode!
  );
  assert.equal(afterLockout.success, false);
});

test('Phase 1 Security 4.5: Public Order Tracking Rejects Sequential orderNo & Strips Street Address PII', () => {
  // 1. Sequential orderNo lookup on public endpoint is FORBIDDEN (blocks PII harvesting)
  const seqAttempt = getPublicOrderTrackingByToken('ORD-261106-0001');
  assert.equal(seqAttempt.allowed, false);
  assert.equal(seqAttempt.code, 'SEQUENTIAL_ORDER_NO_FORBIDDEN');

  // 2. Create a storefront order and verify it receives a cryptographically random secureTrackingToken
  const created = createStorefrontOrder({
    idempotencyKey: `p1-trk-test-${Date.now()}`,
    customerName: 'নুসরাত জাহান',
    customerPhone: '01911223344',
    districtId: 47,
    upazilaId: 365,
    streetAddress: 'বাসা ৯৯, রোড ১১, বনানী',
    landmark: 'চেয়ারম্যান বাড়ি মোড়',
    source: 'storefront',
    deliveryMethod: 'courier',
    paymentMethod: 'cod',
    advancePaidPoisha: 0,
    customerNote: '',
    internalStaffNote: '',
    items: [
      {
        productId: '00000000-0000-4000-8000-000000000101',
        variantId: '00000000-0000-4000-8000-000000000201',
        quantity: 1,
      },
    ],
  });
  assert.equal(created.success, true);
  assert.ok(created.order?.secureTrackingToken?.startsWith('trk_'));

  // 3. Lookup by secureTrackingToken succeeds and NEVER leaks streetAddress, landmark, or unmasked phone
  const pubTrack = getPublicOrderTrackingByToken(
    created.order!.secureTrackingToken
  );
  assert.equal(pubTrack.allowed, true);
  assert.ok(pubTrack.order);
  const rawJson = JSON.stringify(pubTrack.order);
  assert.equal(rawJson.includes('বাসা ৯৯'), false);
  assert.equal(rawJson.includes('চেয়ারম্যান বাড়ি'), false);
  assert.equal(rawJson.includes('01911223344'), false);
  assert.equal(pubTrack.order.customerPhoneMasked.includes('****'), true);
});

test('Phase 1 Security 4.3 & 4.7: Manual bKash Financial Safety, Over-Balance Guard & Maker-Checker Separation', () => {
  // 1. Create a storefront order with manual bKash submission -> advancePaidPoisha MUST stay 0 until verified!
  const orderRes = createStorefrontOrder({
    idempotencyKey: `p1-bkash-order-${Date.now()}`,
    customerName: 'কামরুল হাসান',
    customerPhone: '01755667788',
    districtId: 47,
    upazilaId: 365,
    streetAddress: 'বাড়ি ১২, মিরপুর ১০',
    landmark: 'গোল চত্বর',
    source: 'storefront',
    deliveryMethod: 'courier',
    paymentMethod: 'bkash_manual',
    manualPaymentTrxId: `TRX${Date.now().toString().slice(-7)}`,
    advancePaidPoisha: 50000, // Even if client claims 500 BDT advance, unverified order must start at 0 verified advance!
    customerNote: '',
    internalStaffNote: '',
    items: [
      {
        productId: '00000000-0000-4000-8000-000000000101',
        variantId: '00000000-0000-4000-8000-000000000201',
        quantity: 1,
      },
    ],
  });
  assert.equal(orderRes.success, true);

  // 2. Submit a manual bKash TrxID exceeding totalPayablePoisha -> rejected!
  const overPay = submitManualBkashPayment({
    orderNo: orderRes.order!.orderNo,
    senderPhone: '01755667788',
    trxId: `OVER${Date.now().toString().slice(-6)}`,
    submittedAmountPoisha: orderRes.order!.totalPayablePoisha + 10000,
    idempotencyKey: `idem-over-${Date.now()}`,
  });
  assert.equal(overPay.success, false);
  assert.equal(overPay.code, 'INVALID_AMOUNT');

  // 3. Submit a valid manual bKash TrxID -> stays pending_verification and does NOT reduce codCollectablePoisha yet
  const validTrx = `BK${Date.now().toString().slice(-8)}`;
  const subRes = submitManualBkashPayment({
    orderNo: orderRes.order!.orderNo,
    senderPhone: '01755667788',
    trxId: validTrx,
    submittedAmountPoisha: 10000,
    idempotencyKey: `idem-valid-${Date.now()}`,
  });
  assert.equal(subRes.success, true);
  assert.equal(subRes.submission?.verificationStatus, 'pending_verification');
  assert.equal(subRes.submission?.senderPhoneMatchesOrderPhone, true);

  const trackBeforeApprove = getPublicOrderTrackingByToken(
    orderRes.order!.secureTrackingToken
  );
  assert.equal(trackBeforeApprove.order?.advancePaidPoisha, 0);
  assert.equal(
    trackBeforeApprove.order?.codCollectablePoisha,
    orderRes.order!.totalPayablePoisha
  );

  // 4. Duplicate TrxID submission with a different idempotencyKey is rejected
  const dupSub = submitManualBkashPayment({
    orderNo: orderRes.order!.orderNo,
    senderPhone: '01755667788',
    trxId: validTrx,
    submittedAmountPoisha: 10000,
    idempotencyKey: `idem-dup-${Date.now()}`,
  });
  assert.equal(dupSub.success, false);
  assert.equal(dupSub.code, 'DUPLICATE_TRX_ID');

  // 5. Authorized Reviewer approves submission -> NOW advancePaidPoisha increases and codCollectablePoisha decreases
  const adminCtx = getActorSecurityContext('usr-super-admin')!;
  const approveRes = reviewManualBkashSubmission(adminCtx, {
    orderNo: orderRes.order!.orderNo,
    trxId: validTrx,
    decision: 'approved',
  });
  assert.equal(approveRes.success, true);

  const trackAfterApprove = getPublicOrderTrackingByToken(
    orderRes.order!.secureTrackingToken
  );
  assert.equal(trackAfterApprove.order?.advancePaidPoisha, 10000);
  assert.equal(
    trackAfterApprove.order?.codCollectablePoisha,
    orderRes.order!.totalPayablePoisha - 10000
  );

  // 6. Maker-Checker enforcement on Vendor Payouts & RBAC module checks
  const mktCtx = getActorSecurityContext('usr-marketing-01')!;
  const vendorCtx = getActorSecurityContext('usr-vendor-001')!;
  assert.equal(hasModulePermission(vendorCtx, 'finance', 'read'), false);
  assert.equal(hasModulePermission(mktCtx, 'users_security', 'update'), false);

  const mcSelfBlocked = checkMakerCheckerSeparation({
    makerUsername: 'marketing_lead',
    checkerCtx: mktCtx,
  });
  assert.equal(mcSelfBlocked.allowed, false);
});

test('Phase 1 Security 4.6: Courier Webhook Fail-Closed HMAC Verification & Replay Deduplication', () => {
  const sampleBody = JSON.stringify({
    provider: 'steadfast',
    orderNo: 'ORD-261106-0001',
    rawStatus: 'in_transit',
  });

  // 1. Missing webhook secret MUST fail closed!
  const noSecretCheck = verifyCourierWebhookHmac({
    rawPayload: sampleBody,
    signatureHeader: 'any-sig',
    secret: undefined,
  });
  assert.equal(noSecretCheck.valid, false);
  assert.equal(noSecretCheck.code, 'MISSING_SECRET');

  // 2. Missing signature header MUST fail closed!
  const noSigCheck = verifyCourierWebhookHmac({
    rawPayload: sampleBody,
    signatureHeader: '',
    secret: 'whsec_test_secret_2026',
  });
  assert.equal(noSigCheck.valid, false);
  assert.equal(noSigCheck.code, 'MISSING_SIGNATURE');

  // 3. Invalid signature MUST fail closed!
  const badSigCheck = verifyCourierWebhookHmac({
    rawPayload: sampleBody,
    signatureHeader: '0000000000000000000000000000000000000000000000000000000000000000',
    secret: 'whsec_test_secret_2026',
  });
  assert.equal(badSigCheck.valid, false);
  assert.equal(badSigCheck.code, 'INVALID_SIGNATURE');

  // 4. Valid HMAC signature with fresh timestamp succeeds
  const validSig = computeWebhookHmacSignature(
    sampleBody,
    'whsec_test_secret_2026'
  );
  const validCheck = verifyCourierWebhookHmac({
    rawPayload: sampleBody,
    signatureHeader: validSig,
    secret: 'whsec_test_secret_2026',
    timestampHeader: String(Date.now()),
  });
  assert.equal(validCheck.valid, true);

  // 5. Expired timestamp outside 5-minute window is rejected
  const staleCheck = verifyCourierWebhookHmac({
    rawPayload: sampleBody,
    signatureHeader: validSig,
    secret: 'whsec_test_secret_2026',
    timestampHeader: String(Date.now() - 10 * 60 * 1000),
  });
  assert.equal(staleCheck.valid, false);
  assert.equal(staleCheck.code, 'TIMESTAMP_EXPIRED');

  // 6. Webhook replay deduplication blocks duplicate eventId when enforceReplayDeduplication = true
  const uniqueEventId = `evt-p1-${Date.now()}`;
  const firstEvent = processCourierWebhookPayload(WEBHOOK_SERVICE_CONTEXT, {
    provider: 'steadfast',
    orderNo: 'ORD-261106-0001',
    rawStatus: 'in_transit',
    eventId: uniqueEventId,
    signatureHeader: validSig,
    enforceReplayDeduplication: true,
  });
  assert.equal(firstEvent.success, true);

  const replayEvent = processCourierWebhookPayload(WEBHOOK_SERVICE_CONTEXT, {
    provider: 'steadfast',
    orderNo: 'ORD-261106-0001',
    rawStatus: 'in_transit',
    eventId: uniqueEventId,
    signatureHeader: validSig,
    enforceReplayDeduplication: true,
  });
  assert.equal(replayEvent.success, false);
  assert.equal(replayEvent.code, 'DUPLICATE_EVENT');
});
