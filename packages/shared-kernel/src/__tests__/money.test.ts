import { describe, it, expect } from "vitest";
import { Money, parseMoney } from "../money.js";

describe("Money", () => {
  describe("Money.of()", () => {
    it("creates from number", () => {
      const m = Money.of(1.5);
      expect(m.toString(2)).toBe("1.50");
    });

    it("creates from string", () => {
      const m = Money.of("0.00123456");
      expect(m.toString(8)).toBe("0.00123456");
    });

    it("preserves precision beyond float64", () => {
      const m = Money.of("0.1").add(Money.of("0.2"));
      // Native JS: 0.1 + 0.2 = 0.30000000000000004
      // Decimal.js: exactly 0.3
      expect(m.toString(1)).toBe("0.3");
    });
  });

  describe("Money.zero()", () => {
    it("creates zero USD", () => {
      const m = Money.zero();
      expect(m.isZero()).toBe(true);
      expect(m.currency).toBe("USD");
    });
  });

  describe("arithmetic", () => {
    it("adds two Money values", () => {
      const a = Money.usd("0.032");
      const b = Money.usd("0.018");
      expect(a.add(b).toString(3)).toBe("0.050");
    });

    it("subtracts Money values", () => {
      const a = Money.usd("0.50");
      const b = Money.usd("0.032");
      expect(a.subtract(b).toString(3)).toBe("0.468");
    });

    it("multiplies by a factor", () => {
      const m = Money.usd("0.10");
      expect(m.multiply(3).toString(2)).toBe("0.30");
    });

    it("throws on currency mismatch", () => {
      const usd = Money.usd("1.00");
      const idr = Money.of("1.00", "IDR");
      expect(() => usd.add(idr)).toThrow("Currency mismatch");
    });
  });

  describe("comparisons", () => {
    it("gte returns true when equal", () => {
      expect(Money.usd("0.50").gte(Money.usd("0.50"))).toBe(true);
    });

    it("gte returns false when less", () => {
      expect(Money.usd("0.30").gte(Money.usd("0.50"))).toBe(false);
    });

    it("gt returns true when greater", () => {
      expect(Money.usd("0.51").gt(Money.usd("0.50"))).toBe(true);
    });

    it("isNegative returns true for negative amounts", () => {
      expect(Money.usd("0.50").subtract(Money.usd("1.00")).isNegative()).toBe(
        true,
      );
    });
  });

  describe("parseMoney()", () => {
    it("parses a decimal string", () => {
      const m = parseMoney("0.032");
      expect(m.toString(3)).toBe("0.032");
    });

    it("returns zero for null", () => {
      expect(parseMoney(null).isZero()).toBe(true);
    });

    it("returns zero for undefined", () => {
      expect(parseMoney(undefined).isZero()).toBe(true);
    });
  });
});
