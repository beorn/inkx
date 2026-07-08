/**
 * Layout-phase STRICT invariants: slug-system migration (audit packet #5).
 *
 * The three layout-phase STRICT invariants used to read `process.env.SILVERY_STRICT`
 * directly and gate `throw` on `strict === "2"` (exact string match). Under any
 * compound tier spec — `SILVERY_STRICT=incremental,2`, `=2,3`, `=1,2` — the exact
 * match failed, so a real layout violation silently downgraded to warn-only and
 * stopped failing tests exactly when a paranoid compound spec was in use. They were
 * also not disable-able via `!slug`.
 *
 * After migration each check routes through `isStrictEnabled(slug, minTier)`:
 *   - `layout-overflow`   (minTier 2) — strictLayoutOverflowCheck
 *   - `scroll-invariants` (minTier 2) — strictScrollInvariants
 *   - `layout-flag`       (minTier 1) — the layoutChangedThisFrame consistency check
 *
 * This file drives the exported `strictLayoutOverflowCheck` (the other two are
 * internal) through a realistic-scale fixture and asserts the compound-tier bug
 * is fixed AND per-check disable works — without changing default tier-1/tier-2
 * behavior.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest"
import { strictLayoutOverflowCheck } from "@silvery/ag-term/pipeline/layout-phase"
import { resetStrictCache } from "@silvery/ag-term/strict-mode"
import type { AgNode, Rect } from "@silvery/ag/types"
import { INITIAL_EPOCH } from "@silvery/ag/epoch"

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height }
}

/** Minimal laid-out AgNode (boxRect populated; no layout engine required). */
function boxNode(
  props: Record<string, unknown>,
  boxRect: Rect | null,
  children: AgNode[] = [],
): AgNode {
  const n = {
    type: "silvery-box",
    props,
    children,
    parent: null,
    layoutNode: null,
    boxRect,
    scrollRect: null,
    screenRect: null,
    prevLayout: null,
    prevScrollRect: null,
    prevScreenRect: null,
    layoutChangedThisFrame: INITIAL_EPOCH,
    dirtyBits: 0,
    dirtyEpoch: INITIAL_EPOCH,
  } as unknown as AgNode
  for (const c of children) (c as unknown as { parent: AgNode }).parent = n
  return n
}

/**
 * Realistic-scale fixture: a column of `rowCount` rows (each width 80, holding
 * one leaf). Every leaf fits its row EXCEPT the leaf at `overflowRowIndex`, which
 * is width 100 inside a width-80 row — the single overflow strictLayoutOverflowCheck
 * must flag. Pass `overflowRowIndex = -1` for a clean tree (no violation).
 *
 * rowCount 55 → 55 rows + 55 leaves + 1 root = 111 nodes (>> the 50-node floor).
 */
function buildOverflowTree(overflowRowIndex = 5, rowCount = 55): AgNode {
  const ROOT_W = 80
  const rows: AgNode[] = []
  for (let i = 0; i < rowCount; i++) {
    const leafWidth = i === overflowRowIndex ? 100 : 60
    const leaf = boxNode({ id: `leaf-${i}` }, rect(0, i, leafWidth, 1))
    const row = boxNode({ id: `row-${i}` }, rect(0, i, ROOT_W, 1), [leaf])
    rows.push(row)
  }
  return boxNode({ id: "root" }, rect(0, 0, ROOT_W, rowCount), rows)
}

describe("layout-phase STRICT invariants — slug-system migration (packet #5)", () => {
  let saved: string | undefined
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    saved = process.env.SILVERY_STRICT
    // The tier-1 path warns via console.warn on violation; silence it so the
    // suite's console stays clean and any console gate doesn't trip.
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    resetStrictCache()
  })

  afterEach(() => {
    warnSpy.mockRestore()
    if (saved === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = saved
    resetStrictCache()
  })

  function withStrict(value: string | undefined, fn: () => void): void {
    if (value === undefined) delete process.env.SILVERY_STRICT
    else process.env.SILVERY_STRICT = value
    resetStrictCache()
    fn()
  }

  test("regression-safety: plain SILVERY_STRICT=2 still throws on overflow", () => {
    const root = buildOverflowTree()
    withStrict("2", () => {
      expect(() => strictLayoutOverflowCheck(root)).toThrow(/Layout overflow/)
    })
  })

  test("compound-tier bug fixed: SILVERY_STRICT=incremental,2 throws on overflow", () => {
    const root = buildOverflowTree()
    // RED on pre-migration code: strict === "incremental,2" !== "2" → warn-only,
    // no throw, so this assertion fails.
    // GREEN after migration: isStrictEnabled("layout-overflow", 2) is true → throws.
    withStrict("incremental,2", () => {
      expect(() => strictLayoutOverflowCheck(root)).toThrow(/Layout overflow/)
    })
  })

  test("compound-tier bug fixed: SILVERY_STRICT=1,2 throws on overflow", () => {
    const root = buildOverflowTree()
    withStrict("1,2", () => {
      expect(() => strictLayoutOverflowCheck(root)).toThrow(/Layout overflow/)
    })
  })

  test("composability: SILVERY_STRICT=2,!layout-overflow does NOT throw", () => {
    const root = buildOverflowTree()
    withStrict("2,!layout-overflow", () => {
      expect(() => strictLayoutOverflowCheck(root)).not.toThrow()
    })
    // Disabled entirely — not even a warn.
    expect(warnSpy).not.toHaveBeenCalled()
  })

  test("isolate: SILVERY_STRICT=layout-overflow throws on overflow (fatal isolate)", () => {
    const root = buildOverflowTree()
    withStrict("layout-overflow", () => {
      expect(() => strictLayoutOverflowCheck(root)).toThrow(/Layout overflow/)
    })
  })

  test("tier-1 behavior preserved: SILVERY_STRICT=1 warns, does not throw", () => {
    const root = buildOverflowTree()
    withStrict("1", () => {
      expect(() => strictLayoutOverflowCheck(root)).not.toThrow()
    })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/Layout overflow/))
  })

  test("no false positive: a clean tree does not throw at tier 2", () => {
    const root = buildOverflowTree(-1)
    withStrict("2", () => {
      expect(() => strictLayoutOverflowCheck(root)).not.toThrow()
    })
    expect(warnSpy).not.toHaveBeenCalled()
  })

  test("off: unset SILVERY_STRICT is a no-op (no throw, no warn)", () => {
    const root = buildOverflowTree()
    withStrict(undefined, () => {
      expect(() => strictLayoutOverflowCheck(root)).not.toThrow()
    })
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
