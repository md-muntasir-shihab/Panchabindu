// src/lib/security/crypto-session.ts
// Phase 1 Security Hardening:
//   - Password Hashing & Verification (node:crypto scrypt + timingSafeEqual)
//   - AES-256-GCM Secret Encryption at Rest (TOTP secrets & API credentials)
//   - Real RFC 6238 TOTP Verification (otpauth) with Replay Guard & Hashed Backup Codes
//   - Server-Verified Cryptographic Admin Sessions (HMAC-SHA256 + Session Registry + Rotation/Revocation)
//   - Customer Phone OTP Challenge (Hashed OTP, 5-min TTL, 5-attempt lockout, 60s cooldown) & Customer Sessions
//   - Sliding-Window Rate Limiter, CSRF/Origin Guard & Payload Size Validator

import crypto from 'node:crypto';
import path from 'node:path';
import { readLocalJsonStore, writeLocalJsonStore } from '../db/local-json-store';
import { hasDurableRuntimeContext } from '../db/runtime-persistence';
import * as OTPAuth from 'otpauth';
import type { SystemRoleSlug } from '../../types/permissions';

// ============================================================================
// 1. KEY MANAGEMENT & AES-256-GCM ENCRYPTION AT REST
// ============================================================================

function getMasterSecretBytes(purpose: string): Buffer {
  const rawEnvKey = process.env.CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!rawEnvKey || rawEnvKey.length < 32 || /^0+$/.test(rawEnvKey) || /placeholder|replace|your-/i.test(rawEnvKey)) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'CRITICAL SECURITY ERROR: CREDENTIALS_ENCRYPTION_KEY environment variable is required in production.'
      );
    }
    throw new Error('CREDENTIALS_ENCRYPTION_KEY is required for local identity too.');
  }
  return crypto
    .createHmac('sha256', rawEnvKey)
    .update(`panchagarh-kdf-v1:${purpose}`)
    .digest();
}

/**
 * Encrypts sensitive secret strings (e.g. Base32 TOTP secret) using AES-256-GCM.
 * Output format: `enc:v1:<ivHex>:<authTagHex>:<ciphertextHex>`
 */
export function encryptSecretAtRest(plaintext: string): string {
  if (!plaintext) return '';
  if (plaintext.startsWith('enc:v1:')) return plaintext;
  const key = getMasterSecretBytes('aes-256-gcm-at-rest');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an `enc:v1:...` payload encrypted by `encryptSecretAtRest`.
 */
export function decryptSecretAtRest(encryptedPayload: string): string {
  if (!encryptedPayload) return '';
  if (!encryptedPayload.startsWith('enc:v1:')) {
    // Legacy migration support if called before store migration finishes
    return encryptedPayload;
  }
  const parts = encryptedPayload.split(':');
  if (parts.length !== 5) {
    throw new Error('Invalid encrypted secret format.');
  }
  const [, , ivHex, authTagHex, cipherHex] = parts;
  const key = getMasterSecretBytes('aes-256-gcm-at-rest');
  const iv = Buffer.from(ivHex!, 'hex');
  const authTag = Buffer.from(authTagHex!, 'hex');
  const ciphertext = Buffer.from(cipherHex!, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

// ============================================================================
// 2. PASSWORD HASHING & VERIFICATION (node:crypto scrypt + timingSafeEqual)
// ============================================================================

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;

/**
 * Hashes a plaintext password using salted node:crypto scrypt.
 * Format: `scrypt$16384$8$1$<saltHex>$<derivedHex>`
 */
export function hashPassword(plainPassword: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(plainPassword, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored `scrypt$...` hash in constant time.
 */
export function verifyPassword(
  plainPassword: string,
  storedHash: string | undefined | null
): boolean {
  if (!plainPassword || !storedHash || !storedHash.startsWith('scrypt$')) {
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 6) return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltHex = parts[4];
  const expectedHex = parts[5];
  if (!saltHex || !expectedHex || !Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    const actualBuf = crypto.scryptSync(plainPassword, salt, expectedBuf.length, {
      N: n,
      r,
      p,
    });
    if (actualBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(actualBuf, expectedBuf);
  } catch {
    return false;
  }
}

// ============================================================================
// 3. RFC 6238 TOTP (otpauth) WITH REPLAY PROTECTION & BACKUP CODES
// ============================================================================

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;

/**
 * Generates a unique cryptographically random 160-bit Base32 TOTP secret.
 */
export function generateUniqueTotpSecret(): string {
  const secret = new OTPAuth.Secret({ size: 20 });
  return secret.base32;
}

/**
 * Generates a deterministic but unique Base32 secret per seeded user ID so each
 * seeded account has its own distinct TOTP secret (never shared across users).
 */
export function deriveSeededUserTotpSecret(userId: string): string {
  const digest = crypto
    .createHmac('sha256', 'panchagarh-totp-seed-v1')
    .update(userId)
    .digest()
    .subarray(0, 20);
  const secret = new OTPAuth.Secret({ buffer: digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength) });
  return secret.base32;
}

export function buildTotpSetupUri(
  username: string,
  base32Secret: string,
  issuer = 'PanchabinduERP'
): string {
  const totp = new OTPAuth.TOTP({
    issuer,
    label: username,
    algorithm: 'SHA1',
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
  });
  return totp.toString();
}

/**
 * Generates the current valid 6-digit RFC 6238 TOTP code for a Base32 secret.
 */
export function generateTotpCode(
  base32Secret: string,
  timestampMs: number = Date.now()
): string {
  const totp = new OTPAuth.TOTP({
    issuer: 'PanchabinduERP',
    algorithm: 'SHA1',
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
  });
  return totp.generate({ timestamp: timestampMs });
}

export function hashBackupCode(rawCode: string): string {
  const normalized = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto
    .createHmac('sha256', getMasterSecretBytes('backup-code-hash'))
    .update(normalized)
    .digest('hex');
}

export function generateRecoveryBackupCodes(count = 6): {
  plainCodes: string[];
  codeHashes: string[];
} {
  const plainCodes: string[] = [];
  const codeHashes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    plainCodes.push(formatted);
    codeHashes.push(hashBackupCode(formatted));
  }
  return { plainCodes, codeHashes };
}

/**
 * Verifies a 6-digit RFC 6238 TOTP code or an 8-char recovery backup code.
 * Enforces strict replay protection via `lastUsedStep`.
 */
export function verifyTotpWithReplayGuard(params: {
  base32Secret: string;
  token: string;
  lastUsedStep?: number | null;
  backupCodeHashes?: string[];
  timestampMs?: number;
}): {
  valid: boolean;
  matchedStep?: number;
  usedBackupCodeHash?: string;
  reasonBn?: string;
} {
  const rawToken = (params.token ?? '').trim();
  if (!rawToken) {
    return {
      valid: false,
      reasonBn: '৬ সংখ্যার Google Authenticator TOTP কোড আবশ্যক।',
    };
  }

  // Check if token is a recovery backup code (e.g. ABCD-1234 or 8 hex chars)
  const normalizedAlnum = rawToken.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (
    normalizedAlnum.length === 8 &&
    params.backupCodeHashes &&
    params.backupCodeHashes.length > 0
  ) {
    const candidateHash = hashBackupCode(normalizedAlnum);
    const matched = params.backupCodeHashes.find((h) => {
      try {
        return crypto.timingSafeEqual(
          Buffer.from(h, 'hex'),
          Buffer.from(candidateHash, 'hex')
        );
      } catch {
        return false;
      }
    });
    if (matched) {
      return {
        valid: true,
        usedBackupCodeHash: matched,
      };
    }
  }

  if (!/^\d{6}$/.test(rawToken)) {
    return {
      valid: false,
      reasonBn: 'সঠিক ৬ সংখ্যার সংখ্যাসূচক TOTP কোড দিন।',
    };
  }

  const nowMs = params.timestampMs ?? Date.now();
  try {
    const totp = new OTPAuth.TOTP({
      issuer: 'PanchabinduERP',
      algorithm: 'SHA1',
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD_SECONDS,
      secret: OTPAuth.Secret.fromBase32(params.base32Secret),
    });

    const delta = totp.validate({
      token: rawToken,
      timestamp: nowMs,
      window: 1,
    });

    if (delta === null) {
      return {
        valid: false,
        reasonBn: 'Google Authenticator TOTP ৬ সংখ্যার কোডটি সঠিক নয় বা মেয়াদোত্তীর্ণ।',
      };
    }

    const currentStep = Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS) + delta;
    if (
      params.lastUsedStep !== undefined &&
      params.lastUsedStep !== null &&
      currentStep <= params.lastUsedStep
    ) {
      return {
        valid: false,
        reasonBn:
          'এই TOTP কোডটি ইতিমধ্যে ব্যবহৃত হয়েছে (Replay Blocked)। অনুগ্রহ করে পরবর্তী ৩০ সেকেন্ডের নতুন কোড দিন।',
      };
    }

    return {
      valid: true,
      matchedStep: currentStep,
    };
  } catch {
    return {
      valid: false,
      reasonBn: 'TOTP যাচাইকরণে ত্রুটি ঘটেছে।',
    };
  }
}

// ============================================================================
// 4. SERVER-VERIFIED CRYPTOGRAPHIC ADMIN SESSION REGISTRY
// ============================================================================

export const ADMIN_SESSION_COOKIE_NAME = 'bg_admin_session';
export const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export interface AdminSessionRecord {
  purpose?: 'workspace' | 'enrollment';
  sessionId: string;
  userId: string;
  username: string;
  roleSlug: SystemRoleSlug;
  csrfToken: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  ip?: string;
  userAgent?: string;
}

interface PersistedSessionStore {
  rateLimits?: Record<string, { timestamps: number[] }>;
  customerPrincipals: CustomerPrincipal[];
  adminSessions: AdminSessionRecord[];
  customerSessions: CustomerSessionRecord[];
  customerOtpChallenges: Record<string, CustomerOtpChallengeRecord>;
}

const SESSION_STORE_PATH = path.join(
  process.cwd(),
  '.data',
  'erp-security-sessions.json'
);

function readSessionStore(): PersistedSessionStore {
  try {
    const parsed = readLocalJsonStore<PersistedSessionStore>(SESSION_STORE_PATH, {
      arrays: ['customerPrincipals', 'adminSessions', 'customerSessions'],
      objects: ['customerOtpChallenges'],
    });
    if (parsed) {
      return {
        rateLimits: parsed.rateLimits ?? {},
        customerPrincipals: Array.isArray(parsed.customerPrincipals) ? parsed.customerPrincipals : [],
        adminSessions: Array.isArray(parsed.adminSessions)
          ? parsed.adminSessions
          : [],
        customerSessions: Array.isArray(parsed.customerSessions)
          ? parsed.customerSessions
          : [],
        customerOtpChallenges:
          parsed.customerOtpChallenges &&
          typeof parsed.customerOtpChallenges === 'object'
            ? parsed.customerOtpChallenges
            : {},
      };
    }
  } catch {
    throw new Error('Security session store is unavailable.');
  }
  return {
    customerPrincipals: [],
    adminSessions: [],
    customerSessions: [],
    customerOtpChallenges: {},
  };
}

function writeSessionStore(store: PersistedSessionStore): void {
  try {
    const nowIso = new Date().toISOString();
    // Prune expired sessions older than 24h to keep file small
    store.adminSessions = store.adminSessions
      .filter((s) => s.expiresAt > nowIso && !s.revokedAt)
      .slice(0, 500);
    store.customerSessions = store.customerSessions
      .filter((s) => s.expiresAt > nowIso && !s.revokedAt)
      .slice(0, 1000);
    writeLocalJsonStore(SESSION_STORE_PATH, store);
  } catch {
    throw new Error('Security session persistence failed.');
  }
}

function signSessionId(sessionId: string, domain: 'admin' | 'customer'): string {
  const mac = crypto
    .createHmac('sha256', getMasterSecretBytes(`session-hmac:${domain}`))
    .update(sessionId)
    .digest('hex');
  return `${sessionId}.${mac}`;
}

function verifySignedSessionId(
  token: string | undefined | null,
  domain: 'admin' | 'customer'
): string | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 2) return null;
  const [sessionId, signatureHex] = parts;
  if (
    !sessionId ||
    !signatureHex ||
    !/^[a-f0-9]{48,64}$/i.test(sessionId) ||
    !/^[a-f0-9]{64}$/i.test(signatureHex)
  ) {
    return null;
  }
  const expectedToken = signSessionId(sessionId, domain);
  const expectedSigHex = expectedToken.split('.')[1]!;
  try {
    const a = Buffer.from(signatureHex, 'hex');
    const b = Buffer.from(expectedSigHex, 'hex');
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
    return sessionId;
  } catch {
    return null;
  }
}

/**
 * Creates a new cryptographically signed & server-registered Admin session.
 * Rotates/revokes any previous session token if provided.
 */
export function createAdminSession(params: {
  purpose?: 'workspace' | 'enrollment';
  userId: string;
  username: string;
  roleSlug: SystemRoleSlug;
  previousToken?: string | null;
  ip?: string;
  userAgent?: string;
}): {
  token: string;
  csrfToken: string;
  session: AdminSessionRecord;
} {
  const store = readSessionStore();
  if (params.previousToken) {
    const prevId = verifySignedSessionId(params.previousToken, 'admin');
    if (prevId) {
      for (const s of store.adminSessions) {
        if (s.sessionId === prevId) {
          s.revokedAt = new Date().toISOString();
        }
      }
    }
  }

  const sessionId = crypto.randomBytes(24).toString('hex');
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const session: AdminSessionRecord = {
    purpose: params.purpose ?? 'workspace',
    sessionId,
    userId: params.userId,
    username: params.username,
    roleSlug: params.roleSlug,
    csrfToken,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (params.purpose === 'enrollment' ? 10 * 60 * 1000 : ADMIN_SESSION_TTL_MS)).toISOString(),
    revokedAt: null,
    ip: params.ip,
    userAgent: params.userAgent,
  };

  store.adminSessions.unshift(session);
  writeSessionStore(store);

  return {
    token: signSessionId(sessionId, 'admin'),
    csrfToken,
    session,
  };
}

/**
 * Verifies an Admin session cookie token against HMAC signature, server session registry,
 * expiration timestamp, and revocation status. Never falls back to any default user.
 */
export function verifyAdminSessionToken(
  token: string | undefined | null
): AdminSessionRecord | null {
  if (process.env.NODE_ENV === 'production' && !hasDurableRuntimeContext()) return null;
  const sessionId = verifySignedSessionId(token, 'admin');
  if (!sessionId) return null;

  const store = readSessionStore();
  const nowIso = new Date().toISOString();
  const found = store.adminSessions.find((s) => s.sessionId === sessionId);
  if (!found) return null;
  if (found.revokedAt) return null;
  if (!Number.isFinite(Date.parse(found.expiresAt)) || found.expiresAt <= nowIso) return null;

  return found;
}

export function revokeAdminSession(tokenOrSessionId: string | undefined | null): void {
  if (!tokenOrSessionId) return;
  const sessionId =
    verifySignedSessionId(tokenOrSessionId, 'admin') ?? tokenOrSessionId;
  const store = readSessionStore();
  let changed = false;
  const nowIso = new Date().toISOString();
  for (const s of store.adminSessions) {
    if (s.sessionId === sessionId && !s.revokedAt) {
      s.revokedAt = nowIso;
      changed = true;
    }
  }
  if (changed) {
    writeSessionStore(store);
  }
}

export function revokeAllUserSessions(userId: string): void {
  if (!userId) return;
  const store = readSessionStore();
  let changed = false;
  const nowIso = new Date().toISOString();
  for (const s of store.adminSessions) {
    if (s.userId === userId && !s.revokedAt) {
      s.revokedAt = nowIso;
      changed = true;
    }
  }
  if (changed) {
    writeSessionStore(store);
  }
}

// ============================================================================
// 5. CUSTOMER PHONE OTP CHALLENGE & CUSTOMER SESSION MANAGEMENT
// ============================================================================

export const CUSTOMER_SESSION_COOKIE_NAME = 'bg_customer_session';
export const CUSTOMER_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const CUSTOMER_OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const CUSTOMER_OTP_MAX_ATTEMPTS = 5;
export const CUSTOMER_OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

export interface CustomerOtpChallengeRecord {
  deliveryStatus?: 'SANDBOX_TEST_ONLY' | 'SENT_LIVE_SMS';
  phone: string;
  otpHash: string;
  saltHex: string;
  createdAtMs: number;
  expiresAtMs: number;
  attempts: number;
  lockedUntilMs: number | null;
}

export interface CustomerPrincipal {
  customerId: string;
  phone: string;
  phoneConfirmationStatus: 'SANDBOX_TEST_ONLY' | 'VERIFIED';
  isActive: boolean;
}

export interface CustomerSessionRecord {
  sessionId: string;
  customerId: string;
  phone: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export function isSmsOtpProviderConfigured(): boolean {
  // A key alone is not an implemented SMS delivery adapter.
  return false;
}

function hashCustomerOtp(otpCode: string, saltHex: string): string {
  return crypto
    .createHmac('sha256', getMasterSecretBytes('customer-otp'))
    .update(`${saltHex}:${otpCode.trim()}`)
    .digest('hex');
}

export function requestCustomerPhoneOtp(
  normalizedPhone: string,
  options?: { allowSandboxInNonProd?: boolean; nowMs?: number }
): {
  success: boolean;
  errorBn?: string;
  deliveryStatus: 'SENT_LIVE_SMS' | 'SANDBOX_TEST_ONLY' | 'NOT_INTEGRATED';
  sandboxOtpCode?: string;
  expiresInSeconds?: number;
  retryAfterSeconds?: number;
} {
  if (process.env.NODE_ENV === 'production' && !isSmsOtpProviderConfigured()) return {
    success: false, deliveryStatus: 'NOT_INTEGRATED', expiresInSeconds: 0, retryAfterSeconds: 0,
    errorBn: 'ফোন নিশ্চিতকরণ সার্ভিস উপলব্ধ নয় (NOT_INTEGRATED)।',
  };
  const nowMs = options?.allowSandboxInNonProd !== undefined && options.nowMs
    ? options.nowMs
    : Date.now();
  const store = readSessionStore();
  const existing = store.customerOtpChallenges[normalizedPhone];

  if (existing) {
    if (existing.lockedUntilMs && existing.lockedUntilMs > nowMs) {
      const waitSec = Math.ceil((existing.lockedUntilMs - nowMs) / 1000);
      return {
        success: false,
        deliveryStatus: isSmsOtpProviderConfigured()
          ? 'SENT_LIVE_SMS'
          : 'NOT_INTEGRATED',
        retryAfterSeconds: waitSec,
        errorBn: `অতিরিক্ত ভুল ওটিপি চেষ্টার কারণে এই নম্বরটি সাময়িকভাবে লক করা হয়েছে। ${waitSec} সেকেন্ড পর আবার চেষ্টা করুন।`,
      };
    }

    const elapsedMs = nowMs - existing.createdAtMs;
    if (elapsedMs < CUSTOMER_OTP_RESEND_COOLDOWN_MS) {
      const retryAfterSeconds = Math.ceil(
        (CUSTOMER_OTP_RESEND_COOLDOWN_MS - elapsedMs) / 1000
      );
      return {
        success: false,
        deliveryStatus: isSmsOtpProviderConfigured()
          ? 'SENT_LIVE_SMS'
          : 'NOT_INTEGRATED',
        retryAfterSeconds,
        errorBn: `নতুন ওটিপি কোডের জন্য অনুগ্রহ করে ${retryAfterSeconds} সেকেন্ড অপেক্ষা করুন।`,
      };
    }
  }

  const providerConfigured = isSmsOtpProviderConfigured();
  const allowSandbox =
    process.env.NODE_ENV !== 'production' &&
    (process.env.NODE_ENV === 'test' || process.env.PANCHABINDU_ENABLE_SANDBOX_AUTH === '1') &&
    (options?.allowSandboxInNonProd ?? true);

  if (!providerConfigured && !allowSandbox) {
    return {
      success: false,
      deliveryStatus: 'NOT_INTEGRATED',
      errorBn:
        'এসএমএস ওটিপি সার্ভিস এই মুহূর্তে কনফিগার করা নেই (NOT_INTEGRATED)। অর্ডার ট্র্যাক করতে আপনার সিকিউর ট্র্যাকিং লিংক ব্যবহার করুন।',
    };
  }

  // Generate a cryptographically random 6-digit OTP (avoid '123456' to ensure static demo code never matches)
  let otpNumber = crypto.randomInt(100000, 999999);
  if (otpNumber === 123456) {
    otpNumber = 654321;
  }
  const otpCode = String(otpNumber);
  const saltHex = crypto.randomBytes(16).toString('hex');
  const otpHash = hashCustomerOtp(otpCode, saltHex);

  store.customerOtpChallenges[normalizedPhone] = {
    deliveryStatus: providerConfigured ? 'SENT_LIVE_SMS' : 'SANDBOX_TEST_ONLY',
    phone: normalizedPhone,
    otpHash,
    saltHex,
    createdAtMs: nowMs,
    expiresAtMs: nowMs + CUSTOMER_OTP_TTL_MS,
    attempts: 0,
    lockedUntilMs: null,
  };
  writeSessionStore(store);

  return {
    success: true,
    deliveryStatus: providerConfigured ? 'SENT_LIVE_SMS' : 'SANDBOX_TEST_ONLY',
    sandboxOtpCode: providerConfigured ? undefined : otpCode,
    expiresInSeconds: Math.floor(CUSTOMER_OTP_TTL_MS / 1000),
  };
}

export function verifyCustomerPhoneOtp(
  normalizedPhone: string,
  submittedOtp: string,
  nowMs: number = Date.now()
): {
  success: boolean;
  errorBn?: string;
  sessionToken?: string;
  session?: CustomerSessionRecord;
} {
  if (process.env.NODE_ENV === 'production' && !hasDurableRuntimeContext()) return {
    success: false, errorBn: 'ফোন নিশ্চিতকরণ সার্ভিস উপলব্ধ নয় (NOT_INTEGRATED)।',
  };
  const cleanOtp = (submittedOtp ?? '').trim();
  if (!/^\d{6}$/.test(cleanOtp)) {
    return {
      success: false,
      errorBn: 'সঠিক ৬ সংখ্যার ওটিপি (OTP) কোড দিন।',
    };
  }

  const store = readSessionStore();
  const challenge = store.customerOtpChallenges[normalizedPhone];

  if (process.env.NODE_ENV === 'production' && challenge?.deliveryStatus !== 'SENT_LIVE_SMS') {
    return { success: false, errorBn: 'ফোন নিশ্চিতকরণ সার্ভিস উপলব্ধ নয় (NOT_INTEGRATED)।' };
  }

  if (!challenge) {
    return {
      success: false,
      errorBn:
        'কোনো সক্রিয় ওটিপি অনুরোধ পাওয়া যায়নি। আগে "ওটিপি পাঠান" বাটনে ক্লিক করে নতুন কোড নিন।',
    };
  }

  if (challenge.lockedUntilMs && challenge.lockedUntilMs > nowMs) {
    const waitSec = Math.ceil((challenge.lockedUntilMs - nowMs) / 1000);
    return {
      success: false,
      errorBn: `অতিরিক্ত ভুল চেষ্টার কারণে ওটিপি যাচাই লক করা হয়েছে (${waitSec} সেকেন্ড পর চেষ্টা করুন)।`,
    };
  }

  if (nowMs > challenge.expiresAtMs) {
    delete store.customerOtpChallenges[normalizedPhone];
    writeSessionStore(store);
    return {
      success: false,
      errorBn: 'ওটিপি কোডের মেয়াদ (৫ মিনিট) শেষ হয়ে গেছে। অনুগ্রহ করে নতুন ওটিপি নিন।',
    };
  }

  const candidateHash = hashCustomerOtp(cleanOtp, challenge.saltHex);
  let matched = false;
  try {
    matched = crypto.timingSafeEqual(
      Buffer.from(challenge.otpHash, 'hex'),
      Buffer.from(candidateHash, 'hex')
    );
  } catch {
    matched = false;
  }

  if (!matched) {
    challenge.attempts += 1;
    if (challenge.attempts >= CUSTOMER_OTP_MAX_ATTEMPTS) {
      challenge.lockedUntilMs = nowMs + 15 * 60 * 1000; // 15 min lockout
      writeSessionStore(store);
      return {
        success: false,
        errorBn:
          '৫ বার ভুল ওটিপি দেওয়ার কারণে নিরাপত্তা লক চালু হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।',
      };
    }
    writeSessionStore(store);
    return {
      success: false,
      errorBn: `ওটিপি কোড সঠিক নয় (${challenge.attempts}/${CUSTOMER_OTP_MAX_ATTEMPTS} চেষ্টা)।`,
    };
  }

  // OTP verified! Consume challenge so it cannot be replayed
  delete store.customerOtpChallenges[normalizedPhone];

  const proof = challenge.deliveryStatus === 'SENT_LIVE_SMS' ? 'VERIFIED' : 'SANDBOX_TEST_ONLY';
  let principal = store.customerPrincipals.find((p) => p.phone === normalizedPhone && p.phoneConfirmationStatus === proof);
  if (principal && !principal.isActive) return { success: false, errorBn: 'অ্যাকাউন্ট নিষ্ক্রিয়।' };
  if (!principal) {
    principal = { customerId: crypto.randomUUID(), phone: normalizedPhone, phoneConfirmationStatus: proof, isActive: true };
    store.customerPrincipals.push(principal);
  }
  // Rotate previous sessions for this principal when a fresh OTP is consumed.
  for (const previous of store.customerSessions) {
    if (previous.customerId === principal.customerId) previous.revokedAt = new Date(nowMs).toISOString();
  }
  const sessionId = crypto.randomBytes(24).toString('hex');
  const session: CustomerSessionRecord = {
    sessionId,
    customerId: principal.customerId,
    phone: normalizedPhone,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + CUSTOMER_SESSION_TTL_MS).toISOString(),
    revokedAt: null,
  };

  store.customerSessions.unshift(session);
  writeSessionStore(store);

  return {
    success: true,
    sessionToken: signSessionId(sessionId, 'customer'),
    session,
  };
}

export function verifyCustomerSessionToken(
  token: string | undefined | null
): CustomerSessionRecord | null {
  if (process.env.NODE_ENV === 'production' && !hasDurableRuntimeContext()) return null;
  const sessionId = verifySignedSessionId(token, 'customer');
  if (!sessionId) return null;

  const store = readSessionStore();
  const nowIso = new Date().toISOString();
  const found = store.customerSessions.find((s) => s.sessionId === sessionId);
  if (!found || found.revokedAt || !Number.isFinite(Date.parse(found.expiresAt)) || found.expiresAt <= nowIso) {
    return null;
  }
  const principal = store.customerPrincipals.find((p) => p.customerId === found.customerId && p.phone === found.phone && p.isActive);
  if (!principal || (process.env.NODE_ENV === 'production' && principal.phoneConfirmationStatus !== 'VERIFIED')) return null;
  return found;
}

export function revokeCustomerSession(token: string | undefined | null): void {
  const sessionId = verifySignedSessionId(token, 'customer');
  if (!sessionId) return;
  const store = readSessionStore();
  const nowIso = new Date().toISOString();
  for (const s of store.customerSessions) {
    if (s.sessionId === sessionId && !s.revokedAt) {
      s.revokedAt = nowIso;
    }
  }
  writeSessionStore(store);
}

// ============================================================================
// 6. RATE LIMITING, ORIGIN/CSRF PROTECTION & REQUEST PAYLOAD GUARDS
// ============================================================================

interface RateLimitBucket {
  timestamps: number[];
}

const rateLimitBuckets = new Map<string, RateLimitBucket>();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  nowMs: number = Date.now()
): {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
} {
  const cutoff = nowMs - windowMs;
  const persistent = hasDurableRuntimeContext() ? readSessionStore() : null;
  const rateKey = crypto.createHash('sha256').update(key).digest('hex');
  const bucket = persistent?.rateLimits?.[rateKey] ?? rateLimitBuckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= maxRequests) {
    const oldest = bucket.timestamps[0] ?? nowMs;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + windowMs - nowMs) / 1000)
    );
    rateLimitBuckets.set(key, bucket);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  bucket.timestamps.push(nowMs);
  rateLimitBuckets.set(key, bucket);
  if (persistent) {
    persistent.rateLimits = Object.fromEntries(Object.entries(persistent.rateLimits ?? {})
      .filter(([, value]) => value.timestamps.some(timestamp => timestamp > nowMs - 86_400_000)));
    persistent.rateLimits[rateKey] = bucket;
    writeSessionStore(persistent);
  }
  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - bucket.timestamps.length),
    retryAfterSeconds: 0,
  };
}

export function resetRateLimitsForTest(): void {
  rateLimitBuckets.clear();
}

export function getClientIpFromRequest(req: Request): string {
  if (process.env.PANCHABINDU_TRUST_PROXY_HEADERS !== '1') return 'untrusted-proxy';
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || '127.0.0.1';
  }
  return req.headers.get('x-real-ip')?.trim() || '127.0.0.1';
}

/**
 * Extracts the signed Admin session token from either X-Admin-Session-Token header,
 * Authorization Bearer header, or bg_admin_session cookie (supports cross-origin iframes).
 */
export function extractAdminSessionTokenFromRequest(
  req: Request
): string | undefined {
  const headerToken = req.headers.get('x-admin-session-token')?.trim();
  if (headerToken) return headerToken;

  const authHeader = req.headers.get('authorization')?.trim();
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (bearer) return bearer;
  }

  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader) {
    const parts = cookieHeader.split(';');
    for (const part of parts) {
      const [rawName, ...rest] = part.trim().split('=');
      if (rawName === ADMIN_SESSION_COOKIE_NAME) {
        const val = rest.join('=').trim();
        if (val) return decodeURIComponent(val);
      }
    }
  }
  return undefined;
}

/**
 * Verifies same-origin / CSRF safety for state-changing requests.
 * Require the exact request origin. Never trust client-supplied forwarded hosts or preview suffixes.
 */
export function verifyOriginAndCsrf(
  req: Request,
  session?: AdminSessionRecord | null
): { ok: boolean; errorBn?: string } {
  const origin = req.headers.get('origin');
  try {
    const configured = process.env.APP_URL?.trim();
    // Next may reconstruct req.url using an internal host. Production must pin the
    // public target origin in server configuration, never a forwarded request header.
    if (!configured && process.env.NODE_ENV === 'production') return { ok: false, errorBn: 'APP_URL কনফিগার করা প্রয়োজন।' };
    const target = new URL(configured || req.url);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password ||
        (configured && (target.pathname !== '/' || target.search || target.hash)) ||
        !origin || origin === 'null' || new URL(origin).origin !== target.origin || req.headers.get('sec-fetch-site') === 'cross-site') {
      return { ok: false, errorBn: 'ক্রস-অরিজিন (CSRF) অনুরোধ প্রত্যাখ্যান করা হয়েছে।' };
    }
  } catch {
    return { ok: false, errorBn: 'অবৈধ Origin হেডার (CSRF Guard)।' };
  }

  const csrfHeader = req.headers.get('x-csrf-token');
  if (session && (!csrfHeader || csrfHeader !== session.csrfToken)) {
    return {
      ok: false,
      errorBn: 'অবৈধ CSRF টোকেন। অনুগ্রহ করে পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।',
    };
  }

  return { ok: true };
}

/**
 * Enforces a maximum payload size on incoming JSON bodies to prevent DoS.
 */
export function assertJsonBodySize(
  rawBody: string,
  maxBytes = 256 * 1024
): { ok: boolean; errorBn?: string } {
  if (Buffer.byteLength(rawBody, 'utf8') > maxBytes) {
    return {
      ok: false,
      errorBn: 'অনুরোধের পেলোড সাইজ অনুমোদিত সীমার (256KB) চেয়ে বড়।',
    };
  }
  return { ok: true };
}
