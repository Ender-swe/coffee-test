import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const proxy = {
  "/api": {
    target: process.env.API_URL || "http://127.0.0.1:3001",
    changeOrigin: true,
  },
};

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        ["index", "shop", "checkout", "signup", "login", "order"].map(
          (page) => [
            page,
            fileURLToPath(new URL(`./${page}.html`, import.meta.url)),
          ],
        ),
      ),
    },
  },
  server: { port: 3000, strictPort: true, proxy },
  preview: { port: 3000, strictPort: true, proxy },
});
