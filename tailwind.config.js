/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Figtree", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["EB Garamond", "Georgia", "serif"],
      },
      colors: {
        canvas: "#fcfcfb",
        surface: "#ffffff",
        wash: "#f4f2ec",
        border: "#deddd7",
        soft: "#eceae4",
        foreground: "#1a1a1a",
        ink: "#1a1a1a",
        muted: "#71716e",
        faint: "#6f6f76",
        accent: "#1a1a1a",
      },
      borderRadius: {
        card: "8px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(26,26,26,0.05), 0 4px 16px rgba(26,26,26,0.06)",
        pill: "0 8px 32px rgba(0,0,0,0.35)",
      },
    },
  },
  plugins: [],
};
