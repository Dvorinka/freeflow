import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri dev server must be exactly http://localhost:1420 (see tauri.conf.json).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { outDir: "dist", target: "es2021" },
});
