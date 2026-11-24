import crypto from 'node:crypto';
import { parseTakaStringToPoisha } from '../money';
import { readErpState, upsertAdminProduct, writeErpState } from '../db/repository';
import { appendImmutableAuditLog, readAdminStore, writeAdminStore } from '../admin/phase4a-service';
import type { ActorSecurityContext } from '../../types/permissions';
import { isFirstLoginGateCleared } from '../../types/permissions';
import { readPhase4BStore } from '../admin/phase4b-service';

import { CATALOG_IMPORT_COLUMNS, parseCatalogCsv } from './csv';
export { CATALOG_IMPORT_COLUMNS, parseCatalogCsv } from './csv';

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

export function planCatalogImport(source: string, actorId: string, mapping: Record<string, string> = {}) {
  const state = readErpState();
  const rows = parseCatalogCsv(source);
  const headers = rows.shift()!.map(header => header.toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error('DUPLICATE_CSV_HEADER');
  const indexes = Object.fromEntries(CATALOG_IMPORT_COLUMNS.map(column => [column, headers.indexOf((mapping[column] || column).toLowerCase())]));
  if (Object.values(indexes).some(index => index < 0)) throw new Error('CSV_REQUIRED_COLUMNS');
  const knownSkus = new Set(state.products.flatMap(product => product.variants.map(variant => variant.publicSku.toUpperCase())));
  const knownSlugs = new Set(state.products.map(product => product.slug));
  const knownCategories = new Set(state.categories.map(category => category.id));
  const activeVendorIds = new Set(
    readPhase4BStore().vendors.filter(vendor => vendor.status === 'active').map(vendor => vendor.vendorId)
  );
  const items: Parameters<typeof upsertAdminProduct>[0][] = [];
  const errors: Array<{ row: number; code: string }> = [];
  rows.forEach((values, index) => {
    try {
      if (values.length !== headers.length) throw new Error('CSV_COLUMN_COUNT');
      const value = (column: typeof CATALOG_IMPORT_COLUMNS[number]) => values[indexes[column]].trim();
      const nameBn = value('name_bn'), nameEn = value('name_en'), sku = value('public_sku').toUpperCase();
      const variantBn = value('variant_bn'), variantEn = value('variant_en');
      const cost = parseTakaStringToPoisha(value('supplier_cost_bdt'));
      const profit = parseTakaStringToPoisha(value('supplier_profit_bdt'));
      const sale = parseTakaStringToPoisha(value('sale_price_bdt'));
      const weight = Number(value('weight_grams'));
      const slug = nameEn.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 120);
      if (
        !nameBn || !nameEn || !sku || !slug ||
        nameBn.length > 160 || nameEn.length > 160 || sku.length > 64 ||
        variantBn.length > 120 || variantEn.length > 120 ||
        hasControlChars(nameBn) || hasControlChars(nameEn) || hasControlChars(sku) ||
        hasControlChars(variantBn) || hasControlChars(variantEn) ||
        cost <= 0 || profit < 0 || sale < cost + profit ||
        !Number.isSafeInteger(weight) || weight < 100 || weight > 100_000
      ) throw new Error('INVALID_CATALOG_ROW');
      if (!knownCategories.has(value('category_id'))) throw new Error('UNKNOWN_CATEGORY');
      if (!activeVendorIds.has(value('vendor_id'))) throw new Error('UNKNOWN_VENDOR');
      if (knownSkus.has(sku) || knownSlugs.has(slug)) throw new Error('DUPLICATE_CATALOG_ITEM');
      knownSkus.add(sku); knownSlugs.add(slug);
      items.push({ vendorId: value('vendor_id'), categoryId: value('category_id'), nameBn, nameEn,
        descriptionBn: '', descriptionEn: '', slug, status: 'draft', images: [],
        variants: [{ publicSku: sku, titleBn: variantBn, titleEn: variantEn,
          supplierCostPoisha: cost, supplierProfitPoisha: profit, platformMarginPoisha: sale - cost - profit,
          salePricePoisha: sale, weightGrams: weight, stockOnHand: 0,
        }],
      });
    } catch (error) { errors.push({ row: index + 2, code: error instanceof Error ? error.message : 'INVALID_CATALOG_ROW' }); }
  });
  const fingerprint = JSON.stringify({ source, actorId, mapping, products: state.products.map(product => ({ id: product.productId, slug: product.slug, skus: product.variants.map(variant => variant.publicSku) })) });
  const previewHash = crypto.createHash('sha256').update(fingerprint).digest('hex');
  return { items, errors, previewHash, rowCount: rows.length };
}

export function commitCatalogImport(actor: ActorSecurityContext, source: string, previewHash: string, mapping?: Record<string, string>) {
  if (actor.roleSlug !== 'super_admin' || !isFirstLoginGateCleared(actor)) throw new Error('FORBIDDEN');
  const plan = planCatalogImport(source, actor.userId, mapping);
  if (plan.previewHash !== previewHash || plan.errors.length || !plan.items.length) throw new Error('IMPORT_REVIEW_REQUIRED');
  const previousProductsSnapshot = structuredClone(readErpState().products);
  const created: string[] = [];
  try {
    for (const item of plan.items) {
      const result = upsertAdminProduct(item);
      if (!result.success || !result.product) throw new Error('IMPORT_ROW_REJECTED');
      created.push(result.product.productId);
    }
  } catch (error) {
    const rollbackState = readErpState();
    rollbackState.products = previousProductsSnapshot;
    writeErpState(rollbackState);
    throw error;
  }
  const store = readAdminStore();
  appendImmutableAuditLog(store, { actorUserId: actor.userId, actorUsername: actor.username, actorRole: actor.roleSlug,
    actionCode: 'CATALOG_CSV_IMPORTED', targetType: 'system', targetId: previewHash,
    summaryBn: 'সিএসভি যাচাই শেষে ড্রাফট পণ্য আমদানি করা হয়েছে।', metadata: { previewHash, productIds: created, rows: created.length },
  });
  writeAdminStore(store);
  return { success: true, productIds: created, imported: created.length };
}
