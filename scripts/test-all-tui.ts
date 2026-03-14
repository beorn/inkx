#!/usr/bin/env bun
/**
 * Parallel test orchestrator with inline TUI
 *
 * Runs all tests via Vitest using Bun runtime (bunx --bun vitest).
 * This enables bun:* imports (bun:sqlite, bun:ffi) while using Vitest's
 * superior test framework and native TAP streaming.
 *
 * Test suites displayed as separate rows:
 * - vitest:fast - Fast tests (~11s)
 * - vitest:slow - Slow tests (sync, chaos)
 * - vitest:md - Markdown tests (.test.md files)
 *
 * Features:
 * - Real-time colored dots as tests complete
 * - Per-suite timing display
 * - Updates in place using cursor positioning
 *
 * Usage: bun scripts/test-all-tui.ts
 */

import { createOrchestrator } from "@beorn/tap/orchestrate"
import { renderParallel } from "@beorn/tap/parallel-tui"
import { discoverTests } from "./test-patterns"

const [fastTests, slowTests, mdTests] = await Promise.all([
	discoverTests("fast"),
	discoverTests("slow"),
	discoverTests("mdtest"),
])

const orchestrator = createOrchestrator({
	mode: "parallel", // Force parallel TUI mode
	suites: [
		{ name: "vitest:fast", runner: "vitest", files: fastTests },
		{ name: "vitest:slow", runner: "vitest", files: slowTests },
		{ name: "vitest:md", runner: "vitest", files: mdTests },
	],
	renderParallel, // Inject inline renderer
})

const exitCode = await orchestrator.run()
process.exit(exitCode)
