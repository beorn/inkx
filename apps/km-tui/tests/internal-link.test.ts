/**
 * Internal link resolution tests.
 *
 * Tests the pure URL parsing and node resolution logic for km:// links:
 * - km://node/{id}  — direct node ID
 * - km://wiki/{name} — wiki link (by name, then by ID, then ^ID)
 * - km://block/{id}  — block reference (by node ID)
 */
import { describe, test, expect } from "vitest"
import { parseKmUrl, resolveKmLink, type LinkRepo } from "../src/internal-link.ts"
import type { KNode } from "@km/core"

// =============================================================================
// Helpers
// =============================================================================

function makeNode(id: string, overrides: Partial<KNode> = {}): KNode {
  return {
    id,
    type: "p",
    item: true,
    list_marker: "-",
    content: id,
    data: {},
    parent_id: null,
    parent_idx: 0,
    embed_source: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
    ...overrides,
  }
}

function makeLinkRepo(nodes: KNode[], nameIndex?: Map<string, KNode>): LinkRepo {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  return {
    getNode(id: string) {
      return nodeMap.get(id) ?? null
    },
    resolveByName(name: string) {
      if (nameIndex) return nameIndex.get(name.toLowerCase()) ?? null
      // Simple name matching: check content/name fields
      const lower = name.toLowerCase()
      for (const node of nodes) {
        const nodeName = (node as any).name?.toLowerCase()
        if (nodeName === lower) return node
      }
      return null
    },
  }
}

// =============================================================================
// URL Parsing
// =============================================================================

describe("parseKmUrl", () => {
  test("parses km://node/{id}", () => {
    const result = parseKmUrl("km://node/abc123")
    expect(result).toEqual({ type: "node", value: "abc123" })
  })

  test("parses km://wiki/{name}", () => {
    const result = parseKmUrl("km://wiki/My%20Page")
    expect(result).toEqual({ type: "wiki", value: "My Page" })
  })

  test("parses km://block/{id}", () => {
    const result = parseKmUrl("km://block/1210156063601370")
    expect(result).toEqual({ type: "block", value: "1210156063601370" })
  })

  test("decodes URI-encoded values", () => {
    const result = parseKmUrl("km://wiki/%5E1210156063601370")
    expect(result).toEqual({ type: "wiki", value: "^1210156063601370" })
  })

  test("returns null for non-km URLs", () => {
    expect(parseKmUrl("https://example.com")).toBeNull()
    expect(parseKmUrl("http://example.com")).toBeNull()
    expect(parseKmUrl("file:///foo")).toBeNull()
  })

  test("returns null for unknown km:// types", () => {
    expect(parseKmUrl("km://unknown/foo")).toBeNull()
  })

  test("returns null for malformed km:// URLs", () => {
    expect(parseKmUrl("km://")).toBeNull()
    expect(parseKmUrl("km://node/")).toBeNull()
    expect(parseKmUrl("km://node")).toBeNull()
  })
})

// =============================================================================
// Node Resolution
// =============================================================================

describe("resolveKmLink", () => {
  const nodeA = makeNode("abc123", { content: "Task A" })
  const nodeB = makeNode("1210156063601370", { content: "Review quarterly budget" })
  const nodeC = makeNode("def456", { content: "Project Alpha" })

  describe("km://node/ — direct ID lookup", () => {
    test("resolves existing node by ID", () => {
      const repo = makeLinkRepo([nodeA, nodeB])
      const result = resolveKmLink({ type: "node", value: "abc123" }, repo)
      expect(result).toBe("abc123")
    })

    test("returns null for unknown ID", () => {
      const repo = makeLinkRepo([nodeA])
      const result = resolveKmLink({ type: "node", value: "unknown" }, repo)
      expect(result).toBeNull()
    })
  })

  describe("km://wiki/ — name-based resolution", () => {
    test("resolves by name via resolveByName", () => {
      const nameIndex = new Map([["project alpha", nodeC]])
      const repo = makeLinkRepo([nodeC], nameIndex)
      const result = resolveKmLink({ type: "wiki", value: "Project Alpha" }, repo)
      expect(result).toBe("def456")
    })

    test("falls back to getNode when resolveByName misses", () => {
      const nameIndex = new Map<string, KNode>() // empty name index
      const repo = makeLinkRepo([nodeA], nameIndex)
      const result = resolveKmLink({ type: "wiki", value: "abc123" }, repo)
      expect(result).toBe("abc123")
    })

    test("resolves ^ID wiki links (blockref-style: [[^ID]])", () => {
      const nameIndex = new Map<string, KNode>() // no name match
      const repo = makeLinkRepo([nodeB], nameIndex)
      const result = resolveKmLink({ type: "wiki", value: "^1210156063601370" }, repo)
      expect(result).toBe("1210156063601370")
    })

    test("returns null when nothing matches", () => {
      const nameIndex = new Map<string, KNode>()
      const repo = makeLinkRepo([nodeA], nameIndex)
      const result = resolveKmLink({ type: "wiki", value: "Nonexistent Page" }, repo)
      expect(result).toBeNull()
    })
  })

  describe("km://block/ — block reference lookup", () => {
    test("resolves existing block by ID", () => {
      const repo = makeLinkRepo([nodeB])
      const result = resolveKmLink({ type: "block", value: "1210156063601370" }, repo)
      expect(result).toBe("1210156063601370")
    })

    test("returns null for unknown block ID", () => {
      const repo = makeLinkRepo([nodeA])
      const result = resolveKmLink({ type: "block", value: "unknown" }, repo)
      expect(result).toBeNull()
    })
  })
})

// =============================================================================
// Integration: parseKmUrl + resolveKmLink
// =============================================================================

describe("end-to-end URL → node ID resolution", () => {
  const targetNode = makeNode("1210156063601370", { content: "Review quarterly budget" })
  const namedNode = makeNode("file-abc", { content: "Meeting Notes" })

  test("km://node/ID → resolves to node ID", () => {
    const repo = makeLinkRepo([targetNode])
    const parsed = parseKmUrl("km://node/1210156063601370")
    expect(parsed).not.toBeNull()
    const result = resolveKmLink(parsed!, repo)
    expect(result).toBe("1210156063601370")
  })

  test("km://wiki/name → resolves by name", () => {
    const nameIndex = new Map([["meeting notes", namedNode]])
    const repo = makeLinkRepo([namedNode], nameIndex)
    const parsed = parseKmUrl("km://wiki/Meeting%20Notes")
    expect(parsed).not.toBeNull()
    const result = resolveKmLink(parsed!, repo)
    expect(result).toBe("file-abc")
  })

  test("km://wiki/^ID → resolves blockref-style wiki link", () => {
    const repo = makeLinkRepo([targetNode])
    const parsed = parseKmUrl("km://wiki/%5E1210156063601370")
    expect(parsed).not.toBeNull()
    const result = resolveKmLink(parsed!, repo)
    expect(result).toBe("1210156063601370")
  })

  test("km://block/ID → resolves block reference", () => {
    const repo = makeLinkRepo([targetNode])
    const parsed = parseKmUrl("km://block/1210156063601370")
    expect(parsed).not.toBeNull()
    const result = resolveKmLink(parsed!, repo)
    expect(result).toBe("1210156063601370")
  })

  test("unresolvable URLs return null at resolution step", () => {
    const repo = makeLinkRepo([])
    const parsed = parseKmUrl("km://wiki/Nonexistent")
    expect(parsed).not.toBeNull()
    const result = resolveKmLink(parsed!, repo)
    expect(result).toBeNull()
  })
})
