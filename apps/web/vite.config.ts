import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const apiProxy = {
  "/api": {
    target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3000",
    changeOrigin: false,
  },
};

export default defineConfig({
  envDir: "../..",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [tailwindcss(), react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true, proxy: apiProxy },
});
