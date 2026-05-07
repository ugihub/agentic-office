import { describe, it, expect } from "vitest";
import {
  classifyCacheCategory,
  effectiveTtl,
  SYSTEM_FLOOR_TTL,
  TENANT_MAX_TTL,
} from "../cache/category-cache.js";

describe("classifyCacheCategory", () => {
  it("classifies financial prompts correctly", () => {
    expect(classifyCacheCategory("harga bitcoin hari ini")).toBe("financial");
    expect(
      classifyCacheCategory("what is the current stock price of AAPL"),
    ).toBe("financial");
    expect(classifyCacheCategory("kurs dollar ke rupiah")).toBe("financial");
    expect(classifyCacheCategory("crypto market cap")).toBe("financial");
  });

  it("classifies temporal prompts", () => {
    expect(classifyCacheCategory("what happened today in tech")).toBe(
      "temporal",
    );
    expect(classifyCacheCategory("berita terbaru tentang AI")).toBe("temporal");
    expect(classifyCacheCategory("tren teknologi minggu ini")).toBe("temporal");
  });

  it("classifies personnel prompts", () => {
    expect(classifyCacheCategory("who is the CEO of OpenAI")).toBe("personnel");
    expect(classifyCacheCategory("siapa direktur utama Telkom")).toBe(
      "personnel",
    );
  });

  it("classifies inventory prompts", () => {
    expect(classifyCacheCategory("is this product in stock")).toBe("inventory");
    expect(classifyCacheCategory("cek stok barang tersedia")).toBe("inventory");
  });

  it("defaults non-matching prompts", () => {
    expect(classifyCacheCategory("explain how neural networks work")).toBe(
      "default",
    );
    expect(classifyCacheCategory("write a poem about autumn")).toBe("default");
  });
});

describe("effectiveTtl", () => {
  it("financial always returns 0 regardless of tenant override", () => {
    expect(effectiveTtl("financial")).toBe(0);
    expect(effectiveTtl("financial", 99999)).toBe(0);
    expect(effectiveTtl("financial", TENANT_MAX_TTL.financial)).toBe(0);
  });

  it("uses floor when no tenant override", () => {
    expect(effectiveTtl("temporal")).toBe(SYSTEM_FLOOR_TTL.temporal);
    expect(effectiveTtl("default")).toBe(SYSTEM_FLOOR_TTL.default);
  });

  it("applies tenant override within bounds", () => {
    // temporal floor=60, max=600
    expect(effectiveTtl("temporal", 300)).toBe(300);
  });

  it("clamps tenant override to floor", () => {
    // temporal floor=60 — cannot go below
    expect(effectiveTtl("temporal", 30)).toBe(60);
  });

  it("clamps tenant override to max", () => {
    // temporal max=600 — cannot go above
    expect(effectiveTtl("temporal", 9999)).toBe(600);
  });

  it("default category respects tenant override", () => {
    // default floor=3600, max=604800
    expect(effectiveTtl("default", 7200)).toBe(7200);
  });
});
