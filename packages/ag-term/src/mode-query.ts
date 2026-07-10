/**
 * DECRQM — DEC Private Mode Query
 *
 * Queries the terminal for the state of DEC private modes.
 *
 * Protocol:
 * - Query:    CSI ? {mode} $ p
 * - Response: CSI ? {mode} ; {Ps} $ y
 *
 * Where Ps is:
 *   1 = set (mode is enabled)
 *   2 = reset (mode is disabled)
 *   0 = not recognized (unknown mode)
 *   3 = permanently set
 *   4 = permanently reset
 *
 * We normalize 3→"set" and 4→"reset" for simplicity.
 *
 * Supported by: xterm, Ghostty, Kitty, WezTerm, foot, VTE-based terminals
 */

/** Regex for DECRPM response: CSI ? mode ; Ps $ y */
const DECRPM_RESPONSE_RE = /\x1b\[\?(\d+);(\d+)\$y/

/**
 * Regex for matching a DECRPM response anywhere in a chunk.
 *
 * Terminals may flush a DECRPM echo interleaved with other bytes (OSC color
 * reports, prior queries, cursor moves). The standalone {@link decodeDecrpmResponse}
 * helper accepts a haystack and locates the first DECRPM match, rather than
 * insisting the chunk start with one.
 *
 * `Ps` is constrained to a single digit (0-9 only) — the DECRPM specification
 * defines values 0/1/2/3/4 and reserves the rest. Multi-digit Ps strings are
 * not valid DECRPM responses and should be ignored.
 */
const DECRPM_RESPONSE_FIND_RE = /\x1b\[\?(\d+);(\d)\$y/

/** Well-known DEC private mode constants. */
export const DecMode = {
  /** DEC cursor visible (DECTCEM) */
  CURSOR_VISIBLE: 25,
  /** Alternate screen buffer (DECSET 1049) */
  ALT_SCREEN: 1049,
  /** Normal mouse tracking (X10) */
  MOUSE_TRACKING: 1000,
  /** Bracketed paste mode */
  BRACKETED_PASTE: 2004,
  /** Synchronized output */
  SYNC_OUTPUT: 2026,
  /** Focus reporting */
  FOCUS_REPORTING: 1004,
} as const

type ModeState = "set" | "reset" | "unknown"

/**
 * Query the state of a single DEC private mode.
 *
 * @param write Function to write to stdout
 * @param read Function to read a chunk from stdin
 * @param mode DEC private mode number (e.g., DecMode.ALT_SCREEN)
 * @param timeoutMs How long to wait for response (default: 200ms)
 * @returns "set", "reset", or "unknown"
 */
export async function queryMode(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  mode: number,
  timeoutMs = 200,
): Promise<ModeState> {
  write(`\x1b[?${mode}$p`)

  const data = await read(timeoutMs)
  if (data == null) return "unknown"

  const match = DECRPM_RESPONSE_RE.exec(data)
  if (!match) return "unknown"

  const reportedMode = parseInt(match[1]!, 10)
  if (reportedMode !== mode) return "unknown"

  const ps = parseInt(match[2]!, 10)
  switch (ps) {
    case 1:
    case 3:
      return "set"
    case 2:
    case 4:
      return "reset"
    default:
      return "unknown"
  }
}

/**
 * Query the state of multiple DEC private modes.
 *
 * Queries each mode sequentially and returns a Map of results.
 *
 * @param write Function to write to stdout
 * @param read Function to read a chunk from stdin
 * @param modes Array of DEC private mode numbers
 * @param timeoutMs Per-query timeout (default: 200ms)
 */
export async function queryModes(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  modes: number[],
  timeoutMs = 200,
): Promise<Map<number, ModeState>> {
  const results = new Map<number, ModeState>()

  for (const mode of modes) {
    const state = await queryMode(write, read, mode, timeoutMs)
    results.set(mode, state)
  }

  return results
}

// =============================================================================
// Standalone DECRPM response decoder (15127 GAP 8)
// =============================================================================

/**
 * Decoded DECRPM response — the mode the terminal reported on, and its state.
 *
 * `state: "unknown"` means the terminal responded but indicated it does not
 * recognize the mode (DECRPM Ps=0, or any unspecified Ps). Distinguish this
 * from `decodeDecrpmResponse` returning `null`, which means no DECRPM
 * response was found in the chunk at all.
 */
export interface DecrpmResponse {
  readonly mode: number
  readonly state: ModeState
}

/**
 * Decode a DECRPM response (CSI ? {mode} ; {Ps} $ y) from a byte chunk.
 *
 * Optional, side-effect-free, never throws. Designed for the "the terminal
 * may or may not echo state back" path — sync update mode (DEC 2026) is the
 * canonical case: some terminals respond to `CSI ?2026h` with an echoed
 * state, most just apply it silently. Consumers route incoming bytes through
 * this decoder; absence of a match is normal and silently passes through.
 *
 * Returns the decoded {@link DecrpmResponse} when a well-formed response is
 * located anywhere in `data`, or `null` when the chunk contains no DECRPM
 * payload (or only a malformed one). `expectedMode`, when provided, narrows
 * acceptance: a response for any other mode returns `null` rather than
 * reporting on the wrong mode.
 *
 * @param data Raw bytes received from the terminal (may include unrelated
 *             OSC/CSI noise — only the first valid DECRPM match is returned)
 * @param expectedMode If set, only DECRPM responses for this mode are accepted
 */
export function decodeDecrpmResponse(
  data: string,
  expectedMode?: number,
): DecrpmResponse | null {
  if (!data) return null

  const match = DECRPM_RESPONSE_FIND_RE.exec(data)
  if (!match) return null

  const mode = parseInt(match[1]!, 10)
  if (!Number.isFinite(mode)) return null
  if (expectedMode !== undefined && mode !== expectedMode) return null

  const ps = parseInt(match[2]!, 10)
  let state: ModeState
  switch (ps) {
    case 1:
    case 3:
      state = "set"
      break
    case 2:
    case 4:
      state = "reset"
      break
    default:
      // Ps=0 (mode not recognized) and any other digit fall through to
      // "unknown" — the terminal answered, but the answer isn't a usable
      // set/reset signal.
      state = "unknown"
      break
  }

  return { mode, state }
}

/**
 * Decode a Synchronized Update Mode (DEC 2026) echo response, if present.
 *
 * Convenience over {@link decodeDecrpmResponse} narrowed to mode 2026:
 *
 * - `"set"` — terminal echoed state=set (Ps=1 or Ps=3)
 * - `"reset"` — terminal echoed state=reset (Ps=2 or Ps=4)
 * - `null` — no usable echo (no DECRPM response, response was for a different
 *   mode, or Ps=0/unknown indicating the terminal does not recognize sync mode)
 *
 * Returning `null` is the common case — most terminals apply `CSI ?2026h/l`
 * silently and never echo state. Callers route input bytes through this
 * decoder and update a local "observed sync state" gauge only when it returns
 * a definite "set"/"reset".
 */
export function decodeSyncUpdateResponse(data: string): "set" | "reset" | null {
  const response = decodeDecrpmResponse(data, DecMode.SYNC_OUTPUT)
  if (response === null) return null
  if (response.state === "unknown") return null
  return response.state
}
