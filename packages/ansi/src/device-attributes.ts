/** Primary Device Attributes (DA1) response parsing. */

const ESC = String.fromCharCode(27)
const DA1_RESPONSE_RE = new RegExp(`${ESC}\\[\\?([\\d;]+)c`)
export const DA1_QUERY = "\x1b[c"

export interface PrimaryDeviceAttributes {
  readonly params: number[]
}

export interface PrimaryDeviceAttributesMatch {
  readonly result: PrimaryDeviceAttributes
  readonly span: { readonly start: number; readonly end: number }
}

/** Recognize one complete DA1 response and return its exact half-open span. */
export function recognizePrimaryDAResponse(acc: string): PrimaryDeviceAttributesMatch | null {
  const match = DA1_RESPONSE_RE.exec(acc)
  if (!match) return null

  return {
    result: { params: match[1]!.split(";").map((value) => Number.parseInt(value, 10)) },
    span: { start: match.index, end: match.index + match[0].length },
  }
}

/**
 * Compatibility parser for ordinary prefix-consuming probes. Multi-response
 * transactions use {@link recognizePrimaryDAResponse} so unrelated gaps can
 * replay instead of being swallowed with a prefix.
 */
export function parsePrimaryDAResponse(
  acc: string,
): { result: PrimaryDeviceAttributes; consumed: number } | null {
  const recognized = recognizePrimaryDAResponse(acc)
  return recognized ? { result: recognized.result, consumed: recognized.span.end } : null
}
