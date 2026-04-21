import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    maxConcurrency: 1,
    env: {
      DATABASE_URL: "file:./prisma/vitest.db",
      SESSION_SECRET: "test-session-secret-test-session-secret",
      VITEST: "1",
      TURSO_DATABASE_URL: "",
      TURSO_AUTH_TOKEN: "",
    },
  },
});
