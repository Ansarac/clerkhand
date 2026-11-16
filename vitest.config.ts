import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    unstubEnvs: true,
  },
});
