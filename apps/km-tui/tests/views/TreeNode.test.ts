/**
 * Tests for TreeNode component helpers (Layer 3)
 *
 * Note: Full component render tests require database setup.
 * These tests cover the helper functions and selection key logic.
 */

import { describe, it, expect } from "vitest"
import { makeSelectionKey, parseSelectionKey } from "../../src/types.ts"

describe("makeSelectionKey", () => {
  it("creates key from nodeId", () => {
    expect(makeSelectionKey("node-abc")).toBe("node-abc")
    expect(makeSelectionKey("node-xyz")).toBe("node-xyz")
  })

  it("handles node IDs with special characters", () => {
    expect(makeSelectionKey("a:b:c")).toBe("a:b:c")
  })

  it("creates unique keys for different nodes", () => {
    const keys = new Set([makeSelectionKey("node-1"), makeSelectionKey("node-2"), makeSelectionKey("node-3")])
    expect(keys.size).toBe(3)
  })
})

describe("parseSelectionKey", () => {
  it("parses nodeId from key", () => {
    const result = parseSelectionKey("node-abc")
    expect(result.nodeId).toBe("node-abc")
  })

  it("handles node IDs with colons", () => {
    const result = parseSelectionKey("a:b:c")
    expect(result.nodeId).toBe("a:b:c")
  })
})

// TreeNode component visual tests removed - testing via integration tests instead
// (board.test.ts, body-content.test.ts, etc.) which provide better coverage
// of actual user-facing behavior.
