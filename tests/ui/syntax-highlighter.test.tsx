import React from "react"
import { describe, expect, test, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import {
  Box,
  ScrollArea,
  SearchProvider,
  SyntaxHighlighter,
  type SearchContextValue,
  useScrollController,
  useSearch,
} from "@silvery/ag-react"

describe("SyntaxHighlighter", () => {
  test("upgrades the synchronous source fallback to styled syntax tokens", async () => {
    const render = createRenderer({ cols: 48, rows: 8, autoRender: true })
    const app = render(<SyntaxHighlighter language="typescript" code="const answer = 42" bare />)

    expect(app.text).toContain("const answer = 42")
    await vi.waitFor(
      () => {
        const row = app.lines.findIndex((line) => line.includes("const answer"))
        const column = app.lines[row]?.indexOf("const") ?? -1
        expect(row).toBeGreaterThanOrEqual(0)
        expect(column).toBeGreaterThanOrEqual(0)
        expect(app.cell(column, row).fg).not.toBeNull()
      },
      { timeout: 5_000 },
    )
  })

  test("keeps the unconfigured render byte-identical", () => {
    const render = createRenderer({ cols: 80, rows: 8 })
    const code = "const first = true\nconst second = true"

    expect(render(<SyntaxHighlighter language="typescript" code={code} bare />).text).toBe(code)
  })

  test("registers source search and reveals matches by measured wrapped-line origins", async () => {
    const code = Array.from({ length: 18 }, (_, index) =>
      index === 15 ? "const uniqueNeedle = true" : `const row${index} = "${"x".repeat(72)}"`,
    ).join("\n")
    let search: SearchContextValue | null = null
    let observedOffset = 0

    function Inspector() {
      search = useSearch()
      return null
    }

    function SearchableSource() {
      const controller = useScrollController()
      observedOffset = controller.scrollOffset
      return (
        <Box width={40} height={6} flexDirection="column">
          <ScrollArea controller={controller}>
            <SyntaxHighlighter
              language="typescript"
              code={code}
              bare
              search={{ id: "source", scrollController: controller }}
            />
          </ScrollArea>
        </Box>
      )
    }

    const render = createRenderer({ cols: 40, rows: 6, autoRender: true })
    render(
      <SearchProvider>
        <Inspector />
        <SearchableSource />
      </SearchProvider>,
    )

    search!.open()
    for (const char of "uniqueNeedle") search!.input(char)

    await vi.waitFor(() => {
      expect(search!.matches).toEqual([{ row: 15, startCol: 6, endCol: 18 }])
      expect(observedOffset).toBeGreaterThan(15)
    })
  })
})
