/**
 * Runtime Kitty-graphics capability probe (km bead 19668).
 *
 * Env detection (`TERM_PROGRAM`/`TERM`) only GUESSES Kitty-graphics support, and
 * the guess is wrong for a sink that advertises a graphics-capable terminal but
 * cannot actually paint it — a cmux/proxied PTY, a captured or piped stream. An
 * `<Image>` that trusts the guess dumps raw graphics APC bytes (the welcome
 * escape-flood). The authoritative answer is a runtime query: send a tiny
 * graphics command with the query action (`a=q`) and wait for the terminal's
 * `\x1b_Gi=<id>;OK\x1b\` acknowledgement. A terminal that does not speak the
 * protocol sends nothing (and swallows the unknown APC), so the absence of a
 * response is itself the signal.
 */

import type { ProbeInputOwner } from "./theme/detect"

const APC = "\x1b_G"
const ST = "\x1b\\"

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

/**
 * Probe the terminal at runtime for Kitty graphics support. Resolves:
 *   - `true`      — the terminal acknowledged it can paint Kitty graphics.
 *   - `false`     — a non-`OK` response (the protocol is understood but refused).
 *   - `undefined` — no response within `timeoutMs` (the terminal does not speak
 *                   the protocol, or a proxy/capture that cannot paint it).
 *
 * The query is a 1×1 RGB query-only command, harmless to a terminal that ignores
 * unknown APC sequences. Routed through the session's {@link ProbeInputOwner}
 * (never `process.stdin` directly) so it is safe inside a running TUI.
 */
export async function probeKittyGraphics(
  input: ProbeInputOwner,
  timeoutMs = 150,
): Promise<boolean | undefined> {
  // 1×1 RGB pixel = 3 zero bytes → base64 "AAAA"; `a=q` = query support.
  const query = `${APC}i=${KITTY_PROBE_ID},s=1,v=1,a=q,t=d,f=24;AAAA${ST}`
  const result = await input.probe<boolean>({
    query,
    timeoutMs,
    parse: (acc) => parseKittyGraphicsResponse(acc, KITTY_PROBE_ID),
  })
  return result ?? undefined
}
