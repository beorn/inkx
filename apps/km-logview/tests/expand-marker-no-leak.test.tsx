import React from "react"
import { Box } from "silvery"
import { run } from "silvery/runtime"
import { createTermless } from "@silvery/test"
import { describe, expect, test } from "vitest"
import { claudeSessionConfig } from "../src/configs/claude-session.ts"
import { LogRowView } from "../src/row/LogRowView.tsx"
import { PopoverProvider } from "../src/Popover.tsx"
import type { LogRow } from "../src/view-config.ts"

// Repro: user reports the blue left-edge marker leaks onto sibling rows
// after expanding just one row. Only the expanded row's body lines should
// carry the marker — all other rows in the list must be marker-free.
describe("expand marker confined to expanded row", () => {
  test("expanded row marker does not leak onto sibling rows", async () => {
    using term = createTermless({ cols: 120, rows: 40 })
    const rows: LogRow[] = [
      {
        id: "1.a",
        lineNo: 1,
        kind: "msg",
        raw: null,
        fields: { time: "05:00:00", label: "Info", body: "first row — short" },
      },
      {
        id: "2.a",
        lineNo: 2,
        kind: "tool_use",
        raw: null,
        fields: {
          time: "05:00:01",
          label: "Bash",
          body: Array.from({ length: 8 }, (_, i) => `expanded line ${i + 1}`).join("\n"),
        },
      },
      {
        id: "3.a",
        lineNo: 3,
        kind: "msg",
        raw: null,
        fields: { time: "05:00:02", label: "Info", body: "third row — short" },
      },
      {
        id: "4.a",
        lineNo: 4,
        kind: "msg",
        raw: null,
        fields: { time: "05:00:03", label: "Info", body: "fourth row — short" },
      },
    ]

    const handle = await run(
      <PopoverProvider>
        <Box flexDirection="column" width="100%" height="100%">
          {rows.map((r) => (
            <LogRowView
              key={r.id}
              row={r}
              fields={claudeSessionConfig.fields}
              isCursor={false}
              expanded={r.id === "2.a"}
              onToggleExpand={() => {}}
            />
          ))}
        </Box>
      </PopoverProvider>,
      term,
    )

    // Find row 1 (id=1.a — "first row") and row 3 (id=3.a — "third row") in
    // the rendered screen. Their leftmost cells MUST NOT contain a border
    // glyph (│ or ▎) — those belong exclusively to row 2's expanded body.
    const lines = term.screen.getLines()

    const firstRowIdx = lines.findIndex((l) => l.includes("first row"))
    const thirdRowIdx = lines.findIndex((l) => l.includes("third row"))
    const fourthRowIdx = lines.findIndex((l) => l.includes("fourth row"))
    expect(firstRowIdx).toBeGreaterThanOrEqual(0)
    expect(thirdRowIdx).toBeGreaterThanOrEqual(0)
    expect(fourthRowIdx).toBeGreaterThanOrEqual(0)

    for (const r of [firstRowIdx, thirdRowIdx, fourthRowIdx]) {
      const leadCol = (lines[r] ?? "").slice(0, 3)
      expect(leadCol).not.toMatch(/[│▎]/) // no marker on non-expanded rows
    }
    handle.unmount()
  })
})
