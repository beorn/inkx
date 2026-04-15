/**
 * Phase 7d tests — node search for non-`:` sigils in the unified omnibox.
 *
 * Post-BM25-reframe: `nodeResultsForOmnibox` is a thin pass-through over
 * `repo.search()`, which applies BM25 column weights + depth tie-break in
 * SQL. The ranking contract is verified end-to-end in
 * `packages/km-storage/tests/fts-sigil.test.ts`; this file covers the
 * projection logic alone (mode dispatch, row conversion, limit handling).
 */
import { describe, expect, it } from "vitest"
import type { KNode } from "@km/core"
import {
  nodeResultsForOmnibox,
  type NodeSearchRepo,
  commandResultsForOmnibox,
} from "../src/state/omnibox-projection.ts"
import { allCommands } from "@km/commands"

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

/**
 * Minimal NodeSearchRepo stub that returns a fixed list of nodes as the
 * search result, in whatever order the test supplies. Since the BM25
 * ranking contract is verified at the storage layer, these tests only
 * need to check that the projection correctly forwards + projects.
 */
function makeRepo(searchResults: KNode[]): NodeSearchRepo {
  return {
    search: (_query: string, limit?: number) => searchResults.slice(0, limit ?? searchResults.length),
  }
}

// ---------------------------------------------------------------------------
// Forwarding + projection
// ---------------------------------------------------------------------------

describe("nodeResultsForOmnibox — forwards to repo.search() and projects to rows", () => {
  it("returns rows in the order repo.search supplies (no re-rank)", () => {
    const repo = makeRepo([node("a", "first"), node("b", "second"), node("c", "third")])
    const rows = nodeResultsForOmnibox(repo, "any", "project")
    expect(rows.map((r) => r.id)).toEqual(["node:a", "node:b", "node:c"])
  })

  it("caps results at NODE_RESULT_LIMIT (12)", () => {
    const nodes = Array.from({ length: 30 }, (_, i) => node(`n${i}`, `content ${i}`))
    const repo = makeRepo(nodes)
    const rows = nodeResultsForOmnibox(repo, "content", "project")
    expect(rows.length).toBeLessThanOrEqual(12)
  })

  it("every row is namespaced with node: prefix", () => {
    const repo = makeRepo([node("a", "foo"), node("b", "bar")])
    const rows = nodeResultsForOmnibox(repo, "foo", "project")
    for (const row of rows) {
      expect(row.id.startsWith("node:")).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Mode contracts — the projection deliberately doesn't handle these
// ---------------------------------------------------------------------------

describe("nodeResultsForOmnibox — mode contracts", () => {
  it("command mode returns empty (caller uses commandResultsForOmnibox)", () => {
    const repo = makeRepo([node("a", "anything")])
    const rows = nodeResultsForOmnibox(repo, ":foo", "command")
    expect(rows).toEqual([])
  })

  it("local_find mode returns empty (Phase 9 owns the in-pane find chrome)", () => {
    const repo = makeRepo([node("a", "anything")])
    const rows = nodeResultsForOmnibox(repo, "/foo", "local_find")
    expect(rows).toEqual([])
  })

  it("universal mode (empty buffer) returns empty for v1", () => {
    const repo = makeRepo([node("a", "anything")])
    const rows = nodeResultsForOmnibox(repo, "", "universal")
    expect(rows).toEqual([])
  })

  it("empty query returns empty even for a sigil mode", () => {
    const repo = makeRepo([node("a", "anything")])
    const rows = nodeResultsForOmnibox(repo, "", "project")
    expect(rows).toEqual([])
  })

  it("commandResultsForOmnibox is the orthogonal command path — sanity check", () => {
    const rows = commandResultsForOmnibox(allCommands, "goto", "normal")
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]?.id.startsWith("cmd:")).toBe(true)
  })
})
