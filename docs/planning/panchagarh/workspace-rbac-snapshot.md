# Workspace RBAC allow/deny snapshot

Generated from isolated NODE_ENV=test identities; no real accounts or configuration are used.
ALLOW/DENY describe the HTTP workspace mutation policy, not all domain-service permissions.
Anon and customer have no staff context. Both vendors are denied workspace operations; vendor-specific endpoints and cross-vendor 404s are tested separately.
Disabled operations remain DENY even for super_admin. This is an executable regression snapshot, not a proposed permission change.

| Operation | anon | customer | vendor A | vendor B | marketing | packaging | super_admin |
|---|---|---|---|---|---|---|---|
| add_expense_or_ad | DENY | DENY | DENY | DENY | ALLOW | DENY | ALLOW |
| audit_vendor_closure | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| confirm_batch_handover | DENY | DENY | DENY | DENY | DENY | ALLOW | ALLOW |
| create_flash_campaign | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| create_ledger_reversal | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| create_pickup_batch | DENY | DENY | DENY | DENY | DENY | ALLOW | ALLOW |
| create_smart_order | DENY | DENY | DENY | DENY | ALLOW | DENY | ALLOW |
| create_system_backup_snapshot | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| create_user | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| delete_product | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| execute_customer_refund | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| generate_print_slips | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| input_manual_mfs | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| inspect_role_sanitization | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| lookup_phone | DENY | DENY | DENY | DENY | ALLOW | ALLOW | ALLOW |
| moderate_product_review | DENY | DENY | DENY | DENY | ALLOW | DENY | ALLOW |
| order_grid_action | DENY | DENY | DENY | DENY | ALLOW | ALLOW | ALLOW |
| preview_order_message | DENY | DENY | DENY | DENY | ALLOW | DENY | ALLOW |
| process_four_way_return | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| promote_matured_escrow | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| receive_qc_stock | DENY | DENY | DENY | DENY | ALLOW | ALLOW | ALLOW |
| reconcile_courier_csv | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| record_cart_reminder | DENY | DENY | DENY | DENY | ALLOW | DENY | ALLOW |
| record_dispatched_message | DENY | DENY | DENY | DENY | ALLOW | DENY | ALLOW |
| recover_abandoned_cart | DENY | DENY | DENY | DENY | ALLOW | DENY | ALLOW |
| request_vendor_payout | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| reset_user_security | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| resolve_customer_refund | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| resolve_ledger_reversal | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| resolve_price_proposal | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| resolve_vendor_payout | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| review_consignment_lot | DENY | DENY | DENY | DENY | ALLOW | ALLOW | ALLOW |
| review_manual_bkash | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| run_consignment_lifecycle_dry_run | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| run_phase5_audit | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| run_scheduled_job_now | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| save_or_revoke_credential | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| settle_courier_remittance | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| simulate_automation_rule | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| simulate_courier_webhook | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| split_order_fulfillment_groups | DENY | DENY | DENY | DENY | ALLOW | ALLOW | ALLOW |
| submit_consignment_lot | DENY | DENY | DENY | DENY | ALLOW | DENY | ALLOW |
| submit_price_proposal | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| submit_vendor_onboarding_15q | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| sync_courier_tracking | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| toggle_automation_rule | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| trigger_sheets_sync | DENY | DENY | DENY | DENY | DENY | DENY | DENY |
| update_about_contact_settings | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| update_branding_thresholds | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| update_full_order | DENY | DENY | DENY | DENY | ALLOW | ALLOW | ALLOW |
| update_inquiry_status | DENY | DENY | DENY | DENY | ALLOW | DENY | ALLOW |
| update_message_template | DENY | DENY | DENY | DENY | ALLOW | DENY | ALLOW |
| update_print_config | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| update_storefront_content | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| upsert_blacklist | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| upsert_category | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| upsert_district_rate | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| upsert_product | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| upsert_promo_code | DENY | DENY | DENY | DENY | ALLOW | DENY | ALLOW |
| upsert_role_matrix | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |
| upsert_supplier_offer | DENY | DENY | DENY | DENY | DENY | DENY | ALLOW |

Regenerate intentionally after reviewing policy changes:
`pnpm --filter @workspace/scripts run test:security --update-rbac`
