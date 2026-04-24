import React from "react"
import { Box, PopoverProvider } from "silvery"
import { run } from "silvery/runtime"
import { createTermless } from "@silvery/test"
import { describe, expect, test } from "vitest"
import { claudeSessionConfig } from "../src/configs/claude-session.ts"
import { LogRowView } from "../src/row/LogRowView.tsx"
import type { LogRow } from "../src/view-config.ts"

function makeCollapsibleRow(): LogRow {
  // 6 body lines → isCollapsible = true (> BODY_COLLAPSED_MAX_LINES + 1 = 4).
  return {
    id: "1.a",
    lineNo: 1,
    kind: "tool_use",
    raw: null,
    fields: {
      time: "05:00:00",
      label: "Bash",
      body: Array.from({ length: 6 }, (_, i) => `line ${i + 1}`).join("\n"),
    },
  }
}

/**
 * Expanded rows use two layered signals:
 * 1. Row bg — `$bg-surface-subtle` when non-cursor; `$bg-cursor` wins
 *    when cursor is on the row (prevents cross-domain composition of
 *    surface bg × cursor fg; see km-silvery.cursor-contrast-unguarded).
 * 2. Left-edge `$accent` bar — always shown on expanded bodies,
 *    survives cursor+expansion combos as the expansion indicator.
 */
describe("expanded row — bg + left-accent bar", () => {
  test("non-cursor expanded: $bg-surface-subtle on row, $accent bar at col 1 of body", async () => {
    using term = createTermless({ cols: 80, rows: 12 })
    const row = makeCollapsibleRow()
    const handle = await run(
      <PopoverProvider>
        <Box flexDirection="column" width="100%" height="100%">
          <LogRowView
            row={row}
            fields={claudeSessionConfig.fields}
            isCursor={false}
            expanded={true}
            onToggleExpand={() => {}}
          />
        </Box>
      </PopoverProvider>,
      term,
    )

    // Header (row 0) — subtle bg across header area
    const headerCell = term.cell(0, 5)
    expect(headerCell.bg).not.toBeNull()

    // Body (row 1+) — col 1 is the $accent bar (paddingX=1 on outer Box
    // + 1-col bar inside BodyLines). Col 5 is body content on subtle bg.
    const barCell = term.cell(1, 1)
    const contentCell = term.cell(1, 5)
    expect(barCell.bg).not.toBeNull()
    expect(contentCell.bg).not.toBeNull()

    // Bar and content have DIFFERENT bg (bar = accent, content = subtle)
    expect(JSON.stringify(barCell.bg)).not.toBe(JSON.stringify(contentCell.bg))

    handle.unmount()
  })

  test("cursor + expanded: $bg-cursor wins for bg, accent bar still shows", async () => {
    using term = createTermless({ cols: 80, rows: 12 })
    const row = makeCollapsibleRow()
    const handle = await run(
      <PopoverProvider>
        <Box flexDirection="column" width="100%" height="100%">
          <LogRowView
            row={row}
            fields={claudeSessionConfig.fields}
            isCursor={true}
            expanded={true}
            onToggleExpand={() => {}}
          />
        </Box>
      </PopoverProvider>,
      term,
    )

    const headerCell = term.cell(0, 5)
    const barCell = term.cell(1, 1)
    const contentCell = term.cell(1, 5)

    // Header + content share cursor bg (cursor wins over expansion).
    expect(JSON.stringify(headerCell.bg)).toBe(JSON.stringify(contentCell.bg))
    // Bar still paints a different bg (accent) to signal expansion.
    expect(JSON.stringify(barCell.bg)).not.toBe(JSON.stringify(contentCell.bg))

    handle.unmount()
  })
})
