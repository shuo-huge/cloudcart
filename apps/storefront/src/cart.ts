export interface CartLine {
  itemId: string;
  productId: string;
  variantId: string | null;
  name: string;
  slug: string;
  unitPriceCents: number;
  quantity: number;
  totalCents: number;
  available: boolean;
}

export interface CartResponse {
  ok: boolean;
  cart?: {
    lines: CartLine[];
    itemCount: number;
    subtotalCents: number;
    discountCents: number;
    shippingCents: number;
    totalCents: number;
    couponCode: string | null;
    couponError: string | null;
  };
  error?: { code: string; message: string };
}

async function request(path: string, init: RequestInit): Promise<CartResponse> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
    credentials: "same-origin",
  });
  let body: CartResponse;
  try {
    body = (await res.json()) as CartResponse;
  } catch {
    body = { ok: false, error: { code: "network_error", message: "The cart service is unavailable." } };
  }
  if (!res.ok && body.ok) {
    body = { ok: false, error: { code: "request_failed", message: "The cart request failed." } };
  }
  return body;
}

/** Server-backed cart. The server is the source of truth for prices and stock. */
export class CartStore {
  itemCount = 0;
  private listeners = new Set<(count: number) => void>();

  async add(productId: string, variantId: string | null, quantity: number): Promise<CartResponse> {
    const result = await request("/api/cart/items", {
      method: "POST",
      body: JSON.stringify({ productId, variantId, quantity }),
    });
    this.sync(result);
    return result;
  }

  async update(itemId: string, quantity: number): Promise<CartResponse> {
    const result = await request(`/api/cart/items/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    });
    this.sync(result);
    return result;
  }

  async remove(itemId: string): Promise<CartResponse> {
    const result = await request(`/api/cart/items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
      body: JSON.stringify({}),
    });
    this.sync(result);
    return result;
  }

  async applyCoupon(code: string): Promise<CartResponse> {
    const result = await request("/api/cart/coupon", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    this.sync(result);
    return result;
  }

  async refresh(): Promise<void> {
    const res = await fetch("/api/cart", { headers: { Accept: "application/json" } });
    if (!res.ok) return;
    const body = (await res.json()) as CartResponse;
    this.sync(body);
  }

  onChange(listener: (count: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitChange(count = this.itemCount): void {
    this.itemCount = count;
    for (const listener of this.listeners) listener(count);
    for (const badge of document.querySelectorAll<HTMLElement>("[data-cart-count]")) {
      badge.textContent = String(count);
    }
  }

  private sync(result: CartResponse): void {
    if (result.ok && result.cart) this.emitChange(result.cart.itemCount);
  }
}

function showMessage(message: string, isError = true): void {
  const region = document.querySelector("[data-cart-message]");
  if (!region) {
    if (isError) window.alert(message);
    return;
  }
  region.textContent = message;
  region.classList.toggle("cc-error", isError);
  window.setTimeout(() => { region.textContent = ""; }, 4000);
}

export function bindCartButtons(cart: CartStore): void {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLElement>("[data-add-to-cart]");
    if (!button) return;
    event.preventDefault();
    const productId = button.dataset.productId;
    if (!productId) return;
    const quantityInput = document.querySelector("[data-quantity-input]") as HTMLInputElement | null;
    const variant = document.querySelector("[data-variant-select]") as HTMLSelectElement | null;
    const quantity = Number(quantityInput?.value ?? 1) || 1;
    const original = button.textContent;
    button.setAttribute("aria-busy", "true");
    void cart.add(productId, variant?.value || null, quantity).then((result) => {
      button.removeAttribute("aria-busy");
      if (result.ok) {
        button.textContent = "Added to cart";
        showMessage("Added to cart.", false);
        if (button.dataset.redirect === "cart") window.location.assign("/cart");
        window.setTimeout(() => { button.textContent = original; }, 1500);
      } else {
        showMessage(result.error?.message ?? "Unable to add this item.", true);
      }
    });
  });
}

export function bindCartPage(cart: CartStore): void {
  const page = document.querySelector("[data-cart-page]");
  if (!page) return;

  page.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const remove = target.closest<HTMLElement>("[data-cart-remove]");
    if (remove?.dataset.itemId) {
      event.preventDefault();
      void cart.remove(remove.dataset.itemId).then((result) => {
        if (result.ok) window.location.reload();
        else showMessage(result.error?.message ?? "Unable to update the cart.");
      });
      return;
    }
    const qtyButton = target.closest<HTMLElement>("[data-qty-step]");
    if (qtyButton) {
      event.preventDefault();
      const input = qtyButton.parentElement?.querySelector("input[data-cart-qty]") as HTMLInputElement | null;
      if (!input) return;
      const step = Number(qtyButton.dataset.qtyStep ?? 0);
      const next = Math.max(1, (Number(input.value) || 1) + step);
      input.value = String(next);
      void updateQuantity(cart, input);
    }
  });

  page.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches("[data-cart-qty]")) return;
    void updateQuantity(cart, target);
  });

  const couponForm = page.querySelector("[data-coupon-form]") as HTMLFormElement | null;
  couponForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = couponForm.querySelector("input[name='code']") as HTMLInputElement | null;
    void cart.applyCoupon(input?.value ?? "").then((result) => {
      if (result.ok) window.location.reload();
      else showMessage(result.error?.message ?? "This coupon could not be applied.");
    });
  });
}

/** Keep product gallery controls keyboard- and touch-friendly. */
export function bindProductGallery(): void {
  const mainImage = document.querySelector<HTMLImageElement>("[data-product-main-image]");
  if (!mainImage) return;

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>("[data-gallery-image]");
    if (!button) return;

    const nextUrl = button.dataset.imageUrl;
    if (!nextUrl) return;
    mainImage.src = nextUrl;
    mainImage.alt = button.dataset.imageAlt ?? "";
    document.querySelectorAll<HTMLButtonElement>("[data-gallery-image]").forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
  });
}

/** Reveal a compact add-to-cart bar after the main purchase button scrolls away. */
export function bindStickyProductBar(): void {
  const bar = document.querySelector<HTMLElement>("[data-sticky-product-bar]");
  const primaryButton = document.querySelector<HTMLElement>(
    "[data-add-to-cart]:not([data-sticky-add-to-cart])",
  );
  if (!bar || !primaryButton || typeof IntersectionObserver === "undefined") return;

  const observer = new IntersectionObserver(([entry]) => {
    const show = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    bar.classList.toggle("is-visible", show);
    bar.setAttribute("aria-hidden", String(!show));
  }, { threshold: 0 });

  observer.observe(primaryButton);
}

function updateQuantity(cart: CartStore, input: HTMLInputElement): Promise<void> {
  const itemId = input.dataset.itemId;
  if (!itemId) return Promise.resolve();
  return cart.update(itemId, Number(input.value) || 1).then((result) => {
    if (result.ok) window.location.reload();
    else {
      showMessage(result.error?.message ?? "Unable to update the quantity.");
      input.value = input.dataset.previousValue ?? "1";
    }
  });
}
