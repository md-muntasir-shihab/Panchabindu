import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiRequest } from '../http';
import { GET, POST } from '../../../app/api/account/orders/route';
const req = (body: object, cookie?: string) => new ApiRequest('http://localhost/api/account/orders', { method: 'POST', headers: { origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
test('sandbox OTP sign-in verifies phone, creates a session and production fails closed without SMS provider', async () => {
  const phone = '01781234567';
  const start = await POST(req({ action: 'request_otp', customerPhone: phone }));
  assert.equal(start.status, 200);
  const payload = await start.json();
  assert.equal(payload.providerStatus, 'SANDBOX_TEST_ONLY');
  assert.match(payload.sandboxOtpPreview, /^\d{6}$/);
  const invalid = await POST(req({ action: 'verify_otp', customerPhone: '01881234567', otpCode: payload.sandboxOtpPreview }));
  assert.notEqual(invalid.status, 200);
  const verified = await POST(req({ action: 'verify_otp', customerPhone: phone, otpCode: payload.sandboxOtpPreview }));
  assert.equal(verified.status, 200);
  const cookie = verified.headers.get('set-cookie')!.split(';')[0];
  assert.match(cookie, /^bg_customer_session=/);
  const account = await GET(new ApiRequest('http://localhost/api/account/orders', { headers: { cookie } }));
  assert.equal((await account.json()).authenticated, true);
  const logout = await POST(req({ action: 'logout' }, cookie));
  assert.equal(logout.status, 200);
  const after = await GET(new ApiRequest('http://localhost/api/account/orders', { headers: { cookie } }));
  assert.equal((await after.json()).authenticated, false);
  const prior = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const noSms = await POST(req({ action: 'request_otp', customerPhone: phone }));
    assert.equal(noSms.status, 503);
    assert.equal((await noSms.json()).sandboxOtpPreview, undefined);
  } finally { process.env.NODE_ENV = prior; }
});
