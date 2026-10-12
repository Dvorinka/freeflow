/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0b0f14",
        surface: "#111827",
        border: "#1f2937",
        foreground: "#e5e7eb",
        muted: "#9ca3af",
        accent: "#38bdf8",
      },
    },
  },
  plugins: [],
};
