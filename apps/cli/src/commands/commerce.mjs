import {
  flagBool,
  flagList,
  flagString,
  requirePositional,
} from "../args.mjs";
import { requireConfirmation, usageError } from "../errors.mjs";
import {
  integerFlag,
  readJsonInput,
  readTextInput,
  splitList,
  stripUndefined,
} from "../io.mjs";
import { minorToDecimal, moneyString, ratePercentToBps } from "../money.mjs";

function unwrap(body) {
  return body && typeof body === "object" && "data" in body ? body.data : body;
}

function paging(flags) {
  return {
    page: flagString(flags, "page") || 1,
    perPage: flagString(flags, "per-page") || 20,
  };
}

export async function ordersList(ctx) {
  const client = ctx.requireClient();
  return {
    data: unwrap(await client.requestJson("GET", "/api/admin/orders", {
      query: {
        ...paging(ctx.flags),
        status: flagString(ctx.flags, "status") || "",
        paymentStatus: flagString(ctx.flags, "payment-status") || "",
        q: flagString(ctx.flags, "q") || "",
      },
    })),
  };
}

export async function ordersGet(ctx) {
  const id = requirePositional(ctx.args, 0, "order id");
  const client = ctx.requireClient();
  return { data: unwrap(await client.requestJson("GET", `/api/admin/orders/${encodeURIComponent(id)}`)) };
}

export async function ordersStatus(ctx) {
  const id = requirePositional(ctx.args, 0, "order id");
  const status = requirePositional(ctx.args, 1, "order status");
  const client = ctx.requireClient();
  await client.requestJson("POST", `/api/admin/orders/${encodeURIComponent(id)}/status`, { body: { status } });
  return { data: { id, status }, message: `Set order ${id} to ${status}.` };
}

export async function ordersConfirm(ctx) {
  const id = requirePositional(ctx.args, 0, "order id");
  const client = ctx.requireClient();
  const data = unwrap(await client.requestJson("POST", `/api/admin/orders/${encodeURIComponent(id)}/confirm-payment`, {
    body: { note: flagString(ctx.flags, "note") || undefined },
  }));
  return { data, message: `Confirmed payment for order ${id}.` };
}

export async function ordersShip(ctx) {
  const id = requirePositional(ctx.args, 0, "order id");
  const client = ctx.requireClient();
  const body = stripUndefined({
    carrier: flagString(ctx.flags, "carrier"),
    trackingNumber: flagString(ctx.flags, "tracking-number"),
    trackingUrl: flagString(ctx.flags, "tracking-url"),
  });
  const data = unwrap(await client.requestJson("POST", `/api/admin/orders/${encodeURIComponent(id)}/shipping`, { body }));
  return { data, message: `Updated shipment for order ${id}.` };
}

export async function ordersNote(ctx) {
  const id = requirePositional(ctx.args, 0, "order id");
  const note = flagString(ctx.flags, "note") || (ctx.flags["notes-file"]
    ? await readTextInput(undefined, ctx.flags["notes-file"], "note")
    : undefined);
  if (!note) throw usageError("Missing --note or --notes-file.");
  const client = ctx.requireClient();
  await client.requestJson("POST", `/api/admin/orders/${encodeURIComponent(id)}/notes`, { body: { note } });
  return { data: { id, note }, message: `Added a note to order ${id}.` };
}

export async function ordersCancel(ctx) {
  requireConfirmation(ctx.flags, "Cancelling an order");
  const id = requirePositional(ctx.args, 0, "order id");
  const client = ctx.requireClient();
  await client.requestJson("POST", `/api/admin/orders/${encodeURIComponent(id)}/cancel`, { body: {} });
  return { data: { id, cancelled: true }, message: `Cancelled order ${id}.` };
}

export async function ordersRefund(ctx) {
  requireConfirmation(ctx.flags, "Refunding an order");
  const id = requirePositional(ctx.args, 0, "order id");
  const amount = flagString(ctx.flags, "amount");
  if (!amount) throw usageError("Missing --amount (decimal string, e.g. 12.34).");
  const client = ctx.requireClient();
  const data = unwrap(await client.requestJson("POST", `/api/admin/orders/${encodeURIComponent(id)}/refund`, {
    body: { amount },
  }));
  return { data, message: `Refunded ${amount} for order ${id}.` };
}

export async function customersList(ctx) {
  const client = ctx.requireClient();
  return {
    data: unwrap(await client.requestJson("GET", "/api/admin/customers", {
      query: { ...paging(ctx.flags), q: flagString(ctx.flags, "q") || "" },
    })),
  };
}

export async function customersGet(ctx) {
  const id = requirePositional(ctx.args, 0, "customer id");
  const client = ctx.requireClient();
  return { data: unwrap(await client.requestJson("GET", `/api/admin/customers/${encodeURIComponent(id)}`)) };
}

export async function customersNotes(ctx) {
  const id = requirePositional(ctx.args, 0, "customer id");
  const notes = flagString(ctx.flags, "notes") || (ctx.flags["notes-file"]
    ? await readTextInput(undefined, ctx.flags["notes-file"], "notes")
    : undefined);
  if (notes === undefined) throw usageError("Missing --notes or --notes-file.");
  const client = ctx.requireClient();
  await client.requestJson("PUT", `/api/admin/customers/${encodeURIComponent(id)}/notes`, { body: { notes } });
  return { data: { id, notes }, message: `Updated notes for customer ${id}.` };
}

function couponFlags(flags) {
  return stripUndefined({
    code: flagString(flags, "code"),
    type: flagString(flags, "type"),
    value: flags.value !== undefined ? integerFlag(flags.value, "value", { min: 1 }) : undefined,
    minSubtotal: flagString(flags, "min-subtotal"),
    startsAt: flagString(flags, "starts-at") || null,
    endsAt: flagString(flags, "ends-at") || null,
    maxUses: flags["max-uses"] !== undefined ? integerFlag(flags["max-uses"], "max-uses", { min: 1 }) : null,
    appliesTo: flagString(flags, "applies-to"),
    status: flagString(flags, "status"),
    productIds: flags["product-id"] !== undefined ? flagList(flags, "product-id") : undefined,
    categoryIds: flags["category-id"] !== undefined ? flagList(flags, "category-id") : undefined,
  });
}

async function couponPayload(flags, currency) {
  if (flags.data !== undefined) return readJsonInput(flags.data, "coupon JSON");
  const payload = couponFlags(flags);
  if (!payload.code) throw usageError("Missing --code.");
  if (!payload.type) throw usageError("Missing --type (fixed|percent).");
  if (payload.value === undefined) throw usageError("Missing --value.");
  if (payload.type === "percent" && (payload.value < 1 || payload.value > 100)) {
    throw usageError("Percent coupon value must be between 1 and 100.");
  }
  payload.minSubtotal = payload.minSubtotal ? moneyString(payload.minSubtotal, currency, "min-subtotal") : "0";
  payload.appliesTo = payload.appliesTo || "all";
  payload.status = payload.status || "active";
  payload.productIds = payload.productIds || [];
  payload.categoryIds = payload.categoryIds || [];
  payload.startsAt = payload.startsAt || null;
  payload.endsAt = payload.endsAt || null;
  payload.maxUses = payload.maxUses ?? null;
  return payload;
}

export async function couponsList(ctx) {
  const client = ctx.requireClient();
  return { data: unwrap(await client.requestJson("GET", "/api/admin/coupons")) };
}

export async function couponsGet(ctx) {
  const id = requirePositional(ctx.args, 0, "coupon id");
  const client = ctx.requireClient();
  const detail = unwrap(await client.requestJson("GET", `/api/admin/coupons/${encodeURIComponent(id)}`));
  const currency = await ctx.getCurrency();
  return {
    data: {
      ...detail,
      input: {
        code: detail.coupon.code,
        type: detail.coupon.type,
        value: detail.coupon.value,
        minSubtotal: minorToDecimal(detail.coupon.min_subtotal_cents || 0, currency),
        startsAt: detail.coupon.starts_at,
        endsAt: detail.coupon.ends_at,
        maxUses: detail.coupon.max_uses,
        appliesTo: detail.coupon.applies_to,
        status: detail.coupon.status,
        productIds: detail.productIds,
        categoryIds: detail.categoryIds,
      },
    },
  };
}

export async function couponsCreate(ctx) {
  const payload = await couponPayload(ctx.flags, await ctx.getCurrency());
  const client = ctx.requireClient();
  const data = unwrap(await client.requestJson("POST", "/api/admin/coupons", { body: payload }));
  return { data, message: `Created coupon ${data.id}.` };
}

export async function couponsUpdate(ctx) {
  const id = requirePositional(ctx.args, 0, "coupon id");
  if (ctx.flags.data === undefined) {
    throw usageError("Coupon updates replace the full resource. Pass --data with the complete coupon JSON (see `cloudcart coupons get`).");
  }
  const payload = await readJsonInput(ctx.flags.data, "coupon JSON");
  const client = ctx.requireClient();
  await client.requestJson("PUT", `/api/admin/coupons/${encodeURIComponent(id)}`, { body: payload });
  return { data: { id, ...payload }, message: `Updated coupon ${id}.` };
}

export async function couponsDelete(ctx) {
  requireConfirmation(ctx.flags, "Deleting a coupon");
  const id = requirePositional(ctx.args, 0, "coupon id");
  const client = ctx.requireClient();
  await client.requestJson("DELETE", `/api/admin/coupons/${encodeURIComponent(id)}`);
  return { data: { id, deleted: true }, message: `Deleted coupon ${id}.` };
}

export async function shippingList(ctx) {
  const client = ctx.requireClient();
  return { data: unwrap(await client.requestJson("GET", "/api/admin/shipping")) };
}

function zoneFlags(flags) {
  return stripUndefined({
    name: flagString(flags, "name"),
    countries: flags.countries !== undefined ? splitList(flags.countries).map((code) => code.toUpperCase()) : undefined,
    isDefault: flags.default !== undefined ? flagBool(flags, "default") : undefined,
  });
}

export async function shippingZoneCreate(ctx) {
  const payload = zoneFlags(ctx.flags);
  if (!payload.name || !payload.countries || payload.countries.length === 0) {
    throw usageError("Both --name and --countries are required.");
  }
  payload.isDefault = payload.isDefault ?? false;
  const client = ctx.requireClient();
  const data = unwrap(await client.requestJson("POST", "/api/admin/shipping/zones", { body: payload }));
  return { data, message: `Created shipping zone ${data.id}.` };
}

async function shippingData(ctx) {
  const client = ctx.requireClient();
  return { client, data: unwrap(await client.requestJson("GET", "/api/admin/shipping")) };
}

export async function shippingZoneUpdate(ctx) {
  const id = requirePositional(ctx.args, 0, "zone id");
  const { client, data } = await shippingData(ctx);
  const zones = Array.isArray(data) ? data : data.zones || [];
  const current = zones.find((zone) => zone.id === id);
  if (!current) throw usageError(`Shipping zone not found: ${id}`);
  let countries = current.countries;
  if (!Array.isArray(countries)) {
    try { countries = JSON.parse(current.countries_json || "[]"); } catch { countries = []; }
  }
  const payload = {
    name: current.name,
    countries,
    isDefault: Boolean(current.is_default),
    ...zoneFlags(ctx.flags),
  };
  await client.requestJson("PUT", `/api/admin/shipping/zones/${encodeURIComponent(id)}`, { body: payload });
  return { data: { id, ...payload }, message: `Updated shipping zone ${id}.` };
}

export async function shippingZoneDelete(ctx) {
  requireConfirmation(ctx.flags, "Deleting a shipping zone");
  const id = requirePositional(ctx.args, 0, "zone id");
  const client = ctx.requireClient();
  await client.requestJson("DELETE", `/api/admin/shipping/zones/${encodeURIComponent(id)}`);
  return { data: { id, deleted: true }, message: `Deleted shipping zone ${id}.` };
}

function rateFlags(flags, zoneId) {
  return stripUndefined({
    zoneId,
    name: flagString(flags, "name"),
    price: flagString(flags, "price"),
    minOrder: flagString(flags, "min-order"),
    maxOrder: flagString(flags, "max-order"),
    freeOver: flagString(flags, "free-over"),
    isActive: flags.active !== undefined ? flagBool(flags, "active") : undefined,
    position: flags.position !== undefined ? integerFlag(flags.position, "position") : undefined,
  });
}

export async function shippingRateCreate(ctx) {
  const zoneId = flagString(ctx.flags, "zone");
  if (!zoneId) throw usageError("Missing --zone.");
  const currency = await ctx.getCurrency();
  const payload = rateFlags(ctx.flags, zoneId);
  if (!payload.name || !payload.price) throw usageError("Both --name and --price are required.");
  payload.price = moneyString(payload.price, currency, "price");
  payload.minOrder = payload.minOrder ? moneyString(payload.minOrder, currency, "min-order") : "0";
  payload.maxOrder = payload.maxOrder ? moneyString(payload.maxOrder, currency, "max-order") : null;
  payload.freeOver = payload.freeOver ? moneyString(payload.freeOver, currency, "free-over") : null;
  payload.isActive = payload.isActive ?? true;
  payload.position = payload.position ?? 0;
  const client = ctx.requireClient();
  const data = unwrap(await client.requestJson("POST", "/api/admin/shipping/rates", { body: payload }));
  return { data, message: `Created shipping rate ${data.id}.` };
}

export async function shippingRateUpdate(ctx) {
  const id = requirePositional(ctx.args, 0, "rate id");
  const { client, data } = await shippingData(ctx);
  const zones = Array.isArray(data) ? data : data.zones || [];
  const current = zones.flatMap((zone) => zone.rates || []).find((rate) => rate.id === id);
  if (!current) throw usageError(`Shipping rate not found: ${id}`);
  const currency = await ctx.getCurrency();
  const payload = {
    zoneId: current.zone_id || current.zoneId,
    name: current.name,
    price: current.price || minorToDecimal(current.price_cents ?? 0, currency),
    minOrder: current.min_order || minorToDecimal(current.min_order_cents ?? 0, currency),
    maxOrder: current.max_order || (current.max_order_cents == null ? null : minorToDecimal(current.max_order_cents, currency)),
    freeOver: current.free_over || (current.free_over_cents == null ? null : minorToDecimal(current.free_over_cents, currency)),
    isActive: Boolean(current.is_active),
    position: current.position || 0,
    ...rateFlags(ctx.flags, current.zone_id || current.zoneId),
  };
  await client.requestJson("PUT", `/api/admin/shipping/rates/${encodeURIComponent(id)}`, { body: payload });
  return { data: { id, ...payload }, message: `Updated shipping rate ${id}.` };
}

export async function shippingRateDelete(ctx) {
  requireConfirmation(ctx.flags, "Deleting a shipping rate");
  const id = requirePositional(ctx.args, 0, "rate id");
  const client = ctx.requireClient();
  await client.requestJson("DELETE", `/api/admin/shipping/rates/${encodeURIComponent(id)}`);
  return { data: { id, deleted: true }, message: `Deleted shipping rate ${id}.` };
}

function taxFlags(flags) {
  return stripUndefined({
    name: flagString(flags, "name"),
    country: flagString(flags, "country"),
    region: flagString(flags, "region") || "",
    rateBps: flags["rate-percent"] !== undefined
      ? ratePercentToBps(flags["rate-percent"])
      : flags["rate-bps"] !== undefined
        ? integerFlag(flags["rate-bps"], "rate-bps", { min: 0, max: 10_000 })
        : undefined,
    active: flags.active !== undefined ? flagBool(flags, "active") : undefined,
  });
}

export async function taxList(ctx) {
  const client = ctx.requireClient();
  return { data: unwrap(await client.requestJson("GET", "/api/admin/tax-rates")) };
}

export async function taxCreate(ctx) {
  const payload = taxFlags(ctx.flags);
  if (!payload.name || !payload.country || payload.rateBps === undefined) {
    throw usageError("--name, --country and --rate-percent (or --rate-bps) are required.");
  }
  payload.active = payload.active ?? true;
  const client = ctx.requireClient();
  const data = unwrap(await client.requestJson("POST", "/api/admin/tax-rates", { body: payload }));
  return { data, message: `Created tax rate ${data.id}.` };
}

export async function taxUpdate(ctx) {
  const id = requirePositional(ctx.args, 0, "tax rate id");
  const client = ctx.requireClient();
  const list = unwrap(await client.requestJson("GET", "/api/admin/tax-rates"));
  const rates = Array.isArray(list) ? list : list.rates || [];
  const current = rates.find((rate) => rate.id === id);
  if (!current) throw usageError(`Tax rate not found: ${id}`);
  const payload = {
    name: current.name,
    country: current.country,
    region: current.region || "",
    rateBps: current.rate_bps,
    active: Boolean(current.active),
    ...taxFlags(ctx.flags),
  };
  await client.requestJson("PUT", `/api/admin/tax-rates/${encodeURIComponent(id)}`, { body: payload });
  return { data: { id, ...payload }, message: `Updated tax rate ${id}.` };
}

export async function taxDelete(ctx) {
  requireConfirmation(ctx.flags, "Deleting a tax rate");
  const id = requirePositional(ctx.args, 0, "tax rate id");
  const client = ctx.requireClient();
  await client.requestJson("DELETE", `/api/admin/tax-rates/${encodeURIComponent(id)}`);
  return { data: { id, deleted: true }, message: `Deleted tax rate ${id}.` };
}
