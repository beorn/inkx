import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import React from "react"
import { SearchProvider } from "silvery"
import { run } from "silvery/runtime"
import { createTermless } from "@silvery/test"
import { describe, expect, test } from "vitest"
import { App } from "../src/App.tsx"
import { claudeSessionConfig } from "../src/configs/claude-session.ts"
import { loadRows } from "../src/parse-jsonl.ts"

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = resolve(HERE, "fixtures/all-kinds.jsonl")

/**
 * Fixture (all-kinds.jsonl) — 8 rows, row 1 is a "cursor-anchor" user row.
 * We press gg to move the cursor to row 1, so rows 2..8 are non-cursor and
 * render their kind labels with the claude-session config's kind color.
 *
 * Rendered layout (row 0 = status bar, rows 1..8 = list items):
 *   row 1:  05:00:00 USER     cursor-anchor   (cursor — skipped)
 *   row 2:  05:00:01 USER     hi              → kind color: $color4 (blue)
 *   row 3:  05:00:02 think    hmm             → $color8 (bright-black)
 *   row 4:  05:00:03 ASSIST   ok              → $color2 (green)
 *   row 5:  05:00:04 → tool   Bash ls         → $color6 (cyan)
 *   row 6:  05:00:05 ← result tu1 out         → $color14 (bright-cyan)
 *   row 7:  05:00:06 ◆ hook   PreToolUse:Bash → $color5 (magenta)
 *   row 8:  05:00:07 SYSTEM   system msg      → $color3 (yellow)
 *
 * The kind label column starts at col 10 (after " hh:mm:ss ").
 * We don't pin exact hex — theme can change. We assert the colors are all
 * DISTINCT (7 kinds → 7 unique resolved fg colors).
 */

type Rgb = { r: number; g: number; b: number }

function kindFgAt(term: ReturnType<typeof createTermless>, row: number): Rgb {
  // The kind label starts at col 10 (1 padding + 8 time + 1 space).
  const cell = term.cell(row, 10)
  if (!cell.fg || typeof cell.fg !== "object") {
    throw new Error(`expected RGB fg at (row=${row}, col=10), got ${JSON.stringify(cell.fg)}`)
  }
  return cell.fg as Rgb
}

describe("km-logview kind colors", () => {
  test("each kind renders with a distinct fg color", async () => {
    using term = createTermless({ cols: 120, rows: 30 })
    const rows = loadRows(FIXTURE, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={FIXTURE} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )
    // Move cursor to the anchor row (screen row 1) so rows 2..8 are
    // non-cursor and show their native kind colors.
    await handle.press("g")
    await handle.press("g")

    // Rows 2..8 map to the 7 kinds we care about.
    const kinds: Array<[string, number]> = [
      ["user", 2],
      ["thinking", 3],
      ["assistant", 4],
      ["tool_use", 5],
      ["tool_result", 6],
      ["hook", 7],
      ["system", 8],
    ]
    const colors = new Map<string, string>()
    for (const [kind, row] of kinds) {
      colors.set(kind, JSON.stringify(kindFgAt(term, row)))
    }

    // Each kind's color must be distinct — 7 kinds → 7 unique values.
    const distinct = new Set(colors.values())
    expect(distinct.size).toBe(kinds.length)

    handle.unmount()
  })

  test("each kind's color is a valid RGB (not null, not default)", async () => {
    using term = createTermless({ cols: 120, rows: 30 })
    const rows = loadRows(FIXTURE, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={FIXTURE} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )
    await handle.press("g")
    await handle.press("g")

    for (let row = 2; row <= 8; row++) {
      const rgb = kindFgAt(term, row)
      expect(typeof rgb.r).toBe("number")
      expect(typeof rgb.g).toBe("number")
      expect(typeof rgb.b).toBe("number")
      // Rule out "accidentally all-zeros" sentinel.
      expect(rgb.r + rgb.g + rgb.b).toBeGreaterThan(0)
    }
    handle.unmount()
  })
})
