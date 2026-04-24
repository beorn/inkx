import React from "react"
import { Box } from "silvery"
import { run } from "silvery/runtime"
import { createTermless } from "@silvery/test"
import { describe, expect, test } from "vitest"
import { claudeSessionConfig } from "../src/configs/claude-session.ts"
import { LogRowView } from "../src/row/LogRowView.tsx"
import { PopoverProvider } from "../src/Popover.tsx"
import type { LogRow } from "../src/view-config.ts"

/**
 * Contract: the row never cross-composes tokens from different domains.
 * Either EVERY bg-painted cell in the row uses the cursor bg (if cursor
 * is on), or EVERY such cell uses the surface bg (if expanded-only) —
 * never a mix. Prevents the pre-fix Espresso failure (surface bg #3B3B3B
 * × cursor fg #999999 = 4.22:1) and its cousins in other low-contrast
 * cursor schemes.
 */

function makeExpandedRow(): LogRow {
  return {
    id: "1.a",
    lineNo: 1,
    kind: "user",
    raw: null,
    fields: {
      time: "05:00:00",
      label: "",
      body: [
        "<system-reminder>",
        "first plain-text body line with real content",
        'second line with "key": "value" and numbers 42',
        "third plain body paragraph — just prose",
        "fourth body paragraph — also prose for testing",
        "</system-reminder>",
      ].join("\n"),
    },
  }
}

describe("km-logview row bg is single-domain", () => {
  test("cursor + expanded: header bg equals body content bg (no domain mixing)", async () => {
    using term = createTermless({ cols: 80, rows: 12 })
    const row = makeExpandedRow()
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
          <Box flexGrow={1} />
        </Box>
      </PopoverProvider>,
      term,
    )

    // Row 0 = header. Row 1+ = body content (past the $accent bar at col 1).
    const headerCell = term.cell(0, 10)
    const bodyCell = term.cell(2, 20)
    expect(JSON.stringify(headerCell.bg)).toBe(JSON.stringify(bodyCell.bg))

    handle.unmount()
  })
})
