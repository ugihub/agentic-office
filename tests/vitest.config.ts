import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30_000,
    include: ["e2e/**/*.test.ts", "performance/**/*.test.ts", "security/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: {
      "@bureau/shared-kernel": resolve(
        __dirname,
        "../packages/shared-kernel/src/index.ts",
      ),
      "@bureau/contracts": resolve(
        __dirname,
        "../packages/contracts/src/index.ts",
      ),
      "@bureau/agents-core": resolve(
        __dirname,
        "../packages/agents-core/src/index.ts",
      ),
      "@bureau/auth": resolve(__dirname, "../packages/auth/src/index.ts"),
      "@bureau/cost-analytics": resolve(
        __dirname,
        "../packages/cost-analytics/src/index.ts",
      ),
      "@bureau/infra-messaging": resolve(
        __dirname,
        "../packages/infra-messaging/src/index.ts",
      ),
      "@bureau/infra-mongo": resolve(
        __dirname,
        "../packages/infra-mongo/src/index.ts",
      ),
      "@bureau/llm-providers": resolve(
        __dirname,
        "../packages/llm-providers/src/index.ts",
      ),
      "@bureau/models": resolve(__dirname, "../packages/models/src/index.ts"),
      "@bureau/task-machine": resolve(
        __dirname,
        "../packages/task-machine/src/index.ts",
      ),
      "@bureau/telemetry": resolve(
        __dirname,
        "../packages/telemetry/src/index.ts",
      ),
    },
  },
});
