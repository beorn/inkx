/**
 * DECRPM response decoder tests (15127 GAP 8).
 *
 * Covers the standalone, side-effect-free decoder for DECRPM responses
 * (CSI ? {mode} ; {Ps} $ y) — including the focused `decodeSyncUpdateResponse`
 * helper for DEC private mode 2026 (Synchronized Update).
 *
 * The decoder is "optional": it must recognize a well-formed echoed state if
 * the terminal sends one, and return `null` (without throwing) for any input
 * that doesn't match — terminals that never echo sync state are valid and
 * common, so silent passthrough is the contract.
 */
import { describe, expect, test } from "vitest"
import {
  decodeDecrpmResponse,
  decodeSyncUpdateResponse,
  DecMode,
} from "../packages/ag-term/src/mode-query"

const ESC = "\x1b"
const CSI = `${ESC}[`

/** Build a synthetic DECRPM response: CSI ? mode ; Ps $ y */
function decrpm(mode: number, ps: number): string {
  return `${CSI}?${mode};${ps}$y`
}

describe("decodeDecrpmResponse", () => {
  test("recognizes Ps=1 → set", () => {
    const r = decodeDecrpmResponse(decrpm(2026, 1))
    expect(r).toEqual({ mode: 2026, state: "set" })
  })

  test("recognizes Ps=2 → reset", () => {
    const r = decodeDecrpmResponse(decrpm(2026, 2))
    expect(r).toEqual({ mode: 2026, state: "reset" })
  })

  test("recognizes Ps=3 → set (permanently set)", () => {
    const r = decodeDecrpmResponse(decrpm(2026, 3))
    expect(r).toEqual({ mode: 2026, state: "set" })
  })

  test("recognizes Ps=4 → reset (permanently reset)", () => {
    const r = decodeDecrpmResponse(decrpm(2026, 4))
    expect(r).toEqual({ mode: 2026, state: "reset" })
  })

  test("recognizes Ps=0 → unknown (mode not recognized)", () => {
    const r = decodeDecrpmResponse(decrpm(2026, 0))
    expect(r).toEqual({ mode: 2026, state: "unknown" })
  })

  test("returns null for empty input", () => {
    expect(decodeDecrpmResponse("")).toBeNull()
  })

  test("returns null for unrelated ANSI noise", () => {
    expect(decodeDecrpmResponse(`${CSI}H${CSI}2J`)).toBeNull()
    expect(decodeDecrpmResponse("hello world")).toBeNull()
  })

  test("returns null for malformed DECRPM (missing final $y)", () => {
    expect(decodeDecrpmResponse(`${CSI}?2026;1`)).toBeNull()
  })

  test("returns null for malformed DECRPM (missing ?)", () => {
    expect(decodeDecrpmResponse(`${CSI}2026;1$y`)).toBeNull()
  })

  test("returns null for non-numeric Ps", () => {
    expect(decodeDecrpmResponse(`${CSI}?2026;X$y`)).toBeNull()
  })

  test("locates DECRPM embedded in a larger chunk", () => {
    // Terminals may flush other bytes alongside the echo
    const noise = `${ESC}]11;rgb:1a1a/1a1a/1a1a${ESC}\\`
    const r = decodeDecrpmResponse(`${noise}${decrpm(2026, 1)}`)
    expect(r).toEqual({ mode: 2026, state: "set" })
  })

  test("filters by expectedMode when provided", () => {
    // Response for a different mode → null
    expect(decodeDecrpmResponse(decrpm(2004, 1), 2026)).toBeNull()
    // Response for the expected mode → decoded
    expect(decodeDecrpmResponse(decrpm(2026, 1), 2026)).toEqual({
      mode: 2026,
      state: "set",
    })
  })

  test("decodes Ps=5..9 as unknown (unspecified by spec)", () => {
    const r = decodeDecrpmResponse(decrpm(2026, 5))
    expect(r).toEqual({ mode: 2026, state: "unknown" })
  })
})

describe("decodeSyncUpdateResponse", () => {
  test("recognizes set echo for SYNC_OUTPUT (mode 2026)", () => {
    expect(decodeSyncUpdateResponse(decrpm(2026, 1))).toBe("set")
    expect(decodeSyncUpdateResponse(decrpm(2026, 3))).toBe("set")
  })

  test("recognizes reset echo for SYNC_OUTPUT (mode 2026)", () => {
    expect(decodeSyncUpdateResponse(decrpm(2026, 2))).toBe("reset")
    expect(decodeSyncUpdateResponse(decrpm(2026, 4))).toBe("reset")
  })

  test("returns null when terminal does not echo sync state", () => {
    // The "no echo" path — must not crash, must not invent a state
    expect(decodeSyncUpdateResponse("")).toBeNull()
    expect(decodeSyncUpdateResponse("garbage")).toBeNull()
  })

  test("returns null for DECRPM echo of a different mode", () => {
    // A response for bracketed-paste (2004) must not be mistaken for sync
    expect(decodeSyncUpdateResponse(decrpm(2004, 1))).toBeNull()
    expect(decodeSyncUpdateResponse(decrpm(DecMode.BRACKETED_PASTE, 1))).toBeNull()
  })

  test("returns null for unknown Ps", () => {
    // Ps=0 means terminal doesn't know mode 2026 — caller can't use that as set/reset
    expect(decodeSyncUpdateResponse(decrpm(2026, 0))).toBeNull()
  })

  test("survives interleaved bytes without throwing", () => {
    const prefix = `${ESC}]10;rgb:ff/ff/ff${ESC}\\`
    const suffix = `${CSI}H`
    expect(decodeSyncUpdateResponse(`${prefix}${decrpm(2026, 1)}${suffix}`)).toBe("set")
  })
})
