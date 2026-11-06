import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  // Assets live under /static/admin-ui/* so they are served by Workers Static
  // Assets instead of being caught by the Worker's /admin SPA route.
  base: "/static/admin-ui/",
  plugins: [preact()],
  build: {
    outDir: "../../dist/static/admin-ui",
    emptyOutDir: true,
    assetsDir: "assets",
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].[hash].js",
        chunkFileNames: "assets/[name].[hash].js",
        assetFileNames: "assets/[name].[hash][extname]",
      },
    },
  },
});
