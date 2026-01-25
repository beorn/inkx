/**
 * Board State Tests (Fast, No Database)
 *
 * Pure state and logic tests that don't need database access.
 * These tests use inline state and fixtures for fast, parallelizable execution.
 *
 * NOTE: Key handling is tested in @km/commands package (keybindings.test.ts).
 * This file tests state factories and selectors only.
 */

import { describe, test, expect } from "bun:test"

import {
  createEmptyState,
  getCurrentCard,
  getCurrentColumn,
} from "../src/state.ts"

import { createSimpleTestBoard } from "./fixtures/board-fixtures.ts"

// =============================================================================
// Empty State
// =============================================================================

describe("createEmptyState", () => {
  test("returns valid empty state", () => {
    const state = createEmptyState()
    expect(state.rootId).toBeNull()
    expect(state.columns).toHaveLength(0)
    expect(state.colIndex).toBe(0)
    expect(state.cardIndex).toBe(0)
    expect(state.selectedCards.size).toBe(0)
    expect(state.visualMode).toBe(false)
    expect(state.searchMode).toBe(false)
    expect(state.helpMode).toBe(false)
  })
})

// =============================================================================
// getCurrentCard / getCurrentColumn with Inline State
// =============================================================================

describe("Current Card/Column Selectors", () => {
  test("getCurrentCard returns current card", () => {
    const { state, nodeIds } = createSimpleTestBoard()
    const card = getCurrentCard(state)

    expect(card).not.toBeNull()
    expect(card!.node.id).toBe(nodeIds.card1)
  })

  test("getCurrentCard returns null for empty state", () => {
    const state = createEmptyState()
    const card = getCurrentCard(state)
    expect(card).toBeNull()
  })

  test("getCurrentColumn returns current column", () => {
    const { state, nodeIds } = createSimpleTestBoard()
    const col = getCurrentColumn(state)

    expect(col).not.toBeNull()
    expect(col!.node.id).toBe(nodeIds.col1)
  })

  test("getCurrentColumn returns null for empty state", () => {
    const state = createEmptyState()
    const col = getCurrentColumn(state)
    expect(col).toBeNull()
  })

  test("getCurrentCard respects cardIndex", () => {
    const { state, nodeIds } = createSimpleTestBoard()
    state.cardIndex = 1
    const card = getCurrentCard(state)

    expect(card).not.toBeNull()
    expect(card!.node.id).toBe(nodeIds.card2)
  })

  test("getCurrentColumn respects colIndex", () => {
    const { state, nodeIds } = createSimpleTestBoard()
    state.colIndex = 1
    const col = getCurrentColumn(state)

    expect(col).not.toBeNull()
    expect(col!.node.id).toBe(nodeIds.col2)
  })
})
