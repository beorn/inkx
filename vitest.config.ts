import { mdtest } from "@beorn/mdtest/vitest-plugin"
import { defineConfig } from "vitest/config"
import { availableParallelism } from "node:os"

// Use vitest projects to separate km tests (with strict console enforcement)
// from vendor tests (which emit act() warnings and other output)
export default defineConfig({
	plugins: [mdtest()],
	test: {
		// Enable location info (line/column) for test cases in reporters
		includeTaskLocation: true,
		// Reporters configured via CLI flags (see package.json scripts)
		outputFile: {
			html: "./test-results/vitest-report.html",
			junit: "./test-results/junit.xml",
		},
		maxWorkers: process.env.VITEST_MAX_WORKERS
			? Number.parseInt(process.env.VITEST_MAX_WORKERS)
			: Math.max(availableParallelism() - 1, 1),
		fileParallelism: true,
		server: {
			deps: {
				inline: ["zod"],
			},
		},
		projects: [
			{
				// km project: packages/ and apps/ with strict console enforcement
				extends: true,
				test: {
					name: "km",
					include: ["**/*.{test,spec}.{ts,tsx,md}"],
					exclude: [
						"**/node_modules/**",
						"**/dist/**",
						"**/vendor/**",
						"**/.direnv/**",
					],
					setupFiles: [
						"./packages/km-infra/vitest/setup.ts",
					],
				},
			},
			{
				// vendor project: vendor tests WITHOUT console enforcement setup
				// (vendor tests emit act() warnings + other output that km's
				// strict console enforcement would reject)
				extends: true,
				test: {
					name: "vendor",
					include: ["vendor/**/*.{test,spec}.{ts,tsx}"],
					exclude: [
						"**/node_modules/**",
						"**/dist/**",
						"**/.direnv/**",
						// Uses bun:test integration — incompatible with vitest runner
						"vendor/beorn-mdtest/tests/mdtest-e2e.slow.test.ts",
					],
				},
			},
		],
		benchmark: {
			include: [
				"**/*.bench.{ts,tsx}",
				"vendor/beorn-flexx/bench/**/*.bench.ts",
			],
			exclude: [
				"**/node_modules/**",
				"**/dist/**",
				"**/.direnv/**",
			],
		},
	},
})
