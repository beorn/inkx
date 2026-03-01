import { mdtest } from "@beorn/mdtest/vitest-plugin"
import { defineConfig } from "vitest/config"
import { availableParallelism } from "node:os"

// Always-excluded files (incompatible with vitest runner regardless of project)
const alwaysExclude = [
	"**/node_modules/**",
	"**/dist/**",
	"**/.direnv/**",
	"**/.claude/worktrees/**",
	// Uses bun:test integration — incompatible with vitest runner
	"vendor/beorn-mdtest/tests/mdtest-e2e.slow.test.ts",
	// Spawns real km subprocess with PTY — needs full CPU, can't run in parallel
	"apps/km-tui/tests/pty-integration.slow.spec.ts",
]

// When --project is passed, define named projects so vitest can filter.
// Without --project, the root config runs alone (= fast tests only).
const hasProjectFlag = process.argv.some((a) => a.startsWith("--project"))

const sharedTest = {
	setupFiles: ["./packages/km-infra/vitest/setup.ts"],
	maxWorkers: process.env.VITEST_MAX_WORKERS
		? Number.parseInt(process.env.VITEST_MAX_WORKERS)
		: Math.max(availableParallelism() - 1, 1),
	server: { deps: { inline: ["zod"] } },
}

const projects = hasProjectFlag
	? [
			{
				plugins: [mdtest()],
				test: {
					name: "default",
					...sharedTest,
					include: ["**/*.{test,spec}.{ts,tsx,md}"],
					exclude: [...alwaysExclude, "**/*.slow.*", "vendor/**"],
				},
			},
			{
				plugins: [mdtest()],
				test: {
					name: "slow",
					...sharedTest,
					include: ["**/*.slow.{test,spec}.{ts,tsx,md}"],
					exclude: alwaysExclude,
				},
			},
			{
				plugins: [mdtest()],
				test: {
					name: "vendor",
					...sharedTest,
					include: ["vendor/**/*.{test,spec}.{ts,tsx,md}"],
					exclude: [...alwaysExclude, "**/*.slow.*"],
				},
			},
		]
	: undefined

export default defineConfig({
	cacheDir: "node_modules/.vitest",
	plugins: [mdtest()],
	test: {
		// Performance: forks pool with isolate:false shares modules between test files
		// in the same worker process, eliminating ~1.8s import overhead per file after
		// the first. Requires all module-level state to be reset in testEnv() — see
		// resetBoardAppState() in board-app.ts. Without this, tests leak timer/cache
		// state between files. The "threads" pool doesn't work with bun (stdout.pipe
		// errors). See bead km-msmhm for proper elimination of module-level state.
		pool: "forks",
		poolOptions: { forks: { isolate: false } },
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
		exclude: [...alwaysExclude, "**/*.slow.*", "vendor/**"],
		setupFiles: ["./packages/km-infra/vitest/setup.ts"],
		benchmark: {
			include: [
				"**/*.bench.{ts,tsx}",
			],
		},
		projects,
	},
})
