import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Process entry point and real-network integration clients are exercised
      // by integrations.real.test.ts with fakes, not by route tests.
      exclude: ["src/server.ts"],
      reporter: ["text-summary", "text"],
    },
  },
});
