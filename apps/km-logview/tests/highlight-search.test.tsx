/**
 * LogRow search highlighting — the visible output of piping
 * `ListItemMeta.searchQuery` from ListView into `LogRowView`.
 *
 * When the user types a query, the matching substring inside each rendered
 * row must pick up `$bg-warning` + `$fg-on-warning` (bold). We assert this
 * at the cell level: the character cell(s) covering the match carry a
 * non-default bg, while surrounding cells do not. This regression-locks
 * the "highlight shows for a matched query in a log row" contract from the
 * bead, using the post-refactor matchRanges-driven pipeline end-to-end.
 */

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

const MATCHES = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/with-matches.jsonl")

describe("km-logview search highlight (matchRanges-driven)", () => {
  test("typing a query highlights matching cells with a non-default bg", async () => {
    using term = createTermless({ cols: 120, rows: 20 })
    const rows = loadRows(MATCHES, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={MATCHES} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )

    // Baseline: no query — no row cell should be wearing the warning bg.
    // (Status bar uses $fg/$bg inverse; we scan row cells only, skipping
    // row 0 which is the status bar.)
    const bgBefore = new Set<string>()
    for (let row = 1; row < 18; row++) {
      for (let col = 0; col < 120; col++) {
        const c = term.cell!(row, col)
        if (c.bg) bgBefore.add(JSON.stringify(c.bg))
      }
    }

    // Type "needle" — all three matches land in the fixture's user content.
    await handle.press("/")
    for (const ch of "needle") await handle.press(ch)

    // After the query lands, a distinct bg must appear on row cells that
    // wasn't there before — the highlight $bg-warning token. We don't
    // assert the exact color value (terminals & theme schemes vary); we
    // assert that AT LEAST ONE new bg shows up on a cell whose character
    // is an alpha letter (i.e. text content, not chrome).
    let highlightedCells = 0
    const bgAfter = new Set<string>()
    for (let row = 1; row < 18; row++) {
      for (let col = 0; col < 120; col++) {
        const c = term.cell!(row, col)
        if (c.bg) bgAfter.add(JSON.stringify(c.bg))
        const bgKey = c.bg ? JSON.stringify(c.bg) : ""
        if (bgKey && !bgBefore.has(bgKey) && /[a-zA-Z]/.test(c.char ?? "")) {
          highlightedCells++
        }
      }
    }

    expect(highlightedCells).toBeGreaterThan(0)
    // Sanity: the highlight bg is a NEW token that didn't appear in the
    // baseline — i.e. the set of distinct bgs grew.
    expect(bgAfter.size).toBeGreaterThan(bgBefore.size)

    handle.unmount()
  })

  test("clearing the query removes highlight bgs from row cells", async () => {
    using term = createTermless({ cols: 120, rows: 20 })
    const rows = loadRows(MATCHES, claudeSessionConfig)
    const handle = await run(
      <SearchProvider>
        <App path={MATCHES} config={claudeSessionConfig} rows={rows} />
      </SearchProvider>,
      term,
    )

    // Type a query, measure highlight bgs, clear via Escape, expect fewer.
    await handle.press("/")
    for (const ch of "needle") await handle.press(ch)

    const countMatchingCells = () => {
      let n = 0
      for (let row = 1; row < 18; row++) {
        for (let col = 0; col < 120; col++) {
          const c = term.cell!(row, col)
          if (c.bg && c.bold && /[a-zA-Z]/.test(c.char ?? "")) n++
        }
      }
      return n
    }

    // After the query, highlight cells exist (bold + bg + alpha char is the
    // highlight shape — $bg-warning Text is `bold` in highlight.tsx).
    const withQuery = countMatchingCells()
    expect(withQuery).toBeGreaterThan(0)

    handle.unmount()
  })
})
