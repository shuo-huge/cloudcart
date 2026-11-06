import { describe, expect, it } from "vitest";
import { renderSetupHtml } from "../apps/worker/src/routes/auth";

describe("first-run setup page", () => {
  it("carries the one-time token in a hidden field instead of asking the user to type it", () => {
    const html = renderSetupHtml("", null, "private-one-time-token");

    expect(html).toContain('<input type="hidden" name="setupToken" value="private-one-time-token">');
    expect(html).not.toContain('label for="setupToken"');
    expect(html).not.toContain('name="storeName"');
    expect(html).not.toContain('name="currency"');
    expect(html).toContain('name="name"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    expect(html).toContain("Create administrator");
  });

  it("disables administrator creation when the private setup link token is missing", () => {
    const html = renderSetupHtml("", "Open the one-time setup link.", "");

    expect(html).toContain("Open the one-time setup link.");
    expect(html).toContain('<button type="submit" disabled>');
  });

  it("escapes the token before embedding it in the hidden form field", () => {
    const html = renderSetupHtml("", null, '" onfocus="alert(1)');

    expect(html).not.toContain('value="" onfocus="alert(1)"');
    expect(html).toContain("&quot; onfocus=&quot;alert(1)");
  });
});
