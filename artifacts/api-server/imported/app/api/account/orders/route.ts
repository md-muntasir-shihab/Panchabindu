import { backendRoute } from '@/src/lib/db/backend-route';
import { ApiRequest as NextRequest, ApiResponse as NextResponse } from '@/src/lib/http';
import { z } from 'zod';
import { getAuthenticatedCustomerOrders, getCustomerLastDeliveryProfile, saveCustomerDeliveryProfile } from '@/src/lib/db/repository';
import {
  assertJsonBodySize, checkRateLimit, CUSTOMER_SESSION_COOKIE_NAME, CUSTOMER_SESSION_TTL_MS, getClientIpFromRequest,
  registerPasswordCustomer, loginPasswordCustomer, getCustomerSessionProfile, changeCustomerPassword,
  revokeCustomerSession, verifyCustomerSessionToken, verifyOriginAndCsrf,
} from '@/src/lib/security/crypto-session';
import { normalizeBdPhone } from '@/src/lib/validators';

const password = z.string().min(10, 'পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে।').max(128);
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('register'), phone: z.string().trim().max(30).optional(), email: z.string().trim().max(254).optional(), password }),
  z.object({ action: z.literal('login'), identifier: z.string().trim().min(1).max(254), password: z.string().min(1).max(128) }),
  z.object({ action: z.literal('change_password'), currentPassword: z.string().min(1).max(128), newPassword: password }),
  z.object({
    action: z.literal('update_personal_profile'),
    customerName: z.string().trim().min(2).max(120),
    customerPhone: z.string().trim().max(30).optional(),
    customerEmail: z.string().trim().max(254).nullable().optional(),
  }),
  z.object({
    action: z.literal('update_delivery_profile'),
    customerName: z.string().trim().min(2).max(120),
    customerPhone: z.string().trim().max(30).optional(),
    customerEmail: z.string().trim().max(254).nullable().optional(),
    districtId: z.number().int().positive(),
    upazilaId: z.number().int().positive(),
    postCode: z.string().trim().max(10).optional(),
    recipientCity: z.string().trim().max(120).optional(),
    recipientZone: z.string().trim().max(120).optional(),
    recipientArea: z.string().trim().max(120).optional(),
    streetAddress: z.string().trim().min(6).max(500),
    landmark: z.string().trim().max(200).optional(),
  }),
  z.object({ action: z.literal('get_orders') }),
  z.object({ action: z.literal('logout') }),
]);

function sessionResponse(token: string, session: { phone: string }, identifier: string) {
  const res = NextResponse.json({ success: true, customerPhone: session.phone, identifier, deliveryProfile: getCustomerLastDeliveryProfile(token), orders: getAuthenticatedCustomerOrders(token) });
  res.cookies.set(CUSTOMER_SESSION_COOKIE_NAME, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: CUSTOMER_SESSION_TTL_MS / 1000,
  });
  return res;
}

async function handleGET(req: NextRequest) {
  const token = req.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value;
  const session = verifyCustomerSessionToken(token);
  if (!session) return NextResponse.json({ authenticated: false, orders: [] });
  const profile = getCustomerSessionProfile(session);
  return NextResponse.json({
    authenticated: true,
    authBypassed: session.sessionId === 'bypass-customer-session',
    customerPhone: session.phone,
    identifier: profile?.identifier ?? session.phone,
    customerEmail: profile?.email ?? null,
    deliveryProfile: getCustomerLastDeliveryProfile(token),
    orders: getAuthenticatedCustomerOrders(token),
  });
}

async function handlePOST(req: NextRequest) {
  if (!verifyOriginAndCsrf(req).ok) return NextResponse.json({ success: false, errorBn: 'অনুরোধ অনুমোদিত নয়।' }, { status: 403 });
  const raw = await req.text();
  if (!assertJsonBodySize(raw, 16 * 1024).ok) return NextResponse.json({ success: false, errorBn: 'অনুরোধটি অতিরিক্ত বড়।' }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ success: false, errorBn: 'অনুরোধের তথ্য সঠিক নয়।' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, errorBn: parsed.error.issues[0]?.message ?? 'তথ্য সঠিক নয়।' }, { status: 400 });
  const data = parsed.data;
  if (data.action === 'logout') {
    revokeCustomerSession(req.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value);
    const res = NextResponse.json({ success: true }); res.cookies.delete(CUSTOMER_SESSION_COOKIE_NAME); return res;
  }
  if (data.action === 'get_orders') {
    const token = req.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value;
    const session = verifyCustomerSessionToken(token);
    if (!session) return NextResponse.json({ success: false, errorBn: 'অ্যাকাউন্টে লগইন করুন।' }, { status: 401 });
    return NextResponse.json({ success: true, customerPhone: session.phone, deliveryProfile: getCustomerLastDeliveryProfile(token), orders: getAuthenticatedCustomerOrders(token) });
  }
  if (data.action === 'update_personal_profile') {
    const token = req.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value;
    const session = verifyCustomerSessionToken(token);
    if (!session) return NextResponse.json({ success: false, errorBn: 'অ্যাকাউন্টে লগইন করুন।' }, { status: 401 });
    const normalizedPhone = data.customerPhone?.trim() ? normalizeBdPhone(data.customerPhone.trim()) : session.phone;
    if (data.customerPhone?.trim() && !normalizedPhone) {
      return NextResponse.json({ success: false, errorBn: 'সঠিক ১১ ডিজিট বাংলাদেশি মোবাইল নম্বর দিন।' }, { status: 400 });
    }
    const cleanEmail = data.customerEmail?.trim() ? data.customerEmail.trim().toLowerCase() : null;
    if (cleanEmail && !z.email().safeParse(cleanEmail).success) {
      return NextResponse.json({ success: false, errorBn: 'সঠিক ইমেইল ঠিকানা দিন।' }, { status: 400 });
    }
    const existing = getCustomerLastDeliveryProfile(token);
    const saved = saveCustomerDeliveryProfile(token, {
      customerName: data.customerName,
      customerPhone: normalizedPhone ?? session.phone,
      customerEmail: cleanEmail,
      districtId: existing?.districtId ?? 47,
      upazilaId: existing?.upazilaId ?? 365,
      postCode: existing?.postCode,
      recipientCity: existing?.recipientCity,
      recipientZone: existing?.recipientZone,
      recipientArea: existing?.recipientArea,
      streetAddress: existing?.streetAddress ?? '',
      landmark: existing?.landmark ?? '',
      allowEmptyAddress: true,
    });
    if (!saved.success) {
      return NextResponse.json(saved, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      deliveryProfile: saved.deliveryProfile,
    });
  }
  if (data.action === 'update_delivery_profile') {
    const token = req.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value;
    const session = verifyCustomerSessionToken(token);
    if (!session) return NextResponse.json({ success: false, errorBn: 'অ্যাকাউন্টে লগইন করুন।' }, { status: 401 });
    const normalizedPhone = data.customerPhone ? normalizeBdPhone(data.customerPhone) : session.phone;
    if (data.customerPhone && !normalizedPhone) {
      return NextResponse.json({ success: false, errorBn: 'সঠিক ১১ ডিজিট বাংলাদেশি মোবাইল নম্বর দিন।' }, { status: 400 });
    }
    const saved = saveCustomerDeliveryProfile(token, {
      customerName: data.customerName,
      customerPhone: normalizedPhone ?? session.phone,
      customerEmail: data.customerEmail ?? null,
      districtId: data.districtId,
      upazilaId: data.upazilaId,
      postCode: data.postCode,
      recipientCity: data.recipientCity,
      recipientZone: data.recipientZone,
      recipientArea: data.recipientArea,
      streetAddress: data.streetAddress,
      landmark: data.landmark,
    });
    if (!saved.success) {
      return NextResponse.json(saved, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      deliveryProfile: saved.deliveryProfile,
    });
  }
  const ip = getClientIpFromRequest(req);
  const limit = checkRateLimit(`customer-password-ip:${ip}`, 100, 15 * 60_000);
  if (!limit.allowed) return NextResponse.json({ success: false, errorBn: 'অনেক চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।' }, { status: 429 });
  if (data.action === 'change_password') {
    const token = req.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value;
    const session = verifyCustomerSessionToken(token);
    if (!session) return NextResponse.json({ success: false, errorBn: 'অ্যাকাউন্টে লগইন করুন।' }, { status: 401 });
    if (!checkRateLimit(`customer-password-change:${session.customerId}`, 5, 15 * 60_000).allowed) return NextResponse.json({ success: false, errorBn: 'অনেক চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।' }, { status: 429 });
    if (!changeCustomerPassword(session, data.currentPassword, data.newPassword)) return NextResponse.json({ success: false, errorBn: 'বর্তমান পাসওয়ার্ড সঠিক নয়।' }, { status: 401 });
    const res = NextResponse.json({ success: true }); res.cookies.delete(CUSTOMER_SESSION_COOKIE_NAME); return res;
  }
  if (data.action === 'register') {
    if (!checkRateLimit(`customer-register:${ip}`, 20, 60 * 60_000).allowed) return NextResponse.json({ success: false, errorBn: 'অনেক চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।' }, { status: 429 });
    const phone = data.phone ? normalizeBdPhone(data.phone) : undefined;
    const email = data.email?.toLowerCase() || undefined;
    if ((!phone && !email) || (data.phone && !phone) || (email && !z.email().safeParse(email).success)) return NextResponse.json({ success: false, errorBn: 'সঠিক বাংলাদেশি ফোন নম্বর অথবা ইমেইল দিন।' }, { status: 400 });
    const result = registerPasswordCustomer({ phone: phone || undefined, email, password: data.password });
    if (!result.success) return NextResponse.json(result, { status: 409 });
    return sessionResponse(result.sessionToken, result.session, result.identifier);
  }
  const identifier = data.identifier.includes('@') ? data.identifier.toLowerCase() : normalizeBdPhone(data.identifier);
  if (!identifier) return NextResponse.json({ success: false, errorBn: 'নম্বর/ইমেইল বা পাসওয়ার্ড সঠিক নয়।' }, { status: 401 });
  if (!checkRateLimit(`customer-password-identifier:${identifier}`, 10, 15 * 60_000).allowed) return NextResponse.json({ success: false, errorBn: 'অনেক চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।' }, { status: 429 });
  const result = loginPasswordCustomer(identifier, data.password);
  if (!result.success) return NextResponse.json(result, { status: 401 });
  return sessionResponse(result.sessionToken, result.session, result.identifier);
}
export const GET = backendRoute(handleGET, { commitAuthFailure: true });
export const POST = backendRoute(handlePOST, { commitAuthFailure: true });
