import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Separate from vite.config.ts on purpose: the tests run in plain Node, with
// the Workers runtime module replaced by an in-memory stand-in.
export default defineConfig({
  resolve: {
    alias: {
      "cloudflare:workers": fromRoot("./tests/support/cloudflare-workers.ts"),
      "@": fromRoot("."),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
    unstubGlobals: true,
  },
});
