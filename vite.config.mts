import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = dirname(fileURLToPath(import.meta.url));
const kitDir = resolve(rootDir, "vendor/object-kit");

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  resolve: {
    alias: {
      "@object/kit": kitDir,
    },
  },
  build: {
    outDir: resolve(rootDir, "dist/web"),
    emptyOutDir: false,
    target: "es2022",
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(rootDir, "src/webapp/host.ts"),
      name: "OpmWebAppHost",
      formats: ["iife"],
      fileName: () => "webapp.js",
      cssFileName: "webapp",
    },
  },
});
