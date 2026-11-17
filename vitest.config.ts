import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    // Authentication tests set real Windows ACLs through several OS subprocesses.
    testTimeout: 30_000,
    hookTimeout: 10_000,
    unstubEnvs: true,
  },
});
