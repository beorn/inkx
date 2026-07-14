import { ProtocolError, isProtocolError } from "@silvery/ansi"
import { PASTE_START, parseBracketedPasteEnvelope } from "./bracketed-paste"
import {
  MAX_OSC52_BASE64_LENGTH,
  OSC52_PREFIX,
  findOsc52Terminator,
  measureOsc52ContentLength,
  parseClipboardResponseEnvelope,
} from "./clipboard"

export type TerminalInputSegment =
  | { type: "raw"; data: string }
  | { type: "paste"; text: string; raw: string }
  | { type: "clipboard"; text: string; raw: string }
  | { type: "invalid"; error: ProtocolError }

export interface TerminalInputDecoder {
  /** Append one transport chunk and return every complete segment now available. */
  push(chunk: string): TerminalInputSegment[]
  /** Whether the retained bytes are only an ambiguous protocol prefix. */
  hasPendingPrefix(): boolean
  /** Release an ambiguous prefix as raw input without flushing a transaction. */
  flushPendingPrefix(): TerminalInputSegment[]
  /** Discard an incomplete protocol transaction. */
  reset(): void
}

export interface TerminalInputStreamDecoder {
  /** Append one transport chunk and return every synchronously complete segment. */
  push(chunk: string): TerminalInputSegment[]
  /** Decode one complete logical event, flushing ambiguous prefixes at its boundaries. */
  pushAtomic(chunk: string): TerminalInputSegment[]
  /** Cancel a pending prefix timeout and discard decoder state. */
  reset(): void
}

export interface TerminalInputStreamDecoderOptions {
  /** Receive a retained prefix when its bounded ambiguity window expires. */
  onPrefixTimeout(segments: TerminalInputSegment[]): void
  prefixTimeoutMs?: number
}

/** Match the terminal owner's existing standalone-Escape disambiguation window. */
export const TERMINAL_INPUT_PREFIX_TIMEOUT_MS = 25

const PROTOCOL_PREFIXES = [PASTE_START, OSC52_PREFIX] as const

function appendRaw(segments: TerminalInputSegment[], data: string): void {
  if (data.length === 0) return
  const previous = segments.at(-1)
  if (previous?.type === "raw") previous.data += data
  else segments.push({ type: "raw", data })
}

function earliestProtocolStart(input: string): number {
  let earliest = -1
  for (const prefix of PROTOCOL_PREFIXES) {
    const index = input.indexOf(prefix)
    if (index !== -1 && (earliest === -1 || index < earliest)) earliest = index
  }
  return earliest
}

function trailingProtocolPrefixLength(input: string): number {
  let longest = 0
  for (const prefix of PROTOCOL_PREFIXES) {
    const max = Math.min(input.length, prefix.length - 1)
    for (let length = max; length >= 1; length--) {
      if (input.endsWith(prefix.slice(0, length))) {
        longest = Math.max(longest, length)
        break
      }
    }
  }
  return longest
}

/**
 * Decode the terminal input stream rather than an individual transport chunk.
 *
 * Safe raw prefixes emit immediately. Only an incomplete protocol suffix is
 * retained. Malformed complete envelopes are consumed without replaying their
 * bytes as keys. Exact envelope bytes remain available to transport adapters
 * that must forward a transaction to a downstream decoder.
 */
export function createTerminalInputDecoder(): TerminalInputDecoder {
  let pending = ""
  let pendingPrefix = false
  let discardingOversizeOsc52 = false
  let discardTerminatorPrefix = ""

  function beginOversizeOsc52Discard(): void {
    discardTerminatorPrefix = pending.endsWith("\x1b") ? "\x1b" : ""
    pending = ""
    pendingPrefix = false
    discardingOversizeOsc52 = true
  }

  return {
    push(chunk) {
      pendingPrefix = false
      if (discardingOversizeOsc52) {
        const discarded = discardTerminatorPrefix + chunk
        const terminator = findOsc52Terminator(discarded, 0)
        if (terminator === null) {
          discardTerminatorPrefix = discarded.endsWith("\x1b") ? "\x1b" : ""
          return []
        }
        chunk = discarded.slice(terminator.end)
        discardingOversizeOsc52 = false
        discardTerminatorPrefix = ""
      }
      pending += chunk
      const segments: TerminalInputSegment[] = []

      while (pending.length > 0) {
        const protocolStart = earliestProtocolStart(pending)
        if (protocolStart === -1) {
          const partialLength = trailingProtocolPrefixLength(pending)
          const rawEnd = pending.length - partialLength
          appendRaw(segments, pending.slice(0, rawEnd))
          pending = pending.slice(rawEnd)
          pendingPrefix = partialLength > 0
          break
        }

        if (protocolStart > 0) {
          appendRaw(segments, pending.slice(0, protocolStart))
          pending = pending.slice(protocolStart)
          continue
        }

        if (pending.startsWith(PASTE_START)) {
          try {
            const envelope = parseBracketedPasteEnvelope(pending)
            if (envelope === null) throw new Error("bracketed paste prefix was not recognized")
            const raw = pending.slice(0, envelope.end)
            segments.push({ type: "paste", text: envelope.result.content, raw })
            pending = pending.slice(envelope.end)
          } catch (error) {
            if (!isProtocolError(error)) throw error
            break
          }
          continue
        }

        const contentStart = OSC52_PREFIX.length
        if (pending.length <= contentStart) break

        // Queries are control traffic, not keyboard input. Consume a complete
        // query and keep scanning so it cannot mask a following response.
        if (pending[contentStart] === "?") {
          const terminator = findOsc52Terminator(pending, contentStart + 1)
          if (terminator === null) {
            if (measureOsc52ContentLength(pending, contentStart) <= MAX_OSC52_BASE64_LENGTH) break
            const error = new ProtocolError({
              parser: "parseClipboardResponse",
              input: pending,
              reason: `OSC 52 query exceeds ${MAX_OSC52_BASE64_LENGTH}-character bound without a terminator`,
            })
            segments.push({ type: "invalid", error })
            beginOversizeOsc52Discard()
            continue
          }
          pending = pending.slice(terminator.end)
          continue
        }

        try {
          const envelope = parseClipboardResponseEnvelope(pending)
          if (envelope === null) throw new Error("OSC52 response prefix was not recognized")
          const raw = pending.slice(0, envelope.end)
          segments.push({ type: "clipboard", text: envelope.text, raw })
          pending = pending.slice(envelope.end)
        } catch (error) {
          if (!isProtocolError(error)) throw error
          const terminator = findOsc52Terminator(pending, contentStart)
          if (terminator === null) {
            if (measureOsc52ContentLength(pending, contentStart) <= MAX_OSC52_BASE64_LENGTH) break
            segments.push({ type: "invalid", error })
            beginOversizeOsc52Discard()
            continue
          }
          segments.push({ type: "invalid", error })
          pending = pending.slice(terminator.end)
        }
      }

      return segments
    },

    hasPendingPrefix() {
      return pendingPrefix
    },

    flushPendingPrefix() {
      if (!pendingPrefix) return []
      const raw = pending
      pending = ""
      pendingPrefix = false
      return raw.length === 0 ? [] : [{ type: "raw", data: raw }]
    },

    reset() {
      pending = ""
      pendingPrefix = false
      discardingOversizeOsc52 = false
      discardTerminatorPrefix = ""
    },
  }
}

/**
 * Own transport-chunk ambiguity around the pure terminal input decoder.
 *
 * Complete segments emit synchronously. A suffix that is only a possible
 * protocol prefix is retained for one bounded window, then released as raw
 * input. Full paste and OSC 52 transactions remain buffered until complete or
 * reset; the timeout never converts transaction payload into keyboard input.
 */
export function createTerminalInputStreamDecoder(
  options: TerminalInputStreamDecoderOptions,
): TerminalInputStreamDecoder {
  const decoder = createTerminalInputDecoder()
  const prefixTimeoutMs = options.prefixTimeoutMs ?? TERMINAL_INPUT_PREFIX_TIMEOUT_MS
  let prefixTimer: ReturnType<typeof setTimeout> | null = null

  function cancelPrefixTimer(): void {
    if (prefixTimer === null) return
    clearTimeout(prefixTimer)
    prefixTimer = null
  }

  return {
    push(chunk) {
      cancelPrefixTimer()
      const segments = decoder.push(chunk)
      if (!decoder.hasPendingPrefix()) return segments

      prefixTimer = setTimeout(() => {
        prefixTimer = null
        const timedOut = decoder.flushPendingPrefix()
        if (timedOut.length > 0) options.onPrefixTimeout(timedOut)
      }, prefixTimeoutMs)
      ;(prefixTimer as { unref?: () => void }).unref?.()
      return segments
    },

    pushAtomic(chunk) {
      cancelPrefixTimer()
      const segments = decoder.flushPendingPrefix()
      segments.push(...decoder.push(chunk))
      segments.push(...decoder.flushPendingPrefix())
      return segments
    },

    reset() {
      cancelPrefixTimer()
      decoder.reset()
    },
  }
}
