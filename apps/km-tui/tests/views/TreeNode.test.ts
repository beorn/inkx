/**
 * Tests for TreeNode component helpers (Layer 3)
 *
 * Note: Full component render tests require database setup.
 * These tests cover the helper functions and selection key logic.
 */

import { describe, it, expect } from "bun:test"
import { makeSelectionKey } from "../../src/types.ts"

describe("makeSelectionKey", () => {
  it("creates key from col, card, sub indices", () => {
    expect(makeSelectionKey(0, 0, 0)).toBe("0:0:0")
    expect(makeSelectionKey(1, 2, 3)).toBe("1:2:3")
  })

  it("handles large indices", () => {
    expect(makeSelectionKey(10, 100, 1000)).toBe("10:100:1000")
  })

  it("creates unique keys for different positions", () => {
    const keys = new Set([
      makeSelectionKey(0, 0, 0),
      makeSelectionKey(0, 0, 1),
      makeSelectionKey(0, 1, 0),
      makeSelectionKey(1, 0, 0),
    ])
    expect(keys.size).toBe(4)
  })
})

// TreeNode component visual tests removed - testing via integration tests instead
// (board.test.ts, body-content.test.ts, etc.) which provide better coverage
// of actual user-facing behavior.
