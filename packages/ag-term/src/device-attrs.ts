/**
 * Device Attributes (DA1/DA2/DA3) + XTVERSION Queries
 *
 * Provides functions to query terminal identity and capabilities using
 * the standard VT device attribute escape sequences.
 *
 * Protocols:
 *
 * DA1 (Primary Device Attributes):
 *   Query:    CSI c       (\x1b[c)
 *   Response: CSI ? Ps ; Ps ; ... c
 *
 * DA2 (Secondary Device Attributes):
 *   Query:    CSI > c     (\x1b[>c)
 *   Response: CSI > Pt ; Pv ; Pc c
 *   Where Pt=terminal type, Pv=firmware version, Pc=ROM cartridge id
 *
 * DA3 (Tertiary Device Attributes):
 *   Query:    CSI = c     (\x1b[=c)
 *   Response: DCS ! | hex-encoded-id ST  (\x1bP!|{hex}\x1b\\)
 *
 * XTVERSION (Terminal Name + Version):
 *   Query:    CSI > 0 q   (\x1b[>0q)
 *   Response: DCS > | name(version) ST  (\x1bP>|{text}\x1b\\)
 *
 * Supported by: xterm, Ghostty, Kitty, WezTerm, foot, VTE-based terminals
 */

import {
  DA1_QUERY,
  parsePrimaryDAResponse,
  parseTerminalVersionResponse,
  XTVERSION_QUERY,
} from "@silvery/ansi"

/** Regex for DA2 response: CSI > params c */
const DA2_RESPONSE_RE = /\x1b\[>([\d;]+)c/

/** Regex for DA3 response: DCS ! | hex ST */
const DA3_RESPONSE_RE = /\x1bP!\|([0-9a-fA-F]*)\x1b\\/

// ============================================================================
// DA1 — Primary Device Attributes
// ============================================================================

/**
 * Query primary device attributes (DA1).
 *
 * Returns the list of attribute parameters the terminal reports.
 * Common params: 1=132-cols, 4=sixel, 6=selective-erase, 22=ANSI-color
 *
 * @param write Function to write to stdout
 * @param read Function to read a chunk from stdin
 * @param timeoutMs How long to wait for response (default: 200ms)
 */
export async function queryPrimaryDA(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  timeoutMs = 200,
): Promise<{ params: number[] } | null> {
  write(DA1_QUERY)

  const data = await read(timeoutMs)
  if (data == null) return null

  return parsePrimaryDAResponse(data)?.result ?? null
}

// ============================================================================
// DA2 — Secondary Device Attributes
// ============================================================================

/**
 * Query secondary device attributes (DA2).
 *
 * Returns terminal type, firmware version, and ROM cartridge id.
 * Common type values: 0=VT100, 1=VT220, 41=xterm, 65=VT500
 *
 * @param write Function to write to stdout
 * @param read Function to read a chunk from stdin
 * @param timeoutMs How long to wait for response (default: 200ms)
 */
export async function querySecondaryDA(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  timeoutMs = 200,
): Promise<{ type: number; version: number; id: number } | null> {
  write("\x1b[>c")

  const data = await read(timeoutMs)
  if (data == null) return null

  const match = DA2_RESPONSE_RE.exec(data)
  if (!match) return null

  const parts = match[1]!.split(";")
  if (parts.length < 3) return null

  return {
    type: parseInt(parts[0]!, 10),
    version: parseInt(parts[1]!, 10),
    id: parseInt(parts[2]!, 10),
  }
}

// ============================================================================
// DA3 — Tertiary Device Attributes
// ============================================================================

/**
 * Query tertiary device attributes (DA3).
 *
 * Returns a hex-encoded unit ID string. Decode with Buffer.from(hex, 'hex').
 *
 * @param write Function to write to stdout
 * @param read Function to read a chunk from stdin
 * @param timeoutMs How long to wait for response (default: 200ms)
 */
export async function queryTertiaryDA(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  timeoutMs = 200,
): Promise<string | null> {
  write("\x1b[=c")

  const data = await read(timeoutMs)
  if (data == null) return null

  const match = DA3_RESPONSE_RE.exec(data)
  if (!match) return null

  return match[1]!
}

// ============================================================================
// XTVERSION — Terminal Name + Version
// ============================================================================

/**
 * Query the terminal name and version via XTVERSION.
 *
 * Returns the version string as reported by the terminal, e.g.:
 * - "xterm(388)"
 * - "tmux 3.4"
 * - "WezTerm 20230712-072601-f4abf8fd"
 *
 * @param write Function to write to stdout
 * @param read Function to read a chunk from stdin
 * @param timeoutMs How long to wait for response (default: 200ms)
 */
export async function queryTerminalVersion(
  write: (data: string) => void,
  read: (timeoutMs: number) => Promise<string | null>,
  timeoutMs = 200,
): Promise<string | null> {
  write(XTVERSION_QUERY)

  const data = await read(timeoutMs)
  if (data == null) return null

  return parseTerminalVersionResponse(data)?.result ?? null
}
