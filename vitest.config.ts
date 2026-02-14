import { mdtest } from "@beorn/mdtest/vitest-plugin"
import { defineConfig } from "vitest/config"
import { availableParallelism } from "node:os"

export default defineConfig({
	cacheDir: "node_modules/.vitest",
	plugins: [mdtest()],
	test: {
		reporter: "dot",
		includeTaskLocation: true,
		outputFile: {
			html: "./test-results/vitest-report.html",
			junit: "./test-results/junit.xml",
		},
		maxWorkers: process.env.VITEST_MAX_WORKERS
			? Number.parseInt(process.env.VITEST_MAX_WORKERS)
			: Math.max(availableParallelism() - 1, 1),
		server: {
			deps: {
				inline: ["zod"],
			},
		},
		include: process.env.FUZZ
			? ["**/*.fuzz.ts"]
			: ["**/*.{test,spec}.{ts,tsx,md}"],
		exclude: [
			"**/node_modules/**",
			"**/dist/**",
			"**/.direnv/**",
			// Uses bun:test integration — incompatible with vitest runner
			"vendor/beorn-mdtest/tests/mdtest-e2e.slow.test.ts",
			// Spawns real km subprocess with PTY — needs full CPU, can't run in parallel
			"apps/km-tui/tests/pty-integration.slow.spec.ts",
		],
		setupFiles: ["./packages/km-infra/vitest/setup.ts"],
		benchmark: {
			include: [
				"**/*.bench.{ts,tsx}",
			],
		},
	},
})
