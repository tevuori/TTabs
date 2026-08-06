import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0a0a0b",
          card: "#131316",
          hover: "#1a1a1f",
          border: "#26262e",
        },
        accent: {
          DEFAULT: "#f97316",
          hover: "#ea580c",
          muted: "#c2410c",
        },
        text: {
          DEFAULT: "#e4e4e7",
          muted: "#71717a",
          dim: "#52525b",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
