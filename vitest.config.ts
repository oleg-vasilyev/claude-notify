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
        "src/watcher-process.ts",
        "src/presence/idle-time.ts",
        "src/state/file-locations.ts",
        "src/telegram/telegram-api.ts",
        "src/usage/usage-api.ts",
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
