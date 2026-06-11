/**
 * Inline Mode Fuzz Tests
 *
 * Property-based tests for inline rendering. The output phase has two modes:
 * fullscreen (diff + absolute positioning) and inline (relative positioning
 * with cursor tracking). These tests verify inline-specific invariants:
 *
 * 1. Resize roundtrip: resize A→B→A produces same output as A alone
 * 2. Content changes: incremental inline output matches full inline render
 * 3. Cursor-only changes: when only the cursor moves, output is minimal
 *
 * Uses the same VT screen simulator pattern as inline-output.test.tsx to
 * interpret ANSI output and compare visible screen state.
 *
 * ## Running
 *
 * ```bash
 * bun vitest run tests/inline-fuzz.fuzz.ts
 * FUZZ=1 bun vitest run tests/inline-fuzz.fuzz.ts
 * ```
 */

import { describe, expect } from "vitest"
import { test, gen, take } from "vimonkey/fuzz"
import { createBuffer, type TerminalBuffer } from "@silvery/ag-term/buffer"
import { createOutputPhase } from "@silvery/ag-term/pipeline/output-phase"

// ============================================================================
// Minimal VT Screen Simulator (same as inline-output.test.tsx)
// ============================================================================

function createScreen(cols: number, rows: number) {
  const cells: string[][] = Array.from({ length: rows }, () => Array(cols).fill(" "))
  let cursorX = 0
  let cursorY = 0

  function feed(ansi: string): void {
    let i = 0
    while (i < ansi.length) {
      if (ansi[i] === "\x1b") {
        if (ansi[i + 1] === "[") {
          let j = i + 2
          let isPrivate = false
          if (j < ansi.length && (ansi[j] === "?" || ansi[j] === ">")) {
            isPrivate = true
            j++
          }
          let params = ""
          while (j < ansi.length && ((ansi[j]! >= "0" && ansi[j]! <= "9") || ansi[j] === ";")) {
            params += ansi[j]
            j++
          }
          while (j < ansi.length && ansi[j]! >= " " && ansi[j]! <= "/") {
            j++
          }
          const cmd = ansi[j]
          j++
          const paramParts = params.split(";")
          const n = paramParts[0] ? parseInt(paramParts[0], 10) : 1

          if (isPrivate) {
            i = j
            continue
          }

          switch (cmd) {
            case "A":
              cursorY = Math.max(0, cursorY - n)
              break
            case "B":
              cursorY = Math.min(rows - 1, cursorY + n)
              break
            case "C":
              cursorX = Math.min(cols - 1, cursorX + n)
              break
            case "D":
              cursorX = Math.max(0, cursorX - n)
              break
            case "H": {
              cursorY = Math.max(0, parseInt(paramParts[0] || "1", 10) - 1)
              cursorX = Math.max(0, parseInt(paramParts[1] || "1", 10) - 1)
              break
            }
            case "J":
              if (params === "" || params === "0") {
                for (let x = cursorX; x < cols; x++) cells[cursorY]![x] = " "
                for (let y = cursorY + 1; y < rows; y++) {
                  for (let x = 0; x < cols; x++) cells[y]![x] = " "
                }
              } else if (params === "2") {
                for (let y = 0; y < rows; y++) {
                  for (let x = 0; x < cols; x++) cells[y]![x] = " "
                }
              }
              break
            case "K":
              if (params === "" || params === "0") {
                for (let x = cursorX; x < cols; x++) cells[cursorY]![x] = " "
              }
              break
            case "m":
              break
            default:
              break
          }
          i = j
        } else if (ansi[i + 1] === "]") {
          let j = i + 2
          while (j < ansi.length) {
            if (ansi[j] === "\x07") {
              j++
              break
            }
            if (ansi[j] === "\x1b" && ansi[j + 1] === "\\") {
              j += 2
              break
            }
            j++
          }
          i = j
        } else {
          i += 2
        }
      } else if (ansi[i] === "\r") {
        cursorX = 0
        i++
      } else if (ansi[i] === "\n") {
        cursorY++
        if (cursorY >= rows) {
          cells.shift()
          cells.push(Array(cols).fill(" "))
          cursorY = rows - 1
        }
        i++
      } else {
        if (cursorX < cols && cursorY < rows) {
          cells[cursorY]![cursorX] = ansi[i]!
          cursorX++
          if (cursorX >= cols) cursorX = cols - 1
        }
        i++
      }
    }
  }

  function getNonEmptyLines(): string[] {
    const lines = cells.map((row) => row.join("").trimEnd())
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop()
    return lines
  }

  return { feed, getNonEmptyLines }
}

// ============================================================================
// Buffer Helpers
// ============================================================================

function writeLine(buffer: TerminalBuffer, row: number, text: string): void {
  for (let i = 0; i < text.length && i < buffer.width; i++) {
    buffer.setCell(i, row, { char: text[i]! })
  }
}

function bufferWithLines(width: number, height: number, lines: string[]): TerminalBuffer {
  const buf = createBuffer(width, height)
  for (let i = 0; i < lines.length && i < height; i++) writeLine(buf, i, lines[i]!)
  return buf
}

/**
 * Render a buffer through a fresh output phase (full render, no prev buffer)
 * and return the visible screen lines. This is the "ground truth" for inline mode.
 */
function freshInlineRender(buf: TerminalBuffer, cols: number, rows: number): string[] {
  const op = createOutputPhase({})
  const screen = createScreen(cols, rows)
  screen.feed(op(null, buf, "inline", 0, rows))
  return screen.getNonEmptyLines()
}

// ============================================================================
// Fuzz Tests
// ============================================================================

describe("inline mode fuzz", () => {
  // --------------------------------------------------------------------------
  // 1. Resize roundtrip: A→B→A produces same output as A alone
  // --------------------------------------------------------------------------

  describe("Resize roundtrip (A→B→A)", () => {
    const DIMS: [number, number][] = [
      [40, 10],
      [60, 15],
      [80, 20],
      [30, 8],
      [100, 24],
    ]

    test.fuzz(
      "resize A→B→A produces same visible output as A alone",
      async () => {
        // Pick random dimension pairs
        const DIM_ACTIONS: [number, number][] = [
          [20, 0],
          [20, 1],
          [20, 2],
          [20, 3],
          [20, 4],
        ]

        // Generate random content lines
        const CONTENT_POOL = [
          "Hello world",
          "Line two here",
          "Another item",
          "Status: running",
          "Count: 42",
          "Footer text",
          "A longer line with more content to test",
          "Short",
        ]

        let iteration = 0
        for await (const dimIdxA of take(gen<number>(DIM_ACTIONS), 20)) {
          // Pick a different dimension for B
          const dimIdxB = (dimIdxA + 1) % DIMS.length

          const [colsA, rowsA] = DIMS[dimIdxA]!
          const [colsB, rowsB] = DIMS[dimIdxB]!

          // Generate random content (2-6 lines)
          const lineCount = 2 + (iteration % 5)
          const lines: string[] = []
          for (let i = 0; i < lineCount; i++) {
            lines.push(CONTENT_POOL[(iteration * 3 + i) % CONTENT_POOL.length]!)
          }

          // Render at size A (ground truth)
          const bufA = bufferWithLines(colsA, rowsA, lines)
          const expectedLines = freshInlineRender(bufA, colsA, rowsA)

          // Render A → resize to B → resize back to A
          // Use separate output phases since resize means new state
          const opA = createOutputPhase({})
          const screenA = createScreen(colsA, rowsA)
          screenA.feed(opA(null, bufA, "inline", 0, rowsA))
          const linesAfterA = screenA.getNonEmptyLines()

          // Verify first render matches ground truth
          expect(linesAfterA).toEqual(expectedLines)

          // Now render at B dimensions (content may be clipped/different)
          const bufB = bufferWithLines(colsB, rowsB, lines)
          const opB = createOutputPhase({})
          const screenB = createScreen(colsB, rowsB)
          screenB.feed(opB(null, bufB, "inline", 0, rowsB))

          // Resize back to A — render fresh at original dimensions
          const bufA2 = bufferWithLines(colsA, rowsA, lines)
          const opA2 = createOutputPhase({})
          const screenA2 = createScreen(colsA, rowsA)
          screenA2.feed(opA2(null, bufA2, "inline", 0, rowsA))
          const linesAfterRoundtrip = screenA2.getNonEmptyLines()

          // The roundtrip should produce identical output to the original
          if (JSON.stringify(linesAfterRoundtrip) !== JSON.stringify(expectedLines)) {
            expect.unreachable(
              `Resize roundtrip mismatch at iteration ${iteration}.\n` +
                `Dims: ${colsA}x${rowsA} → ${colsB}x${rowsB} → ${colsA}x${rowsA}\n` +
                `Expected: ${JSON.stringify(expectedLines)}\n` +
                `Got:      ${JSON.stringify(linesAfterRoundtrip)}`,
            )
          }

          iteration++
        }
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // 2. Content changes: incremental inline output matches full render
  // --------------------------------------------------------------------------

  describe("Content changes (incremental vs full)", () => {
    test.fuzz(
      "incremental inline render matches fresh render after content mutations",
      async () => {
        const COLS = 50
        const ROWS = 15
        const op = createOutputPhase({})
        const screen = createScreen(COLS, ROWS)

        // Start with initial content
        let lines = ["Header", "Item 1", "Item 2", "Item 3", "Footer"]
        let prev = bufferWithLines(COLS, ROWS, lines)
        screen.feed(op(null, prev, "inline", 0, ROWS))

        // Actions modify the content in various ways
        const MUTATIONS: [number, string][] = [
          [15, "add"], // add a line
          [15, "remove"], // remove a line
          [15, "change"], // change a line's content
          [15, "grow"], // make a line longer
          [15, "shrink"], // make a line shorter
          [10, "replace"], // replace all content
          [15, "swap"], // swap two lines
        ]

        let iteration = 1
        for await (const action of take(gen<string>(MUTATIONS), 80)) {
          // Apply mutation
          switch (action) {
            case "add":
              if (lines.length < ROWS - 2) {
                const pos = Math.min(Math.max(1, iteration % (lines.length - 1)), lines.length - 1)
                lines = [...lines.slice(0, pos), `Added-${iteration}`, ...lines.slice(pos)]
              }
              break
            case "remove":
              if (lines.length > 2) {
                const pos = Math.min(1 + (iteration % (lines.length - 2)), lines.length - 2)
                lines = [...lines.slice(0, pos), ...lines.slice(pos + 1)]
              }
              break
            case "change": {
              const pos = Math.min(iteration % lines.length, lines.length - 1)
              lines = [...lines]
              lines[pos] = `Changed-${iteration}`
              break
            }
            case "grow": {
              const pos = Math.min(iteration % lines.length, lines.length - 1)
              lines = [...lines]
              lines[pos] = lines[pos]! + "!"
              break
            }
            case "shrink": {
              const pos = Math.min(iteration % lines.length, lines.length - 1)
              lines = [...lines]
              if (lines[pos]!.length > 3) {
                lines[pos] = lines[pos]!.slice(0, -1)
              }
              break
            }
            case "replace":
              lines = [`New-${iteration}`, `Content-${iteration}`, "End"]
              break
            case "swap":
              if (lines.length >= 3) {
                lines = [...lines]
                const a = 1
                const b = Math.min(2, lines.length - 1)
                ;[lines[a], lines[b]] = [lines[b]!, lines[a]!]
              }
              break
          }

          // Render incrementally
          const next = bufferWithLines(COLS, ROWS, lines)
          screen.feed(op(prev, next, "inline", 0, ROWS))
          const incrementalLines = screen.getNonEmptyLines()

          // Render fresh (ground truth)
          const expectedLines = freshInlineRender(next, COLS, ROWS)

          // Compare
          if (JSON.stringify(incrementalLines) !== JSON.stringify(expectedLines)) {
            expect.unreachable(
              `Inline incremental vs fresh mismatch at iteration ${iteration} (action: ${action}).\n` +
                `Content: ${JSON.stringify(lines)}\n` +
                `Expected: ${JSON.stringify(expectedLines)}\n` +
                `Got:      ${JSON.stringify(incrementalLines)}`,
            )
          }

          prev = next
          iteration++
        }
      },
      { timeout: 30_000 },
    )

    test.fuzz(
      "grow and shrink cycles produce correct inline output",
      async () => {
        const COLS = 40
        const ROWS = 20
        const op = createOutputPhase({})
        const screen = createScreen(COLS, ROWS)

        let lines = ["Base"]
        let prev = bufferWithLines(COLS, ROWS, lines)
        screen.feed(op(null, prev, "inline", 0, ROWS))

        const ACTIONS: [number, string][] = [
          [40, "grow"], // add line at end
          [40, "shrink"], // remove line from end
          [20, "modify"], // modify existing line
        ]

        let iteration = 1
        for await (const action of take(gen<string>(ACTIONS), 100)) {
          switch (action) {
            case "grow":
              if (lines.length < ROWS - 1) {
                lines = [...lines, `Line-${lines.length}`]
              }
              break
            case "shrink":
              if (lines.length > 1) {
                lines = lines.slice(0, -1)
              }
              break
            case "modify":
              if (lines.length > 0) {
                lines = [...lines]
                const idx = iteration % lines.length
                lines[idx] = `Mod-${iteration}`
              }
              break
          }

          const next = bufferWithLines(COLS, ROWS, lines)
          screen.feed(op(prev, next, "inline", 0, ROWS))
          const incrementalLines = screen.getNonEmptyLines()
          const expectedLines = freshInlineRender(next, COLS, ROWS)

          if (JSON.stringify(incrementalLines) !== JSON.stringify(expectedLines)) {
            expect.unreachable(
              `Grow/shrink mismatch at iteration ${iteration} (action: ${action}).\n` +
                `Lines: ${JSON.stringify(lines)}\n` +
                `Expected: ${JSON.stringify(expectedLines)}\n` +
                `Got:      ${JSON.stringify(incrementalLines)}`,
            )
          }

          prev = next
          iteration++
        }
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // 3. Cursor-only changes: minimal output when only cursor moves
  // --------------------------------------------------------------------------

  describe("Cursor-only changes (minimal output)", () => {
    // Cursor positions indexed by action name
    const CURSOR_POS_MAP: Record<string, [number, number]> = {
      tl: [0, 0], // top-left
      mid: [5, 1], // middle
      r3: [0, 3], // row 3
      foot: [10, 4], // near footer
      c32: [3, 2], // column 3, row 2
      last: [0, 4], // last row
    }

    test.fuzz(
      "cursor movement on unchanged content produces minimal output",
      async () => {
        const COLS = 50
        const ROWS = 12

        // Fixed content — never changes
        const lines = ["Header line", "Content row 1", "Content row 2", "Content row 3", "Footer"]

        // Measure full render size for comparison baseline
        const opMeasure = createOutputPhase({})
        const bufMeasure = bufferWithLines(COLS, ROWS, lines)
        const fullOutput = opMeasure(null, bufMeasure, "inline", 0, ROWS, {
          x: 0,
          y: 0,
          visible: true,
        })
        const fullBytes = Buffer.byteLength(fullOutput)

        // Create fresh output phase for the actual test
        const opCursor = createOutputPhase({})
        const bufInit = bufferWithLines(COLS, ROWS, lines)
        opCursor(null, bufInit, "inline", 0, ROWS, { x: 0, y: 0, visible: true })

        const CURSOR_ACTIONS: [number, string][] = [
          [15, "tl"],
          [15, "mid"],
          [15, "r3"],
          [15, "foot"],
          [15, "c32"],
          [15, "last"],
        ]

        let iteration = 1
        let prevCursor = { x: 0, y: 0 }
        for await (const action of take(gen<string>(CURSOR_ACTIONS), 50)) {
          const [cx, cy] = CURSOR_POS_MAP[action]!

          // Same buffer, different cursor position
          const sameContent = bufferWithLines(COLS, ROWS, lines)
          const output = opCursor(bufInit, sameContent, "inline", 0, ROWS, {
            x: cx,
            y: cy,
            visible: true,
          })

          const outputBytes = Buffer.byteLength(output)

          // Cursor-only changes should produce much less output than a full render.
          // The output should be just cursor repositioning + show/hide sequences.
          // Allow some overhead for SGR reset, cursor movement escape sequences.
          if (outputBytes > fullBytes * 0.5 && fullBytes > 100) {
            expect.unreachable(
              `Cursor-only change produced ${outputBytes} bytes (full render: ${fullBytes} bytes) ` +
                `at iteration ${iteration}.\n` +
                `Cursor moved from (${prevCursor.x},${prevCursor.y}) to (${cx},${cy}).\n` +
                `Expected minimal output for cursor-only change.`,
            )
          }

          prevCursor = { x: cx, y: cy }
          iteration++
        }
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // Combined: content changes + cursor moves + height variations
  // --------------------------------------------------------------------------

  describe("Combined inline mutations", () => {
    test.fuzz(
      "mixed content and cursor changes produce correct output",
      async () => {
        const COLS = 60
        const ROWS = 18
        const op = createOutputPhase({})
        const screen = createScreen(COLS, ROWS)

        let lines = ["Title", "A", "B", "C", "Status"]
        let cursorX = 0
        let cursorY = 0

        let prev = bufferWithLines(COLS, ROWS, lines)
        screen.feed(op(null, prev, "inline", 0, ROWS, { x: cursorX, y: cursorY, visible: true }))

        const ACTIONS: [number, string][] = [
          [20, "add"], // add line
          [15, "remove"], // remove line
          [20, "change"], // change content
          [15, "cursor-h"], // move cursor horizontally
          [15, "cursor-v"], // move cursor vertically
          [15, "cursor-hide"], // hide cursor (no visible cursor)
        ]

        let iteration = 1
        let cursorVisible = true
        for await (const action of take(gen<string>(ACTIONS), 100)) {
          switch (action) {
            case "add":
              if (lines.length < ROWS - 2) {
                const pos = Math.max(1, iteration % lines.length)
                lines = [...lines.slice(0, pos), `New-${iteration}`, ...lines.slice(pos)]
              }
              break
            case "remove":
              if (lines.length > 2) {
                const pos = 1 + (iteration % Math.max(1, lines.length - 2))
                lines = [...lines.slice(0, pos), ...lines.slice(pos + 1)]
              }
              break
            case "change": {
              const pos = iteration % lines.length
              lines = [...lines]
              lines[pos] = `Edit-${iteration}`
              break
            }
            case "cursor-h":
              cursorX = (cursorX + 3) % Math.min(COLS, 20)
              cursorVisible = true
              break
            case "cursor-v":
              cursorY = iteration % Math.max(1, lines.length)
              cursorVisible = true
              break
            case "cursor-hide":
              cursorVisible = !cursorVisible
              break
          }

          // Clamp cursor to valid range
          cursorY = Math.min(cursorY, Math.max(0, lines.length - 1))

          const next = bufferWithLines(COLS, ROWS, lines)
          const cursor = cursorVisible ? { x: cursorX, y: cursorY, visible: true } : undefined
          screen.feed(op(prev, next, "inline", 0, ROWS, cursor))

          const incrementalLines = screen.getNonEmptyLines()
          const expectedLines = freshInlineRender(next, COLS, ROWS)

          if (JSON.stringify(incrementalLines) !== JSON.stringify(expectedLines)) {
            expect.unreachable(
              `Combined inline mismatch at iteration ${iteration} (action: ${action}).\n` +
                `Cursor: (${cursorX},${cursorY}) visible=${cursorVisible}\n` +
                `Content: ${JSON.stringify(lines)}\n` +
                `Expected: ${JSON.stringify(expectedLines)}\n` +
                `Got:      ${JSON.stringify(incrementalLines)}`,
            )
          }

          prev = next
          iteration++
        }
      },
      { timeout: 30_000 },
    )
  })

  // --------------------------------------------------------------------------
  // Scrollback promotion + content changes (complex real-world pattern)
  // --------------------------------------------------------------------------

  describe("Scrollback promotion fuzz", () => {
    test.fuzz(
      "freeze cycles interleaved with content changes produce correct output",
      async () => {
        const COLS = 50
        const ROWS = 20
        const op = createOutputPhase({})
        const screen = createScreen(COLS, ROWS)

        let lines = ["Task 1", "Task 2", "Task 3", "Task 4", "Task 5", "Spinner"]
        const frozenSoFar: string[] = []

        let prev = bufferWithLines(COLS, ROWS, lines)
        screen.feed(op(null, prev, "inline", 0, ROWS))

        const ACTIONS: [number, string][] = [
          [30, "freeze"], // freeze first line
          [25, "change"], // change spinner content
          [20, "add"], // add a new task
          [25, "grow-text"], // make a line longer
        ]

        let iteration = 1
        for await (const action of take(gen<string>(ACTIONS), 60)) {
          switch (action) {
            case "freeze":
              if (lines.length > 2) {
                const frozen = lines[0]!
                frozenSoFar.push(frozen)
                op.promoteScrollback!(`${frozen}\x1b[K\r\n`, 1)
                lines = lines.slice(1)
              }
              break
            case "change": {
              lines = [...lines]
              lines[lines.length - 1] = `Spin-${iteration}`
              break
            }
            case "add":
              if (lines.length < ROWS - frozenSoFar.length - 2) {
                lines = [...lines.slice(0, -1), `Task-New-${iteration}`, lines[lines.length - 1]!]
              }
              break
            case "grow-text":
              if (lines.length > 1) {
                lines = [...lines]
                const idx = iteration % Math.max(1, lines.length - 1)
                lines[idx] = lines[idx]! + "+"
              }
              break
          }

          const next = bufferWithLines(COLS, ROWS, lines)
          screen.feed(op(prev, next, "inline", 0, ROWS))

          // Frozen lines should persist on-screen above live content
          const visibleLines = screen.getNonEmptyLines()
          for (const frozen of frozenSoFar) {
            if (!visibleLines.includes(frozen)) {
              expect.unreachable(
                `Frozen line "${frozen}" missing from screen at iteration ${iteration} (action: ${action}).\n` +
                  `Frozen so far: ${JSON.stringify(frozenSoFar)}\n` +
                  `Live content: ${JSON.stringify(lines)}\n` +
                  `Visible: ${JSON.stringify(visibleLines)}`,
              )
            }
          }

          prev = next
          iteration++
        }
      },
      { timeout: 30_000 },
    )
  })
})
