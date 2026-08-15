/**
 * Runtime graphics-capability probe (km beads 19668 + kitty-probe-env-gated).
 *
 * Env detection (`TERM_PROGRAM`/`TERM`) only GUESSES Kitty-graphics support, and
 * the guess is wrong for a sink that advertises a graphics-capable terminal but
 * cannot actually paint it — a cmux/proxied PTY, a captured or piped stream. An
 * `<Image>` that trusts the guess dumps raw graphics APC bytes (the welcome
 * escape-flood). The authoritative answer is a runtime query: send a tiny
 * graphics command with the query action (`a=q`), followed by a DA1 query that
 * acts as the transaction barrier. A Kitty acknowledgement before that barrier
 * confirms Kitty graphics; DA1 attribute 4 confirms Sixel. The barrier makes a
 * missing Kitty reply authoritative without a separate timeout or probe.
 */

import { parsePrimaryDAResponse } from "./device-attributes"
import type { ProbeInputOwner } from "./theme/detect"

const APC = "\x1b_G"
const ST = "\x1b\\"
const DA1_QUERY = "\x1b[c"

/**
 * The image id used for the support query. Chosen well above the runtime image
 * id range (1..255) so a probe ack can never be confused with a real image's
 * response.
 */
export const KITTY_PROBE_ID = 7777

/**
 * Parse a Kitty graphics query response for {@link KITTY_PROBE_ID}.
 *
 *   - `{ result: true }`  — `\x1b_Gi=<id>;OK\x1b\` → graphics supported.
 *   - `{ result: false }` — a well-formed response for our id that is NOT `OK`
 *                           (the terminal parsed the APC but rejected the query).
 *   - `null`              — no complete response for our id yet (the probe keeps
 *                           waiting; on timeout the caller treats this as
 *                           unsupported).
 */
export function parseKittyGraphicsResponse(
  acc: string,
  id: number,
): { result: boolean; consumed: number } | null {
  const prefix = `${APC}i=${id};`
  const start = acc.indexOf(prefix)
  if (start === -1) return null
  const bodyStart = start + prefix.length
  const end = acc.indexOf(ST, bodyStart)
  if (end === -1) return null // terminator not yet arrived
  const body = acc.slice(bodyStart, end)
  return { result: body.trim() === "OK", consumed: end + ST.length }
}

export interface TerminalGraphicsCapabilities {
  readonly kittyGraphics: boolean
  readonly sixel: boolean
}

/**
 * Parse the one graphics transaction once its DA1 barrier arrives.
 *
 * Terminal replies preserve command order, so a Kitty acknowledgement absent
 * before the DA1 response is a definitive negative. Sixel is advertised by
 * DA1 parameter 4 in that same response.
 */
export function parseTerminalGraphicsResponse(
  acc: string,
  id: number,
): { result: TerminalGraphicsCapabilities; consumed: number } | null {
  const da1 = parsePrimaryDAResponse(acc)
  if (!da1) return null

  const transaction = acc.slice(0, da1.consumed)
  const kitty = parseKittyGraphicsResponse(transaction, id)
  return {
    result: {
      kittyGraphics: kitty?.result === true,
      sixel: da1.result.params.includes(4),
    },
    consumed: da1.consumed,
  }
}

/**
 * Probe the terminal at runtime for Kitty and Sixel graphics support.
 * Resolves an honest all-false result when the bounded transaction times out.
 *
 * The Kitty portion is a 1×1 RGB query-only command, harmless to a terminal
 * that ignores unknown APC sequences. DA1 is the ordered barrier and Sixel
 * capability source. The transaction routes through the session's
 * {@link ProbeInputOwner} (never `process.stdin` directly), so it is safe
 * inside a running TUI.
 */
export async function probeTerminalGraphics(
  input: ProbeInputOwner,
  timeoutMs = 150,
): Promise<TerminalGraphicsCapabilities> {
  // 1×1 RGB pixel = 3 zero bytes → base64 "AAAA"; `a=q` = query support.
  // DA1 is concatenated as the ordered barrier and carries Sixel attribute 4.
  const query = `${APC}i=${KITTY_PROBE_ID},s=1,v=1,a=q,t=d,f=24;AAAA${ST}${DA1_QUERY}`
  const result = await input.probe<TerminalGraphicsCapabilities>({
    query,
    timeoutMs,
    parse: (acc) => parseTerminalGraphicsResponse(acc, KITTY_PROBE_ID),
  })
  return result ?? { kittyGraphics: false, sixel: false }
}
