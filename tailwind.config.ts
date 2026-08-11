import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        surface: "#ffffff",
        muted: "#6b6b68"
      }
    }
  },
  plugins: []
};

export default config;
