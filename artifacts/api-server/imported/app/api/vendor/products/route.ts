import { backendRoute } from '@/src/lib/db/backend-route';
import { ApiRequest as NextRequest, ApiResponse as NextResponse } from '@/src/lib/http';
import { z } from 'zod';
import { assertJsonBodySize } from '@/src/lib/security/crypto-session';
import { authenticateVendorRequest } from '@/src/lib/vendor/vendor-auth';
import {
  isVendorNotFound,
  vendorSetProductStatus,
  vendorUpsertProduct,
} from '@/src/lib/vendor/vendor-workspace-service';

// POST /api/vendor/products
// Create or edit one of the caller's own products. Cost/price are validated
// against the platform margin floor; publishing is a separate action below.

const variantSchema = z.object({
  variantId: z.string().min(1).optional(),
  publicSku: z.string().trim().min(1, 'পাবলিক SKU আবশ্যক।').max(64),
  titleBn: z.string().trim().min(1, 'ভ্যারিয়েন্টের নাম আবশ্যক।').max(160),
  titleEn: z.string().trim().max(160).optional(),
  attributes: z.record(z.string(), z.string().max(120)).optional(),
  imageUrl: z.string().trim().max(2048).nullable().optional(),
  supplierCostPoisha: z.number().int().positive('ক্রয়মূল্য শূন্যের বেশি হতে হবে।'),
  salePricePoisha: z.number().int().positive('বিক্রয়মূল্য শূন্যের বেশি হতে হবে।'),
  weightGrams: z.number().int().positive().max(50_000).optional(),
});

const productSchema = z.object({
  action: z.literal('upsert'),
  product: z.object({
    productId: z.string().min(1).optional(),
    categoryId: z.string().min(1, 'ক্যাটাগরি নির্বাচন করুন।'),
    nameBn: z.string().trim().min(2, 'বাংলা নাম আবশ্যক।').max(200),
    nameEn: z.string().trim().min(2, 'ইংরেজি নাম আবশ্যক।').max(200),
    slug: z.string().trim().max(120).optional(),
    descriptionBn: z.string().trim().min(5, 'বাংলা বিবরণ আবশ্যক।').max(4000),
    descriptionEn: z.string().trim().max(4000).optional(),
    images: z.array(z.string().trim().max(2048)).max(8).optional(),
    specs: z
      .array(
        z.object({
          labelBn: z.string().trim().max(80),
          labelEn: z.string().trim().max(80),
          valueBn: z.string().trim().max(200),
          valueEn: z.string().trim().max(200),
        })
      )
      .max(12)
      .optional(),
    isFreeDelivery: z.boolean().optional(),
    lowStockThreshold: z.number().int().min(0).max(10_000).optional(),
    leadTimeDays: z.number().int().min(0).max(60).optional(),
    variants: z.array(variantSchema).min(1, 'কমপক্ষে একটি ভ্যারিয়েন্ট যোগ করুন।').max(30),
  }),
});

const statusSchema = z.object({
  action: z.literal('set_status'),
  productId: z.string().min(1),
  status: z.enum(['draft', 'active', 'archived']),
});

const bodySchema = z.discriminatedUnion('action', [productSchema, statusSchema]);

async function handlePOST(req: NextRequest) {
  const auth = authenticateVendorRequest(req, { requireCsrf: true });
  if (!auth.ok) return NextResponse.json({ success: false, errorBn: auth.errorBn }, { status: auth.status });

  const rawBody = await req.text();
  const sizeCheck = assertJsonBodySize(rawBody, 128 * 1024);
  if (!sizeCheck.ok) return NextResponse.json({ success: false, errorBn: sizeCheck.errorBn }, { status: 413 });

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, errorBn: 'অনুরোধের তথ্য সঠিক JSON নয়।' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(parsedBody);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, errorBn: parsed.error.issues[0]?.message ?? 'তথ্য সঠিক নয়।' },
      { status: 400 }
    );
  }

  try {
    const payload = parsed.data;
    const result =
      payload.action === 'upsert'
        ? vendorUpsertProduct(auth.actor, payload.product)
        : vendorSetProductStatus(auth.actor, {
            productId: payload.productId,
            status: payload.status,
          });
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    if (isVendorNotFound(error)) {
      return NextResponse.json({ success: false, errorBn: 'পণ্যটি পাওয়া যায়নি।' }, { status: 404 });
    }
    throw error;
  }
}

export const POST = backendRoute(handlePOST);
