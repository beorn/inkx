/**
 * Regression: km-silvery.box-scroll-stable-on-height-change
 *
 * Clicking a collapsible log row to expand it must not shift the viewport.
 * Rows above the clicked row must stay at the same on-screen Y; rows below
 * get pushed down as the expanded row grows.
 *
 * The real-world user flow: you're reading logs, you click a tool_use row
 * with a multi-line body to see the full output. Before the fix, the whole
 * ListView viewport yanked upward to keep the grown row "fully visible" —
 * and the row you just clicked disappeared off the top of the screen. With
 * the fix (Box scrollTo is "fire on change, not on re-render"), the cursor
 * row's header stays at the same on-screen position; only content below it
 * shifts.
 */

import React, { useImperativeHandle, useState, forwardRef } from "react"
import { Box, ListView, PopoverProvider } from "silvery"
import { run } from "silvery/runtime"
import { createTermless } from "@silvery/test"
import { describe, expect, test } from "vitest"
import { claudeSessionConfig } from "../src/configs/claude-session.ts"
import { LogRowView } from "../src/row/LogRowView.tsx"
import type { LogRow } from "../src/view-config.ts"

function makeRow(n: number, multi = false): LogRow {
  return {
    id: `r${n}`,
    lineNo: n,
    kind: "tool_use",
    raw: null,
    fields: {
      time: `05:00:${String(n).padStart(2, "0")}`,
      label: multi ? "Bash" : `Msg${n}`,
      body: multi ? Array.from({ length: 6 }, (_, i) => `b${n}-${i}`).join("\n") : `b${n}`,
    },
  }
}

type Api = { toggle: (id: string) => void }
const Harness = forwardRef<Api, { rows: LogRow[]; cursor: number }>(function Harness({ rows, cursor }, ref) {
  const [exp, setExp] = useState<ReadonlySet<string>>(() => new Set())
  useImperativeHandle(
    ref,
    () => ({
      toggle: (id: string) =>
        setExp((p) => {
          const n = new Set(p)
          n.has(id) ? n.delete(id) : n.add(id)
          return n
        }),
    }),
    [],
  )
  return (
    <PopoverProvider>
      <Box flexDirection="column" width="100%" height="100%">
        <ListView
          items={rows}
          height={8}
          nav
          cursorKey={cursor}
          getKey={(r) => r.id}
          renderItem={(r, _i, m) => (
            <LogRowView
              row={r}
              fields={claudeSessionConfig.fields}
              isCursor={m.isCursor}
              expanded={exp.has(r.id)}
              onToggleExpand={() => {}}
            />
          )}
        />
      </Box>
    </PopoverProvider>
  )
})

function findRowOnScreen(term: ReturnType<typeof createTermless>, needle: string): number {
  const lines = term.screen.getLines()
  for (let y = 0; y < lines.length; y++) {
    if ((lines[y] ?? "").includes(needle)) return y
  }
  return -1
}

describe("km-logview click-to-expand keeps viewport stable", () => {
  test("expanding a visible row does not shift rows above it on screen", async () => {
    // 8-row viewport; 20 rows total. Cursor mounts at row 10 (near middle),
    // row 10 is collapsible "Bash" with 6-line body. Initial scroll brings
    // row 10 into view. Expanding row 10 grows its rendered height from 5
    // rows (header + 3 preview lines + "⋯ more") to 7 rows (header + 6 body).
    // Before the fix, Box re-fired ensure-visible because target.bottom
    // exceeded visibleBottom, yanking the viewport up. After the fix, the
    // scrollTo value is unchanged between renders so ensure-visible is
    // skipped — viewport stays pinned.
    using term = createTermless({ cols: 80, rows: 8 })
    const rows = Array.from({ length: 20 }, (_, i) => makeRow(i, i === 10))
    const api = React.createRef<Api>()
    const h = await run(<Harness ref={api} rows={rows} cursor={10} />, term)

    // Capture initial viewport state.
    const row10YBefore = findRowOnScreen(term, "Bash")
    expect(row10YBefore, "cursor row must be visible on mount").toBeGreaterThanOrEqual(0)
    const linesBefore = term.screen.getLines()
    // Find the topmost Msg<N> row above the cursor — that's the anchor we
    // assert must not move.
    let rowAboveIdx = -1
    let rowAboveText = ""
    for (let y = 0; y < row10YBefore; y++) {
      const m = (linesBefore[y] ?? "").match(/Msg\d+/)
      if (m) {
        rowAboveIdx = y
        rowAboveText = m[0]
        break
      }
    }
    expect(
      rowAboveIdx,
      "at least one non-cursor row must be visible above the cursor before expand",
    ).toBeGreaterThanOrEqual(0)

    // ACT: toggle expansion in place. This is the moment the bug fired —
    // ListView re-renders with the same cursorKey (= same scrollTo on the
    // inner Box), and the cursor row's height grows.
    api.current!.toggle("r10")
    await new Promise((r) => setImmediate(r))

    // Assert: the row above the cursor must STILL be at the same on-screen Y.
    const rowAboveYAfter = findRowOnScreen(term, rowAboveText)
    const row10YAfter = findRowOnScreen(term, "Bash")

    expect(
      rowAboveYAfter,
      `row "${rowAboveText}" (above cursor) on-screen Y must be unchanged after in-place expand (was ${rowAboveIdx}, got ${rowAboveYAfter})`,
    ).toBe(rowAboveIdx)
    expect(
      row10YAfter,
      `cursor row (r10) top edge must stay at the same on-screen Y after in-place expand (was ${row10YBefore}, got ${row10YAfter})`,
    ).toBe(row10YBefore)

    h.unmount()
  })
})
