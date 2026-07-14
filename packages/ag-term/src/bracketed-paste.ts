/**
 * Bracketed Paste Mode
 *
 * Enables bracketed paste so the terminal wraps pasted text with markers.
 * This lets the app distinguish pasted text from typed input and receive
 * it as a single event rather than individual keystrokes.
 *
 * Protocol: DEC private mode 2004
 * - Enable:  CSI ? 2004 h
 * - Disable: CSI ? 2004 l
 * - Paste start marker: CSI 200 ~
 * - Paste end marker:   CSI 201 ~
 *
 * Supported by: Ghostty, Kitty, WezTerm, iTerm2, Alacritty, xterm, tmux, foot
 */

import { ProtocolError } from "@silvery/ansi"

// ============================================================================
// Constants
// ============================================================================

/** Escape sequence that marks the beginning of pasted text */
export const PASTE_START = "\x1b[200~"

/** Escape sequence that marks the end of pasted text */
export const PASTE_END = "\x1b[201~"

// ============================================================================
// Protocol Control
// ============================================================================

/**
 * Enable bracketed paste mode.
 * Writes CSI ? 2004 h to the output stream.
 */
export function enableBracketedPaste(stdout: NodeJS.WriteStream): void {
  stdout.write("\x1b[?2004h")
}

/**
 * Disable bracketed paste mode.
 * Writes CSI ? 2004 l to the output stream.
 */
export function disableBracketedPaste(stdout: NodeJS.WriteStream): void {
  stdout.write("\x1b[?2004l")
}

// ============================================================================
// Parsing
// ============================================================================

/** Result of parsing a bracketed paste sequence */
export interface BracketedPasteResult {
  type: "paste"
  content: string
}

/** @internal Parsed protocol envelope with its exact consumed byte span. */
export interface BracketedPasteEnvelope {
  result: BracketedPasteResult
  start: number
  end: number
}

/** @internal Use when a stream owner must preserve bytes around the paste. */
export function parseBracketedPasteEnvelope(input: string): BracketedPasteEnvelope | null {
  const startIdx = input.indexOf(PASTE_START)
  if (startIdx === -1) return null

  const contentStart = startIdx + PASTE_START.length
  const endIdx = input.indexOf(PASTE_END, contentStart)
  if (endIdx === -1) {
    // PASTE_START found but no PASTE_END — protocol violation OR mid-stream
    // split. Throwing surfaces it; the dispatch boundary may catch and buffer.
    throw new ProtocolError({
      parser: "parseBracketedPaste",
      input,
      reason: "PASTE_START present but no PASTE_END terminator in chunk",
    })
  }

  return {
    result: {
      type: "paste",
      content: input.slice(contentStart, endIdx),
    },
    start: startIdx,
    end: endIdx + PASTE_END.length,
  }
}

/**
 * Detect and extract bracketed paste content from raw terminal input.
 *
 * Return semantics (see {@link ProtocolError} for the full contract):
 * - `null` — input contains no PASTE_START marker (this is not bracketed
 *   paste input). Discriminator-chain "next parser please" signal.
 * - `throw ProtocolError` — input HAS PASTE_START (we committed to
 *   bracketed paste) but no PASTE_END follows. This indicates either a
 *   stream-split paste (caller should buffer and retry on the next chunk)
 *   or a protocol violation. Loud failure surfaces the gap; the dispatch
 *   layer catches and decides whether to buffer or log.
 */
export function parseBracketedPaste(input: string): BracketedPasteResult | null {
  return parseBracketedPasteEnvelope(input)?.result ?? null
}

// ============================================================================
// Paste Event
// ============================================================================

/**
 * Structured paste event with source tracking and optional rich data.
 *
 * Fired when text is pasted into the application, either from the system
 * clipboard (via bracketed paste) or from the internal clipboard store.
 */
export interface PasteEvent {
  /** The pasted plain text */
  text: string
  /** Where the paste came from */
  source: "bracketed" | "internal"
  /** Rich clipboard data, if available (internal paste only) */
  structured?: import("./clipboard").ClipboardData
}

/**
 * Create a PasteEvent from a bracketed paste result.
 */
export function createBracketedPasteEvent(result: BracketedPasteResult): PasteEvent {
  return {
    text: result.content,
    source: "bracketed",
  }
}

/**
 * Create a PasteEvent from internal clipboard data.
 */
export function createInternalPasteEvent(data: import("./clipboard").ClipboardData): PasteEvent {
  return {
    text: data.text,
    source: "internal",
    structured: data,
  }
}
