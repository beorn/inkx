/**
 * Clipboard Backend Abstraction
 *
 * Pluggable clipboard system with support for multiple backends.
 * The default backend uses OSC 52 for terminal clipboard access.
 *
 * Architecture:
 * - ClipboardBackend: interface for clipboard read/write
 * - ClipboardData: multi-format clipboard content (text, markdown, html, internal)
 * - createOsc52Backend: OSC 52 terminal clipboard (default)
 * - createInternalClipboardBackend: in-memory store for rich app-internal paste
 * - createCompositeClipboard: fan-out writes to multiple backends
 *
 * OSC 52 Protocol:
 * - Copy:    ESC ] 52 ; c ; <base64> BEL
 * - Query:   ESC ] 52 ; c ; ? BEL
 * - Response: ESC ] 52 ; c ; <base64> BEL  (or ST terminator)
 *
 * Supported by: Ghostty, Kitty, WezTerm, iTerm2, xterm, foot, tmux
 */

import { ProtocolError } from "@silvery/ansi"

// ============================================================================
// Types
// ============================================================================

/**
 * Multi-format clipboard content.
 *
 * Plain text is always present. Optional rich formats allow applications
 * to provide structured data for within-app paste without losing it
 * through the plain-text-only system clipboard.
 */
export interface ClipboardData {
  /** Plain text content (always present) */
  text: string
  /** Markdown representation */
  markdown?: string
  /** HTML representation */
  html?: string
  /** App-specific structured data (e.g., node tree for structured paste) */
  internal?: unknown
}

/**
 * Clipboard backend capabilities.
 *
 * `text` is always true — every backend supports plain text.
 * Rich format support is backend-dependent.
 */
export interface ClipboardCapabilities {
  readonly text: true
  readonly html?: boolean
  readonly markdown?: boolean
  readonly internal?: boolean
}

/**
 * Pluggable clipboard backend.
 *
 * Backends handle the transport of clipboard data to/from the system
 * or an in-memory store. The framework writes ClipboardData; the backend
 * decides what formats it can actually carry.
 */
export interface ClipboardBackend {
  /** Write clipboard data. Backends may ignore formats they don't support. */
  write(data: ClipboardData): void | Promise<void>
  /** Read clipboard contents as plain text. Not all backends support read. */
  read?(): Promise<string>
  /** What formats this backend supports */
  readonly capabilities: ClipboardCapabilities
}

// ============================================================================
// Writable interface (avoid coupling to Node.js WriteStream)
// ============================================================================

/** Minimal writable interface for clipboard output */
interface Writable {
  write(data: string): boolean | void
}

// ============================================================================
// OSC 52 Constants
// ============================================================================

const ESC = "\x1b"
const BEL = "\x07"

/** OSC 52 response prefix */
export const OSC52_PREFIX = `${ESC}]52;c;`

/**
 * Upper bound on the decoded size of an OSC 52 clipboard payload.
 *
 * OSC 52 responses are attacker-influenceable: a hostile program on the far end
 * of an SSH session, or a malicious terminal emulator, can emit an arbitrary
 * base64 blob that arrives on stdin and is decoded here (see the
 * `input-owner.ts` clipboard-response path that fires it as a paste). Node's
 * base64 decoder never throws and imposes no size limit, so without a cap a
 * single response could force an arbitrarily large allocation and then be fed
 * into a focused guest as pasted input. Real clipboards are small — terminals
 * themselves cap OSC 52 payloads around ~100 KB (see the `createOsc52Backend`
 * quirks note) — so 1 MiB sits comfortably above any legitimate clipboard while
 * keeping the decode bounded.
 */
export const MAX_OSC52_PAYLOAD_BYTES = 1024 * 1024

/**
 * Base64 encodes 3 bytes as 4 chars, so the encoded form of the byte cap is
 * `ceil(bytes / 3) * 4`. We compare the base64 length against this to reject
 * oversize payloads before decoding (never allocating the decoded buffer).
 */
export const MAX_OSC52_BASE64_LENGTH = Math.ceil(MAX_OSC52_PAYLOAD_BYTES / 3) * 4

/**
 * Standard base64 alphabet with optional `=` padding. Node's decoder silently
 * drops out-of-alphabet bytes instead of failing, so we validate shape first
 * and reject anything that isn't well-formed base64 rather than best-effort
 * decoding garbage into a paste.
 */
const OSC52_BASE64_SHAPE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

function encodeUtf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ""
  const chunkSize = 32 * 1024
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function decodeUtf8Base64(base64: string): string {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)
}

function decodedBase64ByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0
  return (base64.length / 4) * 3 - padding
}

// ============================================================================
// OSC 52 Backend
// ============================================================================

/**
 * Create an OSC 52 clipboard backend.
 *
 * Writes plain text to the system clipboard via the terminal's OSC 52 support.
 * Works across SSH sessions. Rich formats (markdown, html, internal) are
 * silently ignored — OSC 52 only carries plain text.
 *
 * Quirks:
 * - Some terminals limit payload size (~100KB)
 * - tmux requires `set -g set-clipboard on`
 * - Some terminals only support BEL terminator (not ST)
 */
export function createOsc52Backend(stdout: Writable): ClipboardBackend {
  return {
    write(data: ClipboardData): void {
      const base64 = encodeUtf8Base64(data.text)
      stdout.write(`${ESC}]52;c;${base64}${BEL}`)
    },

    async read(): Promise<string> {
      // OSC 52 read requires async response parsing from stdin.
      // The query is sent here; the caller must parse the response
      // from the terminal input stream using parseClipboardResponse().
      stdout.write(`${ESC}]52;c;?${BEL}`)
      // Note: actual response arrives asynchronously via stdin.
      // This is a limitation of the terminal protocol — true async
      // read requires coordination with the input parser.
      return ""
    },

    capabilities: { text: true },
  }
}

// ============================================================================
// Internal Clipboard Backend
// ============================================================================

/**
 * In-memory clipboard store for within-app paste.
 *
 * Stores the full ClipboardData including rich formats that OSC 52 can't carry.
 * Used alongside OSC 52 so plain text goes to the system clipboard while
 * rich data is available for internal paste operations.
 */
export function createInternalClipboardBackend(): ClipboardBackend & {
  /** Get the stored clipboard data, or null if empty */
  getData(): ClipboardData | null
  /** Get the timestamp of the last write */
  getTimestamp(): number
} {
  let stored: ClipboardData | null = null
  let timestamp = 0

  return {
    write(data: ClipboardData): void {
      stored = { ...data }
      timestamp = Date.now()
    },

    async read(): Promise<string> {
      return stored?.text ?? ""
    },

    getData(): ClipboardData | null {
      return stored ? { ...stored } : null
    },

    getTimestamp(): number {
      return timestamp
    },

    capabilities: { text: true, html: true, markdown: true, internal: true },
  }
}

// ============================================================================
// Composite Clipboard
// ============================================================================

/**
 * Create a composite clipboard that writes to multiple backends.
 *
 * Writes fan out to all backends. Reads come from the first backend
 * that supports read (in order). This lets you do OSC 52 + internal
 * store simultaneously: plain text goes to system clipboard, rich
 * data stays in memory for structured paste.
 */
export function createCompositeClipboard(...backends: ClipboardBackend[]): ClipboardBackend {
  return {
    write(data: ClipboardData): void | Promise<void> {
      const promises: Promise<void>[] = []
      for (const backend of backends) {
        const result = backend.write(data)
        if (result instanceof Promise) {
          promises.push(result)
        }
      }
      if (promises.length > 0) {
        return Promise.all(promises).then(() => undefined)
      }
    },

    async read(): Promise<string> {
      for (const backend of backends) {
        if (backend.read) {
          const text = await backend.read()
          if (text) return text
        }
      }
      return ""
    },

    capabilities: {
      text: true,
      html: backends.some((b) => b.capabilities.html) || undefined,
      markdown: backends.some((b) => b.capabilities.markdown) || undefined,
      internal: backends.some((b) => b.capabilities.internal) || undefined,
    },
  }
}

// ============================================================================
// Response Parsing
// ============================================================================

/** @internal Parsed OSC 52 response with its exact consumed byte span. */
export interface ClipboardResponseEnvelope {
  text: string
  start: number
  end: number
}

/** @internal Exact OSC string terminator span. */
export interface Osc52Terminator {
  start: number
  end: number
}

/** Find the earliest BEL or ST terminator after `contentStart`. */
export function findOsc52Terminator(input: string, contentStart: number): Osc52Terminator | null {
  const belStart = input.indexOf(BEL, contentStart)
  const st = `${ESC}\\`
  const stStart = input.indexOf(st, contentStart)
  if (belStart === -1 && stStart === -1) return null
  if (stStart !== -1 && (belStart === -1 || stStart < belStart)) {
    return { start: stStart, end: stStart + st.length }
  }
  return { start: belStart, end: belStart + BEL.length }
}

/** @internal Measure streamed OSC 52 content without counting a split ST prefix. */
export function measureOsc52ContentLength(input: string, contentStart: number): number {
  const terminator = findOsc52Terminator(input, contentStart)
  const contentEnd =
    terminator?.start ?? (input.endsWith(ESC) ? input.length - ESC.length : input.length)
  return Math.max(0, contentEnd - contentStart)
}

/** @internal Use when a stream owner must preserve bytes around the response. */
export function parseClipboardResponseEnvelope(input: string): ClipboardResponseEnvelope | null {
  let prefixIdx = input.indexOf(OSC52_PREFIX)
  while (prefixIdx !== -1) {
    const contentStart = prefixIdx + OSC52_PREFIX.length
    const terminator = findOsc52Terminator(input, contentStart)

    if (input[contentStart] === "?") {
      if (terminator === null) return null
      prefixIdx = input.indexOf(OSC52_PREFIX, terminator.end)
      continue
    }

    const contentLength = measureOsc52ContentLength(input, contentStart)
    if (contentLength > MAX_OSC52_BASE64_LENGTH) {
      throw new ProtocolError({
        parser: "parseClipboardResponse",
        input,
        reason: `OSC 52 base64 payload exceeds ${MAX_OSC52_PAYLOAD_BYTES}-byte cap (got ${contentLength} base64 chars)`,
      })
    }

    if (terminator === null) {
      throw new ProtocolError({
        parser: "parseClipboardResponse",
        input,
        reason: "missing terminator (expected BEL or ST after OSC 52 base64 payload)",
      })
    }

    const base64 = input.slice(contentStart, terminator.start)
    if (!OSC52_BASE64_SHAPE.test(base64)) {
      throw new ProtocolError({
        parser: "parseClipboardResponse",
        input,
        reason: "OSC 52 payload is not valid base64",
      })
    }
    const decodedBytes = decodedBase64ByteLength(base64)
    if (decodedBytes > MAX_OSC52_PAYLOAD_BYTES) {
      throw new ProtocolError({
        parser: "parseClipboardResponse",
        input,
        reason: `OSC 52 payload exceeds ${MAX_OSC52_PAYLOAD_BYTES}-byte cap (decodes to ${decodedBytes} bytes)`,
      })
    }

    return {
      text: decodeUtf8Base64(base64),
      start: prefixIdx,
      end: terminator.end,
    }
  }

  return null
}

/**
 * Parse an OSC 52 clipboard response and decode the base64 content.
 *
 * Return semantics (see {@link ProtocolError} for the full contract):
 * - `null` — input is NOT an OSC 52 clipboard response (no prefix, or a
 *   query marker `?` rather than a response). Callers in a discriminator
 *   chain treat this as "next parser please."
 * - `throw ProtocolError` — input HAS the OSC 52 prefix (we committed to
 *   this protocol) but is malformed (e.g., missing terminator). Loud
 *   failure is required by bead 15127 acceptance line 22.
 *
 * Handles both BEL (\x07) and ST (ESC \) terminators.
 */
export function parseClipboardResponse(input: string): string | null {
  return parseClipboardResponseEnvelope(input)?.text ?? null
}
