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
 * Contract: expanded body renders at full body color — no colorize()
 * syntax highlighting. Rationale: expanded rows use `$bg-surface-subtle`,
 * and colorize's C_BRK ($fg-muted) produces dark-grey bracket/punctuation
 * glyphs on the already-grey subtle bg ("black-on-grey, hard to read").
 *
 * We assert: every character of the body on an expanded row shares the
 * same fg colour (= the parent `bodyColor`), whether or not the row is
 * being hovered. Tags / JSON-like punctuation do NOT get the muted C_BRK
 * treatment on the subtle surface.
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

describe("km-logview expanded hover body contrast", () => {
  test("expanded body has uniform fg — hover does not introduce muted brackets", async () => {
    using term = createTermless({ cols: 80, rows: 12 })
    const row = makeExpandedRow()
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

    type RGB = { r: number; g: number; b: number }
    const toRGB = (v: unknown): RGB | null => (v && typeof v === "object" ? (v as RGB) : null)

    const findRow = (needle: string): number => {
      const lines = term.screen.getLines()
      for (let r = 0; r < lines.length; r++) {
        if ((lines[r] ?? "").includes(needle)) return r
      }
      return -1
    }

    // Hover the row to trigger isHovered=true (the previously broken state).
    const bodyRow = findRow("plain body paragraph")
    expect(bodyRow).toBeGreaterThan(-1)
    await term.mouse.move(5, bodyRow)
    await new Promise((r) => setTimeout(r, 30))

    // Plain-text fg on the prose body line.
    const proseLine = term.screen.getLines()[bodyRow] ?? ""
    const proseCol = proseLine.indexOf("plain")
    const proseFg = toRGB(term.cell(bodyRow, proseCol).fg)
    expect(proseFg).not.toBeNull()

    // Bracket fg on the `<system-reminder>` line — previously C_BRK ($fg-muted)
    // due to colorize(); now must match the prose fg (uniform body color).
    const bracketRow = findRow("<system-reminder")
    expect(bracketRow).toBeGreaterThan(-1)
    const bracketLine = term.screen.getLines()[bracketRow] ?? ""
    const bracketCol = bracketLine.indexOf("<")
    const bracketFg = toRGB(term.cell(bracketRow, bracketCol).fg)
    expect(bracketFg).not.toBeNull()
    expect(JSON.stringify(bracketFg)).toBe(JSON.stringify(proseFg))

    // Same check for a JSON-ish punctuation cell on the "key": "value" line.
    const jsonRow = findRow('"key"')
    expect(jsonRow).toBeGreaterThan(-1)
    const jsonLine = term.screen.getLines()[jsonRow] ?? ""
    const quoteCol = jsonLine.indexOf('"key"')
    const quoteFg = toRGB(term.cell(jsonRow, quoteCol).fg)
    expect(quoteFg).not.toBeNull()
    expect(JSON.stringify(quoteFg)).toBe(JSON.stringify(proseFg))

    handle.unmount()
  })
})
