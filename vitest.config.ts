import { defineConfig } from "vitest/config";


const COVERAGE_FLOOR = 80;

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    clearMocks: true,
    coverage: {
      provider: "v8",
      reportsDirectory: "reports/coverage",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.spec.ts",
        "src/hook.ts",
        "src/notify.ts",
        "src/watcher.ts",
        "src/setup.ts",
        "src/edges/paths.ts",
        "src/edges/presence.ts",
        "src/edges/telegram.ts",
        "src/edges/usage-api.ts",
        "src/edges/watcher-process.ts",
      ],
      thresholds: {
        statements: COVERAGE_FLOOR,
        branches: COVERAGE_FLOOR,
        functions: COVERAGE_FLOOR,
        lines: COVERAGE_FLOOR,
      },
    },
  },
});
