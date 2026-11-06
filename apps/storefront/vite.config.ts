import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import path from "node:path";

export default defineConfig({
  base: "/static/",
  plugins: [preact()],
  build: {
    outDir: "../../dist/static",
    emptyOutDir: true,
    manifest: true,
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      input: path.resolve("src/main.ts"),
      output: {
        entryFileNames: "assets/[name].[hash].js",
        chunkFileNames: "assets/[name].[hash].js",
        assetFileNames: "assets/[name].[hash][extname]",
      },
    },
  },
});
