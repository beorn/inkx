/**
 * Board Key Handling Tests
 *
 * Fast tests for keyboard navigation and mode switching using fixtures.
 * No database access required - pure state transformation tests.
 */

import { describe, test, expect } from "bun:test";

import { handleKey, getCurrentCard } from "../src/state.ts";
import { createSimpleTestBoard } from "./fixtures/board-fixtures.ts";

describe("Board Key Handling", () => {
  test("h key moves left", () => {
    const { state } = createSimpleTestBoard();
    state.colIndex = 1;
    const result = handleKey(state, "h");
    expect(result.state.colIndex).toBe(0);
    expect(result.action).toBeNull();
  });

  test("l key moves right", () => {
    const { state } = createSimpleTestBoard();
    const result = handleKey(state, "l");
    expect(result.state.colIndex).toBe(1);
    expect(result.action).toBeNull();
  });

  test("j key moves down", () => {
    const { state } = createSimpleTestBoard();
    const result = handleKey(state, "j");
    expect(result.state.cardIndex).toBe(1);
    expect(result.action).toBeNull();
  });

  test("k key moves up", () => {
    const { state } = createSimpleTestBoard();
    state.cardIndex = 1;
    const result = handleKey(state, "k");
    expect(result.state.cardIndex).toBe(0);
    expect(result.action).toBeNull();
  });

  test("g jumps to first card", () => {
    const { state } = createSimpleTestBoard();
    state.cardIndex = 1;
    const result = handleKey(state, "g");
    expect(result.state.cardIndex).toBe(0);
  });

  test("G jumps to last card", () => {
    const { state } = createSimpleTestBoard();
    const result = handleKey(state, "G");
    expect(result.state.cardIndex).toBe(1); // Column 1 has 2 cards
  });

  test("q returns quit action", () => {
    const { state } = createSimpleTestBoard();
    const result = handleKey(state, "q");
    expect(result.action).toBe("quit");
  });

  test("? enables help mode", () => {
    const { state } = createSimpleTestBoard();
    const result = handleKey(state, "?");
    expect(result.state.helpMode).toBe(true);
  });

  test("/ enables search mode", () => {
    const { state } = createSimpleTestBoard();
    const result = handleKey(state, "/");
    expect(result.state.searchMode).toBe(true);
    expect(result.state.searchQuery).toBe("");
  });

  test("v toggles visual mode", () => {
    const { state } = createSimpleTestBoard();
    const result1 = handleKey(state, "v");
    expect(result1.state.visualMode).toBe(true);
    expect(result1.state.selectedCards.size).toBe(1);

    const result2 = handleKey(result1.state, "v");
    expect(result2.state.visualMode).toBe(false);
    expect(result2.state.selectedCards.size).toBe(0);
  });

  test("space toggles selection", () => {
    const { state } = createSimpleTestBoard();
    const result1 = handleKey(state, " ");
    expect(result1.state.selectedCards.size).toBe(1);

    const result2 = handleKey(result1.state, " ");
    expect(result2.state.selectedCards.size).toBe(0);
  });

  test("Tab toggles fold", () => {
    const { state, nodeIds } = createSimpleTestBoard();
    const card = getCurrentCard(state)!;
    expect(card.node.id).toBe(nodeIds.card1);

    const result1 = handleKey(state, "\t");
    expect(result1.state.foldedCards.has(card.node.id)).toBe(true);

    const result2 = handleKey(result1.state, "\t");
    expect(result2.state.foldedCards.has(card.node.id)).toBe(false);
  });
});
