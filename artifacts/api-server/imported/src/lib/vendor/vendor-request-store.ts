// src/lib/vendor/vendor-request-store.ts
// Vendor → admin change requests (profile edits, payout account changes,
// onboarding answer updates). Vendors may only *propose*; a super admin applies
// the change, so identity and payout fields can never be self-edited.
// Stored inside the existing phase-4B vendor document so the runtime
// persistence contract keeps its fixed set of documents.

import { readPhase4BStore, writePhase4BStore, type VendorRequestEntry } from '../admin/phase4b-service';

export type VendorSelfServiceRequestRecord = VendorRequestEntry;

function requestList(): VendorSelfServiceRequestRecord[] {
  const raw = readPhase4BStore().vendorRequests;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

export function listVendorRequests(vendorId?: string): VendorSelfServiceRequestRecord[] {
  const all = requestList();
  return (vendorId ? all.filter((request) => request.vendorId === vendorId) : all)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function appendVendorRequest(request: VendorSelfServiceRequestRecord): void {
  const store = readPhase4BStore();
  store.vendorRequests = [request, ...requestList()];
  writePhase4BStore(store);
}

export function updateVendorRequest(
  requestId: string,
  patch: Partial<VendorSelfServiceRequestRecord>
): VendorSelfServiceRequestRecord | null {
  const store = readPhase4BStore();
  const existing = requestList().find((request) => request.requestId === requestId);
  if (!existing) return null;
  const updated = { ...existing, ...patch };
  store.vendorRequests = requestList().map((request) =>
    request.requestId === requestId ? updated : request
  );
  writePhase4BStore(store);
  return updated;
}

export function findPendingRequest(
  vendorId: string,
  kind: VendorSelfServiceRequestRecord['kind']
): VendorSelfServiceRequestRecord | undefined {
  return requestList().find(
    (request) => request.vendorId === vendorId && request.kind === kind && request.status === 'pending_review'
  );
}
