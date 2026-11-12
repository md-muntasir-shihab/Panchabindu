import { canAccessAdminWorkspace, hasModulePermission, type ActorSecurityContext, type PermissionAction, type PermissionModuleKey } from '../../types/permissions';

// Every HTTP workspace mutation must opt in. Unknown/new operations fail closed.
export const WORKSPACE_ACTIONS = {
  lookup_phone: ['orders', 'read'], create_smart_order: ['orders', 'create'],
  order_grid_action: ['orders', 'update'], update_full_order: ['orders', 'update'],
  record_dispatched_message: ['messaging', 'create'],
  create_user: ['users_security', 'create'], reset_user_security: ['users_security', 'update'], upsert_role_matrix: ['users_security', 'update'],
  generate_print_slips: ['print_engine', 'create'], update_print_config: ['settings_control_center', 'update'],
  upsert_district_rate: ['settings_control_center', 'update'], create_pickup_batch: ['couriers', 'create'], confirm_batch_handover: ['couriers', 'update'],
  settle_courier_remittance: ['finance', 'update'], process_four_way_return: ['finance', 'update'],
  request_vendor_payout: ['payouts', 'create'], resolve_vendor_payout: ['payouts', 'update'],
  submit_vendor_onboarding_15q: ['vendors', 'create'], audit_vendor_closure: ['vendors', 'update'],
  receive_qc_stock: ['inventory', 'update'], add_expense_or_ad: ['expenses', 'create'],
  upsert_promo_code: ['promos', 'update'], upsert_blacklist: ['orders', 'update'],
  update_message_template: ['messaging', 'update'], preview_order_message: ['messaging', 'read'],
  toggle_automation_rule: ['automation', 'update'], simulate_automation_rule: ['automation', 'update'],
  trigger_sheets_sync: ['google_sync', 'update'], save_or_revoke_credential: ['settings_control_center', 'update'],
  update_branding_thresholds: ['settings_control_center', 'update'], run_scheduled_job_now: ['settings_control_center', 'update'],
  sync_courier_tracking: ['couriers', 'update'], run_phase5_audit: ['settings_control_center', 'read'],
  inspect_role_sanitization: ['users_security', 'read'], run_consignment_lifecycle_dry_run: ['settings_control_center', 'read'],
  recover_abandoned_cart: ['orders', 'create'], record_cart_reminder: ['messaging', 'create'],
  simulate_courier_webhook: ['settings_control_center', 'update'], reconcile_courier_csv: ['finance', 'update'],
  moderate_product_review: ['catalog', 'update'], create_system_backup_snapshot: ['settings_control_center', 'create'],
  submit_consignment_lot: ['inventory', 'create'], review_consignment_lot: ['inventory', 'update'],
  submit_price_proposal: ['vendors', 'update'], resolve_price_proposal: ['vendors', 'update'],
  create_flash_campaign: ['promos', 'create'], promote_matured_escrow: ['finance', 'update'],
  upsert_supplier_offer: ['vendors', 'update'], split_order_fulfillment_groups: ['orders', 'update'],
  create_ledger_reversal: ['finance', 'create'], resolve_ledger_reversal: ['finance', 'update'],
  execute_customer_refund: ['finance', 'update'], resolve_customer_refund: ['finance', 'update'],
  upsert_product: ['catalog', 'update'], delete_product: ['catalog', 'delete'], upsert_category: ['catalog', 'update'],
  update_inquiry_status: ['messaging', 'update'], update_about_contact_settings: ['settings_control_center', 'update'],
  review_manual_bkash: ['finance', 'update'], input_manual_mfs: ['finance', 'create'],
} as const satisfies Record<string, readonly [PermissionModuleKey, PermissionAction]>;

export function canExecuteWorkspaceAction(ctx: ActorSecurityContext | null, operation: string): boolean {
  if (!canAccessAdminWorkspace(ctx) || !ctx || !Object.hasOwn(WORKSPACE_ACTIONS, operation)) return false;
  if (['create_flash_campaign', 'promote_matured_escrow', 'trigger_sheets_sync', 'run_scheduled_job_now', 'sync_courier_tracking', 'simulate_courier_webhook', 'create_system_backup_snapshot'].includes(operation)) return false;
  const [module, action] = WORKSPACE_ACTIONS[operation as keyof typeof WORKSPACE_ACTIONS];
  // Catalog editing is cost-bearing; a separate field-safe staff editor remains gated.
  if (['upsert_product', 'upsert_category', 'delete_product', 'generate_print_slips', 'upsert_blacklist'].includes(operation) && ctx.roleSlug !== 'super_admin') return false;
  return hasModulePermission(ctx, module, action);
}