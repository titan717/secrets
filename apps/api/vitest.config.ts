import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // PGlite is single-connection; keep everything in one worker.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
