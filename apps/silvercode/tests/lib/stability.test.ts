/**
 * Self-tests for the stability helper. Bead:
 * `@km/silvercode/post-resize-ui-stability`.
 */

import { describe, expect, test } from "vitest"
import { dropBlankFrames, expectStableLayouts, layoutFingerprint } from "./stability.ts"

describe("stability helper", () => {
  test("layoutFingerprint normalises trailing whitespace per line and trailing blank lines", () => {
    expect(layoutFingerprint("foo  \nbar  \n\n")).toBe("foo\nbar")
    expect(layoutFingerprint("")).toBe("")
    expect(layoutFingerprint(undefined)).toBe("")
    expect(layoutFingerprint(null)).toBe("")
  })

  test("dropBlankFrames keeps only content-bearing fingerprints", () => {
    expect(dropBlankFrames(["", "  \n   ", "hello", "", "world"])).toEqual(["hello", "world"])
  })

  test("expectStableLayouts passes with one settled fingerprint", () => {
    expect(() => expectStableLayouts(["A", "A", "A"], { label: "single-stable", kMax: 1 })).not.toThrow()
  })

  test("expectStableLayouts passes with one transient + one settled (kMax=2)", () => {
    expect(() => expectStableLayouts(["A", "B", "B"], { label: "transient+settled", kMax: 2 })).not.toThrow()
  })

  test("expectStableLayouts fails when distinct count exceeds kMax", () => {
    expect(() => expectStableLayouts(["A", "B", "C"], { label: "shuffle", kMax: 2 })).toThrow(
      /expected ≤ 2 distinct stable layouts, observed 3/u,
    )
  })

  test("expectStableLayouts surfaces the offending layouts in the failure message", () => {
    let message = ""
    try {
      expectStableLayouts(["alpha", "beta", "gamma"], { label: "shuffle", kMax: 1 })
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toContain("layout #1")
    expect(message).toContain("layout #2")
    expect(message).toContain("alpha")
    expect(message).toContain("beta")
  })

  test("expectStableLayouts fails with a clear error when nothing was captured", () => {
    expect(() => expectStableLayouts([], { label: "empty", kMax: 1 })).toThrow(/no content-bearing frames captured/u)
  })

  test("expectStableLayouts surfaces a degenerate frame even when kMax is satisfied", () => {
    const expectNotDegenerate = (frame: string): string | null => (frame.includes("BANNER") ? null : "missing banner")
    expect(() =>
      expectStableLayouts(["BANNER ok", "BANNER ok"], { label: "ok", kMax: 2, expectNotDegenerate }),
    ).not.toThrow()
    expect(() =>
      expectStableLayouts(["empty box", "empty box"], {
        label: "degenerate",
        kMax: 2,
        expectNotDegenerate,
      }),
    ).toThrow(/is degenerate: missing banner/u)
  })
})
