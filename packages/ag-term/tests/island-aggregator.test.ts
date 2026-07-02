import { describe, expect, it } from "vitest"
import type { AgNode } from "@silvery/ag/types"
import type { IslandProtocolModes } from "@silvery/ag/island-types"
import { deriveProtocolModesFromFocusSubtree } from "../src/runtime/island-aggregator"

// ---------------------------------------------------------------------------
// Fixtures — build a focus-to-root AgNode chain by linking `parent`. The
// aggregator only ever reads `node.type`, `node.parent`, and
// `node.islandState?.handle?.modes.modes`, so these minimal casts are safe.
// ---------------------------------------------------------------------------

function box(parent: AgNode | null): AgNode {
  return { type: "box", parent } as unknown as AgNode
}

function islandWithModes(modes: IslandProtocolModes, parent: AgNode | null): AgNode {
  return {
    type: "silvery-island",
    parent,
    islandState: { handle: { modes: { modes, subscribe: () => () => {} } } },
  } as unknown as AgNode
}

/** An island whose guest handle has not resolved yet (deferred hydrate). */
function islandNullHandle(parent: AgNode | null): AgNode {
  return { type: "silvery-island", parent, islandState: { handle: null } } as unknown as AgNode
}

/** An island whose handle exposes no modes owner (capabilities.modes = false). */
function islandNoModesOwner(parent: AgNode | null): AgNode {
  return { type: "silvery-island", parent, islandState: { handle: {} } } as unknown as AgNode
}

describe("deriveProtocolModesFromFocusSubtree", () => {
  it("returns an empty object for a null focus", () => {
    expect(deriveProtocolModesFromFocusSubtree(null)).toEqual({})
  })

  it("returns an empty object when no ancestor is an island", () => {
    const root = box(null)
    const leaf = box(root)
    expect(deriveProtocolModesFromFocusSubtree(leaf)).toEqual({})
  })

  it("reads modes from a single ancestor island", () => {
    const island = islandWithModes({ altScreen: true, focusReporting: true }, null)
    const leaf = box(island)
    expect(deriveProtocolModesFromFocusSubtree(leaf)).toEqual({
      altScreen: true,
      focusReporting: true,
    })
  })

  it("OR-merges boolean modes across the ancestor chain", () => {
    const root = islandWithModes({ bracketedPaste: true, kittyKeyboard: true }, null)
    const mid = box(root)
    const inner = islandWithModes({ altScreen: true }, mid)
    const leaf = box(inner)
    expect(deriveProtocolModesFromFocusSubtree(leaf)).toEqual({
      altScreen: true,
      bracketedPaste: true,
      kittyKeyboard: true,
    })
  })

  it("resolves mouse tracking by precedence (highest granularity wins)", () => {
    const root = islandWithModes({ mouseTracking: "any" }, null)
    const inner = islandWithModes({ mouseTracking: "click" }, root)
    const leaf = box(inner)
    // inner sets "click" first, root upgrades to "any" (precedence any > click).
    expect(deriveProtocolModesFromFocusSubtree(leaf).mouseTracking).toBe("any")
  })

  it("keeps the higher-granularity mouse mode regardless of chain order", () => {
    const root = islandWithModes({ mouseTracking: "click" }, null)
    const inner = islandWithModes({ mouseTracking: "any" }, root)
    const leaf = box(inner)
    expect(deriveProtocolModesFromFocusSubtree(leaf).mouseTracking).toBe("any")
  })

  it("gives cursor to the deepest (first-seen) island — first-island-wins", () => {
    const root = islandWithModes({ cursor: { shape: "block", visible: true } }, null)
    const inner = islandWithModes({ cursor: { shape: "bar", visible: true } }, root)
    const leaf = box(inner)
    expect(deriveProtocolModesFromFocusSubtree(leaf).cursor).toEqual({
      shape: "bar",
      visible: true,
    })
  })

  it("walks upward only — sibling islands do not contribute", () => {
    const root = box(null)
    // A sibling island under the same parent that is NOT on the focus chain.
    islandWithModes({ altScreen: true }, root)
    const focusIsland = islandWithModes({ bracketedPaste: true }, root)
    const leaf = box(focusIsland)
    const result = deriveProtocolModesFromFocusSubtree(leaf)
    expect(result).toEqual({ bracketedPaste: true })
    expect(result.altScreen).toBeUndefined()
  })

  it("skips islands whose handle has not resolved", () => {
    const root = islandWithModes({ altScreen: true }, null)
    const pending = islandNullHandle(root)
    const leaf = box(pending)
    expect(deriveProtocolModesFromFocusSubtree(leaf)).toEqual({ altScreen: true })
  })

  it("skips islands whose handle exposes no modes owner", () => {
    const root = islandWithModes({ altScreen: true }, null)
    const noModes = islandNoModesOwner(root)
    const leaf = box(noModes)
    expect(deriveProtocolModesFromFocusSubtree(leaf)).toEqual({ altScreen: true })
  })

  it("does not enable modes an island left unset (no default-on leak)", () => {
    const island = islandWithModes({ altScreen: true }, null)
    const leaf = box(island)
    const result = deriveProtocolModesFromFocusSubtree(leaf)
    expect(result.bracketedPaste).toBeUndefined()
    expect(result.mouseTracking).toBeUndefined()
    expect(result.kittyKeyboard).toBeUndefined()
    expect(result.focusReporting).toBeUndefined()
    expect(result.cursor).toBeUndefined()
  })
})
