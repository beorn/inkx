import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    reporters: ["tap"],
    include: ["tests/**/*.test.ts"],
  },
})
