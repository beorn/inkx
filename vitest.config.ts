import { resolve } from "node:path"
import { mdspec as mdspecPlugin } from "mdspec/vitest-plugin"
import { defineConfig } from "vitest/config"

// v0.17.3 coordinated silvery/loggily release narrowed every @silvery/* and loggily
// package.json exports field to just "." — but the internal source still does deep
// subpath imports like @silvery/ag-term/pipeline/pretext and loggily/worker. These
// aliases bypass the broken exports maps so vendor tests AND km-storage/km-tui tests
// can run. Remove once the exports maps are fully restored.
const silveryPackages = [
	"ag",
	"ag-react",
	"ag-term",
	"ansi",
	"color",
	"commander",
	"commands",
	"create",
	"headless",
	"ink",
	"model",
	"scope",
	"signals",
	"test",
	"theme",
]
const vendorAliases = [
	...silveryPackages.flatMap((pkg) => [
		{
			find: new RegExp(`^@silvery/${pkg}/(.+)$`),
			replacement: resolve(__dirname, `vendor/silvery/packages/${pkg}/src/$1`),
		},
	]),
	{
		find: /^loggily\/(.+)$/,
		replacement: resolve(__dirname, "vendor/loggily/src/$1"),
	},
]

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
	setupFiles: ["./packages/km-infra/vitest/setup.ts"],
	maxWorkers: process.env.VITEST_MAX_WORKERS
		? Number.parseInt(process.env.VITEST_MAX_WORKERS)
		: Math.max(availableParallelism() - 1, 1),
	server: { deps: { inline: ["zod"] } },
}

const projects = hasProjectFlag
	? [
			{
				plugins: [mdspec()],
				resolve: { alias: vendorAliases },
				test: {
					name: "default",
					...sharedTest,
					include: ["**/*.{test,spec}.{ts,tsx,md}"],
					exclude: [...alwaysExclude, "**/*.slow.*", "vendor/**"],
				},
			},
			{
				plugins: [mdspec()],
				resolve: { alias: vendorAliases },
				test: {
					name: "slow",
					...sharedTest,
					include: ["**/*.slow.{test,spec}.{ts,tsx,md}"],
					exclude: [...alwaysExclude],
				},
			},
			{
				plugins: [mdspec()],
				resolve: { alias: vendorAliases },
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
		]
	: undefined

export default defineConfig({
	cacheDir: "node_modules/.vitest",
	plugins: [mdspec()],
	resolve: { alias: vendorAliases },
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
			: [...alwaysExclude, "**/*.slow.*", "vendor/**"],
		setupFiles: ["./packages/km-infra/vitest/setup.ts"],
		benchmark: {
			include: ["**/*.bench.{ts,tsx}"],
			exclude: alwaysExclude,
		},
		projects,
	},
})
