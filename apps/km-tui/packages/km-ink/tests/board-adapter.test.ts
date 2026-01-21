/**
 * Board Adapter Tests
 *
 * Tests for deriveColumnsLayout and related functions.
 * Issue km-k5k3: cardIndex must preserve -1 for column-level selection.
 */

import { describe, it, expect } from "bun:test";
import { deriveColumnsLayout } from "../src/board-adapter.ts";
import type { TNode } from "@km/board";

// Helper to create test nodes
function createNode(
  id: string,
  children: TNode[] = [],
  overrides: Partial<TNode> = {},
): TNode {
  return {
    id,
    type: "section",
    parent_id: null,
    parent_idx: 0,
    link_to: null,
    name: id,
    title: id,
    children,
    childCount: children.length,
    isTask: false,
    depth: 0,
    data: {},
    created_at: 0,
    updated_at: 0,
    version: "",
    ...overrides,
  };
}

describe("deriveColumnsLayout", () => {
  /**
   * km-k5k3: When pressing 'i' to zoom-in on a node that becomes a column,
   * the cursor must stay on that node (at column level with cardIndex=-1),
   * NOT jump to the first card (cardIndex=0).
   *
   * Two bugs were fixed:
   * 1. deriveColumnsLayout was converting cardIndex -1 to 0 via Math.max()
   * 2. handleZoomIn/handleZoomInwards were not setting selectionLevel="column"
   *
   * This test verifies the first fix in deriveColumnsLayout.
   * The second fix (selectionLevel) is verified by Board.tsx keyboard handling.
   */
  describe("cursor preservation (km-k5k3)", () => {
    it("preserves cardIndex=-1 for column-level selection", () => {
      // When cursor is [0] (column 0, no card), cardIndex should be -1
      const nodes = [
        createNode("col-a", [createNode("card-1"), createNode("card-2")]),
        createNode("col-b", [createNode("card-3")]),
      ];

      const layout = deriveColumnsLayout({
        rootId: "root",
        rootPath: null,
        nodes,
        cursor: [0], // Column level - no card selected
        selectedNodes: new Set(),
        foldedNodes: new Set(),
        zoomStack: [],
        navHistory: [],
        navHistoryIndex: -1,
        inMoveMode: false,
        moveSourceCursor: [],
      });

      expect(layout.colIndex).toBe(0);
      expect(layout.cardIndex).toBe(-1); // Must be -1, not 0!
      expect(layout.isAtCardLevel).toBe(false);
    });

    it("returns cardIndex=0 for card-level selection [0, 0]", () => {
      const nodes = [
        createNode("col-a", [createNode("card-1"), createNode("card-2")]),
      ];

      const layout = deriveColumnsLayout({
        rootId: "root",
        rootPath: null,
        nodes,
        cursor: [0, 0], // Column 0, card 0
        selectedNodes: new Set(),
        foldedNodes: new Set(),
        zoomStack: [],
        navHistory: [],
        navHistoryIndex: -1,
        inMoveMode: false,
        moveSourceCursor: [],
      });

      expect(layout.colIndex).toBe(0);
      expect(layout.cardIndex).toBe(0);
      expect(layout.isAtCardLevel).toBe(true);
    });

    it("returns cardIndex=1 for second card selection [0, 1]", () => {
      const nodes = [
        createNode("col-a", [createNode("card-1"), createNode("card-2")]),
      ];

      const layout = deriveColumnsLayout({
        rootId: "root",
        rootPath: null,
        nodes,
        cursor: [0, 1], // Column 0, card 1
        selectedNodes: new Set(),
        foldedNodes: new Set(),
        zoomStack: [],
        navHistory: [],
        navHistoryIndex: -1,
        inMoveMode: false,
        moveSourceCursor: [],
      });

      expect(layout.colIndex).toBe(0);
      expect(layout.cardIndex).toBe(1);
      expect(layout.isAtCardLevel).toBe(true);
    });

    it("handles empty cursor as colIndex=-1, cardIndex=-1", () => {
      const nodes = [createNode("col-a")];

      const layout = deriveColumnsLayout({
        rootId: null,
        rootPath: null,
        nodes,
        cursor: [], // Empty cursor
        selectedNodes: new Set(),
        foldedNodes: new Set(),
        zoomStack: [],
        navHistory: [],
        navHistoryIndex: -1,
        inMoveMode: false,
        moveSourceCursor: [],
      });

      // Empty cursor means board level - no column or card selected
      expect(layout.colIndex).toBe(-1);
      expect(layout.cardIndex).toBe(-1);
    });
  });
});
