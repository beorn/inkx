import React from "react"
import { beforeAll, describe, expect, test } from "vitest"
import { createRenderer, createTermless } from "@silvery/test"
import { isLayoutEngineInitialized, setLayoutEngine } from "@silvery/ag-react"
import { createFlexilyZeroEngine } from "@silvery/ag-term/adapters/flexily-zero-adapter"
import { Box } from "silvery"
import { run } from "silvery/runtime"
import { SessionPromptComposer } from "../src/components/SessionPromptComposer.tsx"

beforeAll(() => {
  if (!isLayoutEngineInitialized()) setLayoutEngine(createFlexilyZeroEngine())
})

function sameRgb(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return a === b
  const left = a as { r?: number; g?: number; b?: number }
  const right = b as { r?: number; g?: number; b?: number }
  return left.r === right.r && left.g === right.g && left.b === right.b
}

const settle = (ms = 20) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe("SessionPromptComposer", () => {
  test("command box surface changes on hover to show it is clickable", async () => {
    const renderer = createRenderer({ cols: 80, rows: 8 })
    const tree = (
      <Box width={80} height={8} flexDirection="column">
        <SessionPromptComposer
          queueText=""
          onQueueChange={() => {}}
          onQueueSubmit={() => {}}
          inputValue=""
          onInputChange={() => {}}
          onSubmit={() => {}}
          onExit={() => {}}
          focusedRegion="command"
          onFocusRegion={() => {}}
        />
      </Box>
    )
    const app = renderer(tree)
    const before = app.cell(1, 1).bg

    await app.hover(1, 1)
    renderer(tree)
    const after = app.cell(1, 1).bg

    expect(before).not.toBeNull()
    expect(after).not.toBeNull()
    expect(sameRgb(after, before)).toBe(false)
  })

  test("command cursor follows word wrap inside the composer prompt gutter", async () => {
    const renderer = createRenderer({ cols: 24, rows: 8 })
    let observedInput = ""

    function App() {
      const [input, setInput] = React.useState("")
      observedInput = input
      return (
        <Box width={12} height={8} flexDirection="column">
          <SessionPromptComposer
            queueText=""
            onQueueChange={() => {}}
            onQueueSubmit={() => {}}
            inputValue={input}
            onInputChange={setInput}
            onSubmit={() => {}}
            onExit={() => {}}
            focusedRegion="command"
            onFocusRegion={() => {}}
          />
        </Box>
      )
    }

    const app = renderer(<App />)
    for (const ch of "123456 789") await app.press(ch)

    expect(observedInput).toBe("123456 789")
    const rowsWithText = app.lines.map((line, row) => ({ line, row })).filter(({ line }) => /123456|789/.test(line))

    expect(rowsWithText.length, app.text).toBeGreaterThan(1)
    const last = rowsWithText[rowsWithText.length - 1]!
    const lastTextEnd = last.line.search(/\s*$/)
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.y, app.text).toBe(last.row)
    expect(cursor!.x, app.text).toBe(lastTextEnd)
  })

  test("command textarea declares a block hardware cursor shape", () => {
    const renderer = createRenderer({ cols: 80, rows: 8 })
    const app = renderer(
      <Box width={80} height={8} flexDirection="column">
        <SessionPromptComposer
          queueText=""
          onQueueChange={() => {}}
          onQueueSubmit={() => {}}
          inputValue=""
          onInputChange={() => {}}
          onSubmit={() => {}}
          onExit={() => {}}
          focusedRegion="command"
          onFocusRegion={() => {}}
        />
      </Box>,
    )

    const cursor = app.getCursorState()
    expect(cursor, app.text).not.toBeNull()
    expect(cursor!.shape).toBe("block")
  })

  test("command cursor stays at the continuation-line insertion point after an exact wrap", async () => {
    const renderer = createRenderer({ cols: 24, rows: 8 })
    let observedInput = ""

    function App() {
      const [input, setInput] = React.useState("")
      observedInput = input
      return (
        <Box width={13} height={8} flexDirection="column">
          <SessionPromptComposer
            queueText=""
            onQueueChange={() => {}}
            onQueueSubmit={() => {}}
            inputValue={input}
            onInputChange={setInput}
            onSubmit={() => {}}
            onExit={() => {}}
            focusedRegion="command"
            onFocusRegion={() => {}}
          />
        </Box>
      )
    }

    const app = renderer(<App />)
    for (const ch of "x".repeat(8)) await app.press(ch)

    expect(observedInput).toBe("x".repeat(8))
    const firstTextRow = app.lines.findIndex((line) => line.includes("xxxxxxxx"))
    expect(firstTextRow, app.text).toBeGreaterThanOrEqual(0)
    const textStart = app.lines[firstTextRow]!.indexOf("x")

    const atBoundary = app.getCursorState()
    expect(atBoundary).not.toBeNull()
    expect(atBoundary!.y, app.text).toBe(firstTextRow + 1)
    expect(atBoundary!.x, app.text).toBe(textStart)

    await app.press("i")

    expect(observedInput).toBe(`${"x".repeat(8)}i`)
    expect(app.lines[firstTextRow + 1]![textStart], app.text).toBe("i")
    const afterInsert = app.getCursorState()
    expect(afterInsert).not.toBeNull()
    expect(afterInsert!.y, app.text).toBe(firstTextRow + 1)
    expect(afterInsert!.x, app.text).toBe(textStart + 1)
  })

  test("terminal command cursor stays aligned after typing past an exact wrap", async () => {
    using term = createTermless({ cols: 24, rows: 8 })
    let observedInput = ""

    function App() {
      const [input, setInput] = React.useState("")
      observedInput = input
      return (
        <Box width={13} height={8} flexDirection="column">
          <SessionPromptComposer
            queueText=""
            onQueueChange={() => {}}
            onQueueSubmit={() => {}}
            inputValue={input}
            onInputChange={setInput}
            onSubmit={() => {}}
            onExit={() => {}}
            focusedRegion="command"
            onFocusRegion={() => {}}
          />
        </Box>
      )
    }

    const handle = await run(<App />, term)
    const cursorTerm = term as typeof term & { getCursor(): { x: number; y: number } }
    try {
      await settle()
      for (const ch of "x".repeat(8)) await handle.press(ch)
      await settle()

      expect(observedInput).toBe("x".repeat(8))
      const lines = term.screen.getLines()
      const firstTextRow = lines.findIndex((line) => line.includes("xxxxxxxx"))
      expect(firstTextRow, term.screen.getText()).toBeGreaterThanOrEqual(0)
      const textStart = lines[firstTextRow]!.indexOf("x")

      const atBoundary = cursorTerm.getCursor()
      expect(atBoundary.y, term.screen.getText()).toBe(firstTextRow + 1)
      expect(atBoundary.x, term.screen.getText()).toBe(textStart)

      await handle.press("i")
      await settle()

      expect(observedInput).toBe(`${"x".repeat(8)}i`)
      const nextLines = term.screen.getLines()
      expect(nextLines[firstTextRow + 1]![textStart], term.screen.getText()).toBe("i")
      const afterInsert = cursorTerm.getCursor()
      expect(afterInsert.y, term.screen.getText()).toBe(firstTextRow + 1)
      expect(afterInsert.x, term.screen.getText()).toBe(textStart + 1)
    } finally {
      handle.unmount()
    }
  })
})
