/**
 * Board State Tests (Fast, No Database)
 *
 * Pure state and logic tests that don't need database access.
 * These tests use inline state and fixtures for fast, parallelizable execution.
 *
 * NOTE: Key handling is tested in @km/commands package (keybindings.test.ts).
 * This file tests state factories and selectors only.
 */

import { describe, test, expect } from "vitest"

import { createEmptyState } from "../src/state.ts"

// =============================================================================
// Empty State
// =============================================================================

describe("createEmptyState", () => {
  test("returns valid empty state", () => {
    const state = createEmptyState()
    expect(state.rootId).toBeNull()
    expect(state.columns).toHaveLength(0)
    expect(state.selectedNodes.size).toBe(0)
    expect(state.visualMode).toBe(false)
    expect(state.searchMode).toBe(false)
    expect(state.helpMode).toBe(false)
  })
})
