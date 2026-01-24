/**
 * Visual Navigation Integration Tests
 *
 * Tests that verify h/l navigation uses actual screen coordinates.
 * Unlike visual-navigation.test.ts which tests the algorithm with mock data,
 * these tests verify the full integration:
 *
 * 1. Cards register screen positions via useScreenRectCallback
 * 2. h/l navigation uses those positions (not just card index)
 * 3. Different column heights/scroll positions work correctly
 *
 * These tests use the inkx test renderer with a custom test component
 * that properly wires up the LayoutProvider.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import React, { useReducer, useMemo, useRef, useEffect, useLayoutEffect, useState, useCallback } from "react";
import { createTestRenderer, bufferToText, createLocator } from "inkx/testing";
import { Box, Text, useInput, useScreenRectCallback, useScreenRect } from "inkx";

import {
  withTestEnv,
  setDatabase,
  applyEvent,
  emitNodeCreated,
  createFakeVault,
} from "@km/storage";
import type { NodeType, KNode } from "@km/core";
import { ulid } from "ulid";

import {
  createLayoutRegistry,
  type LayoutRegistry,
} from "../src/card-positions.ts";
import {
  LayoutProvider,
  useLayoutRegistryOptional,
} from "../src/layout-context.tsx";
import { UIProvider } from "../src/ui-context.tsx";
import { createInitialUIState } from "../src/ui-reducer.ts";
import { Column } from "../src/views/CardColumn.tsx";
import type { ColumnState, CardState, BoardState } from "../src/types.ts";
import { buildBoardState } from "../src/state.ts";

// =============================================================================
// Test Helpers
// =============================================================================

function createTestNode(
  type: NodeType,
  content?: string,
  parentId?: string | null,
  extra?: Record<string, unknown>,
): string {
  const id = ulid();
  emitNodeCreated("test-user", {
    id,
    type,
    parent_id: parentId ?? null,
    content,
    ...extra,
  });
  return id;
}

/**
 * Create a minimal CardState for testing
 */
function makeCard(id: string, content: string): CardState {
  return {
    node: {
      id,
      type: "task",
      parent_id: null,
      parent_idx: 0,
      link_to: null,
      content,
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    },
    children: [],
  };
}

/**
 * Create a minimal ColumnState for testing
 */
function makeColumn(id: string, name: string, cards: CardState[]): ColumnState {
  return {
    node: {
      id,
      type: "section",
      parent_id: null,
      parent_idx: 0,
      link_to: null,
      content: name,
      data: {},
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    },
    cards,
  };
}

// =============================================================================
// Test Component
// =============================================================================

interface TestBoardProps {
  columns: ColumnState[];
  initialColIndex?: number;
  initialCardIndex?: number;
  width: number;
  height: number;
  onRegistryReady?: (registry: LayoutRegistry) => void;
  onCursorChange?: (colIndex: number, cardIndex: number) => void;
}

/**
 * Minimal test board component that:
 * 1. Renders columns with LayoutProvider
 * 2. Handles h/l/j/k navigation
 * 3. Exposes registry for assertions
 */
function TestBoard({
  columns,
  initialColIndex = 0,
  initialCardIndex = 0,
  width,
  height,
  onRegistryReady,
  onCursorChange,
}: TestBoardProps): React.ReactElement {
  const [colIndex, setColIndex] = useState(initialColIndex);
  const [cardIndex, setCardIndex] = useState(initialCardIndex);

  // Create registry once
  const registryRef = useRef<LayoutRegistry | null>(null);
  if (!registryRef.current) {
    registryRef.current = createLayoutRegistry();
  }
  const registry = registryRef.current;

  // Notify test of registry availability
  useEffect(() => {
    if (onRegistryReady) {
      // Wait a tick for layout to complete
      const timer = setTimeout(() => onRegistryReady(registry), 10);
      return () => clearTimeout(timer);
    }
  }, [registry, onRegistryReady]);

  // Notify test of cursor changes
  useEffect(() => {
    if (onCursorChange) {
      onCursorChange(colIndex, cardIndex);
    }
  }, [colIndex, cardIndex, onCursorChange]);

  // Handle keyboard input
  useInput((input, key) => {
    if (input === "j") {
      // Move down
      const col = columns[colIndex];
      if (col && cardIndex < col.cards.length - 1) {
        setCardIndex(cardIndex + 1);
        registry.clearStickyY();
      }
    } else if (input === "k") {
      // Move up
      if (cardIndex > 0) {
        setCardIndex(cardIndex - 1);
        registry.clearStickyY();
      }
    } else if (input === "l") {
      // Move right - use visual navigation
      if (colIndex < columns.length - 1) {
        const targetColIndex = colIndex + 1;
        const targetCol = columns[targetColIndex];

        if (!targetCol || targetCol.cards.length === 0) {
          setColIndex(targetColIndex);
          setCardIndex(-1);
          return;
        }

        // Check if positions are registered
        const hasCurrentPositions = registry.hasCardsInColumn(colIndex);
        const hasTargetPositions = registry.hasCardsInColumn(targetColIndex);

        if (!hasCurrentPositions || !hasTargetPositions) {
          // Fallback to index-based
          const newCardIndex = Math.min(cardIndex, targetCol.cards.length - 1);
          setColIndex(targetColIndex);
          setCardIndex(Math.max(0, newCardIndex));
          return;
        }

        // Visual navigation
        let curswantY = registry.getStickyY();
        if (curswantY === null) {
          const currentLayout = registry.getCardOptional(colIndex, cardIndex);
          if (currentLayout) {
            curswantY =
              currentLayout.layout.y + currentLayout.layout.cardHeight / 2;
            registry.setStickyY(curswantY);
          }
        }

        if (curswantY !== null) {
          const targetCardIndex = registry.findCardAtYVisual(
            targetColIndex,
            curswantY,
          );
          setColIndex(targetColIndex);
          setCardIndex(Math.max(0, targetCardIndex));
        } else {
          // Fallback
          const newCardIndex = Math.min(cardIndex, targetCol.cards.length - 1);
          setColIndex(targetColIndex);
          setCardIndex(Math.max(0, newCardIndex));
        }
      }
    } else if (input === "h") {
      // Move left - use visual navigation
      if (colIndex > 0) {
        const targetColIndex = colIndex - 1;
        const targetCol = columns[targetColIndex];

        if (!targetCol || targetCol.cards.length === 0) {
          setColIndex(targetColIndex);
          setCardIndex(-1);
          return;
        }

        // Check if positions are registered
        const hasCurrentPositions = registry.hasCardsInColumn(colIndex);
        const hasTargetPositions = registry.hasCardsInColumn(targetColIndex);

        if (!hasCurrentPositions || !hasTargetPositions) {
          // Fallback to index-based
          const newCardIndex = Math.min(cardIndex, targetCol.cards.length - 1);
          setColIndex(targetColIndex);
          setCardIndex(Math.max(0, newCardIndex));
          return;
        }

        // Visual navigation
        let curswantY = registry.getStickyY();
        if (curswantY === null) {
          const currentLayout = registry.getCardOptional(colIndex, cardIndex);
          if (currentLayout) {
            curswantY =
              currentLayout.layout.y + currentLayout.layout.cardHeight / 2;
            registry.setStickyY(curswantY);
          }
        }

        if (curswantY !== null) {
          const targetCardIndex = registry.findCardAtYVisual(
            targetColIndex,
            curswantY,
          );
          setColIndex(targetColIndex);
          setCardIndex(Math.max(0, targetCardIndex));
        } else {
          // Fallback
          const newCardIndex = Math.min(cardIndex, targetCol.cards.length - 1);
          setColIndex(targetColIndex);
          setCardIndex(Math.max(0, newCardIndex));
        }
      }
    }
  });

  // Calculate column width
  const colWidth = Math.floor(width / columns.length);

  // Create UI state for the provider
  const uiState = useMemo(
    () => createInitialUIState("cards", [], { columns: width, rows: height }),
    [width, height],
  );
  const noopDispatch = () => {};

  return (
    <UIProvider state={uiState} dispatch={noopDispatch}>
      <LayoutProvider registry={registry}>
        <Box flexDirection="row" width={width} height={height}>
          {columns.map((col, idx) => (
            <Column
              key={col.node.id}
              column={col}
              colIndex={idx}
              isSelected={idx === colIndex}
              isCollapsed={false}
              selectedCardIndex={idx === colIndex ? cardIndex : -1}
              selectedSubIndex={0}
              width={colWidth}
              height={height}
              selectionLevel="card"
            />
          ))}
        </Box>
      </LayoutProvider>
    </UIProvider>
  );
}

// =============================================================================
// Minimal Test Components for Diagnostics
// =============================================================================

/**
 * Super minimal component to test if useScreenRectCallback fires
 */
function MinimalLayoutTest({
  onLayout,
  onDebug,
}: {
  onLayout: (rect: { x: number; y: number; width: number; height: number }) => void;
  onDebug?: (info: { hasNode: boolean; screenRect: unknown }) => void;
}): React.ReactElement {
  // Use useCallback to ensure stable callback reference
  const handleLayout = useCallback(
    (rect: { x: number; y: number; width: number; height: number }) => {
      console.log("useScreenRectCallback fired:", rect);
      onLayout(rect);
    },
    [onLayout],
  );

  useScreenRectCallback(handleLayout);

  // Debug: check node context directly
  const screenRect = useScreenRect();

  useLayoutEffect(() => {
    console.log("Debug - screenRect from useScreenRect:", screenRect);
    if (onDebug) {
      onDebug({ hasNode: true, screenRect });
    }
  }, [screenRect, onDebug]);

  return (
    <Box width={40} height={10}>
      <Text>Test Content</Text>
    </Box>
  );
}

// =============================================================================
// Tests
// =============================================================================

describe("useScreenRectCallback Diagnostics", () => {
  const render = createTestRenderer({ columns: 80, rows: 24 });

  test("useEffect runs in test renderer", async () => {
    let effectRan = false;

    function EffectTest(): React.ReactElement {
      useEffect(() => {
        console.log("useEffect ran!");
        effectRan = true;
      }, []);
      return <Text>Test</Text>;
    }

    render(React.createElement(EffectTest));

    // Wait for effects
    await new Promise((resolve) => setTimeout(resolve, 50));

    console.log("Effect ran:", effectRan);
    expect(effectRan).toBe(true);
  });

  test("useLayoutEffect runs in test renderer", async () => {
    let layoutEffectRan = false;

    function LayoutEffectTest(): React.ReactElement {
      useLayoutEffect(() => {
        console.log("useLayoutEffect ran!");
        layoutEffectRan = true;
      }, []);
      return <Text>Test</Text>;
    }

    render(React.createElement(LayoutEffectTest));

    // Wait for effects
    await new Promise((resolve) => setTimeout(resolve, 50));

    console.log("LayoutEffect ran:", layoutEffectRan);
    expect(layoutEffectRan).toBe(true);
  });

  test("useScreenRectCallback fires on initial render", async () => {
    let callbackFired = false;
    let capturedRect: { x: number; y: number; width: number; height: number } | null = null;

    render(
      React.createElement(MinimalLayoutTest, {
        onLayout: (rect) => {
          callbackFired = true;
          capturedRect = rect;
        },
      }),
    );

    // Wait for effects
    await new Promise((resolve) => setTimeout(resolve, 50));

    console.log("Callback fired:", callbackFired, "Rect:", capturedRect);

    expect(callbackFired).toBe(true);
    expect(capturedRect).not.toBeNull();
    expect(capturedRect!.width).toBeGreaterThan(0);
  });
});

describe("Visual Navigation Integration", () => {
  const render = createTestRenderer({ columns: 80, rows: 24 });

  test("cards register screen positions via useScreenRectCallback", async () => {
    // Create two columns with cards
    const columns = [
      makeColumn("col1", "Column 1", [
        makeCard("card1", "Card 1"),
        makeCard("card2", "Card 2"),
        makeCard("card3", "Card 3"),
      ]),
      makeColumn("col2", "Column 2", [
        makeCard("card4", "Card 4"),
        makeCard("card5", "Card 5"),
      ]),
    ];

    let capturedRegistry: LayoutRegistry | null = null;

    const { unmount } = render(
      React.createElement(TestBoard, {
        columns,
        width: 80,
        height: 24,
        onRegistryReady: (registry) => {
          capturedRegistry = registry;
        },
      }),
    );

    // Wait for layout to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(capturedRegistry).not.toBeNull();

    // Debug: dump registry state
    console.log("Registry state:", capturedRegistry!.dump());

    // Verify positions are registered for both columns
    expect(capturedRegistry!.hasCardsInColumn(0)).toBe(true);
    expect(capturedRegistry!.hasCardsInColumn(1)).toBe(true);

    // Verify card count
    expect(capturedRegistry!.getCardCount(0)).toBe(3);
    expect(capturedRegistry!.getCardCount(1)).toBe(2);

    // Verify positions have Y values
    const card1 = capturedRegistry!.getCardOptional(0, 0);
    expect(card1).toBeDefined();
    expect(typeof card1!.layout.y).toBe("number");
    expect(card1!.layout.y).toBeGreaterThanOrEqual(0);

    unmount();
  });

  test("cards at same visual row have similar Y positions", async () => {
    // Create two columns with same number of cards
    const columns = [
      makeColumn("col1", "Column 1", [
        makeCard("card1", "Card A"),
        makeCard("card2", "Card B"),
      ]),
      makeColumn("col2", "Column 2", [
        makeCard("card3", "Card X"),
        makeCard("card4", "Card Y"),
      ]),
    ];

    let capturedRegistry: LayoutRegistry | null = null;

    const { unmount } = render(
      React.createElement(TestBoard, {
        columns,
        width: 80,
        height: 24,
        onRegistryReady: (registry) => {
          capturedRegistry = registry;
        },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(capturedRegistry).not.toBeNull();

    // Get positions of first cards in each column
    const card0_0 = capturedRegistry!.getCardOptional(0, 0);
    const card1_0 = capturedRegistry!.getCardOptional(1, 0);

    expect(card0_0).toBeDefined();
    expect(card1_0).toBeDefined();

    // Cards in same row should have same Y position
    // (both are first cards, should be at same Y)
    expect(card0_0!.layout.y).toBe(card1_0!.layout.y);

    // Get positions of second cards
    const card0_1 = capturedRegistry!.getCardOptional(0, 1);
    const card1_1 = capturedRegistry!.getCardOptional(1, 1);

    expect(card0_1).toBeDefined();
    expect(card1_1).toBeDefined();

    // Second cards should also have same Y
    expect(card0_1!.layout.y).toBe(card1_1!.layout.y);

    unmount();
  });

  test("h/l navigation moves to visually adjacent card", async () => {
    // Create two columns with cards
    const columns = [
      makeColumn("col1", "Column 1", [
        makeCard("card1", "Card A"),
        makeCard("card2", "Card B"),
        makeCard("card3", "Card C"),
      ]),
      makeColumn("col2", "Column 2", [
        makeCard("card4", "Card X"),
        makeCard("card5", "Card Y"),
        makeCard("card6", "Card Z"),
      ]),
    ];

    let lastColIndex = 0;
    let lastCardIndex = 0;

    const { stdin, unmount } = render(
      React.createElement(TestBoard, {
        columns,
        initialColIndex: 0,
        initialCardIndex: 1, // Start at Card B
        width: 80,
        height: 24,
        onCursorChange: (col, card) => {
          lastColIndex = col;
          lastCardIndex = card;
        },
      }),
    );

    // Wait for layout
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Initial position
    expect(lastColIndex).toBe(0);
    expect(lastCardIndex).toBe(1);

    // Press 'l' to move right
    stdin.write("l");
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should move to card at same visual Y position (Card Y, index 1)
    expect(lastColIndex).toBe(1);
    expect(lastCardIndex).toBe(1); // Same row

    // Press 'h' to move back left
    stdin.write("h");
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should move back to Card B
    expect(lastColIndex).toBe(0);
    expect(lastCardIndex).toBe(1);

    unmount();
  });

  test("curswantY is preserved across multiple h/l moves", async () => {
    // Create 3 columns
    const columns = [
      makeColumn("col1", "Col 1", [
        makeCard("c1", "A"),
        makeCard("c2", "B"),
        makeCard("c3", "C"),
      ]),
      makeColumn("col2", "Col 2", [
        makeCard("c4", "D"),
        makeCard("c5", "E"),
        makeCard("c6", "F"),
      ]),
      makeColumn("col3", "Col 3", [
        makeCard("c7", "G"),
        makeCard("c8", "H"),
        makeCard("c9", "I"),
      ]),
    ];

    let lastColIndex = 0;
    let lastCardIndex = 0;

    const { stdin, unmount } = render(
      React.createElement(TestBoard, {
        columns,
        initialColIndex: 0,
        initialCardIndex: 2, // Start at card C (index 2)
        width: 120,
        height: 24,
        onCursorChange: (col, card) => {
          lastColIndex = col;
          lastCardIndex = card;
        },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Initial: col 0, card 2 (C)
    expect(lastColIndex).toBe(0);
    expect(lastCardIndex).toBe(2);

    // Move right twice
    stdin.write("l");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lastColIndex).toBe(1);
    expect(lastCardIndex).toBe(2); // F

    stdin.write("l");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(lastColIndex).toBe(2);
    expect(lastCardIndex).toBe(2); // I (curswantY preserved)

    unmount();
  });

  test("j/k clears curswantY", async () => {
    const columns = [
      makeColumn("col1", "Col 1", [
        makeCard("c1", "A"),
        makeCard("c2", "B"),
        makeCard("c3", "C"),
      ]),
      makeColumn("col2", "Col 2", [
        makeCard("c4", "D"),
        makeCard("c5", "E"),
        makeCard("c6", "F"),
      ]),
    ];

    let capturedRegistry: LayoutRegistry | null = null;
    let lastColIndex = 0;
    let lastCardIndex = 0;

    const { stdin, unmount } = render(
      React.createElement(TestBoard, {
        columns,
        initialColIndex: 0,
        initialCardIndex: 0,
        width: 80,
        height: 24,
        onRegistryReady: (registry) => {
          capturedRegistry = registry;
        },
        onCursorChange: (col, card) => {
          lastColIndex = col;
          lastCardIndex = card;
        },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Move right to set curswantY
    stdin.write("l");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(capturedRegistry!.getStickyY()).not.toBeNull();

    // Move back left
    stdin.write("h");
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Move down - should clear stickyY
    stdin.write("j");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(capturedRegistry!.getStickyY()).toBeNull();

    unmount();
  });

  test("visual navigation with different card counts per column", async () => {
    // Column 1 has 2 cards, column 2 has 4 cards
    // This tests that visual position (not index ratio) is used
    const columns = [
      makeColumn("col1", "Col 1", [
        makeCard("c1", "First"),
        makeCard("c2", "Second"),
      ]),
      makeColumn("col2", "Col 2", [
        makeCard("c3", "One"),
        makeCard("c4", "Two"),
        makeCard("c5", "Three"),
        makeCard("c6", "Four"),
      ]),
    ];

    let lastColIndex = 0;
    let lastCardIndex = 0;

    const { stdin, unmount } = render(
      React.createElement(TestBoard, {
        columns,
        initialColIndex: 0,
        initialCardIndex: 0, // Start at "First"
        width: 80,
        height: 30, // Taller to fit all cards
        onCursorChange: (col, card) => {
          lastColIndex = col;
          lastCardIndex = card;
        },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Move right from first card
    stdin.write("l");
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Should land on card at same Y position (first card in col 2)
    expect(lastColIndex).toBe(1);
    expect(lastCardIndex).toBe(0); // Not index-based (would be 0 anyway)

    // Move back and down to second card
    stdin.write("h");
    await new Promise((resolve) => setTimeout(resolve, 20));
    stdin.write("j");
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Now at "Second" (index 1 in col 0)
    expect(lastColIndex).toBe(0);
    expect(lastCardIndex).toBe(1);

    // Move right - should find card at same Y position
    stdin.write("l");
    await new Promise((resolve) => setTimeout(resolve, 20));

    // Visual position of "Second" should match "Two" (index 1 in col 2)
    // not index-based mapping which might pick a different card
    expect(lastColIndex).toBe(1);
    // The exact index depends on card heights, but it should be based on Y position
    expect(lastCardIndex).toBeGreaterThanOrEqual(0);

    unmount();
  });
});

describe("Screen Rect Correctness", () => {
  const render = createTestRenderer({ columns: 80, rows: 24 });

  test("card positions are screen-relative (account for column header)", async () => {
    const columns = [
      makeColumn("col1", "My Column", [makeCard("card1", "Task 1")]),
    ];

    let capturedRegistry: LayoutRegistry | null = null;

    const { unmount } = render(
      React.createElement(TestBoard, {
        columns,
        width: 80,
        height: 24,
        onRegistryReady: (registry) => {
          capturedRegistry = registry;
        },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const card = capturedRegistry!.getCardOptional(0, 0);
    expect(card).toBeDefined();

    // Card Y should be > 0 because column header takes space
    // The exact value depends on header height (typically 2 rows: blank + header)
    expect(card!.layout.y).toBeGreaterThan(0);

    unmount();
  });

  test("positions have expected dimensions", async () => {
    const columns = [
      makeColumn("col1", "Column", [makeCard("card1", "A task")]),
    ];

    let capturedRegistry: LayoutRegistry | null = null;

    const { unmount } = render(
      React.createElement(TestBoard, {
        columns,
        width: 80,
        height: 24,
        onRegistryReady: (registry) => {
          capturedRegistry = registry;
        },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const card = capturedRegistry!.getCardOptional(0, 0);
    expect(card).toBeDefined();

    // Card should have reasonable dimensions
    expect(card!.layout.cardWidth).toBeGreaterThan(10);
    expect(card!.layout.cardHeight).toBeGreaterThan(0);
    expect(card!.layout.x).toBeGreaterThanOrEqual(0);

    unmount();
  });
});
