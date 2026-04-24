import { mdspec as mdspecPlugin } from "mdspec/vitest-plugin"
import { defineConfig } from "vitest/config"


// mdspec's vite Plugin type may resolve to a different vite copy than vitest/config,
// causing TS2769. Cast to bridge the duplicate type resolution.
// biome-ignore lint: duplicate vite resolution requires cast
const mdspec = (): any => mdspecPlugin()
import { availableParallelism } from "node:os"

// Always-excluded files (incompatible with vitest runner regardless of project)
const alwaysExclude = [
	"**/node_modules/**",
	"**/dist/**",
	"**/.direnv/**",
	"**/.claude/worktrees/**",
	// mdspec submodule removed — .spec.md files need the real mdspec vitest plugin
	"**/*.spec.md",
	// Uses bun:test integration — incompatible with vitest runner
	"vendor/mdtest/tests/mdspec-e2e.slow.test.ts",
	// Playwright tests — run via `bun run test:showcase` in vendor/silvery, not vitest
	"vendor/silvery/tests/web/**",
	"vendor/silvery/tests/site-smoke.test.ts",
	// hub/ is internal workspace — prototypes/examples-wip import from silvery-internal
	// paths that don't resolve in km's module graph
	"hub/**",
]

// Performance note: each test file pays ~1.8s import overhead (React + silvery + zustand
// module initialization). TUI files >5s are .slow. to keep test:fast under 20s.
// The "threads" pool (default) shares Vite transform cache across workers.
// The "forks" pool with isolate:false shares modules too, but fork process overhead
// cancels the benefit. Don't change pool without benchmarking.
//
// Bun compatibility issues blocking isolate:false (check if fixed):
//   threads + isolate:false crashes: https://github.com/oven-sh/bun/issues/27002
//   vmThreads segfaults on bun:     https://github.com/oven-sh/bun/issues/16415
//   Worker thread termination:      https://github.com/vitest-dev/vitest/issues/8133
//
// When --project is passed, define named projects so vitest can filter.
// Without --project, the root config runs alone (= fast tests only).
const hasProjectFlag = process.argv.some((a) => a.startsWith("--project"))

const sharedTest = {
	setupFiles: [
		"./packages/km-infra/vitest/setup.ts",
		// Silvercode-visual fake boundaries. No-op for tests that don't import
		// silvercode modules, but ensures probe-at-module-load (claude-version)
		// reads the fake env var when SidePanel does load.
		"./apps/silvercode/src/test/setup-fakes.ts",
	],
	maxWorkers: process.env.VITEST_MAX_WORKERS
		? Number.parseInt(process.env.VITEST_MAX_WORKERS)
		: Math.max(availableParallelism() - 1, 1),
	server: { deps: { inline: ["zod"] } },
}

const projects = hasProjectFlag
	? [
			{
				plugins: [mdspec()],
				test: {
					name: "default",
					...sharedTest,
					include: ["**/*.{test,spec}.{ts,tsx,md}"],
					exclude: [
						...alwaysExclude,
						"**/*.slow.*",
						"vendor/**",
						// Live-mode visual tests run under their own project so SILVERCODE_REAL=1
						// can opt them in without affecting the fast default suite.
						"apps/silvercode/tests/visual/**/*.live.*",
					],
				},
			},
			{
				plugins: [mdspec()],
				test: {
					name: "silvercode-live",
					...sharedTest,
					include: ["apps/silvercode/tests/visual/**/*.live.{test,spec}.{ts,tsx}"],
					exclude: [...alwaysExclude],
				},
			},
			{
				plugins: [mdspec()],
				test: {
					name: "slow",
					...sharedTest,
					include: ["**/*.slow.{test,spec}.{ts,tsx,md}"],
					exclude: [...alwaysExclude],
				},
			},
			{
				plugins: [mdspec()],
				test: {
					name: "vendor",
					...sharedTest,
					include: ["vendor/**/*.{test,spec}.{ts,tsx,md}"],
					exclude: [...alwaysExclude, "**/*.slow.*"],
				},
			},
			{
				test: {
					name: "fuzz",
					...sharedTest,
					include: ["**/*.fuzz.{ts,tsx}"],
					exclude: [...alwaysExclude, "**/*.slow.*"],
				},
			},
			{
				// Design-validation prototypes under hub/. Opt-in only — must be
				// explicitly invoked with `--project=prototype`. The always-exclude
				// list above still blocks hub/ from default discovery.
				plugins: [mdspec()],
				test: {
					name: "prototype",
					...sharedTest,
					include: [
						"hub/silvery/prototype/**/*.{test,spec}.{ts,tsx}",
						"hub/silvery/experiments/**/*.{test,spec}.{ts,tsx}",
					],
					exclude: [
						...alwaysExclude.filter((p) => p !== "hub/**"),
						"**/*.slow.*",
						"vendor/**",
					],
				},
			},
		]
	: undefined

export default defineConfig({
	cacheDir: "node_modules/.vitest",
	plugins: [mdspec()],
	test: {
		reporters: ["dot"],
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
			? ["**/*.fuzz.{ts,tsx}"]
			: ["**/*.{test,spec}.{ts,tsx,md}"],
		exclude: process.env.FUZZ
			? [...alwaysExclude, "**/*.slow.*"]
			: [
				...alwaysExclude,
				"**/*.slow.*",
				"vendor/**",
				"apps/silvercode/tests/visual/**/*.live.*",
			],
		setupFiles: [
			"./packages/km-infra/vitest/setup.ts",
			"./apps/silvercode/src/test/setup-fakes.ts",
		],
		benchmark: {
			include: ["**/*.bench.{ts,tsx}"],
			exclude: alwaysExclude,
		},
		projects,
	},
})
