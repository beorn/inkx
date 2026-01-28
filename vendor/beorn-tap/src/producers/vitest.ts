import { spawn, type Subprocess } from "bun"
import type { Readable } from "node:stream"

export interface VitestTapOptions {
	args?: string[]
	cwd?: string
}

export interface VitestTapResult {
	stdout: Readable
	proc: Subprocess
	exited: Promise<number>
}

/**
 * Runs Vitest tests with native TAP reporter.
 *
 * Vitest supports TAP format natively via --reporter=tap, so we can stream
 * the output directly without conversion (unlike Bun which requires JUnit → TAP).
 *
 * This is the key advantage of Vitest: streaming TAP output for real-time feedback.
 *
 * @param options - Configuration options
 * @param options.args - Test file patterns or paths to pass to vitest
 * @param options.cwd - Working directory for test execution
 * @returns Object containing TAP stdout stream and process handle
 *
 * @example
 * ```typescript
 * const { stdout, exited } = runVitestTap({
 *   args: ['tests/**\/*.test.ts'],
 *   cwd: './packages/km-markdown'
 * })
 *
 * stdout.pipe(process.stdout)
 * await exited
 * ```
 */
export function runVitestTap(options: VitestTapOptions = {}): VitestTapResult {
	const args = ["vitest", "run", "--reporter=tap", ...(options.args ?? [])]

	const proc = spawn(["bunx", "--bun", ...args], {
		cwd: options.cwd,
		stdout: "pipe",
		stderr: "inherit", // Show Vitest errors on stderr
	})

	return {
		stdout: proc.stdout,
		proc,
		exited: proc.exited,
	}
}
