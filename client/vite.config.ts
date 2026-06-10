import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const contextRoot = (process.env.VITE_CONTEXT_ROOT ?? "").replace(/^\/+|\/+$/g, "");
const apiProxyPath = contextRoot ? `/${contextRoot}/api` : "/api";

export default defineConfig({
  base: contextRoot ? `/${contextRoot}/` : "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@assessment-os/shared": path.resolve(__dirname, "../packages/shared/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      [apiProxyPath]: {
        target: "http://localhost:3001",
        changeOrigin: true,
        cookieDomainRewrite: "localhost",
      },
    },
  },
});
