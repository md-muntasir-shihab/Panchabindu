import { storefrontContentSchema } from '../storefront/storefront-config';
import { readErpState, writeErpState } from '../db/repository';
import { appendImmutableAuditLog, readAdminStore, writeAdminStore } from './phase4a-service';
import { isFirstLoginGateCleared, type ActorSecurityContext } from '../../types/permissions';

export function updateStorefrontContent(actor: ActorSecurityContext, input: unknown) {
  if (actor.roleSlug !== 'super_admin' || !isFirstLoginGateCleared(actor)) return { success: false, errorBn: 'শুধুমাত্র অনুমোদিত সুপার অ্যাডমিন স্টোরের কনটেন্ট বদলাতে পারবেন।' };
  const parsed = storefrontContentSchema.safeParse(input);
  if (!parsed.success) return { success: false, errorBn: 'ফর্মের তথ্য যাচাই করুন।', errorEn: 'Please check the form fields.', issues: parsed.error.issues.map(v => ({ path: v.path.join('.'), message: v.message })) };
  const state = readErpState();
  if (parsed.data.promoCampaign.enabled && !state.promoCodes.some(v => v.code.toLowerCase() === parsed.data.promoCampaign.code.toLowerCase() && v.isActive && (!v.expiresAt || Date.parse(v.expiresAt) > Date.now()))) {
    return { success: false, errorBn: 'সক্রিয় কুপনের কোড বেছে নিন অথবা অফার ব্যানার বন্ধ করুন।', errorEn: 'Select an active coupon code or disable the offer banner.' };
  }
  state.siteSettings = { ...state.siteSettings, ...parsed.data };
  const audit = readAdminStore();
  appendImmutableAuditLog(audit, { actorUserId: actor.userId, actorUsername: actor.username, actorRole: actor.roleSlug,
    actionCode: 'STOREFRONT_CONTENT_UPDATED', targetType: 'system', targetId: 'site_settings',
    summaryBn: 'স্টোরের ব্র্যান্ডিং, হোমপেজ এবং কনটেন্ট হালনাগাদ হয়েছে।', metadata: { fields: Object.keys(parsed.data) } });
  writeErpState(state);
  writeAdminStore(audit);
  return { success: true, siteSettings: state.siteSettings };
}
