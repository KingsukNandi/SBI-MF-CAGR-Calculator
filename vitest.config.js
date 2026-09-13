import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure calculation tests only. Component tests would need jsdom; the
    // calculation layer is deliberately free of React so it stays this simple.
    include: ["lib/**/*.test.js"],
    environment: "node",
  },
});
