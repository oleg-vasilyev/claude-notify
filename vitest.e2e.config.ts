import { defineConfig } from "vitest/config";


const A_SCENARIO_IS_SLOW_MS = 120_000;

export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.spec.ts"],
    testTimeout: A_SCENARIO_IS_SLOW_MS,
    hookTimeout: A_SCENARIO_IS_SLOW_MS,
    fileParallelism: false,
    clearMocks: true,
  },
});
