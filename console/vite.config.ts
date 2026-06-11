/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// The console ships as static assets served by the admin plane at /admin;
// the API lives at /admin/api. Same origin, no CORS.
export default defineConfig({
  base: "/admin/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  build: {
    rollupOptions: {
      output: {
        // CodeMirror and Recharts only load on their routes; keep them out
        // of the initial bundle (budget: 200KB gz).
        manualChunks: {
          codemirror: [
            "codemirror",
            "@codemirror/state",
            "@codemirror/view",
            "@codemirror/lint",
            "@codemirror/merge",
            "@codemirror/lang-yaml",
          ],
          recharts: ["recharts"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
