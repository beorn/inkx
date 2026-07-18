/**
 * Kitty keyboard protocol detection.
 *
 * Sends CSI ? u and parses the response to determine whether the terminal
 * supports the Kitty keyboard protocol and which flags it reports.
 */

import type { ProbeInputOwner } from "@silvery/ansi"
import { queryKittyKeyboard } from "./output"

export interface KittyDetectResult {
  /** Whether the terminal responded to the Kitty protocol query */
  supported: boolean
  /** Bitfield of KittyFlags the terminal reported supporting (0 if unsupported) */
  flags: number
  /** Any non-response data that was read during detection (regular input that arrived) */
  buffered?: string
}

/** Regex to match a Kitty keyboard query response: CSI ? <flags> u */
const KITTY_RESPONSE_RE = /\x1b\[\?(\d+)u/

/**
 * Detect Kitty keyboard protocol support.
 *
 * Sends CSI ? u to the terminal and waits for a response.
 * Supported terminals respond with CSI ? flags u.
 * Unsupported terminals either ignore the query or echo it.
 *
 * @param write Function to write to stdout
 * @param read Function to read a chunk from stdin (should resolve with data or null on timeout)
 * @param timeoutMs How long to wait for response (default: 200ms)
 */
export async function detectKittySupport(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  timeoutMs = 200,
): Promise<KittyDetectResult> {
  write(queryKittyKeyboard())

  const data = await read(timeoutMs)
  if (data == null) {
    return { supported: false, flags: 0 }
  }

  const parsed = parseKittyResponse(data)
  if (!parsed) {
    return { supported: false, flags: 0, buffered: data }
  }

  // Anything outside the matched response is buffered input
  const before = data.slice(0, parsed.start)
  const after = data.slice(parsed.end)
  const buffered = before + after
  return { ...parsed.result, buffered: buffered || undefined }
}

/** Query Kitty support through the session's canonical stdin owner. */
export async function detectKittyWithProbe(
  input: ProbeInputOwner,
  timeoutMs = 200,
): Promise<KittyDetectResult> {
  return (
    (await input.probe({
      query: queryKittyKeyboard(),
      timeoutMs,
      parse: (acc) => {
        const parsed = parseKittyResponse(acc)
        return parsed ? { result: parsed.result, consumed: parsed.end } : null
      },
    })) ?? { supported: false, flags: 0 }
  )
}

function parseKittyResponse(
  data: string,
): { result: KittyDetectResult; start: number; end: number } | null {
  const match = KITTY_RESPONSE_RE.exec(data)
  if (!match) return null
  return {
    result: { supported: true, flags: parseInt(match[1]!, 10) },
    start: match.index,
    end: match.index + match[0].length,
  }
}

/**
 * Detect Kitty support using real stdin/stdout.
 * Convenience wrapper around detectKittySupport.
 */
export async function detectKittyFromStdio(
  stdout: { write: (s: string) => boolean | void },
  stdin: NodeJS.ReadStream,
  timeoutMs = 200,
): Promise<KittyDetectResult> {
  // Race-safe rawMode toggle — see probeColors comment in
  // vendor/silvery/packages/ansi/src/theme/detect.ts. If another consumer
  // (e.g. silvery's term-provider) is on stdin, leave raw mode alone.
  const otherListeners = stdin.listenerCount("data") > 0
  const wasRaw = stdin.isRaw
  let didSetRaw = false
  if (!wasRaw && !otherListeners) {
    stdin.setRawMode(true)
    didSetRaw = true
  }

  try {
    const write = (s: string) => {
      stdout.write(s)
    }

    const read = (ms: number): Promise<string | null> =>
      new Promise((resolve) => {
        const timer = setTimeout(() => {
          stdin.removeListener("data", onData)
          resolve(null)
        }, ms)

        function onData(chunk: Buffer) {
          clearTimeout(timer)
          stdin.removeListener("data", onData)
          resolve(chunk.toString())
        }

        stdin.on("data", onData)
      })

    return await detectKittySupport(write, read, timeoutMs)
  } finally {
    if (didSetRaw) stdin.setRawMode(false)
  }
}
