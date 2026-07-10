/**
 * SGR color-code emission — every legal Color-space citizen must emit valid SGR.
 *
 * The D3 index-preserving refactor (21016) narrowed the numeric branch of
 * fgColorCode/bgColorCode to palette slots 0–255 and sent everything else to
 * the truecolor object branch. But ag-term's ANSI parser (unicode.ts) has a
 * third numeric form: PACKED truecolor — `0x1000000 | (r<<16) | (g<<8) | b` —
 * which flows into styleToAnsiCodes via fixSgrAcrossWrappedLines when wrapped
 * text carries inline truecolor SGR. Reading `.r`/`.g`/`.b` off that number
 * leaked literal `38;2;undefined;undefined;undefined` into pane bytes
 * (regression caught by hab-attach-pane's ENOENT rendering test).
 *
 * Contract pinned here:
 * - 0–7           → 4-bit (`30+N` / `40+N`)
 * - 8–255         → indexed (`38;5;N` / `48;5;N`)
 * - bit-24 packed → truecolor (`38;2;R;G;B` / `48;2;R;G;B`), unpacked
 * - {r,g,b}       → truecolor
 * - {r,g,b,index} → indexed (provenance wins — the D3 contract)
 * - other numbers → throw (fail loud; they only ever emitted garbage SGR)
 */
import { describe, expect, it } from "vitest"
import { bgColorCode, fgColorCode } from "../src/sgr-codes"

const PACKED_MARKER = 0x1000000

function pack(r: number, g: number, b: number): number {
  return PACKED_MARKER | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)
}

describe("fgColorCode / bgColorCode — numeric forms", () => {
  it("emits 4-bit codes for basic slots 0–7", () => {
    expect(fgColorCode(1)).toBe("31")
    expect(bgColorCode(4)).toBe("44")
  })

  it("emits indexed SGR for slots 8–255", () => {
    expect(fgColorCode(196)).toBe("38;5;196")
    expect(bgColorCode(21)).toBe("48;5;21")
  })

  it("unpacks bit-24 packed truecolor numbers to 38;2/48;2 (the wrapped-inline-SGR path)", () => {
    // 0x1BF60EA — the literal packed value from the hab-attach-pane regression.
    expect(fgColorCode(pack(0xbf, 0x60, 0xea))).toBe("38;2;191;96;234")
    expect(bgColorCode(pack(0x00, 0xff, 0x01))).toBe("48;2;0;255;1")
    // No `undefined` may ever reach the byte stream.
    expect(fgColorCode(29319530)).not.toContain("undefined")
  })

  it("throws loudly on numbers that are neither palette slots nor packed truecolor", () => {
    expect(() => fgColorCode(-1)).toThrow(/palette|packed/i)
    expect(() => fgColorCode(256)).toThrow(/palette|packed/i)
    expect(() => bgColorCode(Number.NaN)).toThrow(/palette|packed/i)
  })
})

describe("fgColorCode / bgColorCode — object forms (D3 identity contract)", () => {
  it("emits truecolor for palette-less RGB", () => {
    expect(fgColorCode({ r: 10, g: 20, b: 30 })).toBe("38;2;10;20;30")
  })

  it("honors palette provenance ahead of baked r/g/b", () => {
    expect(fgColorCode({ r: 255, g: 0, b: 0, index: 196 })).toBe("38;5;196")
    expect(bgColorCode({ r: 0, g: 0, b: 0, index: 2 })).toBe("42")
  })
})
