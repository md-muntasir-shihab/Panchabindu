// src/types/database.types.ts
// Strongly-typed Supabase PostgreSQL Schema Definitions matching 0001..0007 migrations

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type VendorStatus =
  | 'pending_onboarding'
  | 'active'
  | 'suspended'
  | 'closing_audit'
  | 'closed';

export type ProductStatus = 'draft' | 'active' | 'archived';

export type InventoryEventType =
  | 'CONSIGNMENT_IN'
  | 'ORDER_RESERVED'
  | 'ORDER_RESERVATION_RELEASED'
  | 'ORDER_SHIPPED'
  | 'RETURN_RESTOCKED'
  | 'DAMAGE_WRITE_OFF'
  | 'VENDOR_RETURN_OUT'
  | 'MANUAL_AUDIT';

export type OrderSource =
  | 'storefront'
  | 'facebook'
  | 'whatsapp'
  | 'instagram'
  | 'phone_call'
  | 'other';

export type OrderStatus =
  | 'pending_confirmation'
  | 'confirmed'
  | 'packed'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'return_initiated'
  | 'returned'
  | 'cancelled';

export type DeliveryMethod = 'courier' | 'post_office' | 'free';

export type CourierProvider =
  | 'manual'
  | 'steadfast'
  | 'pathao'
  | 'redx'
  | 'bd_post';

export type PaymentMethod =
  | 'cod'
  | 'bkash_manual'
  | 'nagad_manual'
  | 'rocket_manual';

export type PaymentStatus =
  | 'unpaid'
  | 'partial_verified'
  | 'paid_verified'
  | 'remitted'
  | 'refunded';

export type EscrowBucket = 'pending' | 'locked' | 'available';

export type VendorLedgerEntryType =
  | 'EARNING_PENDING'
  | 'EARNING_LOCKED'
  | 'EARNING_MATURED'
  | 'HOLD_PERIOD_RETURN_REVERSAL'
  | 'POST_PAYOUT_CLAWBACK'
  | 'PAYOUT_HOLD'
  | 'PAYOUT_HOLD_RELEASE'
  | 'PAYOUT_DISBURSED'
  | 'MANUAL_ADJUSTMENT';

export type ReturnFaultType =
  | 'WAREHOUSE_PACKAGING_FAULT'
  | 'SUPPLIER_DEFECT'
  | 'CUSTOMER_INTACT_RETURN'
  | 'COURIER_NEGLIGENCE';

export type PayoutStatus = 'requested' | 'approved' | 'rejected' | 'paid';

export type DiscountType = 'fixed_poisha' | 'percentage_bp';

export type MessageChannel =
  | 'wa_deep_link'
  | 'sms_deep_link'
  | 'email_resend'
  | 'sms_textbee'
  | 'sms_http_gateway'
  | 'whatsapp_cloud_api'
  | 'in_app';

export interface Database {
  public: {
    Tables: {
      districts: {
        Row: {
          id: number;
          division_id: number;
          name_en: string;
          name_bn: string;
          lat: string | null;
          lon: string | null;
          url: string | null;
          is_active: boolean;
        };
        Insert: Omit<Database['public']['Tables']['districts']['Row'], 'is_active'> & {
          is_active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['districts']['Row']>;
      };
      upazilas: {
        Row: {
          id: number;
          district_id: number;
          name_en: string;
          name_bn: string;
          url: string | null;
          is_active: boolean;
        };
        Insert: Omit<Database['public']['Tables']['upazilas']['Row'], 'is_active'> & {
          is_active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['upazilas']['Row']>;
      };
      roles: {
        Row: {
          id: string;
          slug: string;
          name_bn: string;
          name_en: string;
          description_bn: string;
          max_discount_bp: number;
          require_2fa: boolean;
          session_timeout_minutes: number;
          is_system: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['roles']['Row'],
          'id' | 'created_at' | 'updated_at'
        > & { id?: string };
        Update: Partial<Database['public']['Tables']['roles']['Row']>;
      };
      role_permissions: {
        Row: {
          id: string;
          role_id: string;
          module_key: string;
          can_read: boolean;
          can_create: boolean;
          can_update: boolean;
          can_delete: boolean;
          allowed_fields: string[];
          hidden_fields: string[];
          masked_fields: string[];
        };
        Insert: Omit<Database['public']['Tables']['role_permissions']['Row'], 'id'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['role_permissions']['Row']>;
      };
      vendors: {
        Row: {
          id: string;
          code: string;
          business_name: string;
          owner_name: string;
          phone: string;
          email: string | null;
          address: string;
          default_commission_bp: number;
          hold_days_override: number | null;
          min_payout_poisha: number | null;
          mask_customer_pii: boolean;
          onboarding_answers_json: Json;
          payout_method_json: Json;
          status: VendorStatus;
          contract_accepted_at: string | null;
          closed_at: string | null;
          closure_audit_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['vendors']['Row'],
          'id' | 'created_at' | 'updated_at'
        > & { id?: string };
        Update: Partial<Database['public']['Tables']['vendors']['Row']>;
      };
      users_profile: {
        Row: {
          id: string;
          username: string;
          internal_email: string;
          display_name: string;
          phone: string | null;
          role_id: string;
          vendor_id: string | null;
          must_change_password: boolean;
          totp_enrolled: boolean;
          require_2fa_override: boolean | null;
          max_discount_bp_override: number | null;
          custom_permission_overrides_json: Json;
          failed_login_count: number;
          locked_until: string | null;
          password_changed_at: string | null;
          last_login_at: string | null;
          last_login_ip: string | null;
          last_login_user_agent: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['users_profile']['Row'],
          'created_at' | 'updated_at'
        >;
        Update: Partial<Database['public']['Tables']['users_profile']['Row']>;
      };
      site_settings: {
        Row: {
          id: number;
          brand_name_bn: string;
          brand_name_en: string;
          tagline_bn: string;
          tagline_en: string;
          logo_url: string | null;
          favicon_url: string | null;
          accent_color_hex: string;
          support_phone: string;
          support_email: string;
          whatsapp_number: string;
          facebook_page_url: string | null;
          default_locale: 'bn' | 'en';
          free_delivery_threshold_poisha: number;
          global_free_delivery: boolean;
          bd_post_default_per_kg_poisha: number;
          global_default_commission_bp: number;
          global_escrow_hold_days: number;
          min_payout_request_poisha: number;
          default_packaging_cost_poisha: number;
          duplicate_order_window_hours: number;
          stuck_order_threshold_hours: number;
          risk_advance_mandatory_score: number;
          risk_weights_json: Json;
          bkash_manual_number: string;
          bkash_instruction_bn: string;
          bkash_instruction_en: string;
          trust_badges_json: Json;
          homepage_sections_json: Json;
          hero_banners_json: Json;
          promo_campaign_json: Json;
          delay_banner_json: Json;
          print_config_json: Json;
          legal_pages_json: Json;
          maintenance_mode: boolean;
          maintenance_message_bn: string;
          demo_mode: boolean;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: Partial<Database['public']['Tables']['site_settings']['Row']>;
        Update: Partial<Database['public']['Tables']['site_settings']['Row']>;
      };
      categories: {
        Row: {
          id: string;
          parent_id: string | null;
          slug: string;
          name_bn: string;
          name_en: string;
          description_bn: string;
          description_en: string;
          banner_url: string | null;
          icon_name: string;
          filter_attributes_schema: Json;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['categories']['Row'],
          'id' | 'created_at' | 'updated_at'
        > & { id?: string };
        Update: Partial<Database['public']['Tables']['categories']['Row']>;
      };
      products: {
        Row: {
          id: string;
          vendor_id: string;
          category_id: string;
          slug: string;
          name_bn: string;
          name_en: string;
          description_bn: string;
          description_en: string;
          specs_json: Json;
          variant_axes_json: Json;
          images: string[];
          is_featured: boolean;
          is_free_delivery: boolean;
          allow_custom_inquiry: boolean;
          low_stock_threshold: number;
          lead_time_days: number;
          commission_override_bp: number | null;
          total_sold_count: number;
          total_returned_count: number;
          rating_avg_bp: number;
          review_count: number;
          status: ProductStatus;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['products']['Row'],
          'id' | 'created_at' | 'updated_at'
        > & { id?: string };
        Update: Partial<Database['public']['Tables']['products']['Row']>;
      };
      product_variants: {
        Row: {
          id: string;
          product_id: string;
          internal_vendor_sku: string;
          public_sku: string;
          title_bn: string;
          title_en: string;
          attributes_json: Json;
          image_url: string | null;
          supplier_cost_poisha: number;
          supplier_profit_poisha: number;
          supplier_payable_poisha: number;
          platform_margin_poisha: number;
          sale_price_poisha: number;
          compare_at_price_poisha: number | null;
          weight_grams: number;
          stock_on_hand: number;
          stock_reserved: number;
          stock_in_transit: number;
          stock_damaged: number;
          stock_available: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['product_variants']['Row'],
          | 'id'
          | 'supplier_payable_poisha'
          | 'sale_price_poisha'
          | 'stock_available'
          | 'created_at'
          | 'updated_at'
        > & { id?: string };
        Update: Partial<
          Omit<
            Database['public']['Tables']['product_variants']['Row'],
            'supplier_payable_poisha' | 'sale_price_poisha' | 'stock_available'
          >
        >;
      };
      orders: {
        Row: {
          id: string;
          order_no: string;
          customer_id: string | null;
          customer_name: string;
          customer_phone: string;
          district_id: number;
          upazila_id: number;
          street_address: string;
          landmark: string;
          address_quality_score: number;
          address_flags: string[];
          address_override_reason: string | null;
          source: OrderSource;
          status: OrderStatus;
          delivery_method: DeliveryMethod;
          courier_provider: CourierProvider;
          consignment_id: string | null;
          tracking_code: string | null;
          tracking_url: string | null;
          pickup_batch_id: string | null;
          total_weight_grams: number;
          subtotal_poisha: number;
          discount_poisha: number;
          promo_code_id: string | null;
          discount_approved_by: string | null;
          delivery_charge_poisha: number;
          total_payable_poisha: number;
          advance_paid_poisha: number;
          cod_collectable_poisha: number;
          payment_method: PaymentMethod;
          payment_status: PaymentStatus;
          manual_payment_trx_id: string | null;
          manual_payment_sender_phone: string | null;
          payment_verified_by: string | null;
          payment_verified_at: string | null;
          snap_total_supplier_payable_poisha: number;
          snap_total_platform_margin_poisha: number;
          snap_packaging_cost_poisha: number;
          estimated_net_profit_poisha: number;
          risk_score: number;
          is_advance_mandatory: boolean;
          is_duplicate_flagged: boolean;
          duplicate_override_reason: string | null;
          next_best_action: string;
          call_attempts_count: number;
          last_call_attempt_at: string | null;
          callback_scheduled_at: string | null;
          customer_note: string;
          internal_staff_note: string;
          tags: string[];
          print_count: number;
          last_printed_at: string | null;
          confirmed_at: string | null;
          packed_at: string | null;
          shipped_at: string | null;
          delivered_at: string | null;
          cancelled_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['orders']['Row'],
          'id' | 'cod_collectable_poisha' | 'created_at' | 'updated_at'
        > & { id?: string };
        Update: Partial<
          Omit<Database['public']['Tables']['orders']['Row'], 'cod_collectable_poisha'>
        >;
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          variant_id: string;
          vendor_id: string;
          product_name_bn_snapshot: string;
          product_name_en_snapshot: string;
          variant_title_snapshot: string;
          public_sku_snapshot: string;
          internal_vendor_sku_snapshot: string;
          image_url_snapshot: string | null;
          quantity: number;
          snap_unit_supplier_cost_poisha: number;
          snap_unit_supplier_profit_poisha: number;
          snap_unit_supplier_payable_poisha: number;
          snap_unit_platform_margin_poisha: number;
          snap_unit_sale_price_poisha: number;
          snap_commission_bp: number;
          snap_commission_source: 'PRODUCT_OVERRIDE' | 'VENDOR_DEFAULT' | 'GLOBAL_DEFAULT';
          line_supplier_payable_poisha: number;
          line_platform_margin_poisha: number;
          line_subtotal_poisha: number;
          escrow_hold_days_snapshot: number;
          created_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['order_items']['Row'],
          | 'id'
          | 'line_supplier_payable_poisha'
          | 'line_platform_margin_poisha'
          | 'line_subtotal_poisha'
          | 'created_at'
        > & { id?: string };
        Update: never;
      };
      vendor_ledger: {
        Row: {
          id: string;
          vendor_id: string;
          order_id: string | null;
          order_item_id: string | null;
          return_case_id: string | null;
          payout_request_id: string | null;
          entry_type: VendorLedgerEntryType;
          escrow_bucket: EscrowBucket;
          amount_poisha: number;
          delivered_at: string | null;
          matures_at: string | null;
          description_bn: string;
          description_en: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['vendor_ledger']['Row'], 'id' | 'created_at'> & {
          id?: string;
        };
        Update: never;
      };
      audit_logs: {
        Row: {
          id: string;
          actor_user_id: string | null;
          actor_username: string | null;
          actor_role_slug: string | null;
          action_key: string;
          entity_type: string;
          entity_id: string | null;
          before_snapshot_json: Json | null;
          after_snapshot_json: Json | null;
          reason: string | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['audit_logs']['Row'], 'id' | 'created_at'> & {
          id?: string;
        };
        Update: never;
      };
    };
    Views: {
      v_storefront_products: {
        Row: {
          product_id: string;
          category_id: string;
          slug: string;
          name_bn: string;
          name_en: string;
          description_bn: string;
          description_en: string;
          specs_json: Json;
          variant_axes_json: Json;
          images: string[];
          is_featured: boolean;
          is_free_delivery: boolean;
          low_stock_threshold: number;
          total_sold_count: number;
          rating_avg_bp: number;
          review_count: number;
          variant_id: string;
          public_sku: string;
          variant_title_bn: string;
          variant_title_en: string;
          attributes_json: Json;
          variant_image_url: string | null;
          sale_price_poisha: number;
          compare_at_price_poisha: number | null;
          weight_grams: number;
          stock_available: number;
        };
      };
      v_vendor_masked_orders: {
        Row: {
          order_item_id: string;
          order_id: string;
          order_no: string;
          order_status: OrderStatus;
          vendor_id: string;
          product_name_bn_snapshot: string;
          variant_title_snapshot: string;
          internal_vendor_sku_snapshot: string;
          quantity: number;
          snap_unit_supplier_cost_poisha: number;
          snap_unit_supplier_profit_poisha: number;
          snap_unit_supplier_payable_poisha: number;
          line_supplier_payable_poisha: number;
          escrow_hold_days_snapshot: number;
          customer_phone_display: string;
          customer_address_display: string;
          district_name_bn: string;
          upazila_name_bn: string;
          delivered_at: string | null;
          created_at: string;
        };
      };
    };
  };
}
