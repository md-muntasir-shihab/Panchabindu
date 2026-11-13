import { backendRoute } from '@/src/lib/db/backend-route';
import { NextRequest, NextResponse } from 'next/server';
import { getActorSecurityContext } from '@/src/lib/admin/phase4a-service';
import { readErpState } from '@/src/lib/db/repository';
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from '@/src/lib/security/crypto-session';
import { isFirstLoginGateCleared } from '@/src/types/permissions';

async function handleGET(req: NextRequest) {
  const session = verifyAdminSessionToken(req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value);
  if (!session || session.purpose === 'enrollment') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const actor = getActorSecurityContext(session.userId);
  if (!actor || actor.roleSlug !== 'vendor' || !actor.vendorId || !isFirstLoginGateCleared(actor) || actor.roleSlug !== session.roleSlug) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // No caller-supplied vendor ID, financial snapshot, raw orders, cost, SKU or full PII.
  const state = readErpState();
  const products = state.products.filter((p) => p.vendorId === actor.vendorId).map((p) => ({
    id: p.productId,
    nameBn: p.nameBn,
    nameEn: p.nameEn,
    status: p.status,
    variants: p.variants.map((v) => ({ titleBn: v.titleBn, titleEn: v.titleEn, stockAvailable: v.stockAvailable })),
  }));
  const lines = state.orderLines.filter((line) => line.vendorId === actor.vendorId);
  const ownOrderIds = new Set(lines.map((line) => line.orderId));
  const orders = state.orders.filter((order) => ownOrderIds.has(order.id)).map((order) => ({
    orderNo: order.orderNo,
    status: order.status,
    items: lines.filter((line) => line.orderId === order.id).map((line) => ({
      nameBn: line.productNameBn,
      nameEn: line.productNameEn,
      variantBn: line.variantTitleBn,
      variantEn: line.variantTitleEn,
      quantity: line.quantity,
    })),
  }));
  return NextResponse.json({ products, orders }, { headers: { 'Cache-Control': 'private, no-store' } });
}
export const GET = backendRoute(handleGET);
