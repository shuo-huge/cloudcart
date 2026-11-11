import { describe, expect, it } from "vitest";
import { formatMoney, parseMoneyInput, percentageOf, slugify, safeRedirectPath } from "@cloudcart/shared";
import { sanitizeHtml, securityHeaders } from "@cloudcart/security";

describe("money", () => {
  it("parses decimal input into integer minor units without floats", () => {
    expect(parseMoneyInput("19.99")).toBe(1999);
    expect(parseMoneyInput("0.01")).toBe(1);
    expect(parseMoneyInput("1234.5")).toBe(123450);
    expect(parseMoneyInput("10", "JPY")).toBe(10);
  });

  it("rejects invalid money input", () => {
    expect(() => parseMoneyInput("1.2.3")).toThrow();
    expect(() => parseMoneyInput("-5")).toThrow();
  });

  it("computes percentages with integer rounding", () => {
    expect(percentageOf(1000, 1500)).toBe(150); // 15%
    expect(percentageOf(999, 1000)).toBe(100);
  });

  it("formats money for display", () => {
    expect(formatMoney(1999, "USD")).toContain("19.99");
  });
});

describe("slugs and redirects", () => {
  it("normalizes product names", () => {
    expect(slugify("  Hello, World!  ")).toBe("hello-world");
    expect(slugify("Café au lait")).toBe("cafe-au-lait");
  });

  it("blocks open redirects", () => {
    expect(safeRedirectPath("https://evil.example")).toBe("/");
    expect(safeRedirectPath("//evil.example")).toBe("/");
    expect(safeRedirectPath("/products/ok")).toBe("/products/ok");
  });
});

describe("security headers", () => {
  it("allows hosted payment redirects in form-action", () => {
    const csp = securityHeaders()["Content-Security-Policy"] ?? "";
    for (const origin of [
      "https://checkout.stripe.com",
      "https://buy.stripe.com",
      "https://www.paypal.com",
      "https://www.sandbox.paypal.com",
    ]) {
      expect(csp).toContain(origin);
    }
    expect(csp).toContain("form-action 'self'");
  });
});

describe("html sanitizer", () => {
  it("removes scripts and event handlers", () => {
    const html = sanitizeHtml('<p onclick="alert(1)">Hi<script>alert(2)</script><a href="javascript:alert(3)">x</a></p>');
    expect(html).not.toContain("script");
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("<p>Hi");
    expect(html).toContain("<a>x</a>");
  });

  it("keeps safe links and images when allowed", () => {
    expect(sanitizeHtml('<a href="https://example.com">ok</a>')).toContain('href="https://example.com"');
    expect(sanitizeHtml('<img src="/media/a.webp" alt="a">', { allowImages: true }))
      .toContain('src="/media/a.webp"');
    expect(sanitizeHtml('<img src="/media/a.webp" alt="a">')).not.toContain("src=");
  });

  it("escapes plain text", () => {
    expect(sanitizeHtml("<b>safe</b><style>body{display:none}</style>")).toBe("<b>safe</b>");
  });
});
