/**
 * km-tui.omnibox-recents — MRU data source for the empty-buffer omnibox.
 *
 * Test matrix (per bead acceptance): (empty / partial / full match)
 * crossed with (with-cursor / without-cursor). The recents store is a
 * plain factory — we construct a fresh one per test with a synthetic
 * clock so recency ordering is deterministic.
 */
import { describe, expect, it } from "vitest"
import type { CommandDef } from "@km/commands"
import type { KNode } from "@km/core"
import { createRecentsStore, RECENCY_PEAK, RECENCY_DECAY_MS } from "../src/state/recents-store.ts"
import { parseQuery } from "../src/state/omnibox-query-parser.ts"
import { rankResults, type RankCandidate } from "../src/state/omnibox-ranker.ts"
import { rankCommands } from "../src/state/omnibox-projection.ts"
import { initialStateFromSpec, type OmniboxInvocationSpec } from "../src/state/omnibox.ts"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function mkNode(id: string, content: string): KNode {
  return {
    id,
    type: "h",
    parent_id: null,
    position: { line: 0, column: 0 },
    item: { list: "-" },
    content,
    name: content,
  } as unknown as KNode
}

function mkCand(id: string, title: string): RankCandidate {
  return { node: mkNode(id, title), title }
}

function mkCmd(id: string, name: string, description = ""): CommandDef {
  return {
    id,
    name,
    description,
    args: [],
    modes: ["normal"],
    category: "test",
    execute: () => ({ type: "unimplemented", reason: "test-fixture" }),
  } as unknown as CommandDef
}

const NOW = 1_700_000_000_000 // arbitrary fixed-clock origin

// Node fixture: 5 nodes with varied recency.
//   n-never : untouched
//   n-old   : touched 14 days ago (boost ≈ PEAK * exp(-2) ≈ 68)
//   n-week  : touched 7 days ago  (boost ≈ PEAK * exp(-1) ≈ 184)
//   n-day   : touched 1 day ago   (boost ≈ PEAK * exp(-1/7) ≈ 432)
//   n-now   : touched right now   (boost === PEAK === 500)
const NODE_CANDS = [
  mkCand("n-never", "alpha"),
  mkCand("n-old", "bravo"),
  mkCand("n-week", "charlie"),
  mkCand("n-day", "delta"),
  mkCand("n-now", "echo"),
  mkCand("n-alpha-match", "alpha-delta"), // also matches "alpha" / partial "del"
]

const CMDS: CommandDef[] = [
  mkCmd("cmd.open", "Open File", "open any file"),
  mkCmd("cmd.save", "Save", "save current"),
  mkCmd("cmd.search", "Search Nodes", "fuzzy search"),
  mkCmd("cmd.undo", "Undo", "undo last op"),
  mkCmd("cmd.redo", "Redo", "redo last op"),
]

function seedNodeRecency(store: ReturnType<typeof createRecentsStore>): void {
  store.touchNode("n-old", NOW - 14 * RECENCY_DECAY_MS)
  store.touchNode("n-week", NOW - RECENCY_DECAY_MS)
  store.touchNode("n-day", NOW - RECENCY_DECAY_MS / 7)
  store.touchNode("n-now", NOW)
}

function seedCommandRecency(store: ReturnType<typeof createRecentsStore>): void {
  store.touchCommand("cmd.undo", NOW - 2 * RECENCY_DECAY_MS)
  store.touchCommand("cmd.search", NOW - RECENCY_DECAY_MS)
  store.touchCommand("cmd.save", NOW)
}

// recencyBoost closure against a synthetic NOW — the store's default
// `Date.now()` fallback would make tests non-deterministic.
function nodeBoostAt(store: ReturnType<typeof createRecentsStore>, now: number): (id: string) => number {
  return (id) => store.nodeBoost(id, now)
}

function commandBoostAt(store: ReturnType<typeof createRecentsStore>, now: number): (id: string) => number {
  return (id) => store.commandBoost(id, now)
}

// ---------------------------------------------------------------------------
// Decay math — sanity check
// ---------------------------------------------------------------------------

describe("recents-store: decay", () => {
  it("just-touched node gets the full PEAK bonus", () => {
    const store = createRecentsStore()
    store.touchNode("x", NOW)
    expect(store.nodeBoost("x", NOW)).toBeCloseTo(RECENCY_PEAK, 5)
  })

  it("untouched id boosts to zero", () => {
    const store = createRecentsStore()
    expect(store.nodeBoost("never", NOW)).toBe(0)
    expect(store.commandBoost("never", NOW)).toBe(0)
  })

  it("boost halves roughly every DECAY * ln(2)", () => {
    const store = createRecentsStore()
    store.touchNode("x", NOW - RECENCY_DECAY_MS * Math.LN2)
    expect(store.nodeBoost("x", NOW)).toBeCloseTo(RECENCY_PEAK / 2, 1)
  })

  it("touchNode updates the timestamp (most-recent wins)", () => {
    const store = createRecentsStore()
    store.touchNode("x", NOW - RECENCY_DECAY_MS)
    const old = store.nodeBoost("x", NOW)
    store.touchNode("x", NOW)
    expect(store.nodeBoost("x", NOW)).toBeGreaterThan(old)
  })
})

// ---------------------------------------------------------------------------
// Empty × with/without cursor
// ---------------------------------------------------------------------------

describe("empty query — recents surfaced", () => {
  it("without cursor (no recency): returns all, alphabetically", () => {
    const store = createRecentsStore() // untouched
    const parsed = parseQuery("")
    const out = rankResults(parsed, NODE_CANDS, { recencyBoost: nodeBoostAt(store, NOW) })
    expect(out.map((r) => r.node.id)).toEqual([
      "n-never", // alpha
      "n-alpha-match", // alpha-delta
      "n-old", // bravo
      "n-week", // charlie
      "n-day", // delta
      "n-now", // echo
    ])
  })

  it("with cursor seeded (has recency): most-recent first, untouched alphabetic", () => {
    const store = createRecentsStore()
    seedNodeRecency(store)
    const parsed = parseQuery("")
    const out = rankResults(parsed, NODE_CANDS, { recencyBoost: nodeBoostAt(store, NOW) })
    const ids = out.map((r) => r.node.id)
    // Recency order: n-now > n-day > n-week > n-old; untouched trails alphabetically.
    expect(ids.slice(0, 4)).toEqual(["n-now", "n-day", "n-week", "n-old"])
    expect(ids.slice(4).sort()).toEqual(["n-alpha-match", "n-never"])
  })
})

// ---------------------------------------------------------------------------
// Partial (prefix / substring match) × with/without cursor
// ---------------------------------------------------------------------------

describe("partial query — recents bias ties", () => {
  it("without cursor: prefix tier dominates the fuzzy tail", () => {
    const store = createRecentsStore() // no recency
    const parsed = parseQuery("al")
    const out = rankResults(parsed, NODE_CANDS, { recencyBoost: nodeBoostAt(store, NOW) })
    const ids = out.map((r) => r.node.id)
    // "alpha" + "alpha-delta" prefix-match (tier 5000+); "charlie" fuzzy-
    // matches char-order (tier 5, 0-999) and trails. Non-matches filtered.
    expect(ids[0]).toBe("n-never") // alpha — shortest prefix
    expect(ids[1]).toBe("n-alpha-match") // alpha-delta — longer prefix
    expect(ids).not.toContain("n-old")
    expect(ids).not.toContain("n-day")
    expect(ids).not.toContain("n-now")
  })

  it("with cursor: additive recency nudges ties but text-tier still dominates", () => {
    const store = createRecentsStore()
    // n-alpha-match gets a max recency boost — without cursor it lost to
    // n-never on length tiebreak; with cursor it should overtake.
    store.touchNode("n-alpha-match", NOW)
    const parsed = parseQuery("al")
    const out = rankResults(parsed, NODE_CANDS, { recencyBoost: nodeBoostAt(store, NOW) })
    const ids = out.map((r) => r.node.id)
    expect(ids[0]).toBe("n-alpha-match") // recency flipped the prefix tie
    expect(ids[1]).toBe("n-never")
  })

  it("recency never promotes a non-match", () => {
    const store = createRecentsStore()
    // "echo" has no 'a' or 'l' in sequence — not even fuzzy-matches "al".
    store.touchNode("n-now", NOW)
    const parsed = parseQuery("al")
    const out = rankResults(parsed, NODE_CANDS, { recencyBoost: nodeBoostAt(store, NOW) })
    const ids = out.map((r) => r.node.id)
    expect(ids).not.toContain("n-now")
  })
})

// ---------------------------------------------------------------------------
// Full match × with/without cursor
// ---------------------------------------------------------------------------

describe("full-word query — exact match wins regardless of recency", () => {
  it("without cursor: exact match at top, no recency signal", () => {
    const store = createRecentsStore()
    const parsed = parseQuery("delta")
    const out = rankResults(parsed, NODE_CANDS, { recencyBoost: nodeBoostAt(store, NOW) })
    expect(out[0]!.node.id).toBe("n-day") // "delta" exact
  })

  it("with cursor: exact still wins even when a prefix match is recent", () => {
    const store = createRecentsStore()
    store.touchNode("n-alpha-match", NOW) // "alpha-delta" — substring, tier 3 at best
    const parsed = parseQuery("delta")
    const out = rankResults(parsed, NODE_CANDS, { recencyBoost: nodeBoostAt(store, NOW) })
    // Exact ("n-day"="delta", tier 1 ≈ 10k) should beat substring (≈1-2k) + PEAK(500).
    expect(out[0]!.node.id).toBe("n-day")
  })
})

// ---------------------------------------------------------------------------
// Commands — empty query returns MRU; typed applies additive bonus
// ---------------------------------------------------------------------------

describe("rankCommands with recency", () => {
  it("empty query + recency: MRU order, unseen at the end", () => {
    const store = createRecentsStore()
    seedCommandRecency(store)
    const out = rankCommands([...CMDS], "", commandBoostAt(store, NOW))
    const ids = out.map((c) => c.id)
    // save (NOW) > search (1w) > undo (2w) > unseen preserve original order.
    expect(ids.slice(0, 3)).toEqual(["cmd.save", "cmd.search", "cmd.undo"])
    expect(ids.slice(3)).toEqual(expect.arrayContaining(["cmd.open", "cmd.redo"]))
  })

  it("empty query + no recency: returns input order", () => {
    const out = rankCommands([...CMDS], "")
    expect(out.map((c) => c.id)).toEqual(CMDS.map((c) => c.id))
  })

  it("typed query + recency: text-tier dominates, recency tiebreaks", () => {
    const store = createRecentsStore()
    store.touchCommand("cmd.redo", NOW) // recent — but doesn't match "save"
    const out = rankCommands([...CMDS], "save", commandBoostAt(store, NOW))
    expect(out[0]!.id).toBe("cmd.save")
    // "cmd.redo" was not a text match, shouldn't appear.
    expect(out.find((c) => c.id === "cmd.redo")).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Pre-select: opening omnibox from a cursored pane seeds selectedArgumentId
// ---------------------------------------------------------------------------

describe("pre-select: cursor becomes selectedArgumentId at open", () => {
  function mkSpec(cursorId: string | null): OmniboxInvocationSpec {
    return {
      initialBuffer: "",
      initialDefaultCommand: "default",
      initialArgumentId: cursorId,
      anchorPaneId: "pane-1",
      subjectSelection: { cursorId, selectedIds: cursorId ? [cursorId] : [] },
      candidateProvider: () => [],
    }
  }

  it("with cursor: initialStateFromSpec propagates argumentId", () => {
    const state = initialStateFromSpec(mkSpec("n-week"))
    expect(state.selectedArgumentId).toBe("n-week")
    expect(state.buffer).toBe("")
  })

  it("without cursor: selectedArgumentId is null", () => {
    const state = initialStateFromSpec(mkSpec(null))
    expect(state.selectedArgumentId).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Store API: MRU snapshot + limit
// ---------------------------------------------------------------------------

describe("recentNodeIds / recentCommandIds", () => {
  it("returns ids sorted most-recent-first", () => {
    const store = createRecentsStore()
    seedNodeRecency(store)
    expect(store.recentNodeIds()).toEqual(["n-now", "n-day", "n-week", "n-old"])
  })

  it("limit truncates the head", () => {
    const store = createRecentsStore()
    seedNodeRecency(store)
    expect(store.recentNodeIds(2)).toEqual(["n-now", "n-day"])
  })

  it("empty store returns empty arrays", () => {
    const store = createRecentsStore()
    expect(store.recentNodeIds()).toEqual([])
    expect(store.recentCommandIds()).toEqual([])
  })
})

// Assertion coverage map for the bead matrix (empty|partial|full × with|without cursor):
//   - empty × without     : "empty query — recents surfaced / without cursor"
//   - empty × with        : "empty query — recents surfaced / with cursor seeded"
//   - partial × without   : "partial query — recents bias ties / without cursor"
//   - partial × with      : "partial query — recents bias ties / with cursor"
//   - full × without      : "full-word query — exact match wins / without cursor"
//   - full × with         : "full-word query — exact match wins / with cursor"
// All six cells covered.
