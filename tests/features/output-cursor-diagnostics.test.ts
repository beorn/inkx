import { afterEach, describe, expect, test } from "vitest"
import { createTerminal } from "@termless/core"
import { createXtermBackend } from "@termless/xtermjs"
import {
  addWriter,
  getDebugFilter,
  getLogLevel,
  setDebugFilter,
  setLogLevel,
  setSuppressConsole,
  type Event,
  type LogEvent,
  type LogLevel,
} from "loggily"
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
const originalDebug = process.env.DEBUG
const ESC_RE = "\\u001b"
const TRAILING_CURSOR_CONTROL_RE = new RegExp(
  `(?:${ESC_RE}\\[\\?2026[hl]|${ESC_RE}\\[\\d+;\\d+H|${ESC_RE}\\[\\?25[lh]|${ESC_RE}\\[H)+$`,
  "g",
)
const INVERSE_SGR_RE = new RegExp(`${ESC_RE}\\[7m`, "g")

afterEach(() => {
  if (originalStrict === undefined) delete process.env.SILVERY_STRICT
  else process.env.SILVERY_STRICT = originalStrict
  if (originalDebug === undefined) delete process.env.DEBUG
  else process.env.DEBUG = originalDebug
  resetStrictCache()
  clearLastOutputCursorDiagnostics()
})

function enableCursorStrict(): void {
  process.env.SILVERY_STRICT = "cursor"
  resetStrictCache()
}

function enableCursorPositionStrict(): void {
  process.env.SILVERY_STRICT = "cursor-position"
  resetStrictCache()
}

function withCursorLogging<T>(run: (events: LogEvent[]) => T): T {
  const prevDebugFilter = getDebugFilter()
  const prevLogLevel: LogLevel = getLogLevel()
  const events: LogEvent[] = []
  setDebugFilter(["silvery:cursor"])
  setLogLevel("debug")
  setSuppressConsole(true)
  const unsubscribe = addWriter(
    { ns: "silvery:cursor", level: "debug" },
    (_formatted: string, _level: string, _namespace: string, event: Event) => {
      if (event.kind === "log") events.push(event)
    },
  )
  try {
    return run(events)
  } finally {
    unsubscribe()
    setDebugFilter(prevDebugFilter)
    setLogLevel(prevLogLevel)
    setSuppressConsole(false)
  }
}

function replayCursor(
  output: string,
  dims: Dims,
): { x: number; y: number; visible: boolean | null } {
  const terminal = createTerminal({
    backend: createXtermBackend(),
    cols: dims.cols,
    rows: dims.rows,
  })
  try {
    terminal.feed(output)
    const cursor = terminal.getCursor()
    return { x: cursor.x, y: cursor.y, visible: cursor.visible }
  } finally {
    void terminal.close()
  }
}

function stripTrailingCursorControl(output: string): string {
  return output.replace(TRAILING_CURSOR_CONTROL_RE, "")
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
    // These scenarios model the ACTIVE composer (command / queue / interject) —
    // the editable the user is typing into. In the production tree that node is
    // focused (`useFocusable`), so the managed frame composites its caret. The
    // @km/code/v0.2/19702 fix only suppresses NON-focused fallback declarers
    // (an unfocused-during-a-turn composer / passive transcript editable), so
    // the focused active composer must carry focus state here.
    interactiveState: { focused: true },
  } as unknown as AgNode
}

function noCursorNode(dims: Dims): AgNode {
  return {
    type: "silvery-root",
    props: {},
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

function noCursorRuntimeBuffer(dims: Dims, text: string): Buffer {
  const terminalBuffer = new TerminalBuffer(dims.cols, dims.rows)
  writeLine(terminalBuffer, 0, text)
  return {
    text,
    ansi: text,
    nodes: noCursorNode(dims),
    _buffer: terminalBuffer,
  }
}

function managedComposerBuffer(
  dims: Dims,
  opts: { cursorRow: number; cursorCol: number; prompt: string },
): Buffer {
  const terminalBuffer = new TerminalBuffer(dims.cols, dims.rows)
  writeLine(terminalBuffer, 0, "transcript: already rendered")
  writeLine(terminalBuffer, 1, "activity: still running")
  writeLine(terminalBuffer, opts.cursorRow - 1, "---- Interject now ----")
  writeLine(terminalBuffer, opts.cursorRow, opts.prompt)
  writeLine(terminalBuffer, dims.rows - 1, "Silver Code status")
  return {
    text: "",
    ansi: "",
    nodes: cursorNode(dims, {
      col: opts.cursorCol,
      row: opts.cursorRow,
      visible: true,
    }),
    _buffer: terminalBuffer,
  }
}

function managedActivityBuffer(
  dims: Dims,
  opts: { activity: string; cursorRow: number; cursorCol: number },
): Buffer {
  const terminalBuffer = new TerminalBuffer(dims.cols, dims.rows)
  writeLine(terminalBuffer, 0, "transcript: already rendered")
  writeLine(terminalBuffer, 1, opts.activity)
  writeLine(terminalBuffer, opts.cursorRow, "> ")
  writeLine(terminalBuffer, dims.rows - 1, "Silver Code status")
  return {
    text: "",
    ansi: "",
    nodes: cursorNode(dims, {
      col: opts.cursorCol,
      row: opts.cursorRow,
      visible: true,
    }),
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

    process.env.SILVERY_STRICT = "cursor-position"
    resetStrictCache()
    expect(isCursorStrictEnabled()).toBe(true)

    process.env.SILVERY_STRICT = "2"
    resetStrictCache()
    expect(isCursorStrictEnabled()).toBe(true)

    process.env.SILVERY_STRICT = "2,!cursor-position"
    resetStrictCache()
    expect(isCursorStrictEnabled()).toBe(false)

    process.env.SILVERY_STRICT = "2,!cursor"
    resetStrictCache()
    expect(isCursorStrictEnabled()).toBe(false)
  })

  test("SILVERY_STRICT=cursor-position logs a literal cursor row/column breadcrumb", () => {
    enableCursorPositionStrict()

    const events = withCursorLogging((logged) => {
      const buffer = new TerminalBuffer(24, 5)
      writeLine(buffer, 0, "completed step")
      writeLine(buffer, 2, "> ")

      const cursor = { x: 2, y: 2, visible: true }
      outputPhase(null, buffer, "inline", 0, 5, cursor)

      return [...logged]
    })

    const diagnostics = getLastOutputCursorDiagnostics()
    expect(diagnostics?.terminal).toMatchObject({ x: 2, y: 2, visible: true })
    expect(
      events.some((event) => event.message.includes("cursor:row=2,col=2")),
      events.map((event) => event.message).join("\n"),
    ).toBe(true)
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
      hardwareParking: {
        x: 2,
        y: 2,
        visible: false,
      },
      hardwareVisibility: false,
      finalCursorEscape: "hide",
      compositorCaret: {
        x: 2,
        y: 2,
        visible: true,
      },
      terminal: {
        x: 2,
        y: 2,
      },
    })
    expect(diagnostics?.terminal?.y).not.toBe(1)
  })

  test("SILVERY_STRICT=cursor accepts managed fullscreen frames with no semantic cursor", () => {
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

    runtime.render(noCursorRuntimeBuffer(dims, "completed step"))

    expect(writes).toHaveLength(1)
    const frame = writes[0]!
    expect(frame).toContain("\x1b[?25l")
    expect(frame).not.toContain("\x1b[?25h")
    // No caret → park the hardware cursor at home (0,0) BEFORE hiding, so a
    // dropped/overridden `?25l` cannot strand a visible cursor in the
    // transcript/chrome. @km/code/v0.2/19702.
    expect(frame).toContain("\x1b[1;1H\x1b[?25l")

    const diagnostics = getLastOutputCursorDiagnostics()
    expect(diagnostics).toMatchObject({
      mode: "fullscreen",
      target: null,
      hardwareParking: { x: 0, y: 0, visible: false },
      hardwareVisibility: false,
      finalCursorEscape: "hide",
      compositorCaret: null,
    })
  })

  test("managed fullscreen runtime frames hide hardware cursor and paint one composited caret", () => {
    enableCursorStrict()

    const dims: Dims = { cols: 36, rows: 10 }
    for (const scenario of [
      { name: "command", prompt: "> ", cursorCol: 2, cursorRow: 7 },
      { name: "queue", prompt: "QUEUE > ", cursorCol: 8, cursorRow: 6 },
      { name: "interject", prompt: "> Interject now", cursorCol: 2, cursorRow: 7 },
    ]) {
      clearLastOutputCursorDiagnostics()
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

      runtime.render(managedComposerBuffer(dims, scenario))

      expect(writes, scenario.name).toHaveLength(1)
      const frame = writes[0]!
      expect(frame, scenario.name).toContain("\x1b[?25l")
      expect(frame, scenario.name).not.toContain("\x1b[?25h")
      expect((frame.match(INVERSE_SGR_RE) ?? []).length, scenario.name).toBe(1)

      const diagnostics = getLastOutputCursorDiagnostics()
      expect(diagnostics, scenario.name).toMatchObject({
        mode: "fullscreen",
        reason: "fullscreen-render",
        target: {
          x: scenario.cursorCol,
          y: scenario.cursorRow,
          visible: true,
        },
        hardwareParking: {
          x: scenario.cursorCol,
          y: scenario.cursorRow,
          visible: false,
        },
        hardwareVisibility: false,
        finalCursorEscape: "hide",
        compositorCaret: {
          x: scenario.cursorCol,
          y: scenario.cursorRow,
          visible: true,
        },
        terminal: {
          x: scenario.cursorCol,
          y: scenario.cursorRow,
        },
      })
    }
  })

  test("managed fullscreen runtime cursor delivery survives a stripped trailing cursor-control tail", () => {
    enableCursorStrict()

    const dims: Dims = { cols: 36, rows: 10 }
    const cursorRow = 7
    const cursorCol = 2
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

    runtime.render(
      managedActivityBuffer(dims, { activity: "activity: Working 1", cursorRow, cursorCol }),
    )
    runtime.render(
      managedActivityBuffer(dims, { activity: "activity: Working 2", cursorRow, cursorCol }),
    )

    expect(writes).toHaveLength(2)
    const frame = writes[1]!
    expect(frame).toContain("\x1b[?2026h")
    expect(frame).toContain("\x1b[?2026l")
    expect(frame).toContain("\x1b[8;3H\x1b[?25l\x1b[0m")

    const cursor = replayCursor(stripTrailingCursorControl(frame), dims)
    expect(cursor.y).toBe(cursorRow)
    expect(cursor.x).toBe(cursorCol)
    expect(cursor.y, "tail-stripped cursor must not strand on the activity update row").not.toBe(1)
  })
})
