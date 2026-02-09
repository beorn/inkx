/**
 * Tests for TreeNode component helpers (Layer 3)
 *
 * Note: Full component render tests require database setup.
 * These tests cover the helper functions and selection key logic.
 */

import { describe, it, expect } from "vitest"
import { makeSelectionKey, parseSelectionKey } from "../../src/types.ts"

describe("makeSelectionKey", () => {
  it("creates key from nodeId and sub index", () => {
    expect(makeSelectionKey("node-abc", 0)).toBe("node-abc:0")
    expect(makeSelectionKey("node-xyz", 3)).toBe("node-xyz:3")
  })

  it("handles node IDs with special characters", () => {
    expect(makeSelectionKey("a:b:c", 1)).toBe("a:b:c:1")
  })

  it("creates unique keys for different nodes", () => {
    const keys = new Set([
      makeSelectionKey("node-1", 0),
      makeSelectionKey("node-1", 1),
      makeSelectionKey("node-2", 0),
      makeSelectionKey("node-3", 0),
    ])
    expect(keys.size).toBe(4)
  })
})

describe("parseSelectionKey", () => {
  it("parses nodeId and sub from key", () => {
    const result = parseSelectionKey("node-abc:0")
    expect(result.nodeId).toBe("node-abc")
    expect(result.sub).toBe(0)
  })

  it("handles node IDs with colons", () => {
    const result = parseSelectionKey("a:b:c:1")
    expect(result.nodeId).toBe("a:b:c")
    expect(result.sub).toBe(1)
  })
})

// TreeNode component visual tests removed - testing via integration tests instead
// (board.test.ts, body-content.test.ts, etc.) which provide better coverage
// of actual user-facing behavior.
