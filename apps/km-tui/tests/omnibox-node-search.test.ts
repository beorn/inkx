/**
 * Phase 7d tests — node search for non-`:` sigils in the unified omnibox.
 *
 * The unified omnibox routes `:` queries to `commandResultsForOmnibox` and
 * everything else (`+`, `@`, `#`, `[`) to `nodeResultsForOmnibox`. This file
 * is the unit-test guard for the latter — pure projection (Repo + buffer →
 * OmniboxRowData[]).
 *
 * The Repo dependency is mocked to the narrow `NodeSearchRepo` interface
 * the function consumes, keeping these tests pure and fast.
 */
import { describe, expect, it } from "vitest"
import type { KNode } from "@km/core"
import { nodeResultsForOmnibox, type NodeSearchRepo } from "../src/state/omnibox-projection.ts"
import { allCommands } from "@km/commands"
import { commandResultsForOmnibox } from "../src/state/omnibox-projection.ts"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function node(id: string, content: string, extra: Partial<KNode> = {}): KNode {
  return {
    id,
    content,
    type: "h",
    parent_id: null,
    parent_idx: 0,
    data: {},
    created_at: 0,
    updated_at: 0,
    version: "",
    ...extra,
  } as KNode
}

/** Minimal Repo stub — implements only what nodeResultsForOmnibox needs. */
function makeRepo(nodes: KNode[]): NodeSearchRepo {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return {
    rawQuery<T = Record<string, unknown>>(): T[] {
      return nodes as unknown as T[]
    },
    getNode: (id: string) => byId.get(id) ?? null,
    getChildren: () => [],
  }
}

// ---------------------------------------------------------------------------
// Project sigil (`+`)
// ---------------------------------------------------------------------------

describe("nodeResultsForOmnibox — project sigil (+)", () => {
  it("ranks +taxes and +taxonomic above +traffic for query '+ta'", () => {
    const repo = makeRepo([node("a", "+taxes"), node("b", "+taxonomic"), node("c", "+traffic"), node("d", "misc")])
    const rows = nodeResultsForOmnibox(repo, "+ta", "project")
    // Top two must be the +ta-prefixed nodes (Tier 2 prefix beats Tier 5 fuzzy)
    expect(
      rows
        .slice(0, 2)
        .map((r) => r.title)
        .sort(),
    ).toEqual(["+taxes", "+taxonomic"])
    // The '+traffic' fuzzy match must NOT push `+ta` prefix matches down
    expect(rows[0]?.title).not.toBe("+traffic")
  })

  it("excludes nodes that don't fuzzy-match at all", () => {
    const repo = makeRepo([node("a", "+taxes"), node("b", "completely unrelated")])
    const rows = nodeResultsForOmnibox(repo, "+ta", "project")
    expect(rows.find((r) => r.title === "completely unrelated")).toBeUndefined()
  })

  it("uses the node: namespace for IDs (the connector strips this prefix)", () => {
    const repo = makeRepo([node("a", "+taxes")])
    const rows = nodeResultsForOmnibox(repo, "+ta", "project")
    expect(rows[0]?.id).toBe("node:a")
  })
})

// ---------------------------------------------------------------------------
// Context sigil (`@`)
// ---------------------------------------------------------------------------

describe("nodeResultsForOmnibox — context sigil (@)", () => {
  it("ranks exact @delei above @delei.co above deep subpath @office/Delei/SPD", () => {
    const repo = makeRepo([node("a", "@delei"), node("b", "@delei.co"), node("c", "@office/Finance/Delei/SPD")])
    const rows = nodeResultsForOmnibox(repo, "@delei", "context")
    // Tier 1 exact > Tier 2 prefix > Tier 3 segment-boundary substring
    expect(rows.map((r) => r.title)).toEqual(["@delei", "@delei.co", "@office/Finance/Delei/SPD"])
  })

  it("returns top-12 cap so a flood of fuzzy matches doesn't blow up the dropdown", () => {
    const many = Array.from({ length: 50 }, (_, i) => node(`n${i}`, `@team/member${i}`))
    const repo = makeRepo(many)
    const rows = nodeResultsForOmnibox(repo, "@team", "context")
    expect(rows.length).toBeLessThanOrEqual(12)
  })
})

// ---------------------------------------------------------------------------
// Tag sigil (`#`)
// ---------------------------------------------------------------------------

describe("nodeResultsForOmnibox — tag sigil (#)", () => {
  it("matches nodes whose title contains the tag literal", () => {
    const repo = makeRepo([
      node("a", "#urgent"),
      node("b", "deploy hotfix #urgent"),
      node("c", "#urge-ish"),
      node("d", "vacation planning"),
    ])
    const rows = nodeResultsForOmnibox(repo, "#urgent", "tag")
    const titles = rows.map((r) => r.title)
    expect(titles).toContain("#urgent")
    expect(titles).toContain("deploy hotfix #urgent")
    expect(titles).not.toContain("vacation planning")
    // Exact match `#urgent` should rank #1 (Tier 1 — 10000-length).
    expect(rows[0]?.title).toBe("#urgent")
  })
})

// `[` is NOT a sigil — it's the task-filter / wikilink bracket. No node-mode
// tests here. The universal fuzzy path (empty sigil, leading alphanum) covers
// the old `[foo` use case through the generic smart-term path.

// ---------------------------------------------------------------------------
// Mode contracts
// ---------------------------------------------------------------------------

describe("nodeResultsForOmnibox — mode contracts", () => {
  it("local_find returns empty (Phase 9 owns this)", () => {
    const repo = makeRepo([node("a", "anything")])
    const rows = nodeResultsForOmnibox(repo, "/foo", "local_find")
    expect(rows).toEqual([])
  })

  it("command mode returns empty — caller is expected to use commandResultsForOmnibox", () => {
    const repo = makeRepo([node("a", "anything")])
    const rows = nodeResultsForOmnibox(repo, ":goto", "command")
    expect(rows).toEqual([])
  })

  it("universal mode (empty buffer) returns empty for v1", () => {
    const repo = makeRepo([node("a", "anything"), node("b", "else")])
    const rows = nodeResultsForOmnibox(repo, "", "universal")
    // Phase 7d v1: empty buffer → empty result. Recents land in Phase 9+.
    expect(rows).toEqual([])
  })

  it("commandResultsForOmnibox is the orthogonal command path — sanity check", () => {
    // Cross-check that the command projection still works alongside the new
    // node projection. The connector (WorkspaceChrome) picks one or the other
    // based on the leading sigil; this test just guards against accidental
    // interference between the two modules.
    const rows = commandResultsForOmnibox(allCommands, "goto", "normal")
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]?.id.startsWith("cmd:")).toBe(true)
  })
})
