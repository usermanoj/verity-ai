import path from "node:path";
import { defineConfig } from "vitest/config";

// Only needed once evals/eval.test.ts started importing route files that
// use the "@/*" alias (tsconfig.json maps it to src/*) — Next.js resolves
// this natively, but vitest doesn't share that resolution by default.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
