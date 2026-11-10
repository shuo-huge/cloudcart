import { describe, expect, it } from "vitest";
import { currencyExponent, minorToDecimal, moneyString, ratePercentToBps } from "../src/money.mjs";

describe("money helpers", () => {
  it("converts minor units by currency exponent", () => {
    expect(minorToDecimal(2500, "USD")).toBe("25.00");
    expect(minorToDecimal(2500, "JPY")).toBe("2500");
    expect(minorToDecimal(1234, "BHD")).toBe("1.234");
    expect(currencyExponent("KRW")).toBe(0);
  });

  it("validates decimal input and rates", () => {
    expect(moneyString(19.9, "USD")).toBe("19.90");
    expect(moneyString("19.99", "USD")).toBe("19.99");
    expect(() => moneyString("-1", "USD")).toThrow();
    expect(ratePercentToBps("8.25")).toBe(825);
    expect(() => ratePercentToBps("101")).toThrow();
  });
});
