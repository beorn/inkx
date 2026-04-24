import React from "react"
import { Box, PopoverProvider } from "silvery"
import { run } from "silvery/runtime"
import { createTermless } from "@silvery/test"
import { describe, expect, test } from "vitest"
import { claudeSessionConfig } from "../src/configs/claude-session.ts"
import { LogRowView } from "../src/row/LogRowView.tsx"
import type { LogRow } from "../src/view-config.ts"

/**
 * Contract: body text color is uniform ($fg) — hover does NOT change the
 * body color. Previous schemes (hover → kindBodyColor) had dark-theme
 * failure modes where tokens resolved to near-black. Pills + header carry
 * the kind signal; body just needs to read clearly. Hover still promotes
 * colorize() (syntax highlighting) — that test lives elsewhere.
 *
 * We render `LogRowView` in isolation (outside ListView) so ListView's
 * "hover moves cursor" behaviour doesn't interfere.
 */

function makeUserRow(): LogRow {
  return {
    id: "1.u",
    lineNo: 1,
    kind: "user",
    raw: null,
    fields: { time: "05:00:00", label: "", body: "hello world body text" },
  }
}

describe("km-logview body hover color (isolated)", () => {
  test("body color is uniform — unchanged across hover transitions", async () => {
    using term = createTermless({ cols: 120, rows: 6 })
    const row = makeUserRow()
    const handle = await run(
      <PopoverProvider>
        {/* Wrap in a full-viewport Box so mouse-move events anywhere in the
            terminal still hit a target — processMouseEvent short-circuits
            when the hit-test returns null, which would skip mouseleave. */}
        <Box flexDirection="column" width="100%" height="100%">
          <LogRowView
            row={row}
            fields={claudeSessionConfig.fields}
            isCursor={false}
            expanded={false}
            onToggleExpand={() => {}}
          />
          {/* Second child absorbs mouse-moves outside the row so we can
              reliably test the "revert on leave" path. */}
          <Box flexGrow={1} />
        </Box>
      </PopoverProvider>,
      term,
    )

    // Body text renders inline on the header line (short single-line body
    // fits at cols=120). Find the first occurrence of "hello" on row 0
    // and sample its fg colour.
    const bodyFgAt = (row: number): { r: number; g: number; b: number } | null => {
      const line = term.screen.getLines()[row] ?? ""
      const col = line.indexOf("hello")
      if (col < 0) return null
      const c = term.cell(row, col)
      return c.fg && typeof c.fg === "object" ? (c.fg as { r: number; g: number; b: number }) : null
    }

    const restingFg = bodyFgAt(0)
    expect(restingFg).not.toBeNull()

    // Hover — mouse-move into the row. Body color must not change.
    await term.mouse.move(2, 0)
    await new Promise((r) => setTimeout(r, 20))
    const hoveredFg = bodyFgAt(0)
    expect(hoveredFg).not.toBeNull()
    expect(JSON.stringify(hoveredFg)).toBe(JSON.stringify(restingFg))

    // Move away — still the same color.
    await term.mouse.move(0, 5)
    await new Promise((r) => setTimeout(r, 20))
    const revertedFg = bodyFgAt(0)
    expect(JSON.stringify(revertedFg)).toBe(JSON.stringify(restingFg))

    handle.unmount()
  })
})
