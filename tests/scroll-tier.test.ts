/**
 * Table-driven tests for the scroll tier planner.
 *
 * planScrollRender() is a pure function that decides which tier strategy
 * a scroll container uses for each frame. These tests verify the decision
 * logic in isolation (no DOM, no buffer, no rendering).
 */

import { describe, test, expect } from "vitest"
import { planScrollRender } from "@silvery/ag-term/pipeline/render-phase"
import type { ScrollPlanInputs, ScrollPlan } from "@silvery/ag-term/pipeline/render-phase"

/** All-false inputs (fresh render, nothing changed). */
function defaults(): ScrollPlanInputs {
  return {
    scrollOffsetChanged: false,
    visibleRangeChanged: false,
    descendantDirty: false,
    hasStickyChildren: false,
    childrenNeedFreshRender: false,
    childrenDirty: false,
    hasPrevBuffer: false,
    ancestorCleared: false,
    contentRegionCleared: false,
    scrollBg: null,
  }
}

describe("scroll tier planner — tier selection", () => {
  test.each<{ name: string; overrides: Partial<ScrollPlanInputs>; expected: ScrollPlan["tier"] }>([
    // Tier 1: shift
    {
      name: "scroll only, no sticky -> shift",
      overrides: { hasPrevBuffer: true, scrollOffsetChanged: true },
      expected: "shift",
    },

    // Tier 2: clear
    {
      name: "scroll with sticky -> clear",
      overrides: { hasPrevBuffer: true, scrollOffsetChanged: true, hasStickyChildren: true },
      expected: "clear",
    },
    {
      name: "childrenDirty -> clear",
      overrides: { hasPrevBuffer: true, childrenDirty: true },
      expected: "clear",
    },
    {
      name: "childrenNeedFreshRender -> clear",
      overrides: { hasPrevBuffer: true, childrenNeedFreshRender: true },
      expected: "clear",
    },
    {
      name: "visibleRangeChanged -> clear",
      overrides: { hasPrevBuffer: true, visibleRangeChanged: true },
      expected: "clear",
    },
    {
      name: "scroll + childrenDirty -> clear (not shift)",
      overrides: { hasPrevBuffer: true, scrollOffsetChanged: true, childrenDirty: true },
      expected: "clear",
    },
    {
      name: "scroll + visibleRangeChanged -> shift when children are stable",
      overrides: { hasPrevBuffer: true, scrollOffsetChanged: true, visibleRangeChanged: true },
      expected: "shift",
    },
    {
      name: "scroll + descendantDirty -> clear",
      overrides: { hasPrevBuffer: true, scrollOffsetChanged: true, descendantDirty: true },
      expected: "clear",
    },
    {
      name: "scroll + visibleRangeChanged + descendantDirty -> clear",
      overrides: {
        hasPrevBuffer: true,
        scrollOffsetChanged: true,
        visibleRangeChanged: true,
        descendantDirty: true,
      },
      expected: "clear",
    },

    // Tier 3: subtree-only
    {
      name: "fresh render (no prev buffer) -> subtree-only",
      overrides: {},
      expected: "subtree-only",
    },
    {
      name: "only subtreeDirty (nothing else) -> subtree-only",
      overrides: { hasPrevBuffer: true },
      expected: "subtree-only",
    },
    {
      name: "descendantDirty without scroll -> subtree-only",
      overrides: { hasPrevBuffer: true, descendantDirty: true },
      expected: "subtree-only",
    },
    {
      name: "no prev buffer, scroll changed -> subtree-only (no prev = no shift/clear)",
      overrides: { scrollOffsetChanged: true },
      expected: "subtree-only",
    },
  ])("$name", ({ overrides, expected }) => {
    const plan = planScrollRender({ ...defaults(), ...overrides })
    expect(plan.tier).toBe(expected)
  })
})

describe("scroll tier planner — stickyForceRefresh", () => {
  test("subtree-only with sticky -> stickyForceRefresh", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      hasStickyChildren: true,
    })
    expect(plan.tier).toBe("subtree-only")
    expect(plan.stickyForceRefresh).toBe(true)
  })

  test("shift tier -> no stickyForceRefresh (sticky forces clear instead)", () => {
    // With sticky children, shift is blocked -> tier becomes clear
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      scrollOffsetChanged: true,
      hasStickyChildren: true,
    })
    expect(plan.tier).toBe("clear")
    expect(plan.stickyForceRefresh).toBe(false)
  })

  test("clear tier with sticky -> no stickyForceRefresh (clear handles it)", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      childrenDirty: true,
      hasStickyChildren: true,
    })
    expect(plan.tier).toBe("clear")
    expect(plan.stickyForceRefresh).toBe(false)
  })

  test("no sticky children -> no stickyForceRefresh", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
    })
    expect(plan.tier).toBe("subtree-only")
    expect(plan.stickyForceRefresh).toBe(false)
  })

  test("no prev buffer with sticky -> no stickyForceRefresh (fresh render)", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasStickyChildren: true,
    })
    expect(plan.stickyForceRefresh).toBe(false)
  })
})

describe("scroll tier planner — child propagation", () => {
  test("shift tier -> childHasPrev preserves hasPrevBuffer", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      scrollOffsetChanged: true,
    })
    expect(plan.childHasPrev).toBe(true)
  })

  test("clear tier -> childHasPrev is false", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      childrenDirty: true,
    })
    expect(plan.childHasPrev).toBe(false)
  })

  test("clear tier -> childAncestorCleared is true", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      childrenDirty: true,
    })
    expect(plan.childAncestorCleared).toBe(true)
  })

  test("subtree-only -> childHasPrev preserves hasPrevBuffer", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
    })
    expect(plan.childHasPrev).toBe(true)
  })

  test("subtree-only with ancestorCleared -> childAncestorCleared propagates", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      ancestorCleared: true,
    })
    expect(plan.childAncestorCleared).toBe(true)
  })

  test("subtree-only with contentRegionCleared -> childAncestorCleared propagates", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      contentRegionCleared: true,
    })
    expect(plan.childAncestorCleared).toBe(true)
  })
})

describe("scroll tier planner — clearBg", () => {
  test("shift tier passes scrollBg as clearBg", () => {
    const bg = { r: 0, g: 128, b: 255 }
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      scrollOffsetChanged: true,
      scrollBg: bg,
    })
    expect(plan.clearBg).toBe(bg)
  })

  test("clear tier passes scrollBg as clearBg", () => {
    const bg = { r: 0, g: 128, b: 255 }
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      childrenDirty: true,
      scrollBg: bg,
    })
    expect(plan.clearBg).toBe(bg)
  })

  test("subtree-only tier has null clearBg", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
    })
    expect(plan.clearBg).toBeNull()
  })
})

describe("scroll tier planner — reasons", () => {
  test("shift includes SHIFT reason", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      scrollOffsetChanged: true,
    })
    expect(plan.reasons).toContain("SHIFT")
  })

  test("clear with childrenDirty includes childrenDirty reason", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      childrenDirty: true,
    })
    expect(plan.reasons).toContain("childrenDirty")
  })

  test("stickyForceRefresh includes reason", () => {
    const plan = planScrollRender({
      ...defaults(),
      hasPrevBuffer: true,
      hasStickyChildren: true,
    })
    expect(plan.reasons).toContain("stickyForceRefresh")
  })
})

// ---------------------------------------------------------------------------
// Exhaustive enumeration (km 20835 slice 1, cascade-predicates pattern).
//
// All 2^10 boolean-input combinations × {null, set} scrollBg = 2,048 cases,
// asserted against a RESTATED reference model. The restatement below is the
// human-auditable spec of the tier decision; any divergence between it and
// planScrollRender is the alarm (either the impl regressed or the spec moved
// — both demand a deliberate commit updating BOTH sides).
// ---------------------------------------------------------------------------

describe("scroll tier planner — exhaustive table (2^10 × scrollBg)", () => {
  const BOOL_KEYS = [
    "scrollOffsetChanged",
    "visibleRangeChanged",
    "descendantDirty",
    "hasStickyChildren",
    "childrenNeedFreshRender",
    "childrenDirty",
    "hasPrevBuffer",
    "ancestorCleared",
    "contentRegionCleared",
    "hasOverlappingAbsoluteSibling",
  ] as const

  /** The restated decision spec (mirror of the documented three-tier strategy). */
  function referenceModel(i: ScrollPlanInputs): Omit<ScrollPlan, "reasons"> {
    const shift =
      i.hasPrevBuffer &&
      i.scrollOffsetChanged &&
      !i.descendantDirty &&
      !i.childrenDirty &&
      !i.childrenNeedFreshRender &&
      !i.hasStickyChildren &&
      !(i.hasOverlappingAbsoluteSibling ?? false)
    const clear =
      i.hasPrevBuffer &&
      !shift &&
      (i.scrollOffsetChanged ||
        i.childrenDirty ||
        i.childrenNeedFreshRender ||
        i.visibleRangeChanged)
    const tier = shift ? "shift" : clear ? "clear" : "subtree-only"
    return {
      tier,
      clearBg: shift || clear ? i.scrollBg : null,
      childHasPrev: clear ? false : i.hasPrevBuffer,
      childAncestorCleared: clear ? true : i.ancestorCleared || i.contentRegionCleared,
      stickyForceRefresh: i.hasStickyChildren && i.hasPrevBuffer && !clear,
    }
  }

  test("all 2,048 combinations match the restated spec and are deterministic", () => {
    let checked = 0
    for (let mask = 0; mask < 1 << BOOL_KEYS.length; mask++) {
      // Buffer-level Color is `number | {r,g,b} | null` (buffer.ts) — a
      // RESOLVED cell color, never a hex string (the km 20835 integrate
      // bounce: '#123456' fails the clean-root typecheck).
      for (const scrollBg of [null, { r: 0x12, g: 0x34, b: 0x56 }] as const) {
        const inputs = defaults()
        inputs.scrollBg = scrollBg
        BOOL_KEYS.forEach((key, bit) => {
          inputs[key] = (mask & (1 << bit)) !== 0
        })
        const expected = referenceModel(inputs)
        const actual = planScrollRender(inputs)
        const actualCore = {
          tier: actual.tier,
          clearBg: actual.clearBg,
          childHasPrev: actual.childHasPrev,
          childAncestorCleared: actual.childAncestorCleared,
          stickyForceRefresh: actual.stickyForceRefresh,
        }
        expect(actualCore, `mask=${mask} scrollBg=${JSON.stringify(scrollBg)}`).toEqual(expected)
        // Reasons invariants: SHIFT marker ⟺ shift tier; sticky marker ⟺ flag.
        expect(actual.reasons.includes("SHIFT"), `SHIFT reason mask=${mask}`).toBe(
          expected.tier === "shift",
        )
        expect(actual.reasons.includes("stickyForceRefresh"), `sticky reason mask=${mask}`).toBe(
          expected.stickyForceRefresh,
        )
        // Determinism: a second call with identical inputs is deep-equal.
        expect(planScrollRender(inputs)).toEqual(actual)
        checked++
      }
    }
    expect(checked).toBe(2048)
  })
})
