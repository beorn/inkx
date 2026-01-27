/**
 * Parallel TUI test runner with inline display
 *
 * Displays 3 separate test suite streams inline (not alternate screen):
 * - Real-time colored dots as tests complete
 * - Per-suite timing
 * - Updates in place using cursor positioning
 *
 * Unlike the inkx version, this renders inline starting from current cursor position,
 * similar to MultiProgress in @beorn/inkx-ui.
 */

import { spawn } from "bun"
import type { Suite } from "./orchestrate"
import { runBunTap } from "./producers/bun"
import { Parser, type Result } from "tap-parser"

interface SuiteState {
	passed: number
	failed: number
	skipped: number
	dots: string
	timing: string
	status: "running" | "done" | "failed"
}

const ANSI = {
	CURSOR_HIDE: "\x1b[?25l",
	CURSOR_SHOW: "\x1b[?25h",
	CLEAR_LINE: "\x1b[2K",
	cursorUp: (n: number) => `\x1b[${n}A`,
}

export async function renderParallel(suites: Suite[]): Promise<number> {
	const states = new Map<string, SuiteState>()
	const startTime = performance.now()

	// Initialize states
	for (const suite of suites) {
		states.set(suite.name, {
			passed: 0,
			failed: 0,
			skipped: 0,
			dots: "…",
			timing: "starting",
			status: "running",
		})
	}

	const isTTY = process.stdout.isTTY ?? false
	let renderedLines = 0

	// Hide cursor if TTY
	if (isTTY) {
		process.stdout.write(ANSI.CURSOR_HIDE)
	}

	// Initial render
	render()

	// Run all suites in parallel
	const promises = suites.map(async (suite) => {
		await runSuite(suite, (update) => {
			const state = states.get(suite.name)
			if (state) {
				Object.assign(state, update)
				render()
			}
		})

		// Mark as done with timing
		const elapsed = performance.now() - startTime
		const state = states.get(suite.name)
		if (state) {
			state.status = state.failed > 0 ? "failed" : "done"
			state.timing = formatMs(elapsed)
			render()
		}
	})

	// Wait for all to complete
	await Promise.all(promises)

	// Final render
	render()

	// Show cursor and add newline
	if (isTTY) {
		process.stdout.write(ANSI.CURSOR_SHOW)
	}
	process.stdout.write("\n")

	// Calculate exit code
	const failedSuites = Array.from(states.values()).filter((s) => s.failed > 0)
	return failedSuites.length > 0 ? 1 : 0

	function render() {
		if (!isTTY) return

		// Move cursor up to overwrite previous render
		if (renderedLines > 0) {
			process.stdout.write(ANSI.cursorUp(renderedLines))
		}

		const lines: string[] = []

		// Render each suite
		for (const suite of suites) {
			const state = states.get(suite.name)
			if (!state) continue

			const color = state.status === "failed" ? "\x1b[31m" : "\x1b[37m"
			const bold = "\x1b[1m"
			const reset = "\x1b[0m"
			const gray = "\x1b[38;5;8m"

			const name = `${bold}${color}${suite.name}${reset}`.padEnd(24) // Pad for alignment (accounting for ANSI codes)
			const dots = state.dots.padEnd(60)
			const timing = `${gray}${state.timing}${reset}`.padStart(20)

			lines.push(`${ANSI.CLEAR_LINE}${name}${dots}${timing}`)
		}

		// Add summary line
		const totalPassed = Array.from(states.values()).reduce(
			(sum, s) => sum + s.passed,
			0,
		)
		const totalFailed = Array.from(states.values()).reduce(
			(sum, s) => sum + s.failed,
			0,
		)
		const totalSkipped = Array.from(states.values()).reduce(
			(sum, s) => sum + s.skipped,
			0,
		)
		const totalTests = totalPassed + totalFailed + totalSkipped

		const summaryColor = totalFailed > 0 ? "\x1b[31m" : "\x1b[32m"
		const bold = "\x1b[1m"
		const reset = "\x1b[0m"
		const icon = totalFailed > 0 ? "✗" : "✓"

		lines.push("") // Empty line before summary
		lines.push(
			`${ANSI.CLEAR_LINE}${bold}${summaryColor}${icon} ${totalTests} tests: ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped${reset}`,
		)

		// Write all lines
		for (const line of lines) {
			process.stdout.write(line + "\n")
		}

		renderedLines = lines.length
	}
}

async function runSuite(
	suite: Suite,
	onUpdate: (update: Partial<SuiteState>) => void,
) {
	const parser = new Parser()
	let dots = ""
	let passed = 0
	let failed = 0
	let skipped = 0

	// Listen for test results
	parser.on("assert", (assert: Result) => {
		if (assert.skip) {
			skipped++
			dots += "\x1b[33m-\x1b[0m" // Yellow dash
		} else if (assert.ok) {
			passed++
			dots += "\x1b[32m.\x1b[0m" // Green dot
		} else {
			failed++
			dots += "\x1b[31mX\x1b[0m" // Red X
		}

		onUpdate({ dots, passed, failed, skipped })
	})

	// Spawn process and get TAP stream
	if (suite.runner === "bun") {
		const { stdout, exited } = runBunTap({ args: suite.files })
		// Pipe TAP stream to parser
		stdout.on("data", (chunk) => parser.write(chunk.toString()))
		stdout.on("end", () => parser.end())
		await exited
	} else {
		const proc = spawn([...suite.command!, ...suite.files], { stdout: "pipe" })
		// Pipe stdout to parser
		if (proc.stdout) {
			for await (const chunk of proc.stdout) {
				parser.write(chunk.toString())
			}
		}
		parser.end()
		await proc.exited
	}
}

function formatMs(ms: number): string {
	if (ms < 1000) return `${ms.toFixed(0)}ms`
	return `${(ms / 1000).toFixed(1)}s`
}
