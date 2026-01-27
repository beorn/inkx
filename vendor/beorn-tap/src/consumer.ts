import { Parser, type Result } from "tap-parser"
import type { Writable } from "node:stream"

export interface Failure {
	name: string
	id: number
	ok: boolean
	diag?: {
		message?: string
		at?: { file?: string; line?: number }
		[key: string]: unknown
	}
}

export interface ConsumerOptions {
	dots?: boolean
	output?: Writable
}

export interface TimingEntry {
	runner: string
	ms: number
}

export interface ConsumerResult {
	passed: number
	failed: number
	skipped: number
	total: number
	failures: Failure[]
	timing: TimingEntry[]
	wallTimeMs: number
}

/**
 * Creates a TAP consumer that parses TAP input and displays formatted output.
 *
 * @param options - Configuration options
 * @param options.dots - Show colored dots during test execution (green dot for pass, red X for fail, yellow dash for skip)
 * @param options.output - Output stream for writing results (defaults to process.stdout)
 * @returns Extended tap-parser instance with addTiming() and getResults() methods
 */
export function createConsumer(options: ConsumerOptions = {}) {
	const output = options.output ?? process.stdout
	const parser = new Parser()
	const failures: Failure[] = []
	const timing: TimingEntry[] = []
	const startTime = performance.now()
	let currentRunner = "unknown"

	let passed = 0
	let failed = 0
	let skipped = 0

	// Track runner from subtest/comment
	parser.on("comment", (comment: string) => {
		const match = comment.match(/^# runner: (.+)$/)
		if (match?.[1]) {
			currentRunner = match[1]
		}
	})

	parser.on("assert", (assert: Result) => {
		if (assert.skip) {
			skipped++
			if (options.dots) output.write("\x1b[33m-\x1b[0m")
		} else if (assert.ok) {
			passed++
			if (options.dots) output.write("\x1b[32m.\x1b[0m")
		} else {
			failed++
			if (options.dots) output.write("\x1b[31mX\x1b[0m")
			failures.push({
				name: assert.name ?? "unnamed test",
				id: assert.id,
				ok: assert.ok,
				diag: assert.diag as Failure["diag"],
			})
		}
	})

	parser.on("complete", (results) => {
		const wallTimeMs = performance.now() - startTime

		if (options.dots) {
			output.write("\n\n")
		}

		// Print failures
		if (failures.length > 0) {
			output.write("\x1b[31m--- Failures ---\x1b[0m\n\n")
			for (const f of failures) {
				output.write(`\x1b[31m✗\x1b[0m ${f.name}\n`)
				if (f.diag?.message) {
					output.write(`  ${f.diag.message}\n`)
				}
				if (f.diag?.at?.file) {
					output.write(`  at ${f.diag.at.file}:${f.diag.at.line ?? "?"}\n`)
				}
				output.write("\n")
			}
		}

		// Print summary
		const total = passed + failed + skipped
		const status = failed > 0 ? "\x1b[31m✗\x1b[0m" : "\x1b[32m✓\x1b[0m"
		output.write(
			`${status} ${total} tests: ${passed} passed, ${failed} failed, ${skipped} skipped\n`,
		)

		// Print timing
		if (timing.length > 0) {
			const timingStr = timing.map((t) => `${t.runner}: ${formatMs(t.ms)}`).join(", ")
			output.write(`\x1b[2mTiming: ${timingStr}\x1b[0m\n`)
		}
		output.write(`\x1b[2mTotal: ${formatMs(wallTimeMs)}\x1b[0m\n`)
	})

	return Object.assign(parser, {
		addTiming(runner: string, ms: number) {
			timing.push({ runner, ms })
		},
		getResults(): ConsumerResult {
			return {
				passed,
				failed,
				skipped,
				total: passed + failed + skipped,
				failures,
				timing,
				wallTimeMs: performance.now() - startTime,
			}
		},
	})
}

function formatMs(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`
	return `${(ms / 1000).toFixed(1)}s`
}
