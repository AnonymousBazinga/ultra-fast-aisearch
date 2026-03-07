import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      colors: {
        surface: {
          primary: "#ffffff",
          secondary: "#f7f7f5",
          tertiary: "#f0f0ee",
          hover: "#ebebea",
        },
        ink: {
          primary: "#1a1a1a",
          secondary: "#6b6b6b",
          tertiary: "#9b9b9b",
          ghost: "#c7c7c7",
        },
        accent: {
          DEFAULT: "#2f6feb",
          light: "#e8f0fe",
          hover: "#1a5cd4",
        },
        border: {
          light: "#e8e8e6",
          DEFAULT: "#ddddd9",
        },
      },
      fontSize: {
        "display": ["2rem", { lineHeight: "1.2", letterSpacing: "-0.03em", fontWeight: "600" }],
        "title": ["1.25rem", { lineHeight: "1.4", letterSpacing: "-0.02em", fontWeight: "600" }],
        "body": ["0.9375rem", { lineHeight: "1.65", letterSpacing: "-0.006em" }],
        "small": ["0.8125rem", { lineHeight: "1.5", letterSpacing: "-0.003em" }],
        "tiny": ["0.6875rem", { lineHeight: "1.4", letterSpacing: "0.01em" }],
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.35s ease-out",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
