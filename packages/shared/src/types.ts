export const ORDER_STATUSES = [
  "draft",
  "pending_payment",
  "awaiting_manual_payment",
  "paid",
  "processing",
  "shipped",
  "completed",
  "cancelled",
  "refunded",
  "partially_refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "unpaid",
  "pending",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_TYPES = ["simple", "variable"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PLUGIN_TYPES = [
  "payment", "shipping", "marketing", "seo", "analytics", "product", "customer", "theme", "admin",
  "notification",
] as const;
export type PluginType = (typeof PLUGIN_TYPES)[number];

export interface AddressInput {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  phone?: string;
}

export interface CartLineInput {
  productId: string;
  variantId?: string | null;
  quantity: number;
}

export interface CartLine {
  productId: string;
  variantId: string | null;
  quantity: number;
}

export type CouponType = "fixed" | "percent";

export interface PageSection {
  id: string;
  type: string;
  enabled: boolean;
  settings: Record<string, unknown>;
  blocks?: PageSection[];
}

export interface PageDocument {
  version: number;
  page: string;
  sections: PageSection[];
}

export interface Pagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

export function normalizeOrderStatus(value: string): OrderStatus | null {
  return (ORDER_STATUSES as readonly string[]).includes(value) ? (value as OrderStatus) : null;
}

export function normalizePaymentStatus(value: string): PaymentStatus | null {
  return (PAYMENT_STATUSES as readonly string[]).includes(value) ? (value as PaymentStatus) : null;
}

export function normalizeProductStatus(value: string): ProductStatus | null {
  return (PRODUCT_STATUSES as readonly string[]).includes(value) ? (value as ProductStatus) : null;
}
