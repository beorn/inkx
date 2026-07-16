/**
 * SGR mouse event parsing (mode 1006) and SGR-Pixels parsing (mode 1016).
 *
 * SGR format: CSI < button;x;y M (press) or CSI < button;x;y m (release)
 *
 * Button encoding:
 * - Bits 0-1: 0=left, 1=middle, 2=right, 3=release (X10 only, not SGR)
 * - Bit 2 (+4): Shift held
 * - Bit 3 (+8): Meta/Alt held
 * - Bit 4 (+16): Ctrl held
 * - Bit 5 (+32): Motion event (mouse moved while button held)
 * - Bits 6-7: 64=wheel-up, 65=wheel-down, 66=wheel-left, 67=wheel-right
 */

/**
 * Parsed mouse event from SGR mouse protocol.
 */
export interface ParsedMouse {
  /** Mouse button: 0=left, 1=middle, 2=right */
  button: number
  /**
   * Silvery layout X coordinate, in terminal cells.
   * Integer in SGR 1006 mode; fractional when parsed from SGR-Pixels 1016.
   */
  x: number
  /**
   * Silvery layout Y coordinate, in terminal cells.
   * Integer in SGR 1006 mode; fractional when parsed from SGR-Pixels 1016.
   */
  y: number
  /** Physical pixel X coordinate, present only for SGR-Pixels 1016. */
  clientX?: number
  /** Physical pixel Y coordinate, present only for SGR-Pixels 1016. */
  clientY?: number
  /** Coordinate mode used by the parser. */
  coordinateMode: "cell" | "pixel"
  /** Event action */
  action: "down" | "up" | "move" | "wheel"
  /**
   * Vertical wheel delta (deltaY): -1 for wheel-up, +1 for wheel-down, 0 for a
   * pure-horizontal wheel. DOM-style sign convention (down is positive).
   */
  delta?: number
  /**
   * Horizontal wheel delta (deltaX): -1 for wheel-left, +1 for wheel-right, 0
   * for a pure-vertical wheel. DOM-style sign convention (right is positive).
   * SGR buttons 66 (left) / 67 (right) decode here; consumers that only read
   * `delta`/`deltaY` are unaffected.
   */
  deltaX?: number
  /** Shift was held */
  shift: boolean
  /** Alt/Meta was held */
  meta: boolean
  /** Ctrl was held */
  ctrl: boolean
  /** Monotonic timestamp when the terminal input chunk was received. */
  receivedAt?: number
  /** Monotonic id shared by events parsed from the same terminal input chunk. */
  inputBatchId?: number
}

const SGR_MOUSE_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/

export interface ParseMouseOptions {
  coordinateMode?: "cell" | "pixel"
  cellSize?: { width: number; height: number }
}

/**
 * Parse an SGR mouse sequence.
 *
 * Return semantics (see ProtocolError in @silvery/ansi for the full contract):
 * - `null` — input does not match the SGR mouse shape `CSI < B;X;Y [Mm]`.
 *   No "committed but malformed" branch exists here: either the full SGR
 *   shape matches (parse succeeds) or it doesn't (null = next-parser-please).
 *
 * The bead 15127 audit listed this parser for review, but the regex-based
 * shape match means there's no place where the parser commits to "this is
 * a mouse event" and then fails on body validation — both happen at the
 * same point. Loud-error tightening here would require a stricter
 * sub-grammar (e.g. validating button-code ranges), tracked separately.
 *
 * @returns ParsedMouse or null if not a valid mouse sequence
 */
export function parseMouseSequence(input: string, options?: ParseMouseOptions): ParsedMouse | null {
  const m = SGR_MOUSE_RE.exec(input)
  if (!m) return null

  const raw = parseInt(m[1]!)
  const rawX = parseInt(m[2]!) - 1 // 1-indexed → 0-indexed
  const rawY = parseInt(m[3]!) - 1
  const coordinateMode = options?.coordinateMode ?? "cell"
  const cellWidth = Math.max(1, options?.cellSize?.width ?? 1)
  const cellHeight = Math.max(1, options?.cellSize?.height ?? 1)
  const x = coordinateMode === "pixel" ? rawX / cellWidth : rawX
  const y = coordinateMode === "pixel" ? rawY / cellHeight : rawY
  const clientX = coordinateMode === "pixel" ? rawX : undefined
  const clientY = coordinateMode === "pixel" ? rawY : undefined
  const terminator = m[4]!

  const shift = !!(raw & 4)
  const meta = !!(raw & 8)
  const ctrl = !!(raw & 16)
  const motion = !!(raw & 32)
  const isWheel = !!(raw & 64)

  if (isWheel) {
    // Bits 0-1 of a wheel button: 0=up, 1=down, 2=left, 3=right (X11 buttons
    // 4/5/6/7 → SGR 64/65/66/67). Up/down move the vertical axis (deltaY),
    // left/right the horizontal axis (deltaX); a wheel tick is single-axis.
    const wheelButton = raw & 3
    const horizontal = wheelButton >= 2
    const deltaY = horizontal ? 0 : wheelButton === 0 ? -1 : 1
    const deltaX = horizontal ? (wheelButton === 2 ? -1 : 1) : 0
    return {
      button: 0,
      x,
      y,
      ...(clientX === undefined ? {} : { clientX }),
      ...(clientY === undefined ? {} : { clientY }),
      coordinateMode,
      action: "wheel",
      delta: deltaY,
      deltaX,
      shift,
      meta,
      ctrl,
    }
  }

  const button = raw & 3
  const action = motion ? "move" : terminator === "M" ? "down" : "up"
  return {
    button,
    x,
    y,
    ...(clientX === undefined ? {} : { clientX }),
    ...(clientY === undefined ? {} : { clientY }),
    coordinateMode,
    action,
    shift,
    meta,
    ctrl,
  }
}

const SGR_MOUSE_TEST_RE = /^\x1b\[<\d+;\d+;\d+[Mm]$/

/** Check if a raw input string is a mouse sequence */
export function isMouseSequence(input: string): boolean {
  return SGR_MOUSE_TEST_RE.test(input)
}
