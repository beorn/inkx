import { createVitestConfig } from "./packages/km-infra/vitest/index.ts"
import { mdtest } from "@beorn/mdtest/vitest-plugin"

export default createVitestConfig({
	plugins: [mdtest()],
	// Include vendor benchmark files (default excludes vendor/*)
	benchmarkInclude: [
		"**/*.bench.{ts,tsx}",
		"vendor/beorn-flexx/bench/**/*.bench.ts",
	],
	test: {
		// Enable location info (line/column) for test cases in reporters
		includeTaskLocation: true,
		// Reporters configured via CLI flags (see package.json scripts)
		// Use test:fast:html or test:all:html for HTML reports and performance tracking
		outputFile: {
			html: "./test-results/vitest-report.html",
			junit: "./test-results/junit.xml",
		},
	},
})
