/**
 * XTVERSION terminal-identity probe shared by the profile resolver and the
 * lower-level device-attributes API.
 *
 * Environment identity is routinely normalized by SSH and terminal
 * containers. XTVERSION asks the terminal attached to the live TTY instead,
 * while silence remains an honest unknown rather than a manufactured match.
 */

/**
 * XTVERSION query bytes. Terminal-owning code must issue the query and own
 * its timeout; this constant does not perform I/O.
 */
export const XTVERSION_QUERY = "\x1b[>0q"

/** XTVERSION response: DCS > | name(version) ST. */
// oxlint-disable-next-line no-control-regex -- the protocol envelope is defined by literal ESC bytes
const XTVERSION_RESPONSE_RE = /\x1bP>\|([^\x1b]*)\x1b\\/

export interface TerminalVersionMatch {
  readonly result: string
  readonly span: { readonly start: number; readonly end: number }
}

/** Recognize one complete XTVERSION response and return its exact span. */
export function recognizeTerminalVersionResponse(acc: string): TerminalVersionMatch | null {
  const match = XTVERSION_RESPONSE_RE.exec(acc)
  if (!match) return null
  return {
    result: match[1]!,
    span: { start: match.index, end: match.index + match[0].length },
  }
}

/**
 * Parse one complete XTVERSION response. Returns `null` for absent,
 * incomplete, or non-matching input, so the terminal owner keeps "unknown"
 * distinct and decides when its query has timed out.
 */
export function parseTerminalVersionResponse(
  acc: string,
): { result: string; consumed: number } | null {
  const recognized = recognizeTerminalVersionResponse(acc)
  return recognized ? { result: recognized.result, consumed: recognized.span.end } : null
}
