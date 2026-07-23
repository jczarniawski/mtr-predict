import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1a2a",
        canvas: "#f7f8fa",
        line: "#e7eaf0",
        yes: {
          DEFAULT: "#059669",
          strong: "#047857",
          soft: "#e8f7f0",
          softer: "#f2fbf7",
        },
        no: {
          DEFAULT: "#e11d48",
          strong: "#be123c",
          soft: "#fdeef2",
          softer: "#fef6f8",
        },
        brand: {
          DEFAULT: "#4f46e5",
          dark: "#4338ca",
          soft: "#eef2ff",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,26,42,0.05)",
        pop: "0 12px 32px rgba(15,26,42,0.12)",
        hero: "0 1px 2px rgba(15,26,42,0.04), 0 16px 48px rgba(79,70,229,0.08)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
