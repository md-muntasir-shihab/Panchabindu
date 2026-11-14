import { randomUUID } from 'node:crypto';
import { readPhase4BStore, writePhase4BStore, type VendorSupportTicket } from '../admin/phase4b-service';
import { appendImmutableAuditLog, readAdminStore, writeAdminStore } from '../admin/phase4a-service';
import type { ActorSecurityContext } from '../../types/permissions';

function audit(actor: ActorSecurityContext, actionCode: string, targetId: string) {
  const admin = readAdminStore();
  appendImmutableAuditLog(admin, { actorUserId: actor.userId, actorUsername: actor.username, actorRole: actor.roleSlug, actionCode, targetType: 'system', targetId, summaryBn: 'ভেন্ডর সহায়তা কার্যক্রম সংরক্ষিত হয়েছে।', metadata: {} });
  writeAdminStore(admin);
}
function visible(actor: ActorSecurityContext, ticket: VendorSupportTicket) {
  return actor.roleSlug === 'super_admin' || (actor.roleSlug === 'vendor' && !!actor.vendorId && ticket.vendorId === actor.vendorId);
}
function dto(actor: ActorSecurityContext, ticket: VendorSupportTicket) {
  return { ticketId: ticket.ticketId, subject: ticket.subject, status: ticket.status, createdAt: ticket.createdAt, updatedAt: ticket.updatedAt, messages: ticket.messages, ...(actor.roleSlug === 'super_admin' ? { vendorId: ticket.vendorId } : {}) };
}
export function listSupport(actor: ActorSecurityContext) {
  return (readPhase4BStore().supportTickets ?? []).filter(ticket => visible(actor, ticket)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(ticket => dto(actor, ticket));
}
export function createSupport(actor: ActorSecurityContext, subject: string, text: string) {
  if (actor.roleSlug !== 'vendor' || !actor.vendorId) return null;
  const store = readPhase4BStore(); store.supportTickets ??= [];
  if (store.supportTickets.filter(ticket => ticket.vendorId === actor.vendorId && ticket.status === 'open').length >= 20) return null;
  const now = new Date().toISOString();
  const ticket: VendorSupportTicket = { ticketId: randomUUID(), vendorId: actor.vendorId, subject, status: 'open', createdAt: now, updatedAt: now, messages: [{ messageId: randomUUID(), sender: 'vendor', text, createdAt: now }] };
  store.supportTickets.push(ticket); writePhase4BStore(store); audit(actor, 'VENDOR_SUPPORT_CREATED', ticket.ticketId);
  return dto(actor, ticket);
}
export function updateSupport(actor: ActorSecurityContext, ticketId: string, action: 'reply' | 'close', text?: string) {
  const store = readPhase4BStore();
  const ticket = store.supportTickets?.find(item => item.ticketId === ticketId && visible(actor, item));
  if (!ticket || ticket.status !== 'open' || (action === 'close' && actor.roleSlug !== 'super_admin')) return null;
  if (action === 'reply' && (!text || ticket.messages.length >= 100)) return null;
  const now = new Date().toISOString();
  if (action === 'reply') ticket.messages.push({ messageId: randomUUID(), sender: actor.roleSlug === 'super_admin' ? 'admin' : 'vendor', text: text!, createdAt: now });
  else ticket.status = 'closed';
  ticket.updatedAt = now; writePhase4BStore(store);
  audit(actor, action === 'close' ? 'VENDOR_SUPPORT_CLOSED' : 'VENDOR_SUPPORT_REPLIED', ticket.ticketId);
  return dto(actor, ticket);
}
