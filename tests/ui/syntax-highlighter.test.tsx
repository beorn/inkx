import React from "react"
import { describe, expect, test, vi } from "vitest"
import { createRenderer } from "@silvery/test"
import { SyntaxHighlighter } from "@silvery/ag-react"

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

  test("reports each semantic source line at its measured visual origin", async () => {
    const lineOrigins = new Map<number, number>()
    const render = createRenderer({ cols: 20, rows: 8, autoRender: true })

    render(
      <SyntaxHighlighter
        language="typescript"
        code={`${"x".repeat(48)}\nconst second = true`}
        bare
        onLineLayout={(lineIndex, y) => lineOrigins.set(lineIndex, y)}
      />,
    )

    await vi.waitFor(() => {
      expect(lineOrigins.get(0)).toBe(0)
      expect(lineOrigins.get(1)).toBeGreaterThan(lineOrigins.get(0) ?? 0)
    })
  })
})
