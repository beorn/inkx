import { describe, expect, test } from "vitest"
import { DEFAULT_COMPACT_MAX_WIDTH, densityForWidth } from "../src/ui/density.ts"

describe("densityForWidth", () => {
  test("resolves exactly the two density steps around the breakpoint", () => {
    expect(densityForWidth(DEFAULT_COMPACT_MAX_WIDTH)).toBe("compact")
    expect(densityForWidth(DEFAULT_COMPACT_MAX_WIDTH + 1)).toBe("spacious")
    expect(new Set([densityForWidth(1), densityForWidth(200)])).toEqual(
      new Set(["compact", "spacious"]),
    )
  })

  test("honours a caller-supplied breakpoint", () => {
    expect(densityForWidth(40, 50)).toBe("compact")
    expect(densityForWidth(51, 50)).toBe("spacious")
  })

  test("falls back to spacious for non-finite / non-positive widths", () => {
    expect(densityForWidth(0)).toBe("spacious")
    expect(densityForWidth(-5)).toBe("spacious")
    expect(densityForWidth(Number.NaN)).toBe("spacious")
    expect(densityForWidth(Number.POSITIVE_INFINITY)).toBe("spacious")
  })
})
