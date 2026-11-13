import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as getOrder, POST as createOrder } from '../../../app/api/orders/route';
import { POST as cancelOrder } from '../../../app/api/orders/cancellation-request/route';
import { POST as returnOrder } from '../../../app/api/orders/return-request/route';
import { POST as submitPayment } from '../../../app/api/payments/manual-bkash/submissions/route';

function request(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json' },
    body: '{}',
  });
}

describe('customer route authentication boundaries', () => {
  it('rejects anonymous checkout, cancellation, payment and returns', async () => {
    assert.equal((await createOrder(request('/api/orders'))).status, 401);
    assert.equal((await cancelOrder(request('/api/orders/cancellation-request'))).status, 401);
    assert.equal((await submitPayment(request('/api/payments/manual-bkash/submissions'))).status, 401);
    const returnRequest = new NextRequest('http://localhost/api/orders/return-request', {
      method: 'POST',
      headers: { host: 'localhost', origin: 'http://localhost', 'content-type': 'application/json' },
      body: JSON.stringify({ orderNo: 'ORD-1234', reasonCode: 'quality_defect', detailsBn: 'synthetic test reason' }),
    });
    assert.equal((await returnOrder(returnRequest)).status, 401);
  });

  it('does not return success for sequential order tracking references', async () => {
    const response = await getOrder(new NextRequest('http://localhost/api/orders?orderNo=ORD-12345'));
    assert.equal(response.status, 404);
  });
});