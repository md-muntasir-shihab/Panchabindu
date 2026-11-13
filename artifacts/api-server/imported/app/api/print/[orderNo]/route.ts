import { ApiRequest as NextRequest } from '@/src/lib/http';
import { z } from 'zod';
import { backendRoute } from '@/src/lib/db/backend-route';
import { readErpState } from '@/src/lib/db/repository';
import { extractAdminSessionTokenFromRequest, verifyAdminSessionToken, verifyOriginAndCsrf } from '@/src/lib/security/crypto-session';
import { getActorSecurityContext, appendImmutableAuditLog, readAdminStore, writeAdminStore } from '@/src/lib/admin/phase4a-service';
import { generateOrderPrintSlips } from '@/src/lib/admin/phase4b-service';
import { hasModulePermission, isFirstLoginGateCleared } from '@/src/types/permissions';

export const POST = backendRoute(async (request: NextRequest, context: { params: Promise<{ orderNo: string }> }) => {
  const session = verifyAdminSessionToken(extractAdminSessionTokenFromRequest(request));
  const actor = session && session.purpose !== 'enrollment' ? getActorSecurityContext(session.userId) : null;
  if (!actor || actor.roleSlug !== session?.roleSlug || !isFirstLoginGateCleared(actor)) return Response.json({ success: false }, { status: 401 });
  if (!verifyOriginAndCsrf(request, session).ok) return Response.json({ success: false }, { status: 403 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 4096) return Response.json({ success: false }, { status: 413 });
  let input;
  try { input = z.object({ copy: z.enum(['customer', 'packaging', 'finance']), reprintReason: z.string().trim().max(500).optional() }).parse(JSON.parse(raw)); }
  catch { return Response.json({ success: false, code: 'INVALID_PRINT_REQUEST' }, { status: 400 }); }
  const { orderNo } = await context.params;
  const state = readErpState();
  const order = state.orders.find(order => order.orderNo === orderNo);
  if (!order) return Response.json({ success: false }, { status: 404 });
  const ownLines = state.orderLines.filter(line => line.orderId === order.id && (actor.roleSlug !== 'vendor' || line.vendorId === actor.vendorId));
  if (!ownLines.length) return Response.json({ success: false }, { status: 404 });
  const audit = readAdminStore();
  const hasPreviousPrint = input.copy === 'finance' ? (order.printCount ?? 0) > 0 : audit.auditLogs.some(log => log.targetId === orderNo && log.actionCode === `PRINT_${input.copy.toUpperCase()}`);
  if (hasPreviousPrint && !input.reprintReason) return Response.json({ success: false, code: 'REPRINT_REASON_REQUIRED' }, { status: 422 });
  if (input.copy === 'finance') {
    if (actor.roleSlug !== 'super_admin') return Response.json({ success: false }, { status: 403 });
    const result = generateOrderPrintSlips(actor, { orderNos: [orderNo] });
    if (!result.success) return Response.json({ success: false }, { status: 403 });
    const financialAudit = readAdminStore();
    appendImmutableAuditLog(financialAudit, { actorUserId: actor.userId, actorUsername: actor.username, actorRole: actor.roleSlug,
      actionCode: 'PRINT_FINANCE', targetType: 'order', targetId: orderNo, summaryBn: 'সীমাবদ্ধ আর্থিক কপির প্রিন্ট তথ্য তৈরি হয়েছে।',
      metadata: { reprintReason: input.reprintReason ?? null },
    });
    writeAdminStore(financialAudit);
    return Response.json({ success: true, copy: 'finance', data: result.slips[0]?.internalPart3 });
  }
  if (actor.roleSlug === 'vendor' && input.copy !== 'packaging') return Response.json({ success: false }, { status: 403 });
  if (actor.roleSlug !== 'vendor' && !hasModulePermission(actor, 'print_engine', 'read')) return Response.json({ success: false }, { status: 403 });
  appendImmutableAuditLog(audit, { actorUserId: actor.userId, actorUsername: actor.username, actorRole: actor.roleSlug,
    actionCode: `PRINT_${input.copy.toUpperCase()}`, targetType: 'order', targetId: orderNo,
    summaryBn: 'অনুমোদিত অর্ডার কপির প্রিন্ট তথ্য তৈরি হয়েছে।', metadata: { copy: input.copy, reprintReason: input.reprintReason ?? null },
  });
  writeAdminStore(audit);
  const items = ownLines.map(line => ({ nameBn: line.productNameBn, variantBn: line.variantTitleBn,
    sku: line.publicSku, quantity: line.quantity,
    ...(input.copy === 'customer' ? { unitSalePricePoisha: line.snapUnitSalePricePoisha, lineTotalPoisha: line.lineSubtotalPoisha - line.lineDiscountPoisha } : {}),
  }));
  return Response.json({ success: true, copy: input.copy, data: { orderNo, items,
    ...(actor.roleSlug !== 'vendor' ? { customerName: order.customerName, phone: order.customerPhone,
      address: order.streetAddress, landmark: order.landmark, district: order.districtNameBn, upazila: order.upazilaNameBn,
    } : {}),
    ...(input.copy === 'customer' ? { subtotalPoisha: order.subtotalPoisha, discountPoisha: order.discountPoisha,
      deliveryChargePoisha: order.deliveryChargePoisha, totalPoisha: order.totalPayablePoisha, paymentMethod: order.paymentMethod,
    } : {}),
  } });
});
