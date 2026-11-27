import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API = process.env.VITE_DEV_API ?? "http://localhost:8080";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/v1": { target: API, changeOrigin: true, ws: true },
      "/health": { target: API, changeOrigin: true },
    },
  },
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 900 },
});
