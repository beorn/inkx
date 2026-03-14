import { defineConfig } from "vitest/config"

export default defineConfig({
	cacheDir: "node_modules/.vitest",
	test: {
		include: ["apps/km-tui/tests/pty-integration.slow.spec.ts"],
		exclude: ["**/node_modules/**"],
		setupFiles: ["./packages/km-infra/vitest/setup.ts"],
	},
})
