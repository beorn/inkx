import { isStrictEnabled } from "./strict-mode"
import { createLogger } from "loggily"
import { createRequire } from "node:module"

// @termless/* are OPTIONAL peers of the published umbrella — a static import
// here would evaluate them for every consumer at module load and break
// installs without the peers (verify-publishable probe, 2026-07-02). The
// diagnostics path lazy-requires them on first use instead.
const requireBackend = createRequire(import.meta.url)

const log = createLogger("silvery:cursor")

export const CURSOR_STRICT_SLUG = "cursor"
export const CURSOR_POSITION_STRICT_SLUG = "cursor-position"
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

/**
 * The previous frame's presentation buffer bundled with the composited caret
 * that was painted into it.
 *
 * These two values MUST move together: the buffer is the diff baseline the next
 * frame renders against, and `caret` is where (or whether) this frame painted
 * the managed inverse-caret overlay. The next frame's overlay-clear
 * (`clearPriorCaretOverlay` in `managed-caret.ts`) reads `caret` to decide which
 * row to re-mark dirty so a moved/removed caret's stale `inverse` cell is
 * cleared. Storing a new buffer without the matching caret (or vice versa)
 * reintroduces the @km/code/v0.2/19702 stranded-caret residue.
 *
 * Bundling them into one struct makes that desync impossible by construction —
 * every assignment site sets both fields in a single object literal, so there is
 * no way to advance the buffer baseline without also advancing the caret it was
 * composited with. Generic over the buffer type because the scheduler tracks a
 * raw `TerminalBuffer` while the runtime tracks its wrapped `Buffer`; both hold
 * the same caret type.
 */
export interface PrevPresentation<TBuffer> {
  /** The presentation buffer the terminal showed this frame (the next diff baseline). */
  buffer: TBuffer
  /** The composited caret painted into `buffer`, or null if none was painted. */
  caret: OutputCompositorCaret | null
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
  /**
   * Whether the VISIBLE composited caret landed inside the editable's content
   * rect (`composerBounds`). The @km/code/v0.2/19702 stranded-caret invariant:
   * a Silvery-owned composited caret several rows ABOVE the composer (on a
   * transcript/chrome row) reads as `false` here. `null` when not checkable —
   * no composited caret, or no known composer bounds (island / legacy cursor,
   * where the caret's owner is a different node than `composerBounds`).
   */
  compositorCaretInComposerBounds: boolean | null
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

function isCursorStrictDisabled(): boolean {
  const raw = process.env.SILVERY_STRICT
  if (!raw) return false
  for (const part of raw.split(",")) {
    const slug = part.trim()
    if (slug === `!${CURSOR_STRICT_SLUG}` || slug === `!${CURSOR_POSITION_STRICT_SLUG}`) {
      return true
    }
  }
  return false
}

export function isCursorStrictEnabled(): boolean {
  if (isCursorStrictDisabled()) return false
  return (
    isStrictEnabled(CURSOR_STRICT_SLUG, CURSOR_STRICT_MIN_TIER) ||
    isStrictEnabled(CURSOR_POSITION_STRICT_SLUG, CURSOR_STRICT_MIN_TIER)
  )
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
  const core = requireBackend("@termless/core") as typeof import("@termless/core")
  const xtermjs = requireBackend("@termless/xtermjs") as typeof import("@termless/xtermjs")
  return { createTerminal: core.createTerminal, createXtermBackend: xtermjs.createXtermBackend }
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

/**
 * The @km/code/v0.2/19702 composited-caret-bounds invariant: a VISIBLE
 * composited caret must land inside the editable's content rect. Returns:
 *   - `true`  — caret is within `bounds`.
 *   - `false` — caret is OUTSIDE `bounds` (the stranded-caret artifact: an
 *     inverse cell painted on a transcript/chrome row above/below the composer).
 *   - `null`  — not checkable (no visible composited caret, or no known
 *     composer bounds — e.g. a `cursorActive` island / legacy cursor whose
 *     owning node differs from `bounds`).
 *
 * Rows are half-open `[y, y+height)`. The end-of-line virtual column (where the
 * next character would be typed) legitimately sits one past the content width,
 * so the x upper bound is inclusive.
 */
function caretInComposerBounds(
  caret: OutputCompositorCaret | null,
  bounds: OutputCursorBounds | null,
): boolean | null {
  if (!caret || caret.visible === false || !bounds) return null
  const inX = caret.x >= bounds.x && caret.x <= bounds.x + bounds.width
  const inY = caret.y >= bounds.y && caret.y < bounds.y + bounds.height
  return inX && inY
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
    compositorCaretInComposerBounds: caretInComposerBounds(
      opts.compositorCaret ?? null,
      opts.composerBounds ?? null,
    ),
    finalCursorEscape,
    expectedTerminal,
    terminal,
  }
  lastOutputCursorDiagnostics = diagnostics

  // NO SILENT ERRORS: a composited caret outside its composer bounds is the
  // @km/code/v0.2/19702 stranded-caret artifact. Surface it LOUDLY rather than
  // silently rendering an inverse cell on a transcript/chrome row. Recorded
  // (not thrown) because an island host-caret legitimately composites outside
  // the separate composer's bounds and the payload does not yet carry the
  // caret's owning-node rect to disambiguate; upgrade to a throw scoped to
  // `focused-declarative` provenance once the provenance walk returns
  // `{node, rect, provenance}` (the noted 19702 follow-up).
  if (diagnostics.compositorCaretInComposerBounds === false) {
    log.warn?.(
      `cursor ${opts.reason}: composited caret OUT OF composer bounds ` +
        `(@km/code/v0.2/19702 stranded-caret) — ` +
        `caret=${formatCompositorCaret(diagnostics.compositorCaret)} ` +
        `composer=${formatBounds(diagnostics.composerBounds)}`,
    )
  }

  log.debug?.(
    `cursor ${opts.reason}: cursor:row=${terminal.y},col=${terminal.x} ` +
      `target=${formatTarget(diagnostics.target)} ` +
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
