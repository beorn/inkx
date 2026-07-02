/**
 * Unit test for the island-mode-leak FIRE seam. `collectProtocolModeLeaks` is
 * the pure comparison body extracted from `assertNoIslandModeLeak`
 * (create-app.tsx): given the ACTUAL terminal protocol-mode snapshot and the
 * DESIRED snapshot derived from the focused island subtree, it returns one
 * descriptor string per diverging mode (empty === no leak). Extracting it lets
 * us exercise the fire case for all five modes without standing up a full app +
 * terminal. Sibling to island-aggregator.test.ts (which unit-tests the pure
 * `deriveProtocolModesFromFocusSubtree`).
 */
import { describe, expect, it } from "vitest"
import { collectProtocolModeLeaks, type ProtocolModeSnapshot } from "../src/runtime/create-app"

// A fully-consistent reference state: actual === desired means no leak. Each
// FIRE case flips exactly one mode away from this so the returned descriptor
// set isolates that single mode.
const CLEAN: ProtocolModeSnapshot = {
  altScreen: true,
  bracketedPaste: true,
  kittyKeyboard: 1,
  mouse: true,
  focusReporting: true,
}

// One single-mode divergence per protocol mode. `false` is assignable to every
// mode's value type (boolean, number | false, MouseTrackingMode), so it is a
// valid leak value for all five.
const FIRE_CASES: ReadonlyArray<{ mode: string; override: Partial<ProtocolModeSnapshot> }> = [
  { mode: "altScreen", override: { altScreen: false } },
  { mode: "bracketedPaste", override: { bracketedPaste: false } },
  { mode: "mouse", override: { mouse: false } },
  { mode: "focusReporting", override: { focusReporting: false } },
  { mode: "kittyKeyboard", override: { kittyKeyboard: false } },
]

describe("collectProtocolModeLeaks — island-mode-leak FIRE seam", () => {
  it("clean case (actual === desired) → no leaks", () => {
    expect(collectProtocolModeLeaks(CLEAN, CLEAN)).toEqual([])
  })

  it.each(FIRE_CASES)("detects a leaked $mode", ({ mode, override }) => {
    const actual: ProtocolModeSnapshot = { ...CLEAN, ...override }
    const leaks = collectProtocolModeLeaks(actual, CLEAN)
    expect(leaks).toHaveLength(1)
    // The descriptor leads with the mode name so the thrown message names it.
    expect(leaks.some((l) => l.startsWith(`${mode}=`))).toBe(true)
  })

  it("detects ALL five modes leaking at once", () => {
    const actual: ProtocolModeSnapshot = {
      altScreen: false,
      bracketedPaste: false,
      kittyKeyboard: false,
      mouse: false,
      focusReporting: false,
    }
    const leaks = collectProtocolModeLeaks(actual, CLEAN)
    expect(leaks).toHaveLength(5)
    for (const { mode } of FIRE_CASES) {
      expect(leaks.some((l) => l.startsWith(`${mode}=`))).toBe(true)
    }
  })

  it("preserves the exact descriptor wording assertNoIslandModeLeak throws", () => {
    // Guards the extraction: the descriptor strings must stay byte-identical to
    // the pre-extraction inline pushes, since assertNoIslandModeLeak joins them
    // verbatim into its SILVERY_STRICT error message.
    const actual: ProtocolModeSnapshot = { ...CLEAN, altScreen: false, kittyKeyboard: false }
    expect(collectProtocolModeLeaks(actual, CLEAN)).toEqual([
      "altScreen=false, wanted true",
      "kittyKeyboard=false, wanted 1",
    ])
  })
})
