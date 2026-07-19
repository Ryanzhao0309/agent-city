import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Agent City web client.
// In dev, API calls to /api/* are proxied to the local Fastify server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
  },
});
