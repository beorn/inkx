/**
 * ANSI Diff Analysis Test
 *
 * Captures the actual ANSI sequences generated during level navigation
 * to diagnose the km-tui.level-nav-shift bug.
 *
 * The bug: Real terminal shows wrong content after k k j j, but buffer is correct.
 * This means the bug is in the ANSI diff output, not the buffer generation.
 *
 * ## ANSI Invariants
 *
 * Universal invariants (apply to all ANSI output):
 * 1. **Replay Equivalence**: Applying ANSI to prev buffer → target buffer
 * 2. **Cursor Bounds**: All ESC[row;colH within buffer dimensions
 * 3. **Change Coverage**: Every changed cell has corresponding write
 * 4. **Determinism**: Same (prev, next) → same ANSI output
 *
 * Per-command invariants (cursor moves j/k/h/l):
 * 1. **Two-Region Diff**: Only old cursor + new cursor regions change
 * 2. **Content Preservation**: Characters identical, only style changes
 * 3. **Bounded Moves**: Few cursor H commands (2-4), not dozens
 */

import { describe, test, expect } from "vitest"
import { existsSync } from "fs"
import { loadTestBoard, createTestBoard } from "@km/tui/test"
// Note: outputPhase isn't exported from inkx public API - using relative path
import { outputPhase } from "../../../vendor/beorn-inkx/src/pipeline/index.js"
import { VirtualTerminal } from "inkx"
import type { TerminalBuffer } from "inkx"

const VAULT_PATH = "/tmp/v2"

/**
 * Parse ANSI escape sequences from a string.
 * Returns array of { type, params, raw } for each sequence.
 */
function parseAnsiSequences(ansi: string): Array<{
	type: string
	params: string
	raw: string
	index: number
}> {
	const sequences: Array<{ type: string; params: string; raw: string; index: number }> = []
	const regex = /\x1b\[([0-9;:]*)?([A-Za-z])/g
	let match

	while ((match = regex.exec(ansi)) !== null) {
		const params = match[1] || ""
		const type = match[2]!
		sequences.push({
			type,
			params,
			raw: match[0],
			index: match.index,
		})
	}

	return sequences
}

/**
 * Extract cursor movement sequences (H = absolute position).
 */
function extractCursorMoves(sequences: ReturnType<typeof parseAnsiSequences>): Array<{
	row: number
	col: number
	index: number
}> {
	return sequences
		.filter((s) => s.type === "H")
		.map((s) => {
			const parts = s.params.split(";")
			return {
				row: parseInt(parts[0] || "1", 10),
				col: parseInt(parts[1] || "1", 10),
				index: s.index,
			}
		})
}

/**
 * Summarize ANSI output for debugging.
 */
function summarizeAnsi(ansi: string): string {
	const sequences = parseAnsiSequences(ansi)
	const cursorMoves = extractCursorMoves(sequences)
	const hasReset = ansi.includes("\x1b[0m")
	const hasHome = ansi.includes("\x1b[H")

	const lines = [
		`Total length: ${ansi.length} bytes`,
		`Total sequences: ${sequences.length}`,
		`Cursor moves (H): ${cursorMoves.length}`,
		`Has reset: ${hasReset}`,
		`Has home: ${hasHome}`,
	]

	if (cursorMoves.length > 0 && cursorMoves.length <= 20) {
		lines.push("Cursor positions:")
		for (const move of cursorMoves) {
			lines.push(`  row=${move.row}, col=${move.col}`)
		}
	} else if (cursorMoves.length > 20) {
		lines.push(`First 10 cursor positions:`)
		for (const move of cursorMoves.slice(0, 10)) {
			lines.push(`  row=${move.row}, col=${move.col}`)
		}
		lines.push(`  ... and ${cursorMoves.length - 10} more`)
	}

	return lines.join("\n")
}

describe("ANSI diff analysis", () => {
	describe("replay equivalence invariant", () => {
		test("synthetic: ANSI replay matches target buffer", () => {
			const board = createTestBoard([
				"Inbox > Task 1",
				"Inbox > Task 2",
				"Projects > Alpha",
				"Projects > Beta",
			])

			const buffer0 = board.driver.app.lastBuffer()!
			const vterm = new VirtualTerminal(buffer0.width, buffer0.height)

			// Apply initial render (full buffer to ANSI)
			const initialAnsi = outputPhase(null, buffer0)
			vterm.applyAnsi(initialAnsi)

			// Verify initial render matches
			let mismatches = vterm.compareToBuffer(buffer0)
			expect(mismatches, "Initial render should match").toHaveLength(0)

			// Navigate k k j j and verify each step
			const keys = ["k", "k", "j", "j"]
			let prevBuffer = buffer0

			for (const key of keys) {
				board.press(key)
				const nextBuffer = board.driver.app.lastBuffer()!

				// Get diff ANSI
				const diff = outputPhase(prevBuffer, nextBuffer)

				// Load prev buffer into virtual terminal (simulates terminal state before diff)
				const stepVterm = new VirtualTerminal(nextBuffer.width, nextBuffer.height)
				stepVterm.loadFromBuffer(prevBuffer)

				// Apply diff
				stepVterm.applyAnsi(diff)

				// Compare to target
				mismatches = stepVterm.compareToBuffer(nextBuffer)
				if (mismatches.length > 0) {
					const first5 = mismatches.slice(0, 5)
					const details = first5
						.map((m) => `  (${m.x},${m.y}): expected="${m.expected}" actual="${m.actual}"`)
						.join("\n")
					expect.fail(`Replay mismatch after '${key}':\n${details}\n  ... and ${mismatches.length - 5} more`)
				}

				prevBuffer = nextBuffer
			}
		})

		test("synthetic: cursor bounds invariant", () => {
			const board = createTestBoard([
				"Inbox > Task 1",
				"Inbox > Task 2",
				"Projects > Alpha",
			])

			const buffer0 = board.driver.app.lastBuffer()!
			board.press("k")
			const buffer1 = board.driver.app.lastBuffer()!

			const diff = outputPhase(buffer0, buffer1)
			const sequences = parseAnsiSequences(diff)
			const cursorMoves = extractCursorMoves(sequences)

			// All cursor positions should be within bounds (1-indexed)
			for (const move of cursorMoves) {
				expect(move.row, `Row ${move.row} should be >= 1`).toBeGreaterThanOrEqual(1)
				expect(move.row, `Row ${move.row} should be <= ${buffer1.height}`).toBeLessThanOrEqual(buffer1.height)
				expect(move.col, `Col ${move.col} should be >= 1`).toBeGreaterThanOrEqual(1)
				expect(move.col, `Col ${move.col} should be <= ${buffer1.width}`).toBeLessThanOrEqual(buffer1.width)
			}
		})
	})

	test("synthetic: analyze k k j j ANSI diffs", () => {
		const board = createTestBoard([
			"Inbox > Task 1",
			"Inbox > Task 2",
			"Projects > Alpha",
			"Projects > Beta",
		])

		// Get initial buffer
		const buffer0 = board.driver.app.lastBuffer()!

		// Press k (first)
		board.press("k")
		const buffer1 = board.driver.app.lastBuffer()!
		const diff1 = outputPhase(buffer0, buffer1)

		// Press k (second)
		board.press("k")
		const buffer2 = board.driver.app.lastBuffer()!
		const diff2 = outputPhase(buffer1, buffer2)

		// Press j (first)
		board.press("j")
		const buffer3 = board.driver.app.lastBuffer()!
		const diff3 = outputPhase(buffer2, buffer3)

		// Press j (second)
		board.press("j")
		const buffer4 = board.driver.app.lastBuffer()!
		const diff4 = outputPhase(buffer3, buffer4)

		// Analyze
		expect(diff1.length).toBeGreaterThan(0)
		expect(diff2.length).toBeGreaterThan(0)
		expect(diff3.length).toBeGreaterThan(0)
		expect(diff4.length).toBeGreaterThan(0)

		// The final buffer should match the initial (content-wise)
		// Compare a few cells
		for (let y = 1; y < 5; y++) {
			for (let x = 0; x < 20; x++) {
				const a = buffer0.getCell(x, y)
				const b = buffer4.getCell(x, y)
				expect(a.char, `Cell (${x},${y}) should match`).toBe(b.char)
			}
		}
	})

	describe.skipIf(!existsSync(VAULT_PATH))("real vault", () => {
		test("replay equivalence: ANSI diff produces correct result", async () => {
			const board = await loadTestBoard(VAULT_PATH, { rows: 40, columns: 120 })

			const buffer0 = board.driver.app.lastBuffer()!

			// Navigate k k j j and verify replay at each step
			const keys = ["k", "k", "j", "j"]
			let prevBuffer = buffer0

			for (const key of keys) {
				board.press(key)
				const nextBuffer = board.driver.app.lastBuffer()!

				// Get diff ANSI
				const diff = outputPhase(prevBuffer, nextBuffer)

				// Load prev buffer into virtual terminal
				const vterm = new VirtualTerminal(nextBuffer.width, nextBuffer.height)
				vterm.loadFromBuffer(prevBuffer)

				// Apply diff
				vterm.applyAnsi(diff)

				// Compare to target - this is the key invariant!
				const mismatches = vterm.compareToBuffer(nextBuffer)
				if (mismatches.length > 0) {
					const first10 = mismatches.slice(0, 10)
					const details = first10
						.map((m) => `  (${m.x},${m.y}): expected="${m.expected}" actual="${m.actual}"`)
						.join("\n")

					// Also show the ANSI summary for debugging
					const summary = summarizeAnsi(diff)

					expect.fail(
						`Replay mismatch after '${key}' (${mismatches.length} cells wrong):\n` +
							`${details}\n` +
							(mismatches.length > 10 ? `  ... and ${mismatches.length - 10} more\n` : "") +
							`\nANSI summary:\n${summary}`,
					)
				}

				prevBuffer = nextBuffer
			}
		})

		test("analyze k k j j ANSI diffs", async () => {
			const board = await loadTestBoard(VAULT_PATH, { rows: 40, columns: 120 })

			// Get initial buffer
			const buffer0 = board.driver.app.lastBuffer()!
			const initialText = bufferToLines(buffer0)

			// Capture diffs at each step
			const diffs: Array<{ key: string; diff: string; buffer: TerminalBuffer }> = []

			// Press k (first)
			board.press("k")
			const buffer1 = board.driver.app.lastBuffer()!
			diffs.push({ key: "k1", diff: outputPhase(buffer0, buffer1), buffer: buffer1 })

			// Press k (second)
			board.press("k")
			const buffer2 = board.driver.app.lastBuffer()!
			diffs.push({ key: "k2", diff: outputPhase(buffer1, buffer2), buffer: buffer2 })

			// Press j (first)
			board.press("j")
			const buffer3 = board.driver.app.lastBuffer()!
			diffs.push({ key: "j1", diff: outputPhase(buffer2, buffer3), buffer: buffer3 })

			// Press j (second)
			board.press("j")
			const buffer4 = board.driver.app.lastBuffer()!
			diffs.push({ key: "j2", diff: outputPhase(buffer3, buffer4), buffer: buffer4 })

			const finalText = bufferToLines(buffer4)

			// Log analysis (will show in test output on failure)
			const analysis: string[] = []
			analysis.push("=== ANSI DIFF ANALYSIS ===\n")

			for (const { key, diff } of diffs) {
				analysis.push(`--- After ${key} ---`)
				analysis.push(summarizeAnsi(diff))
				analysis.push("")
			}

			// Check if initial and final match
			analysis.push("=== BUFFER COMPARISON ===")
			analysis.push(`Initial line count: ${initialText.length}`)
			analysis.push(`Final line count: ${finalText.length}`)

			let differences = 0
			for (let i = 0; i < Math.min(initialText.length, finalText.length); i++) {
				if (initialText[i] !== finalText[i]) {
					differences++
					if (differences <= 5) {
						analysis.push(`Line ${i} differs:`)
						analysis.push(`  initial: "${initialText[i]?.slice(0, 60)}..."`)
						analysis.push(`  final:   "${finalText[i]?.slice(0, 60)}..."`)
					}
				}
			}
			analysis.push(`Total differing lines: ${differences}`)

			// If there are differences, fail with the analysis
			if (differences > 0) {
				expect.fail(analysis.join("\n"))
			}
		})

		test("compare cumulative diff vs fresh render diff", async () => {
			const board = await loadTestBoard(VAULT_PATH, { rows: 40, columns: 120 })

			// Get initial buffer
			const buffer0 = board.driver.app.lastBuffer()!

			// Navigate k k j j
			board.press("k")
			board.press("k")
			board.press("j")
			board.press("j")

			const bufferFinal = board.driver.app.lastBuffer()!

			// Get fresh render
			const freshBuffer = board.driver.app.freshRender()

			// Compare cumulative diff (buffer0 -> bufferFinal) vs fresh diff (null -> freshBuffer)
			const cumulativeDiff = outputPhase(buffer0, bufferFinal)
			const freshDiff = outputPhase(null, freshBuffer)

			// These should produce the same visual result
			// Let's compare the cursor move sequences
			const cumulativeMoves = extractCursorMoves(parseAnsiSequences(cumulativeDiff))
			const freshMoves = extractCursorMoves(parseAnsiSequences(freshDiff))

			// Log for debugging
			const analysis = [
				"=== CUMULATIVE DIFF ===",
				summarizeAnsi(cumulativeDiff),
				"",
				"=== FRESH DIFF ===",
				summarizeAnsi(freshDiff),
			]

			// If there's a mismatch in the number of cursor moves, that's suspicious
			if (Math.abs(cumulativeMoves.length - freshMoves.length) > 10) {
				analysis.push(
					"",
					`SUSPICIOUS: Cumulative has ${cumulativeMoves.length} cursor moves, fresh has ${freshMoves.length}`,
				)
			}

			// The buffers should be identical even if the diffs are different
			for (let y = 0; y < Math.min(bufferFinal.height, freshBuffer.height); y++) {
				for (let x = 0; x < Math.min(bufferFinal.width, freshBuffer.width); x++) {
					const a = bufferFinal.getCell(x, y)
					const b = freshBuffer.getCell(x, y)
					if (a.char !== b.char) {
						expect.fail(
							`Buffer mismatch at (${x},${y}): incremental="${a.char}", fresh="${b.char}"\n\n${analysis.join("\n")}`,
						)
					}
				}
			}
		})
	})
})

/**
 * Convert buffer to array of text lines (no ANSI).
 */
function bufferToLines(buffer: TerminalBuffer): string[] {
	const lines: string[] = []
	for (let y = 0; y < buffer.height; y++) {
		let line = ""
		for (let x = 0; x < buffer.width; x++) {
			const cell = buffer.getCell(x, y)
			if (!cell.continuation) {
				line += cell.char
			}
		}
		lines.push(line.trimEnd())
	}
	return lines
}
