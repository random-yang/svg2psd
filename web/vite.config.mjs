import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  root: ".",
  plugins: [wasm()],
  build: {
    outDir: "dist",
    target: "esnext",
  },
  optimizeDeps: {
    exclude: ["@resvg/resvg-wasm"],
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
