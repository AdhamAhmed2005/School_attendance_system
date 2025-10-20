import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      // Proxy API requests to the backend to avoid CORS during local development
      '/api': {
        target: 'https://school-discipline.runasp.net',
        changeOrigin: true,
        secure: true,
        // If the backend expects paths without /api prefix, uncomment rewrite
        // rewrite: (path) => path.replace(/^\/api/, '/api')
      },
    },
  },
});
