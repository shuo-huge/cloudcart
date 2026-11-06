export interface Admin {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  status: "draft" | "active" | "archived";
  type: "simple" | "variable";
  price_cents: number;
  compare_at_price_cents: number | null;
  currency: string;
  sku: string | null;
  stock: number;
  manage_stock: number;
  featured: number;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
  image_key: string | null;
  image_alt: string | null;
  category_names: string | null;
  images?: ProductImage[];
  variants?: ProductVariant[];
  category_ids?: string[];
  tags?: string[];
}

export interface ProductImage {
  id: string;
  r2_key: string;
  alt: string;
  content_type: string;
  size_bytes: number;
  position: number;
}

export interface ProductVariant {
  id: string;
  title: string;
  sku: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  stock: number;
  options_json: string;
  position: number;
  active: number;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  parent_id: string | null;
  position: number;
  seo_title: string | null;
  seo_description: string | null;
  product_count: number;
}

export interface Order {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  email: string;
  phone: string | null;
  currency: string;
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  total_cents: number;
  refunded_cents: number;
  coupon_code: string | null;
  payment_method: string | null;
  shipping_method: string | null;
  shipping_carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  customer_note: string | null;
  internal_note: string | null;
  customer_name: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface OrderItem {
  id: string;
  name: string;
  sku: string | null;
  unit_price_cents: number;
  quantity: number;
  total_cents: number;
  image_key: string | null;
}

export interface OrderAddress {
  id: string;
  type: string;
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

export interface PaymentTransaction {
  id: string;
  plugin_id: string;
  provider_id: string | null;
  status: string;
  amount_cents: number;
  currency: string;
  provider_status: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  notes: string;
  orders_count: number;
  total_spent_cents: number;
  created_at: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: "fixed" | "percent";
  value: number;
  min_subtotal_cents: number;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  used_count: number;
  applies_to: string;
  status: string;
}

export interface ShippingRate {
  id: string;
  zone_id: string;
  name: string;
  price_cents: number;
  min_order_cents: number;
  free_over_cents: number | null;
  is_active: number;
  position: number;
}

export interface ShippingZone {
  id: string;
  name: string;
  countries_json: string;
  is_default: number;
  rates: ShippingRate[];
}

export interface ThemeRow {
  id: string;
  name: string;
  version: string;
  description: string;
  preview_image: string | null;
  active: number;
  bundled: boolean;
}

export interface ThemeToken {
  key: string;
  label: string;
  type: string;
  default: string;
  group?: string;
}

export interface PluginRow {
  id: string;
  name: string;
  version: string;
  type: string;
  description: string;
  enabled: number;
  bundled: boolean;
  capabilities: string[];
  permissions: string[];
  dependencies: string[];
  last_error: string | null;
}
