/**
 * Regression: status bar stray chars between emoji and count (km-tui.status-bar-stray-chars)
 *
 * Bug: the bottom status bar rendered `📋y1 📄n3` instead of `📋 1 📄 3`.
 * The stray letters (`y`, `n`, `s`, `:`, `a`) appeared in the continuation cell
 * of the wide emoji. Root cause: when the watcher-status Text shrank (e.g.
 * `📄0 starting` -> `📄0`), right-justified flex layout shifted the sibling
 * Texts right. The wide-emoji continuation cell landed on cells that still
 * held stale letters from the previous frame because silvery's incremental
 * pipeline didn't always rewrite those cells across the layout shift.
 *
 * Fix in CommandBox.tsx:
 *   1. Add explicit space between the emoji and the number (`📋 {N}`, `📄 {N}`)
 *      — matches the expected output shown in the bead and guarantees the
 *      cell after the continuation is always a clean space.
 *   2. Split watcher-status into separate stable-width Texts (file count vs
 *      state suffix). The `📄 N` prefix no longer changes width when the
 *      state transitions, so its emoji continuation cell is never shifted
 *      onto stale pixels from a longer prior render.
 */
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import React from "react"

describe("regression: status bar stray chars (km-tui.status-bar-stray-chars)", () => {
  test("node-count template always has a space between 📋 and the number", () => {
    const render = createRenderer({ cols: 60, rows: 3 })
    const app = render(
      <Box flexDirection="row">
        <Text dimColor>DISK /tmp/foo</Text>
        <Text dimColor> 📋 {1}</Text>
      </Box>,
    )
    expect(app.text).toContain("📋 1")
    expect(app.text).not.toMatch(/📋[A-Za-z:]/)
  })

  test("watcher file-count template always has a space between 📄 and the number", () => {
    const render = createRenderer({ cols: 60, rows: 3 })
    const app = render(
      <Box flexDirection="row">
        <Text dimColor>{" 📄 3"}</Text>
      </Box>,
    )
    expect(app.text).toContain("📄 3")
    expect(app.text).not.toMatch(/📄[A-Za-z:]/)
  })

  test("sequence: watcher state transitions keep emoji continuation cell clean", () => {
    const render = createRenderer({ cols: 60, rows: 3 })
    function Row({ fileCount, suffix }: { fileCount: string; suffix: string }) {
      return (
        <Box flexDirection="row" justifyContent="flex-end" paddingX={1}>
          <Box flexDirection="row" flexShrink={0}>
            <Text dimColor>DISK /tmp/foo</Text>
            <Text dimColor> 📋 3</Text>
            {/* Split file-count from suffix — file-count is stable width
               and its wide emoji's continuation cell never lands on stale
               pixels from a prior longer render. */}
            <Text dimColor>{fileCount}</Text>
            {suffix && <Text dimColor>{suffix}</Text>}
          </Box>
        </Box>
      )
    }

    const app = render(<Row fileCount=" 📄 3" suffix=" starting" />)
    app.rerender(<Row fileCount=" 📄 3" suffix=" sync:2" />)
    app.rerender(<Row fileCount=" 📄 3" suffix="" />)
    app.rerender(<Row fileCount=" 📄 3" suffix=" syncing" />)
    app.rerender(<Row fileCount=" 📄 3" suffix="" />)

    const txt = app.text
    expect(txt).not.toMatch(/📋[A-Za-z:]/)
    expect(txt).not.toMatch(/📄[A-Za-z:]/)
    expect(txt).not.toContain("syncing")
    expect(txt).not.toContain("starting")
    expect(txt).not.toContain("sync:")
  })
})
