/**
 * TextArea cursor positioning tests
 *
 * Verifies that the terminal cursor is positioned correctly relative to
 * the text content, accounting for border and padding offsets.
 *
 * Bug: km-silvery.textarea-cursor
 * The cursor was rendered ON the last typed character instead of AFTER it
 * because useCursor used the parent Box's scrollRect (which doesn't include
 * border/padding offset) instead of the content area position.
 */

import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, TextArea } from "silvery"
import { useState } from "react"

describe("TextArea cursor position", () => {
  test("cursor advances through trailing spaces at a soft-wrap boundary", async () => {
    const r = createRenderer({ cols: 80, rows: 8 })
    let observedValue = ""
    const input = "see screenshot - the text ajsfdlk ajsldk fajlksd fjlas df"

    function App() {
      const [value, setValue] = useState("")
      observedValue = value
      return (
        <Box width={61} flexDirection="row">
          <Text>{" > "}</Text>
          <Box flexGrow={1} minWidth={0} paddingRight={1}>
            <TextArea value={value} onChange={setValue} submitKey="enter" />
          </Box>
        </Box>
      )
    }

    const app = r(<App />)
    for (const ch of input) await app.press(ch)

    const beforeSpaces = app.getCursorState()
    expect(beforeSpaces).not.toBeNull()

    for (const ch of "   ") await app.press(ch)

    expect(observedValue).toBe(input + "   ")
    const afterSpaces = app.getCursorState()
    expect(afterSpaces).not.toBeNull()
    expect(afterSpaces!.y).toBe(beforeSpaces!.y)
    expect(afterSpaces!.x).toBe(beforeSpaces!.x + 3)
  })

  test("cursor follows a word that wraps after a consumed boundary space", async () => {
    const r = createRenderer({ cols: 20, rows: 6 })
    let observedValue = ""

    function App() {
      const [value, setValue] = useState("")
      observedValue = value
      return (
        <Box width={6}>
          <TextArea value={value} onChange={setValue} submitKey="enter" />
        </Box>
      )
    }

    const app = r(<App />)
    for (const ch of "123456 789") await app.press(ch)

    expect(observedValue).toBe("123456 789")
    expect(app.lines[0]).toContain("123456")
    expect(app.lines[1]).toContain("789")
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.y).toBe(1)
    expect(cursor!.x).toBe(3)
  })

  test("cursor moves to the next visual row at an exact soft-wrap boundary", () => {
    const r = createRenderer({ cols: 20, rows: 6 })

    function App() {
      return (
        <Box width={10}>
          <TextArea defaultValue={"x".repeat(10)} fieldSizing="fixed" rows={3} />
        </Box>
      )
    }

    const app = r(<App />)
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.y).toBe(1)
    expect(cursor!.x).toBe(0)
  })

  test("controlled cursor remains at the insertion point after typing past an exact soft-wrap boundary", async () => {
    const r = createRenderer({ cols: 20, rows: 6 })
    let observedValue = ""

    function App() {
      const [value, setValue] = useState("")
      observedValue = value
      return (
        <Box width={10}>
          <TextArea value={value} onChange={setValue} submitKey="enter" fieldSizing="fixed" rows={3} />
        </Box>
      )
    }

    const app = r(<App />)
    for (const ch of "x".repeat(10)) await app.press(ch)

    const atBoundary = app.getCursorState()
    expect(atBoundary).not.toBeNull()
    expect(atBoundary!.y, app.text).toBe(1)
    expect(atBoundary!.x, app.text).toBe(0)

    await app.press("i")

    expect(observedValue).toBe(`${"x".repeat(10)}i`)
    expect(app.lines[1]![0], app.text).toBe("i")
    const afterInsert = app.getCursorState()
    expect(afterInsert).not.toBeNull()
    expect(afterInsert!.y, app.text).toBe(1)
    expect(afterInsert!.x, app.text).toBe(1)
  })

  test("cursor stays at insertion point after soft wrap in a row with prompt gutter", async () => {
    const r = createRenderer({ cols: 36, rows: 8 })
    let observedValue = ""

    function App() {
      const [value, setValue] = useState("")
      observedValue = value
      return (
        <Box width={30} flexDirection="row">
          <Text>{" > "}</Text>
          <Box flexGrow={1} minWidth={0} paddingRight={1}>
            <TextArea value={value} onChange={setValue} submitKey="enter" />
          </Box>
        </Box>
      )
    }

    const app = r(<App />)
    const input = "see screenshots - the text is inserted offset vs where the cursor isafter a line wrap"
    for (const ch of input) await app.press(ch)

    expect(observedValue).toBe(input)
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()

    const rowsWithText = app.lines
      .map((line, row) => ({ line, row }))
      .filter(({ line }) => /[a-z0-9]/.test(line))

    expect(rowsWithText.length, `Expected input to wrap.\n${app.text}`).toBeGreaterThan(1)
    const last = rowsWithText[rowsWithText.length - 1]!
    const lastTextEnd = last.line.search(/\s*$/)
    expect(cursor!.y, app.text).toBe(last.row)
    expect(cursor!.x, app.text).toBe(lastTextEnd)
  })

  test("controlled initial value starts with cursor at end and edits from there", async () => {
    const r = createRenderer({ cols: 40, rows: 10 })
    let observedValue = ""

    function App() {
      const [value, setValue] = useState("Hello")
      observedValue = value
      return (
        <Box width={20}>
          <TextArea value={value} onChange={setValue} fieldSizing="fixed" rows={1} />
        </Box>
      )
    }

    const app = r(<App />)

    expect(app.text).toContain("Hello")
    expect(app.getCursorState()?.x).toBe(5)

    await app.press("ArrowLeft")
    await app.press("X")

    expect(observedValue).toBe("HellXo")
    expect(app.getCursorState()?.x).toBe(5)
  })

  test("cursor is after last character without border (uncontrolled)", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    function App() {
      return (
        <Box>
          <TextArea defaultValue="X" fieldSizing="fixed" rows={3} />
        </Box>
      )
    }

    const app = r(<App />)

    // Uncontrolled with defaultValue="X" places cursor at end (position 1)
    // Without border, TextArea renders:
    // X                                        (row 0)
    //
    // The cursor should be AFTER "X", at column 1 (cursorCol=1)
    expect(app.text).toContain("X")
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.visible).toBe(true)
    expect(cursor!.x).toBe(1)
    expect(cursor!.y).toBe(0)
  })

  test("cursorStyle controls the active hardware cursor shape", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    function App() {
      return (
        <Box>
          <TextArea defaultValue="X" fieldSizing="fixed" rows={1} cursorStyle="underline" />
        </Box>
      )
    }

    const app = r(<App />)
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.shape).toBe("underline")
  })

  test("active disabled TextArea owns a hidden cursor position", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    function App() {
      return (
        <Box padding={1}>
          <TextArea defaultValue="blocked" fieldSizing="fixed" rows={1} isActive disabled />
        </Box>
      )
    }

    const app = r(<App />)
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.visible).toBe(false)
    expect(cursor!.x).toBe(1 + "blocked".length)
    expect(cursor!.y).toBe(1)
  })

  test("active visible TextArea owns cursor precedence over deeper fallbacks", () => {
    const r = createRenderer({ cols: 60, rows: 10 })

    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <TextArea defaultValue="compose" fieldSizing="fixed" rows={1} isActive />
          <Box flexDirection="column" padding={1}>
            <Box cursorOffset={{ col: 5, row: 0, visible: true }}>
              <Text>deeper fallback</Text>
            </Box>
          </Box>
        </Box>
      )
    }

    const app = r(<App />)
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.visible).toBe(true)
    expect(cursor!.x).toBe(1 + "compose".length)
    expect(cursor!.y).toBe(1)
  })

  test("cursor is after last character when borderStyle is set (uncontrolled)", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    function App() {
      return (
        <Box>
          <TextArea defaultValue="X" fieldSizing="fixed" rows={1} borderStyle="single" />
        </Box>
      )
    }

    const app = r(<App />)

    // With borderStyle="single", TextArea renders:
    // ┌──────────────────────────────────────┐  (row 0)
    // │ X                                    │  (row 1) - border(1) + padding(1) + "X" at col 2
    // └──────────────────────────────────────┘  (row 2)
    //
    // The cursor should be AFTER "X", at column 3 (border=1 + padding=1 + cursorCol=1)
    // and row 1 (border=1 + visibleCursorRow=0)
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.visible).toBe(true)
    // Cursor col: 1 (border) + 1 (padding) + 1 (after "X") = 3
    expect(cursor!.x).toBe(3)
    // Cursor row: 1 (border) + 0 (visibleCursorRow) = 1
    expect(cursor!.y).toBe(1)
  })

  test("cursor position with border and multiple characters (uncontrolled)", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    function App() {
      return (
        <Box>
          <TextArea defaultValue="Hello" fieldSizing="fixed" rows={1} borderStyle="single" />
        </Box>
      )
    }

    const app = r(<App />)

    // With borderStyle="single" and value "Hello" (cursor at end, col=5):
    // ┌──────────────────────────────────────┐
    // │ Hello                                │  - "H" at col 2, cursor after "o" at col 7
    // └──────────────────────────────────────┘
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    // Cursor col: 1 (border) + 1 (padding) + 5 (after "Hello") = 7
    expect(cursor!.x).toBe(7)
    // Cursor row: 1 (border) + 0 (visibleCursorRow) = 1
    expect(cursor!.y).toBe(1)
  })

  test("cursor inside padded parent without own border (showcase layout)", () => {
    const r = createRenderer({ cols: 40, rows: 10 })

    // Mirrors the textarea showcase: border on grandparent, padding on parent,
    // TextArea has no borderStyle of its own.
    function App() {
      return (
        <Box flexDirection="column" padding={1}>
          <Box borderStyle="single" flexDirection="column">
            <Box paddingX={1}>
              <TextArea defaultValue="X" fieldSizing="fixed" rows={3} />
            </Box>
          </Box>
        </Box>
      )
    }

    const app = r(<App />)

    // Structure:
    // (0,0) padding row
    // (1,1) ┌──────────────────────────────────────┐  border
    // (1,2) │ X                                    │  border + padded content
    // (1,3) │                                      │
    // (1,4) │                                      │
    // (1,5) └──────────────────────────────────────┘  border
    //
    // TextArea is inside <Box paddingX={1}>. useCursor reads that Box's
    // scrollRect (border box) and adds its paddingX=1 as content offset.
    // Parent Box is at x=2 (root padding=1 + border=1).
    // Content inside paddingX=1 starts at x=3.
    // Cursor after "X" = x=3 + 1 = 4.
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    expect(cursor!.visible).toBe(true)
    // x: root-padding(1) + border(1) + parent-paddingX(1) + cursorCol(1) = 4
    expect(cursor!.x).toBe(4)
    // y: root-padding(1) + border(1) + visibleCursorRow(0) = 2
    expect(cursor!.y).toBe(2)
  })

  test("cursor position with border on second wrapped line (uncontrolled)", () => {
    const r = createRenderer({ cols: 20, rows: 10 })

    // With border+padding, content width = 20 - 2(border) - 2(padding) = 16
    // "AAAAAAAAAAAAAAAA" is exactly 16 chars, fills one line
    // "B" wraps to second line
    function App() {
      return (
        <Box>
          <TextArea
            defaultValue={"A".repeat(16) + "B"}
            fieldSizing="fixed"
            rows={5}
            borderStyle="single"
          />
        </Box>
      )
    }

    const app = r(<App />)

    // Cursor is at end of "B" on the second content line:
    // ┌──────────────────┐
    // │ AAAAAAAAAAAAAAAA │  (row 1)
    // │ B                │  (row 2) - cursor after "B" at col 3
    // │                  │
    // └──────────────────┘
    const cursor = app.getCursorState()
    expect(cursor).not.toBeNull()
    // cursorCol = 1 (after "B"), row offset from border
    // Cursor col: 1 (border) + 1 (padding) + 1 (after "B") = 3
    expect(cursor!.x).toBe(3)
    // Cursor row: 1 (border) + 1 (second content line) = 2
    expect(cursor!.y).toBe(2)
  })
})
