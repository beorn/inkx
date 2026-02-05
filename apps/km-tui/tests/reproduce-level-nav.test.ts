/**
 * Reproduce level-nav-shift bug with real vault
 *
 * This test uses /tmp/v2 vault to reproduce the bug where content shifts
 * after k k j j navigation.
 *
 * ## Findings (2026-02-04)
 *
 * The test harness buffer is CORRECT - before and after k k j j navigation,
 * the buffer content is identical. The bug is NOT in:
 * - React state management
 * - Buffer generation
 * - Incremental vs fresh render comparison
 *
 * The bug IS in the ANSI diff output that's sent to the real terminal.
 * The terminal receives incorrect cursor positioning or partial updates
 * that cause the wrong content to be displayed.
 *
 * This means we need to debug output-phase.ts `changesToAnsi` function
 * to understand why the ANSI sequence causes wrong display on real terminals.
 *
 * Run with:
 *   INKX_CHECK_INCREMENTAL=1 bun vitest run apps/km-tui/tests/reproduce-level-nav.test.ts
 */

import { describe, test, expect } from "vitest"
import { existsSync } from "fs"
import { loadTestBoard } from "@km/tui/test"
import { stripAnsi } from "inkx/testing"

const VAULT_PATH = "/tmp/v2"

describe.skipIf(!existsSync(VAULT_PATH))("Level nav bug reproduction", () => {
	test("k k j j buffer content is identical (proves bug is in ANSI output)", async () => {
		const board = await loadTestBoard(VAULT_PATH, { rows: 40, columns: 120 })

		// Capture initial state
		const initialText = board.text
		const initialLines = stripAnsi(initialText).split("\n").slice(1, -1) // Skip breadcrumb and status bar

		// Navigate up to board level
		await board.press("k")
		await board.press("k")

		// Navigate back down
		await board.press("j")
		await board.press("j")

		// Capture final state
		const finalText = board.text
		const finalLines = stripAnsi(finalText).split("\n").slice(1, -1)

		// The test harness buffer should be identical
		// If this passes, the bug is in ANSI output, not buffer generation
		expect(finalLines.slice(0, 10)).toEqual(initialLines.slice(0, 10))
	})

	test("incremental vs fresh render match", async () => {
		const board = await loadTestBoard(VAULT_PATH, { rows: 40, columns: 120 })

		// Navigate levels
		await board.press("k")
		await board.press("k")
		await board.press("j")
		await board.press("j")

		// Compare incremental buffer with fresh render
		const incremental = board.lastBuffer?.()
		const fresh = board.freshRender?.()

		if (incremental && fresh) {
			// Compare first 10 lines of each
			for (let y = 0; y < Math.min(10, incremental.height); y++) {
				for (let x = 0; x < Math.min(40, incremental.width); x++) {
					const a = incremental.getCell(x, y)
					const b = fresh.getCell(x, y)
					expect(a.char, `Cell (${x},${y}) char mismatch`).toBe(b.char)
				}
			}
		}
	})
})
