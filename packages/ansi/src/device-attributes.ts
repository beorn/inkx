/** Primary Device Attributes (DA1) response parsing. */

const ESC = String.fromCharCode(27)
const DA1_RESPONSE_RE = new RegExp(`${ESC}\\[\\?([\\d;]+)c`)

export interface PrimaryDeviceAttributes {
  readonly params: number[]
}

/**
 * Parse a complete DA1 response from an accumulated terminal-input buffer.
 *
 * `consumed` includes any bytes before the response so InputOwner can remove
 * the entire answered transaction from its shared buffer.
 */
export function parsePrimaryDAResponse(
  acc: string,
): { result: PrimaryDeviceAttributes; consumed: number } | null {
  const match = DA1_RESPONSE_RE.exec(acc)
  if (!match) return null

  return {
    result: { params: match[1]!.split(";").map((value) => Number.parseInt(value, 10)) },
    consumed: match.index + match[0].length,
  }
}
