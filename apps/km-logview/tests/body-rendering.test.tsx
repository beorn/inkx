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
const FIXTURE = resolve(HERE, "fixtures/body-shapes.jsonl")

/**
 * body-shapes.jsonl has three rows:
 *   1. "short line" (10 chars, single line)   → inline beside header
 *   2. "this is a long single line body ..."  (≥30 chars)      → below muted
 *   3. "line one\nline two\nline three"        (3 lines)       → below muted
 *
 * INLINE_BODY_MAX_CHARS = 30 in LogRow.tsx controls the inline/below split.
 *
 * Renders into a 120x20 screen. Row 0 = status bar, rows 1+ = list items.
 */
describe("km-logview body rendering", () => {
  test("short single-line body renders inline with the header", async () => {
    using term = createTermless({ cols: 120, rows: 20 })
    const rows = loadRows(FIXTURE, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={FIXTURE} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )
    const lines = term.screen.getLines()

    // Row 1: " 05:00:00 USER short line" — all on one line, no overflow.
    expect(lines[1]).toContain("05:00:00")
    expect(lines[1]).toContain("USER")
    expect(lines[1]).toContain("short line")
    handle.unmount()
  })

  test("long single-line body (>=30 chars) renders below the header", async () => {
    using term = createTermless({ cols: 120, rows: 20 })
    const rows = loadRows(FIXTURE, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={FIXTURE} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )
    const lines = term.screen.getLines()

    // Row 2: header only — time + kind, no body text on same line.
    expect(lines[2]).toContain("05:00:01")
    expect(lines[2]).toContain("USER")
    expect(lines[2]).not.toContain("this is a long single line body")

    // Row 3: body line rendered below, indented by 2 spaces.
    expect(lines[3]).toMatch(/^\s{2,}/)
    expect(lines[3]).toContain("this is a long single line body")
    handle.unmount()
  })

  test("multi-line body renders each line below the header", async () => {
    using term = createTermless({ cols: 120, rows: 20 })
    const rows = loadRows(FIXTURE, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={FIXTURE} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )
    const lines = term.screen.getLines()

    // Row 4: header only for the 3-line row.
    expect(lines[4]).toContain("05:00:02")
    expect(lines[4]).toContain("USER")
    expect(lines[4]).not.toContain("line one")

    // Rows 5-7: each line rendered below, indented.
    expect(lines[5]).toContain("line one")
    expect(lines[6]).toContain("line two")
    expect(lines[7]).toContain("line three")
    handle.unmount()
  })

  test("body-below lines render dim + muted (not cursor-colored)", async () => {
    using term = createTermless({ cols: 120, rows: 20 })
    const rows = loadRows(FIXTURE, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={FIXTURE} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )

    // The cursor starts at the last row (3rd item, rendered at screen row 4).
    // Press gg to move cursor to row 0 so rows 3 and 5-7 are non-cursor and
    // show the muted dim color uniformly.
    await handle.press("g")
    await handle.press("g")

    // Row 3: body line of the long-body item, indent starts at col 1.
    // Find the first non-space cell and assert it has a non-null fg color
    // (the $fg-muted resolved RGB — we don't pin the exact hex; just
    // non-default-terminal).
    const firstCellOnBody = (row: number) => {
      for (let col = 0; col < 120; col++) {
        const c = term.cell(row, col)
        if (c.char !== " " && c.char !== " ") return c
      }
      return null
    }

    const rowBody1 = firstCellOnBody(3)
    expect(rowBody1).not.toBeNull()
    expect(rowBody1!.fg).not.toBeNull()

    const rowBody2 = firstCellOnBody(5)
    expect(rowBody2).not.toBeNull()
    expect(rowBody2!.fg).not.toBeNull()

    // All body lines should be dimmed identically — colors should match.
    expect(JSON.stringify(rowBody1!.fg)).toBe(JSON.stringify(rowBody2!.fg))
    handle.unmount()
  })
})
