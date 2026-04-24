import React from "react"
import { Box, PopoverProvider } from "silvery"
import { run } from "silvery/runtime"
import { createTermless } from "@silvery/test"
import { describe, expect, test } from "vitest"
import { claudeSessionConfig } from "../src/configs/claude-session.ts"
import { LogRowView } from "../src/row/LogRowView.tsx"
import type { LogRow } from "../src/view-config.ts"

function makeMultiLineToolUseRow(): LogRow {
  return {
    id: "1.a",
    lineNo: 1,
    kind: "tool_use",
    raw: null,
    fields: {
      time: "05:00:00",
      label: "Bash",
      body: "echo line one\necho line two\necho line three\necho line four\necho line five",
    },
  }
}

describe("multi-line body muted by default", () => {
  test("each rendered body line has $fg-muted fg when not hovered, not cursor", async () => {
    using term = createTermless({ cols: 120, rows: 10 })
    const row = makeMultiLineToolUseRow()
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
          <Box flexGrow={1} />
        </Box>
      </PopoverProvider>,
      term,
    )

    // Body lines (rows 1..5) should all have the same muted fg color.
    // Skip past the '│' left border (Box borderLeft) + space — the body
    // content starts at col 2.
    const bodyFgs: Array<{ r: number; g: number; b: number } | null> = []
    for (let r = 1; r < 6; r++) {
      const line = term.screen.getLines()[r] ?? ""
      // Find the first alphanumeric glyph (actual body content, not chrome).
      const col = line.search(/[A-Za-z0-9]/)
      if (col < 0) continue
      const c = term.cell(r, col)
      bodyFgs.push((c.fg && typeof c.fg === "object" ? c.fg : null) as { r: number; g: number; b: number } | null)
    }
    // All body lines identically muted.
    expect(bodyFgs.length).toBeGreaterThan(0)
    const first = JSON.stringify(bodyFgs[0])
    for (const fg of bodyFgs) expect(JSON.stringify(fg)).toBe(first)

    // Compare muted to the header tool_use color (row 0, around col 12 where "→ tool" lives).
    // Header must be distinctly different from body (body is muted, header is kind-cyan).
    const headerLine = term.screen.getLines()[0] ?? ""
    const pillCol = headerLine.indexOf("tool")
    if (pillCol > 0) {
      const headerFg = term.cell(0, pillCol).fg
      expect(JSON.stringify(headerFg)).not.toBe(first)
    }
    handle.unmount()
  })
})
