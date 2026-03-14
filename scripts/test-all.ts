#!/usr/bin/env bun
/**
 * Unified test orchestrator - Vitest with Bun runtime
 *
 * Strategy:
 * - Vitest for fast/slow tests: bunx --bun vitest
 * - Bun test for mdspec wrappers: bun test (requires bun:sqlite, etc.)
 *
 * For parallel TUI mode with silvery, use: bun run test:all:tui
 *
 * Usage: bun scripts/test-all.ts
 */

import { createOrchestrator } from "@beorn/tap/orchestrate"
import { discoverTests } from "./test-patterns"

// Discover all test files
const [fastTests, slowTests, mdTests] = await Promise.all([
	discoverTests("fast"),
	discoverTests("slow"),
	discoverTests("mdspec"),
])

// Vitest runs fast/slow tests
const vitestTests = [...fastTests, ...slowTests]

const orchestrator = createOrchestrator({
	mode: "unified", // Interleaved dots (CI-friendly)
	suites: [
		{
			name: "vitest",
			runner: "vitest",
			files: vitestTests,
		},
		{
			name: "bun",
			runner: "bun",
			files: mdTests,
		},
	],
})

const exitCode = await orchestrator.run()
process.exit(exitCode)
