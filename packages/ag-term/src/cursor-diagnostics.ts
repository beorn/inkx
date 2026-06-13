import { isStrictEnabled } from "./strict-mode"
import { createLogger } from "loggily"

const log = createLogger("silvery:cursor")

export const CURSOR_STRICT_SLUG = "cursor"
export const CURSOR_STRICT_MIN_TIER = 2

export interface OutputCursorTarget {
  x: number
  y: number
  visible: boolean
  shape?: string
}

export interface OutputCursorTerminalState {
  x: number
  y: number
  visible: boolean | null
  style: string | null
}

export interface OutputCursorDiagnostics {
  reason: string
  mode: "fullscreen" | "inline"
  backend: "xterm"
  width: number
  height: number
  termRows?: number
  outputBytes: number
  target: OutputCursorTarget | null
  expectedTerminal: OutputCursorTarget | null
  terminal: OutputCursorTerminalState | null
}

export class OutputCursorMismatchError extends Error {
  readonly diagnostics: OutputCursorDiagnostics

  constructor(message: string, diagnostics: OutputCursorDiagnostics) {
    super(message)
    this.name = "OutputCursorMismatchError"
    this.diagnostics = diagnostics
  }
}

let lastOutputCursorDiagnostics: OutputCursorDiagnostics | null = null

let _createTerminal: typeof import("@termless/core").createTerminal | null = null
let _createXtermBackend: typeof import("@termless/xtermjs").createXtermBackend | null = null

export function isCursorStrictEnabled(): boolean {
  return isStrictEnabled(CURSOR_STRICT_SLUG, CURSOR_STRICT_MIN_TIER)
}

export function getLastOutputCursorDiagnostics(): OutputCursorDiagnostics | null {
  return lastOutputCursorDiagnostics
    ? {
        ...lastOutputCursorDiagnostics,
        target: lastOutputCursorDiagnostics.target
          ? { ...lastOutputCursorDiagnostics.target }
          : null,
        expectedTerminal: lastOutputCursorDiagnostics.expectedTerminal
          ? { ...lastOutputCursorDiagnostics.expectedTerminal }
          : null,
        terminal: lastOutputCursorDiagnostics.terminal
          ? { ...lastOutputCursorDiagnostics.terminal }
          : null,
      }
    : null
}

export function clearLastOutputCursorDiagnostics(): void {
  lastOutputCursorDiagnostics = null
}

function loadTermless(): {
  createTerminal: typeof import("@termless/core").createTerminal
  createXtermBackend: typeof import("@termless/xtermjs").createXtermBackend
} {
  if (!_createTerminal || !_createXtermBackend) {
    _createTerminal = require("@termless/core").createTerminal
    _createXtermBackend = require("@termless/xtermjs").createXtermBackend
  }
  return { createTerminal: _createTerminal!, createXtermBackend: _createXtermBackend! }
}

function replayCursor(output: string, cols: number, rows: number): OutputCursorTerminalState {
  const { createTerminal, createXtermBackend } = loadTermless()
  const terminal = createTerminal({ backend: createXtermBackend(), cols, rows })
  try {
    terminal.feed(output)
    const cursor = terminal.getCursor()
    return {
      x: cursor.x,
      y: cursor.y,
      visible: cursor.visible,
      style: cursor.style,
    }
  } finally {
    void terminal.close()
  }
}

function formatTarget(target: OutputCursorTarget | null): string {
  if (!target) return "hidden"
  return `x=${target.x} y=${target.y} visible=${target.visible}`
}

function assertCursorMatches(diagnostics: OutputCursorDiagnostics): void {
  const expected = diagnostics.expectedTerminal
  const actual = diagnostics.terminal
  if (!actual) return

  if (!expected) {
    if (actual.visible === false) return
    const message =
      `SILVERY_STRICT=cursor expected hidden terminal cursor after ${diagnostics.reason}; ` +
      `actual x=${actual.x} y=${actual.y} visible=${actual.visible}`
    throw new OutputCursorMismatchError(message, diagnostics)
  }

  if (!expected.visible) {
    if (actual.visible === false || actual.visible === null) return
    const message =
      `SILVERY_STRICT=cursor expected hidden terminal cursor at ` +
      `${formatTarget(expected)} after ${diagnostics.reason}; ` +
      `actual x=${actual.x} y=${actual.y} visible=${actual.visible}`
    throw new OutputCursorMismatchError(message, diagnostics)
  }

  if (actual.x !== expected.x || actual.y !== expected.y || actual.visible === false) {
    const message =
      `SILVERY_STRICT=cursor terminal cursor mismatch after ${diagnostics.reason}: ` +
      `expected ${formatTarget(expected)} actual x=${actual.x} y=${actual.y} ` +
      `visible=${actual.visible}`
    throw new OutputCursorMismatchError(message, diagnostics)
  }
}

export function recordOutputCursorDiagnostics(opts: {
  reason: string
  mode: "fullscreen" | "inline"
  width: number
  height: number
  termRows?: number
  output: string
  target: OutputCursorTarget | null
  expectedTerminal?: OutputCursorTarget | null
}): void {
  if (!isCursorStrictEnabled()) return

  const terminalRows = opts.termRows ?? opts.height
  const terminal = replayCursor(opts.output, opts.width, terminalRows)
  const diagnostics: OutputCursorDiagnostics = {
    reason: opts.reason,
    mode: opts.mode,
    backend: "xterm",
    width: opts.width,
    height: opts.height,
    termRows: opts.termRows,
    outputBytes: Buffer.byteLength(opts.output),
    target: opts.target ? { ...opts.target } : null,
    expectedTerminal:
      opts.expectedTerminal === undefined
        ? opts.target
          ? { ...opts.target }
          : null
        : opts.expectedTerminal
          ? { ...opts.expectedTerminal }
          : null,
    terminal,
  }
  lastOutputCursorDiagnostics = diagnostics

  log.debug?.(
    `cursor ${opts.reason}: target=${formatTarget(diagnostics.target)} ` +
      `expected=${formatTarget(diagnostics.expectedTerminal)} ` +
      `terminal=x=${terminal.x} y=${terminal.y} visible=${terminal.visible}`,
  )

  assertCursorMatches(diagnostics)
}
