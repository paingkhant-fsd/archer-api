import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    globalSetup: ["./test/global-setup.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "file:./test.db",
      JWT_ACCESS_SECRET: "test-access-secret-that-is-at-least-32-characters",
      JWT_REFRESH_SECRET: "test-refresh-secret-that-is-at-least-32-characters",
      ACCESS_TOKEN_TTL: "15m",
      REFRESH_TOKEN_TTL_DAYS: "30",
      CORS_ORIGIN: "http://localhost:5173",
    },
  },
});
