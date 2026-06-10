import { defineConfig } from "vitest/config"

// Root config so the repo is standalone-testable: without one, vitest walks
// up from vendor/silvery into km's root vitest.config.ts (monorepo leak) and
// dies on km-only setup files. Keep in sync with the packages' test layout.
export default defineConfig({
  test: {
    include: [
      "packages/*/tests/**/*.test.{ts,tsx}",
      "packages/*/src/**/*.test.{ts,tsx}",
      "packages/*/src/**/__tests__/**/*.test.{ts,tsx}",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "packages/examples/**"],
  },
})
