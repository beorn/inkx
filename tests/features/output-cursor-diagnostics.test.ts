import { afterEach, describe, expect, test } from "vitest"
import { TerminalBuffer } from "../../packages/ag-term/src/buffer"
import {
  clearLastOutputCursorDiagnostics,
  createOutputPhase,
  getLastOutputCursorDiagnostics,
  outputPhase,
} from "../../packages/ag-term/src/pipeline/output-phase"
import { createRuntime } from "../../packages/ag-term/src/runtime/create-runtime"
import type { Buffer, Dims } from "../../packages/ag-term/src/runtime/types"
import { isCursorStrictEnabled } from "../../packages/ag-term/src/cursor-diagnostics"
import { resetStrictCache } from "../../packages/ag-term/src/strict-mode"
import type { AgNode } from "../../packages/ag/src/types"

const originalStrict = process.env.SILVERY_STRICT

afterEach(() => {
  if (originalStrict === undefined) delete process.env.SILVERY_STRICT
  else process.env.SILVERY_STRICT = originalStrict
  resetStrictCache()
  clearLastOutputCursorDiagnostics()
})

function enableCursorStrict(): void {
  process.env.SILVERY_STRICT = "cursor"
  resetStrictCache()
}

function writeLine(buffer: TerminalBuffer, row: number, text: string): void {
  for (let col = 0; col < text.length; col++) {
    buffer.setCell(col, row, { char: text[col]! })
  }
}

function cursorNode(dims: Dims, cursor: { col: number; row: number; visible: boolean }): AgNode {
  return {
    type: "silvery-root",
    props: {
      cursorOffset: cursor,
    },
    children: [],
    parent: null,
    scrollRect: { x: 0, y: 0, width: dims.cols, height: dims.rows },
  } as unknown as AgNode
}

function runtimeBuffer(dims: Dims, text: string): Buffer {
  const terminalBuffer = new TerminalBuffer(dims.cols, dims.rows)
  writeLine(terminalBuffer, 0, text)
  return {
    text,
    ansi: text,
    nodes: cursorNode(dims, { col: 2, row: 2, visible: true }),
    _buffer: terminalBuffer,
  }
}

describe("output cursor diagnostics", () => {
  test("cursor strict check is tier 2 and explicitly selectable", () => {
    delete process.env.SILVERY_STRICT
    resetStrictCache()
    expect(isCursorStrictEnabled()).toBe(false)

    process.env.SILVERY_STRICT = "1"
    resetStrictCache()
    expect(isCursorStrictEnabled()).toBe(false)

    process.env.SILVERY_STRICT = "cursor"
    resetStrictCache()
    expect(isCursorStrictEnabled()).toBe(true)

    process.env.SILVERY_STRICT = "2"
    resetStrictCache()
    expect(isCursorStrictEnabled()).toBe(true)
  })

  test("SILVERY_STRICT=cursor records the replayed inline hardware cursor row", () => {
    enableCursorStrict()

    const buffer = new TerminalBuffer(24, 5)
    writeLine(buffer, 0, "completed step")
    writeLine(buffer, 2, "> ")

    const cursor = { x: 2, y: 2, visible: true }
    outputPhase(null, buffer, "inline", 0, 5, cursor)

    const diagnostics = getLastOutputCursorDiagnostics()
    expect(diagnostics).toMatchObject({
      mode: "inline",
      reason: "inline-first-render",
      backend: "xterm",
      target: cursor,
      terminal: {
        x: cursor.x,
        y: cursor.y,
        visible: true,
      },
    })
    expect(diagnostics?.terminal?.y).not.toBe(cursor.y - 1)
  })

  test("SILVERY_STRICT=cursor records the live fullscreen runtime cursor row", () => {
    enableCursorStrict()

    const dims: Dims = { cols: 24, rows: 5 }
    const writes: string[] = []
    using runtime = createRuntime({
      mode: "fullscreen",
      outputPhaseFn: createOutputPhase({}),
      target: {
        write(frame) {
          writes.push(frame)
        },
        getDims() {
          return dims
        },
        onResize() {
          return () => {}
        },
      },
    })

    runtime.render(runtimeBuffer(dims, "completed step"))

    expect(writes).toHaveLength(1)
    const diagnostics = getLastOutputCursorDiagnostics()
    expect(diagnostics).toMatchObject({
      mode: "fullscreen",
      reason: "fullscreen-render",
      backend: "xterm",
      target: {
        x: 2,
        y: 2,
        visible: true,
      },
      terminal: {
        x: 2,
        y: 2,
        visible: true,
      },
    })
    expect(diagnostics?.terminal?.y).not.toBe(1)
  })
})
