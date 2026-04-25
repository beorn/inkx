import React from "react"
import { describe, expect, test, beforeAll } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box } from "silvery"
import { MarkdownView } from "../../src/components/MarkdownView.tsx"
import { isLayoutEngineInitialized, setLayoutEngine } from "@silvery/ag-react"
import { createFlexilyZeroEngine } from "@silvery/ag-term/adapters/flexily-zero-adapter"

beforeAll(() => {
  if (!isLayoutEngineInitialized()) setLayoutEngine(createFlexilyZeroEngine())
})

describe("MarkdownView paragraph wrap", () => {
  test("long paragraph wraps at column boundary", () => {
    const COLS = 60
    const ROWS = 20
    const longPara = "A workspace for agentic knowledge workers: unified notes, tasks, and calendar in a TUI, with bidirectional markdown sync and a vendor/ submodule layout."
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="column">
        <MarkdownView source={longPara} />
      </Box>
    )
    const text = app.text
    // Each line should be <= COLS chars
    for (const line of text.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(COLS)
    }
    // First line should not contain the entire long paragraph (must wrap)
    const firstLine = text.split("\n")[0]
    expect(firstLine?.length).toBeLessThan(longPara.length)
  })
})
