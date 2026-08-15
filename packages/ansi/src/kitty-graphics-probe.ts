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

import { recognizePrimaryDAResponse } from "./device-attributes"
import { recognizeTerminalVersionResponse, XTVERSION_QUERY } from "./terminal-version-probe"
import type { ProbeInputOwner } from "./theme/detect"

const APC = "\x1b_G"
const ST = "\x1b\\"
export const DA1_QUERY = "\x1b[c"

/**
 * The image id used for the support query. Chosen well above the runtime image
 * id range (1..255) so a probe ack can never be confused with a real image's
 * response.
 */
export const KITTY_PROBE_ID = 7777
export const TERMINAL_CAPABILITY_BUFFER_BYTES = 4096

export interface KittyGraphicsMatch {
  readonly result: boolean
  readonly span: { readonly start: number; readonly end: number }
}

/** Recognize one complete response for the requested Kitty image id. */
export function recognizeKittyGraphicsResponse(acc: string, id: number): KittyGraphicsMatch | null {
  const prefix = `${APC}i=${id};`
  const start = acc.indexOf(prefix)
  if (start === -1) return null
  const bodyStart = start + prefix.length
  const end = acc.indexOf(ST, bodyStart)
  if (end === -1) return null
  return {
    result: acc.slice(bodyStart, end).trim() === "OK",
    span: { start, end: end + ST.length },
  }
}

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
  const recognized = recognizeKittyGraphicsResponse(acc, id)
  return recognized ? { result: recognized.result, consumed: recognized.span.end } : null
}

export interface TerminalCapabilityEvidence {
  /** Present only when Kitty returned an explicit OK/error response. */
  readonly kittyGraphics: boolean | undefined
  /** DA1 parameter 4 is positive evidence; its absence is no evidence. */
  readonly sixel: true | undefined
  /** Present only when XTVERSION returned a complete identity response. */
  readonly terminalVersion: string | undefined
}

export type TerminalCapabilityProbeResult =
  | { readonly status: "complete"; readonly value: TerminalCapabilityEvidence }
  | { readonly status: "timeout" }
  | { readonly status: "busy" }
  | {
      readonly status: "overflow"
      readonly maxBufferBytes: number
      readonly receivedBytes: number
    }
  | {
      readonly status: "error"
      readonly reason:
        | "disposed"
        | "invalid-options"
        | "invalid-consumed-span"
        | "recognizer-threw"
        | "write-failed"
      readonly message?: string
    }
  | { readonly status: "unavailable" }

/**
 * Recognize the Kitty + XTVERSION + DA1 transaction. DA1 is the completion
 * barrier; every returned span is exact so InputOwner can replay unrelated
 * bytes without swallowing prefixes.
 */
export function recognizeTerminalCapabilityTransaction(
  acc: string,
  id: number,
):
  | {
      readonly status: "pending"
      readonly consumed: readonly { readonly start: number; readonly end: number }[]
    }
  | {
      readonly status: "complete"
      readonly consumed: readonly { readonly start: number; readonly end: number }[]
      readonly value: TerminalCapabilityEvidence
    } {
  const da1 = recognizePrimaryDAResponse(acc)
  const barrierEnd = da1?.span.end ?? Number.POSITIVE_INFINITY
  const kitty = recognizeKittyGraphicsResponse(acc, id)
  const version = recognizeTerminalVersionResponse(acc)
  const consumed = [kitty?.span, version?.span, da1?.span]
    .filter((span): span is { readonly start: number; readonly end: number } => Boolean(span))
    .filter((span) => span.end <= barrierEnd)
    .sort((left, right) => left.start - right.start)

  if (!da1) return { status: "pending", consumed }
  return {
    status: "complete",
    consumed,
    value: {
      kittyGraphics: kitty && kitty.span.end <= da1.span.end ? kitty.result : undefined,
      sixel: da1.result.params.includes(4) ? true : undefined,
      terminalVersion: version && version.span.end <= da1.span.end ? version.result : undefined,
    },
  }
}

/**
 * Issue the complete capability transaction through the session InputOwner.
 * Query registration and the single stdout write are owned atomically by
 * `probeTransaction`; a legacy structural owner yields typed `unavailable`
 * rather than installing a parallel parser.
 */
export async function probeTerminalCapabilities(
  input: ProbeInputOwner,
  timeoutMs = 150,
): Promise<TerminalCapabilityProbeResult> {
  if (!input.probeTransaction) return { status: "unavailable" }
  const kittyQuery = `${APC}i=${KITTY_PROBE_ID},s=1,v=1,a=q,t=d,f=24;AAAA${ST}`
  return input.probeTransaction({
    query: `${kittyQuery}${XTVERSION_QUERY}${DA1_QUERY}`,
    timeoutMs,
    maxBufferBytes: TERMINAL_CAPABILITY_BUFFER_BYTES,
    recognize: (acc) => recognizeTerminalCapabilityTransaction(acc, KITTY_PROBE_ID),
  })
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
