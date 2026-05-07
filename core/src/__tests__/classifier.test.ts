import { describe, it, expect } from "vitest";
import {
  classifyPath,
  classifyCacheCategory,
  SYSTEM_FLOOR_TTL,
} from "../path-classifier/classifier.js";

describe("Path Classifier", () => {
  describe("classifyPath()", () => {
    it("classifies short simple prompt as fast", () => {
      const result = classifyPath({ prompt: "Buat slogan untuk toko kopi." });
      expect(result.path).toBe("fast");
    });

    it("classifies prompt with code as full", () => {
      const result = classifyPath({
        prompt:
          "Refactor this function:\n```\nfunction hello() { return 1 }\n```\n",
      });
      expect(result.path).toBe("full");
    });

    it("classifies research + long prompt as full", () => {
      const longResearchPrompt =
        "Analisis komprehensif " + "tren pasar fintech Indonesia ".repeat(20);
      const result = classifyPath({ prompt: longResearchPrompt });
      expect(result.path).toBe("full");
      expect(result.signals.hasResearch).toBe(true);
    });

    it("classifies medium research prompt as standard", () => {
      const result = classifyPath({
        prompt: "Bandingkan dua startup AI di Indonesia.",
      });
      expect(result.path).toBe("standard");
      expect(result.signals.hasResearch).toBe(true);
    });

    it("detects temporal signals", () => {
      const result = classifyPath({
        prompt: "Apa berita terbaru tentang Bitcoin?",
      });
      expect(result.signals.hasTemporal).toBe(true);
      expect(result.path).not.toBe("fast");
    });

    it("includes token count in signals", () => {
      const prompt = "Halo dunia";
      const result = classifyPath({ prompt });
      expect(result.signals.tokenCount).toBeGreaterThan(0);
    });
  });

  describe("classifyCacheCategory()", () => {
    it("classifies financial prompts", () => {
      expect(classifyCacheCategory("Berapa harga Bitcoin sekarang?")).toBe(
        "financial",
      );
      expect(classifyCacheCategory("Kurs USD/IDR hari ini?")).toBe("financial");
    });

    it("classifies temporal prompts", () => {
      expect(classifyCacheCategory("Apa yang terjadi hari ini?")).toBe(
        "temporal",
      );
    });

    it("classifies personnel prompts", () => {
      expect(classifyCacheCategory("Siapa CEO Anthropic?")).toBe("personnel");
    });

    it("classifies inventory prompts", () => {
      expect(classifyCacheCategory("Apakah produk ini tersedia?")).toBe(
        "inventory",
      );
    });

    it("defaults to default category", () => {
      expect(classifyCacheCategory("Jelaskan konsep machine learning.")).toBe(
        "default",
      );
    });
  });

  describe("SYSTEM_FLOOR_TTL", () => {
    it("financial TTL is 0 — never cached", () => {
      expect(SYSTEM_FLOOR_TTL.financial).toBe(0);
    });

    it("all other categories have positive TTL", () => {
      expect(SYSTEM_FLOOR_TTL.temporal).toBeGreaterThan(0);
      expect(SYSTEM_FLOOR_TTL.personnel).toBeGreaterThan(0);
      expect(SYSTEM_FLOOR_TTL.inventory).toBeGreaterThan(0);
      expect(SYSTEM_FLOOR_TTL.default).toBeGreaterThan(0);
    });
  });
});
