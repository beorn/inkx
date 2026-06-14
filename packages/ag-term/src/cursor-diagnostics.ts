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

export interface OutputCursorBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface OutputCompositorCaret {
  x: number
  y: number
  visible: boolean
  style: string
}

export interface OutputCursorDiagnostics {
  reason: string
  mode: "fullscreen" | "inline"
  backend: "xterm"
  width: number
  height: number
  termRows?: number
  outputBytes: number
  semanticCursor: OutputCursorTarget | null
  target: OutputCursorTarget | null
  hardwareParking: OutputCursorTarget | null
  hardwareVisibility: boolean | null
  compositorCaret: OutputCompositorCaret | null
  promptBounds: OutputCursorBounds | null
  composerBounds: OutputCursorBounds | null
  finalCursorEscape: "show" | "hide" | null
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
        semanticCursor: lastOutputCursorDiagnostics.semanticCursor
          ? { ...lastOutputCursorDiagnostics.semanticCursor }
          : null,
        hardwareParking: lastOutputCursorDiagnostics.hardwareParking
          ? { ...lastOutputCursorDiagnostics.hardwareParking }
          : null,
        compositorCaret: lastOutputCursorDiagnostics.compositorCaret
          ? { ...lastOutputCursorDiagnostics.compositorCaret }
          : null,
        promptBounds: lastOutputCursorDiagnostics.promptBounds
          ? { ...lastOutputCursorDiagnostics.promptBounds }
          : null,
        composerBounds: lastOutputCursorDiagnostics.composerBounds
          ? { ...lastOutputCursorDiagnostics.composerBounds }
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
    if (actual.visible === false || diagnostics.finalCursorEscape === "hide") return
    const message =
      `SILVERY_STRICT=cursor expected hidden terminal cursor after ${diagnostics.reason}; ` +
      `actual x=${actual.x} y=${actual.y} visible=${actual.visible}`
    throw new OutputCursorMismatchError(message, diagnostics)
  }

  if (!expected.visible) {
    if (
      (actual.visible === false ||
        actual.visible === null ||
        diagnostics.finalCursorEscape === "hide") &&
      actual.x === expected.x &&
      actual.y === expected.y
    ) {
      return
    }
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
  compositorCaret?: OutputCompositorCaret | null
  promptBounds?: OutputCursorBounds | null
  composerBounds?: OutputCursorBounds | null
}): void {
  if (!isCursorStrictEnabled()) return

  const terminalRows = opts.termRows ?? opts.height
  const terminal = replayCursor(opts.output, opts.width, terminalRows)
  const finalCursorEscape = lastCursorVisibilityEscape(opts.output)
  const expectedTerminal =
    opts.expectedTerminal === undefined
      ? opts.target
        ? { ...opts.target }
        : null
      : opts.expectedTerminal
        ? { ...opts.expectedTerminal }
        : null
  const diagnostics: OutputCursorDiagnostics = {
    reason: opts.reason,
    mode: opts.mode,
    backend: "xterm",
    width: opts.width,
    height: opts.height,
    termRows: opts.termRows,
    outputBytes: Buffer.byteLength(opts.output),
    semanticCursor: opts.target ? { ...opts.target } : null,
    target: opts.target ? { ...opts.target } : null,
    hardwareParking: expectedTerminal ? { ...expectedTerminal } : null,
    hardwareVisibility:
      finalCursorEscape === "hide" ? false : finalCursorEscape === "show" ? true : terminal.visible,
    compositorCaret: opts.compositorCaret ? { ...opts.compositorCaret } : null,
    promptBounds: opts.promptBounds ? { ...opts.promptBounds } : null,
    composerBounds: opts.composerBounds ? { ...opts.composerBounds } : null,
    finalCursorEscape,
    expectedTerminal,
    terminal,
  }
  lastOutputCursorDiagnostics = diagnostics

  log.debug?.(
    `cursor ${opts.reason}: target=${formatTarget(diagnostics.target)} ` +
      `expected=${formatTarget(diagnostics.expectedTerminal)} ` +
      `terminal=x=${terminal.x} y=${terminal.y} visible=${terminal.visible} ` +
      `compositor=${formatCompositorCaret(diagnostics.compositorCaret)} ` +
      `prompt=${formatBounds(diagnostics.promptBounds)} ` +
      `composer=${formatBounds(diagnostics.composerBounds)} ` +
      `final=${diagnostics.finalCursorEscape ?? "none"}`,
  )

  assertCursorMatches(diagnostics)
}

function lastCursorVisibilityEscape(output: string): "show" | "hide" | null {
  let last: "show" | "hide" | null = null
  const re = /\x1b\[\?25([hl])/g
  let match: RegExpExecArray | null
  while ((match = re.exec(output))) {
    last = match[1] === "h" ? "show" : "hide"
  }
  return last
}

function formatCompositorCaret(caret: OutputCompositorCaret | null): string {
  if (!caret) return "none"
  return `x=${caret.x} y=${caret.y} visible=${caret.visible} style=${caret.style}`
}

function formatBounds(bounds: OutputCursorBounds | null): string {
  if (!bounds) return "none"
  return `x=${bounds.x} y=${bounds.y} w=${bounds.width} h=${bounds.height}`
}
