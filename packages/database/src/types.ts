import type { OrderStatus, PaymentStatus, ProductStatus, ProductType, PluginType } from "@cloudcart/shared";

export interface AdminRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: "owner" | "admin";
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface AdminSessionRow {
  id: string;
  admin_id: string;
  token_hash: string;
  csrf_token: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

export interface InstallationRow {
  id: number;
  installed_at: string;
  installer_email: string;
  setup_token_used_at: string | null;
}

export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: ProductStatus;
  type: ProductType;
  price_cents: number;
  compare_at_price_cents: number | null;
  currency: string;
  sku: string | null;
  stock: number;
  manage_stock: number;
  featured: number;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductVariantRow {
  id: string;
  product_id: string;
  title: string;
  sku: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  stock: number;
  options_json: string;
  position: number;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface ProductImageRow {
  id: string;
  product_id: string;
  r2_key: string;
  alt: string;
  content_type: string;
  width: number | null;
  height: number | null;
  size_bytes: number;
  position: number;
  created_at: string;
}

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  parent_id: string | null;
  position: number;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductCategoryRow {
  product_id: string;
  category_id: string;
}

export interface InventoryMovementRow {
  id: string;
  product_id: string;
  variant_id: string | null;
  delta: number;
  reason: string;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CustomerRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  notes: string;
  orders_count: number;
  total_spent_cents: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerAddressRow {
  id: string;
  customer_id: string;
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string;
  country: string;
  phone: string | null;
  is_default: number;
  created_at: string;
}

export interface CartRow {
  id: string;
  token: string;
  customer_id: string | null;
  currency: string;
  coupon_code: string | null;
  shipping_rate_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CartItemRow {
  id: string;
  cart_id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  created_at: string;
  updated_at: string;
}

export interface OrderRow {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  customer_id: string | null;
  email: string;
  phone: string | null;
  currency: string;
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  refunded_cents: number;
  coupon_code: string | null;
  payment_method: string | null;
  shipping_method: string | null;
  shipping_rate_id: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  customer_note: string | null;
  internal_note: string | null;
  ip: string | null;
  user_agent: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  name: string;
  sku: string | null;
  unit_price_cents: number;
  quantity: number;
  total_cents: number;
  options_json: string;
  image_key: string | null;
  created_at: string;
}

export interface OrderAddressRow {
  id: string;
  order_id: string;
  type: "shipping" | "billing";
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postal_code: string;
  country: string;
  phone: string | null;
  email: string | null;
}

export interface PaymentTransactionRow {
  id: string;
  order_id: string;
  plugin_id: string;
  provider_id: string | null;
  status: string;
  amount_cents: number;
  currency: string;
  provider_status: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
  paid_at: string | null;
}

export interface PaymentEventRow {
  id: string;
  plugin_id: string;
  event_id: string;
  event_type: string;
  order_id: string | null;
  payload_json: string;
  processed_at: string | null;
  created_at: string;
}

export interface ShippingZoneRow {
  id: string;
  name: string;
  countries_json: string;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export interface ShippingRateRow {
  id: string;
  zone_id: string;
  name: string;
  price_cents: number;
  min_order_cents: number;
  max_order_cents: number | null;
  free_over_cents: number | null;
  is_active: number;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CouponRow {
  id: string;
  code: string;
  type: "fixed" | "percent";
  value: number;
  min_subtotal_cents: number;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  used_count: number;
  applies_to: "all" | "products" | "categories";
  status: "active" | "disabled";
  created_at: string;
  updated_at: string;
}

export type PluginRuntime = "bundled" | "remote";
export type PluginHealthStatus = "unknown" | "ok" | "error";

export interface PluginRow {
  id: string;
  name: string;
  version: string;
  type: PluginType;
  description: string;
  icon: string | null;
  author: string | null;
  enabled: number;
  built_in: number;
  last_error: string | null;
  installed_at: string;
  updated_at: string;
  runtime: PluginRuntime;
  manifest_url: string | null;
  manifest_json: string | null;
  service_base_url: string | null;
  admin_entry_url: string | null;
  admin_origin: string | null;
  manifest_hash: string | null;
  health_status: PluginHealthStatus;
  last_health_check_at: string | null;
  uninstalled_at: string | null;
}

export interface StoreIdentityRow {
  id: number;
  store_id: string;
  created_at: string;
  updated_at: string;
}

export interface PluginSettingRow {
  plugin_id: string;
  key: string;
  value: string;
  encrypted: number;
  updated_at: string;
}

export interface ThemeRow {
  id: string;
  name: string;
  version: string;
  description: string;
  preview_image: string | null;
  built_in: number;
  active: number;
  installed_at: string;
  updated_at: string;
}

export interface ThemeSettingRow {
  theme_id: string;
  key: string;
  value: string;
  updated_at: string;
}

export interface PageRow {
  id: string;
  slug: string;
  title: string;
  type: "home" | "content";
  draft_json: string;
  published_version: number | null;
  created_at: string;
  updated_at: string;
}

export interface PageVersionRow {
  id: string;
  page_id: string;
  version: number;
  data_json: string;
  published_by: string | null;
  published_at: string;
  created_at: string;
}

export interface MediaRow {
  id: string;
  r2_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  alt: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface TaxRateRow {
  id: string;
  name: string;
  country: string;
  region: string;
  rate_bps: number;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface EmailOutboxRow {
  id: string;
  event: string;
  order_id: string | null;
  recipient: string;
  recipient_role: "customer" | "store";
  subject: string;
  html_body: string;
  text_body: string;
  status: "pending" | "sending" | "sent" | "failed";
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  locked_at: string | null;
  provider: string | null;
  provider_message_id: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

export interface AuditLogRow {
  id: string;
  admin_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details_json: string;
  ip: string | null;
  created_at: string;
}

export interface RedirectRow {
  id: string;
  from_path: string;
  to_path: string;
  status_code: number;
  created_at: string;
}
