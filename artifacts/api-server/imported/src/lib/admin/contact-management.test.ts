import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiRequest } from '../http';
import { createAdminSession } from '../security/crypto-session';
import { getActorSecurityContext, readAdminStore } from './phase4a-service';
import { readErpState } from '../db/repository';
import { POST as sendInquiry } from '../../../app/api/storefront/inquiry/route';
import { POST as workspacePost, GET as workspaceGet } from '../../../app/api/admin/workspace/route';

function post(path: string, body: unknown, token?: string, csrf?: string) {
  return new ApiRequest(`http://localhost${path}`, { method: 'POST', headers: {
    origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json',
    ...(token ? { cookie: `bg_admin_session=${token}` } : {}),
    ...(csrf ? { 'x-csrf-token': csrf } : {}),
  }, body: JSON.stringify(body) });
}

test('contact inquiry submission, private triage, audit and concurrent update protection', async () => {
  const submission = await sendInquiry(post('/api/storefront/inquiry', {
    name: 'Synthetic Customer', phone: '01712345678', subject: 'Delivery question', message: 'Please contact me about delivery.',
  }));
  assert.equal(submission.status, 200);
  const created = (await submission.json()).data;
  assert.equal(created.status, 'unread');
  assert.ok(readErpState().inquiries.some(item => item.id === created.id));
  const admin = createAdminSession(getActorSecurityContext('usr-super-admin')!);
  const staff = createAdminSession(getActorSecurityContext('usr-marketing-01')!);
  const change = { operation: 'update_inquiry_status', inquiryId: created.id, status: 'in_progress', priority: 'high', adminNotes: 'Internal follow-up', expectedRevision: 0 };
  const denied = await workspacePost(post('/api/admin/workspace', change, staff.token, staff.csrfToken));
  assert.equal(denied.status, 403);
  const saved = await workspacePost(post('/api/admin/workspace', change, admin.token, admin.csrfToken));
  assert.equal(saved.status, 200);
  const data = await saved.json();
  assert.equal(data.inquiry.status, 'in_progress');
  assert.equal(data.inquiry.priority, 'high');
  assert.equal(data.inquiry.adminNotes, 'Internal follow-up');
  assert.equal(data.inquiry.revision, 1);
  assert.equal(data.inquiry.activity.length, 1);
  assert.ok(readAdminStore().auditLogs.some(entry => entry.actionCode === 'CUSTOMER_INQUIRY_UPDATED' && entry.targetId === created.id));
  assert.equal(JSON.stringify(readAdminStore().auditLogs).includes('Internal follow-up'), false);
  const stale = await workspacePost(post('/api/admin/workspace', { ...change, status: 'resolved' }, admin.token, admin.csrfToken));
  assert.equal(stale.status, 409);
  assert.equal(readErpState().inquiries.find(item => item.id === created.id)?.status, 'in_progress');
  const invalidAssignee = await workspacePost(post('/api/admin/workspace', { ...change, expectedRevision: 1, assignedTo: 'nonexistent' }, admin.token, admin.csrfToken));
  assert.equal(invalidAssignee.status, 400);
  const completed = await workspacePost(post('/api/admin/workspace', { ...change, expectedRevision: 1, status: 'resolved', assignedTo: getActorSecurityContext('usr-super-admin')!.username }, admin.token, admin.csrfToken));
  assert.equal(completed.status, 200);
  assert.equal((await completed.json()).inquiry.status, 'resolved');
  const get = await workspaceGet(new ApiRequest('http://localhost/api/admin/workspace', { headers: { cookie: `bg_admin_session=${staff.token}` } }));
  assert.deepEqual((await get.json()).inquiries, []);
});
