import React from "react"
import { Box } from "silvery"
import { run } from "silvery/runtime"
import { createTermless } from "@silvery/test"
import { describe, expect, test } from "vitest"
import { claudeSessionConfig } from "../src/configs/claude-session.ts"
import { LogRowView } from "../src/row/LogRowView.tsx"
import { PopoverProvider } from "../src/Popover.tsx"
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

describe("expanded-row bg is actually applied", () => {
  test("expanded row has a non-null bg color that differs from the default", async () => {
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

    // Row 0 = header. Rows 1-6 = body. Pick a body cell; its bg should differ
    // from a cell OUTSIDE the row (bottom of the screen).
    const bodyCell = term.cell(2, 3) // row 2 (body line), col 3
    const outsideCell = term.cell(10, 0) // outside the expanded row
    expect(bodyCell.bg).not.toBeNull()
    expect(JSON.stringify(bodyCell.bg)).not.toBe(JSON.stringify(outsideCell.bg))
    handle.unmount()
  })
})
