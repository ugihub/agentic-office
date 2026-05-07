import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "#080808",
        surface: "#111111",
        raised: "#1a1a1a",
        border: "#262626",
        primary: "#ededed",
        secondary: "#888888",
        muted: "#555555",
        brand: {
          400: "#60a5fa",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        running: "#8b5cf6",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Menlo", "Monaco", "Courier New", "monospace"],
      },
      keyframes: {
        scanline: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(400%)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        dotPulse: {
          "0%, 100%": {
            opacity: "0.3",
            filter: "drop-shadow(0 0 2px #60a5fa)",
          },
          "50%": { opacity: "1", filter: "drop-shadow(0 0 8px #60a5fa)" },
        },
        progressFill: {
          "0%": { width: "0%" },
          "100%": { width: "80%" },
        },
        overlayFadeOut: {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
      },
      animation: {
        scanline: "scanline 2s linear infinite",
        shimmer: "shimmer 2s linear infinite",
        slideUp: "slideUp 0.2s ease-out forwards",
        dotPulse: "dotPulse 1.2s ease-in-out infinite",
        progressFill: "progressFill 3s ease-out forwards",
        overlayFadeOut: "overlayFadeOut 0.4s ease-out forwards",
        blink: "blink 1s step-end infinite",
      },
    },
  },
  plugins: [],
};

export default config;
