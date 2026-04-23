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
 *   1. "short line" (10 chars, single line)              → inline beside header
 *   2. "this is a long single line body ..." (>60 chars) → depends on terminal width
 *   3. "line one\nline two\nline three"      (3 lines)   → below muted (multi-line)
 *
 * Inline/below split is terminal-width-aware: single-line bodies inline
 * when header + separator + body + padding fit within `columns`, else
 * push below. Tests use narrow (cols=40) for push-below assertions and
 * wide (cols=200) for inline assertions.
 *
 * Row 0 = status bar, rows 1+ = list items.
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

  test("long single-line body pushes below when it doesn't fit alongside the header", async () => {
    // Fixture body #2 is deliberately >120 chars — longer than cols, so it
    // pushes below regardless of how wide this terminal is.
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
    expect(lines[2]).not.toContain("this is a very long single line body")

    // Row 3: body line rendered below, indented by 2 spaces.
    expect(lines[3]).toMatch(/^\s{2,}/)
    expect(lines[3]).toContain("this is a very long single line body")
    handle.unmount()
  })

  test("multi-line body renders each line on its own row (honors newlines)", async () => {
    // cols=40 ensures the preceding long-body row also pushes below so
    // row indices are stable across the test suite.
    using term = createTermless({ cols: 120, rows: 20 })
    const rows = loadRows(FIXTURE, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={FIXTURE} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )
    const lines = term.screen.getLines()

    // Long body (row 2) wraps across 2 visual rows → multi-line row shifts
    // to lines[5]. Row 5 = header only; rows 6-8 = each body line.
    expect(lines[5]).toContain("05:00:02")
    expect(lines[5]).toContain("USER")
    expect(lines[5]).not.toContain("line one")

    // Body renders across 3 rows — one line per source newline. The fixture
    // has 3 body lines (≤ BODY_COLLAPSED_MAX_LINES+1) so all render flat,
    // no "+N more" needed.
    expect(lines[6]).toContain("line one")
    expect(lines[7]).toContain("line two")
    expect(lines[8]).toContain("line three")
    expect((lines[6] ?? "") + (lines[7] ?? "") + (lines[8] ?? "")).not.toContain("+0 more")
    handle.unmount()
  })

  test("body-below lines render dim + muted (not cursor-colored)", async () => {
    // Narrow cols forces all bodies below → consistent row indices.
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

    // Row 6: multi-body "line one" (long body wraps onto rows 3-4,
    // multi header on row 5, multi body lines begin at 6).
    const rowBody2 = firstCellOnBody(6)
    expect(rowBody2).not.toBeNull()
    expect(rowBody2!.fg).not.toBeNull()

    // All body lines should be dimmed identically — colors should match.
    expect(JSON.stringify(rowBody1!.fg)).toBe(JSON.stringify(rowBody2!.fg))
    handle.unmount()
  })
})
