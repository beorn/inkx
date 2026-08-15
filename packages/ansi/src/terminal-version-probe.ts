/**
 * XTVERSION terminal-identity probe shared by the profile resolver and the
 * lower-level device-attributes API.
 *
 * Environment identity is routinely normalized by SSH and terminal
 * containers. XTVERSION asks the terminal attached to the live TTY instead,
 * while silence remains an honest unknown rather than a manufactured match.
 */

import type { ProbeInputOwner } from "./theme/detect"

export const XTVERSION_QUERY = "\x1b[>0q"

/** XTVERSION response: DCS > | name(version) ST. */
// oxlint-disable-next-line no-control-regex -- the protocol envelope is defined by literal ESC bytes
const XTVERSION_RESPONSE_RE = /\x1bP>\|([^\x1b]*)\x1b\\/

export function parseTerminalVersionResponse(
  acc: string,
): { result: string; consumed: number } | null {
  const match = XTVERSION_RESPONSE_RE.exec(acc)
  if (!match) return null
  return {
    result: match[1]!,
    consumed: match.index + match[0].length,
  }
}

/** Query terminal identity through the session's single stdin owner. */
export async function probeTerminalVersion(
  input: ProbeInputOwner,
  timeoutMs = 150,
): Promise<string | undefined> {
  const result = await input.probe<string>({
    query: XTVERSION_QUERY,
    timeoutMs,
    parse: parseTerminalVersionResponse,
  })
  return result ?? undefined
}
