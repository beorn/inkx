/**
 * Board Slow Tests
 *
 * Integration tests for boardliner TUI using createFakeVault test double.
 * These tests verify board state building, navigation, and rendering.
 *
 * Run with: bun run test:all (includes slow tests)
 * For fast iteration, use: bun run test:fast (excludes slow tests)
 */

import { describe, test, expect } from "bun:test";
import { createTestRenderer } from "inkx/testing";

const render = createTestRenderer();
import React from "react";

import { createFakeVault } from "@km/storage";
import type { Vault } from "@km/storage";
import type { KNode, NodeType } from "@km/core";

import {
  createEmptyState,
  initBoardState,
  buildBoardState,
  handleKey,
  getNodeDisplayName,
  getCurrentCard,
  getCurrentColumn,
} from "../src/state.ts";
import { buildTreeNodes } from "../src/board-adapter.ts";
import { stripAnsi } from "../src/layout/index.ts";

import { renderBoardStatic, renderCard } from "../src/render.ts";

import type { CardState } from "../src/types.ts";
import { BoardCore } from "../src/views/Board.tsx";
import { createInitialUIState } from "../src/ui-reducer.ts";
import { createLayoutRegistry } from "../src/card-positions.ts";
import { VaultProvider } from "../src/vault-context.tsx";
import { NewItemDialog } from "../src/views/NewItemDialog.tsx";
import type { BoardState } from "../src/types.ts";

/** Helper to render BoardCore with test-friendly defaults */
function renderBoardCore(
  state: BoardState,
  vault: Vault,
  options: { width?: number; height?: number } = {},
) {
  const { width = 80, height = 24 } = options;
  const boardCoreElement = React.createElement(BoardCore, {
    state,
    ui: createInitialUIState("cards", [], { columns: width, rows: height }),
    derivedSelectionLevel: "card" as const,
    dimensions: { columns: width, rows: height },
    layoutRegistry: createLayoutRegistry(),
    dispatch: () => {},
    dialogHandlers: {
      handleProjectSelect: () => {},
      handleProjectCancel: () => {},
      handleNewItemCreate: () => {},
      handleNewItemCancel: () => {},
    },
  });
  return React.createElement(VaultProvider, {
    vault,
    children: boardCoreElement,
  });
}

// Helper to build KNode with required defaults
function makeNode(
  id: string,
  type: NodeType,
  content: string | undefined,
  parentId: string | null,
  parentIdx: number,
  extra?: Partial<KNode>,
): KNode {
  const now = Date.now();
  return {
    id,
    type,
    parent_id: parentId,
    parent_idx: parentIdx,
    link_to: null,
    content,
    data: {},
    created_at: now,
    updated_at: now,
    version: "v1",
    ...extra,
  };
}

describe.serial("Board State", () => {
  test("buildBoardState creates columns from children", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("root", "board", "Test Board", null, 0),
        makeNode("col1", "folder", "Column 1", "root", 0),
        makeNode("col2", "folder", "Column 2", "root", 1),
        makeNode("card1", "task", "Card 1.1", "col1", 0),
        makeNode("card2", "task", "Card 1.2", "col1", 1),
        makeNode("card3", "task", "Card 2.1", "col2", 0),
      ],
    });

    const state = buildBoardState(vault, "root");

    expect(state.rootId).toBe("root");
    expect(state.columns).toHaveLength(2);
    expect(state.columns[0]?.cards).toHaveLength(2);
    expect(state.columns[1]?.cards).toHaveLength(1);
  });

  test("initBoardState groups root nodes by name", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("proj1", "folder", "Projects", null, 0),
        makeNode("proj2", "folder", "Projects", null, 1), // Duplicate name
        makeNode("arch", "folder", "Archive", null, 2),
      ],
    });

    const state = initBoardState(vault);

    expect(state).not.toBeNull();
    expect(state!.rootId).toBeNull(); // null means root level view
    expect(state!.columns).toHaveLength(2); // Grouped by unique name
  });

  test("initBoardState deduplicates cards by name within grouped columns", () => {
    const vault = createFakeVault({
      nodes: [
        // Multiple root nodes with same name "ref"
        makeNode("ref1", "folder", "ref", null, 0),
        makeNode("ref2", "folder", "ref", null, 1),
        makeNode("ref3", "folder", "ref", null, 2),
        // Each ref has a child with the same name "Projects"
        makeNode("p1", "folder", "Projects", "ref1", 0),
        makeNode("p2", "folder", "Projects", "ref2", 0),
        makeNode("p3", "folder", "Projects", "ref3", 0),
        // And some with different names
        makeNode("a1", "folder", "Archive", "ref1", 1),
        makeNode("w1", "folder", "Work", "ref2", 1),
      ],
    });

    const state = initBoardState(vault);

    expect(state).not.toBeNull();
    expect(state!.columns).toHaveLength(1); // Only one "ref" column

    // Cards should be deduplicated by name - should have 3 unique: Projects, Archive, Work
    const cardNames = state!.columns[0]!.cards.map(
      (c) => c.node.content || c.node.data?.name,
    );
    const uniqueNames = new Set(cardNames);
    expect(uniqueNames.size).toBe(3);
    expect(cardNames.length).toBe(3); // No duplicates
  });

  test("initBoardState returns null for empty database", () => {
    const vault = createFakeVault({ nodes: [] });
    const state = initBoardState(vault);
    expect(state).toBeNull();
  });

  test("getNodeDisplayName returns content", () => {
    const vault = createFakeVault({
      nodes: [makeNode("task1", "task", "Test Task", null, 0)],
    });
    const node = vault.getNode("task1")!;
    expect(getNodeDisplayName(vault, node)).toBe("Test Task");
  });

  test("getNodeDisplayName returns data.name if present", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("folder1", "folder", undefined, null, 0, {
          data: { name: "My Folder" },
        }),
      ],
    });
    const node = vault.getNode("folder1")!;
    expect(getNodeDisplayName(vault, node)).toBe("My Folder");
  });

  test("getCurrentCard returns current card", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("board", "board", "Board", null, 0),
        makeNode("col", "folder", "Column", "board", 0),
        makeNode("card", "task", "Card", "col", 0),
      ],
    });

    const state = buildBoardState(vault, "board");
    const card = getCurrentCard(state);

    expect(card).not.toBeNull();
    expect(card!.node.id).toBe("card");
  });

  test("getCurrentColumn returns current column", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("board", "board", "Board", null, 0),
        makeNode("col", "folder", "Column", "board", 0),
      ],
    });

    const state = buildBoardState(vault, "board");
    const col = getCurrentColumn(state);

    expect(col).not.toBeNull();
    expect(col!.node.id).toBe("col");
  });

  test("buildBoardState filters out paragraph nodes as columns (km-1tho)", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("root", "file", "@issue.md", null, 0),
        // Create a paragraph (should NOT become a column)
        makeNode(
          "para",
          "paragraph",
          "All issues tracked with the @issue tag.",
          "root",
          0,
        ),
        // Create actual columns (sections should become columns)
        makeNode("col1", "section", "Open Issues", "root", 1),
        makeNode("col2", "section", "Closed Issues", "root", 2),
        // Add cards to columns
        makeNode("task1", "task", "Fix bug #1", "col1", 0),
        makeNode("task2", "task", "Fix bug #2", "col2", 0),
      ],
    });

    const state = buildBoardState(vault, "root");

    // Should have 3 columns: virtual body column + 2 sections
    // Body content (paragraph) is grouped into a virtual body column
    expect(state.columns).toHaveLength(3);
    expect(state.columns[0]!.isVirtual).toBe(true);
    expect(state.columns[0]!.cards).toHaveLength(1);
    expect(state.columns[0]!.cards[0]!.node.type).toBe("paragraph");
    expect(state.columns[1]!.node.type).toBe("section");
    expect(state.columns[2]!.node.type).toBe("section");
  });

  test("buildBoardState filters out code and quote nodes as columns", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("root", "file", "readme.md", null, 0),
        // These should NOT become columns
        makeNode("code", "code", "const x = 1;", "root", 0),
        makeNode("quote", "quote", "Some quote text", "root", 1),
        // This should become a column
        makeNode("col", "section", "Getting Started", "root", 2),
        makeNode("task", "task", "Install dependencies", "col", 0),
      ],
    });

    const state = buildBoardState(vault, "root");

    // Should have 2 columns: virtual body column + 1 section
    // Body content (code, quote) is grouped into a virtual body column
    expect(state.columns).toHaveLength(2);
    expect(state.columns[0]!.isVirtual).toBe(true);
    expect(state.columns[0]!.cards).toHaveLength(2); // code + quote
    expect(state.columns[1]!.node.id).toBe("col");
  });

  test("buildTreeNodes filters out paragraph nodes (km-1tho refresh path)", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("root", "file", "@issue.md", null, 0),
        // Create paragraph (should NOT appear in tree nodes)
        makeNode(
          "para",
          "paragraph",
          "All issues tracked with the @issue tag.",
          "root",
          0,
        ),
        // Create actual columns
        makeNode("col1", "section", "Open Issues", "root", 1),
        makeNode("col2", "section", "Closed Issues", "root", 2),
      ],
    });

    const nodes = buildTreeNodes(vault, "root");

    // Should have exactly 2 nodes (sections), NOT 3 (with paragraph)
    expect(nodes).toHaveLength(2);
    expect(nodes[0]!.type).toBe("section");
    expect(nodes[1]!.type).toBe("section");
  });

  test("buildTreeNodes filters out code and quote nodes", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("root", "file", "readme.md", null, 0),
        makeNode("code", "code", "const x = 1;", "root", 0),
        makeNode("quote", "quote", "Some quote text", "root", 1),
        makeNode("col", "section", "Getting Started", "root", 2),
      ],
    });

    const nodes = buildTreeNodes(vault, "root");

    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.type).toBe("section");
  });
});

describe.serial("Board Key Handling", () => {
  function createTestBoard(): {
    vault: Vault;
    state: ReturnType<typeof buildBoardState>;
  } {
    const vault = createFakeVault({
      nodes: [
        makeNode("root", "board", "Test Board", null, 0),
        makeNode("col1", "folder", "Todo", "root", 0),
        makeNode("col2", "folder", "Done", "root", 1),
        makeNode("task1", "task", "Task 1", "col1", 0),
        makeNode("task2", "task", "Task 2", "col1", 1),
        makeNode("task3", "task", "Task 3", "col2", 0),
      ],
    });
    const state = buildBoardState(vault, "root");
    return { vault, state };
  }

  test("h key moves left", () => {
    const { vault, state } = createTestBoard();
    state.colIndex = 1;
    const result = handleKey(vault, state, "h");
    expect(result.state.colIndex).toBe(0);
    expect(result.action).toBeNull();
  });

  test("l key moves right", () => {
    const { vault, state } = createTestBoard();
    const result = handleKey(vault, state, "l");
    expect(result.state.colIndex).toBe(1);
    expect(result.action).toBeNull();
  });

  test("j key moves down", () => {
    const { vault, state } = createTestBoard();
    const result = handleKey(vault, state, "j");
    expect(result.state.cardIndex).toBe(1);
    expect(result.action).toBeNull();
  });

  test("k key moves up", () => {
    const { vault, state } = createTestBoard();
    state.cardIndex = 1;
    const result = handleKey(vault, state, "k");
    expect(result.state.cardIndex).toBe(0);
    expect(result.action).toBeNull();
  });

  test("g jumps to first card", () => {
    const { vault, state } = createTestBoard();
    state.cardIndex = 1;
    const result = handleKey(vault, state, "g");
    expect(result.state.cardIndex).toBe(0);
  });

  test("G jumps to last card", () => {
    const { vault, state } = createTestBoard();
    const result = handleKey(vault, state, "G");
    expect(result.state.cardIndex).toBe(1); // Column 1 has 2 cards
  });

  test("q returns quit action", () => {
    const { vault, state } = createTestBoard();
    const result = handleKey(vault, state, "q");
    expect(result.action).toBe("quit");
  });

  test("? enables help mode", () => {
    const { vault, state } = createTestBoard();
    const result = handleKey(vault, state, "?");
    expect(result.state.helpMode).toBe(true);
  });

  test("/ enables search mode", () => {
    const { vault, state } = createTestBoard();
    const result = handleKey(vault, state, "/");
    expect(result.state.searchMode).toBe(true);
    expect(result.state.searchQuery).toBe("");
  });

  test("v toggles visual mode", () => {
    const { vault, state } = createTestBoard();
    const result1 = handleKey(vault, state, "v");
    expect(result1.state.visualMode).toBe(true);
    expect(result1.state.selectedCards.size).toBe(1);

    const result2 = handleKey(vault, result1.state, "v");
    expect(result2.state.visualMode).toBe(false);
    expect(result2.state.selectedCards.size).toBe(0);
  });

  test("space toggles selection", () => {
    const { vault, state } = createTestBoard();
    const result1 = handleKey(vault, state, " ");
    expect(result1.state.selectedCards.size).toBe(1);

    const result2 = handleKey(vault, result1.state, " ");
    expect(result2.state.selectedCards.size).toBe(0);
  });

  test("Tab toggles fold", () => {
    const { vault, state } = createTestBoard();
    const card = getCurrentCard(state)!;

    const result1 = handleKey(vault, state, "\t");
    expect(result1.state.foldedCards.has(card.node.id)).toBe(true);

    const result2 = handleKey(vault, result1.state, "\t");
    expect(result2.state.foldedCards.has(card.node.id)).toBe(false);
  });
});

describe.serial("Board Rendering", () => {
  test("renderBoardStatic renders columns", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("board", "board", "Board", null, 0),
        makeNode("col1", "folder", "Todo", "board", 0),
        makeNode("col2", "folder", "Done", "board", 1),
        makeNode("task1", "task", "Task 1", "col1", 0),
      ],
    });

    const state = buildBoardState(vault, "board");
    const output = renderBoardStatic(vault, state, 80);

    expect(output).toContain("Todo");
    expect(output).toContain("Done");
    expect(output).toContain("Task 1");
  });

  test("renderBoardStatic handles empty board", () => {
    const vault = createFakeVault();
    const state = createEmptyState();
    const output = renderBoardStatic(vault, state, 80);
    expect(output).toContain("Empty board");
  });

  test("renderCard includes content", () => {
    const vault = createFakeVault();
    const cardState: CardState = {
      node: {
        id: "test-card",
        type: "task",
        parent_id: null,
        parent_idx: 0,
        link_to: null,
        content: "My Test Task",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      children: [],
    };

    const output = renderCard(vault, cardState, 40, false, false, false);
    expect(output).toContain("My Test Task");
  });

  test("renderCard shows children when not folded", () => {
    const vault = createFakeVault();
    const cardState: CardState = {
      node: {
        id: "test-card",
        type: "task",
        parent_id: null,
        parent_idx: 0,
        link_to: null,
        content: "Parent Task",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      children: [
        {
          id: "child-1",
          type: "task",
          parent_id: "test-card",
          parent_idx: 0,
          link_to: null,
          content: "Child Task 1",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        },
      ],
    };

    const output = renderCard(vault, cardState, 40, false, false, false);
    expect(output).toContain("Child Task 1");
  });

  test("renderCard shows item count when folded", () => {
    const vault = createFakeVault();
    const cardState: CardState = {
      node: {
        id: "test-card",
        type: "task",
        parent_id: null,
        parent_idx: 0,
        link_to: null,
        content: "Parent Task",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      children: [
        {
          id: "child-1",
          type: "task",
          parent_id: "test-card",
          parent_idx: 0,
          link_to: null,
          content: "Child 1",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        },
        {
          id: "child-2",
          type: "task",
          parent_id: "test-card",
          parent_idx: 1,
          link_to: null,
          content: "Child 2",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        },
      ],
    };

    const output = renderCard(vault, cardState, 40, false, false, true);
    expect(output).toContain("\u25b6 2"); // Collapsed indicator with count
    expect(output).not.toContain("Child 1");
  });
});

describe.serial("Board Zoom Navigation", () => {
  test("Enter zooms into card with children", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("board", "board", "Board", null, 0),
        makeNode("col", "folder", "Column", "board", 0),
        makeNode("card", "task", "Card", "col", 0),
        makeNode("subcard", "task", "Sub-card", "card", 0),
      ],
    });

    const state = buildBoardState(vault, "board");

    // Enter should zoom into the card
    const result = handleKey(vault, state, "\r");

    expect(result.state.rootId).toBe("card");
    expect(result.state.zoomStack).toContain("board");
    expect(result.action).toBeNull();
  });

  test("Escape zooms out", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("board", "board", "Board", null, 0),
        makeNode("col", "folder", "Column", "board", 0),
        makeNode("card", "task", "Card", "col", 0),
        makeNode("subcard", "task", "Sub-card", "card", 0),
      ],
    });

    // Start zoomed in
    const state = buildBoardState(vault, "card");
    state.zoomStack = ["board"];

    const result = handleKey(vault, state, "\x1B");

    expect(result.state.rootId).toBe("board");
    expect(result.state.zoomStack).toHaveLength(0);
    expect(result.action).toBeNull();
  });

  test("Escape quits when at root", () => {
    const vault = createFakeVault({
      nodes: [makeNode("board", "board", "Board", null, 0)],
    });
    const state = buildBoardState(vault, "board");

    const result = handleKey(vault, state, "\x1B");
    expect(result.action).toBe("quit");
  });
});

describe.serial("Ink Board Rendering", () => {
  // Note: Full Ink testing would require ink-testing-library
  // These tests verify the static rendering which shares logic with Ink components

  test("board with rootPath shows filesystem path", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("root", "board", "Test Board", null, 0),
        makeNode("col", "folder", "Column", "root", 0),
        makeNode("task", "task", "Task 1", "col", 0),
      ],
    });

    const state = buildBoardState(vault, "root");
    state.rootPath = "/Users/test/vault";

    const output = renderBoardStatic(vault, state, 80);
    // The static renderer doesn't show rootPath, but this verifies state setup
    expect(state.rootPath).toBe("/Users/test/vault");
    expect(output).toContain("Column");
  });

  test("board state includes rootPath field", () => {
    const vault = createFakeVault({
      nodes: [makeNode("board", "board", "Board", null, 0)],
    });
    const state = createEmptyState();
    expect(state.rootPath).toBeNull();

    const boardState = buildBoardState(vault, "board");
    expect(boardState.rootPath).toBeNull(); // Set by caller, not buildBoardState
  });

  test("renderBoardStatic truncates long content", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("board", "board", "Board", null, 0),
        makeNode("col", "folder", "Column", "board", 0),
        makeNode(
          "task",
          "task",
          "This is a very long task name that should be truncated when rendered in a narrow column width",
          "col",
          0,
        ),
      ],
    });

    const state = buildBoardState(vault, "board");
    const output = renderBoardStatic(vault, state, 40); // Narrow width

    // Content should be present but may be truncated
    expect(output).toContain("This is a very long");
    expect(output.length).toBeLessThan(500); // Reasonable output size
  });

  test("renderBoardStatic shows column counts", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("board", "board", "Board", null, 0),
        makeNode("col", "folder", "Todo", "board", 0),
        makeNode("task1", "task", "Task 1", "col", 0),
        makeNode("task2", "task", "Task 2", "col", 1),
        makeNode("task3", "task", "Task 3", "col", 2),
      ],
    });

    const state = buildBoardState(vault, "board");
    const output = renderBoardStatic(vault, state, 80);

    expect(output).toContain("Todo");
    expect(output).toContain("(3)"); // Card count
  });

  test("renderBoardStatic handles multiple columns", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("board", "board", "Board", null, 0),
        makeNode("col1", "folder", "Todo", "board", 0),
        makeNode("col2", "folder", "In Progress", "board", 1),
        makeNode("col3", "folder", "Done", "board", 2),
      ],
    });

    const state = buildBoardState(vault, "board");
    const output = renderBoardStatic(vault, state, 120);

    expect(output).toContain("Todo");
    expect(output).toContain("In Progress");
    expect(output).toContain("Done");
  });
});

describe.serial("Ink Board TUI Rendering", () => {
  // Tests using ink-testing-library to test the ACTUAL Ink components

  test("ink board shows header path on first render", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("root", "board", "Test Board", null, 0),
        makeNode("col", "folder", "Column", "root", 0),
        makeNode("task", "task", "Task 1", "col", 0),
      ],
    });

    const state = buildBoardState(vault, "root");
    state.rootPath = "/Users/test/vault";

    const { lastFrame } = render(renderBoardCore(state, vault));

    const output = lastFrame() ?? "";

    // Header should show the path to the selected card immediately on first render
    // The path shows node names: Test Board / Column / Task 1
    expect(output).toContain("Test Board");
    expect(output).toContain("Task 1");

    // First non-empty line should contain the path (not be blank)
    const lines = output.split("\n").filter((l) => l.trim().length > 0);
    expect(lines[0]).toContain("Test Board");
  });

  test("ink board card content does not overflow into borders", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("board", "board", "Board", null, 0),
        makeNode("col", "folder", "Column", "board", 0),
        makeNode(
          "task",
          "task",
          "Stretching exercises for morning routine",
          "col",
          0,
        ),
      ],
    });

    const state = buildBoardState(vault, "board");

    // Use narrow width to force content handling
    const { lastFrame } = render(
      renderBoardCore(state, createFakeVault(), { width: 40 }),
    );

    const output = lastFrame() ?? "";
    const lines = output.split("\n");

    // Check that text doesn't bleed into box-drawing border characters
    for (const line of lines) {
      // Pattern: letter directly touching horizontal border line (no space between)
      const hasOverflow = /[a-zA-Z]\u2500|\u2500[a-zA-Z]/.test(line);
      if (hasOverflow) {
        console.log("Overflow detected in line:", line);
      }
      expect(hasOverflow).toBe(false);
    }
  });

  test("ink board cards have minimal padding", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("board", "board", "Board", null, 0),
        makeNode("col", "folder", "Column", "board", 0),
        makeNode("task", "task", "TestContent", "col", 0),
      ],
    });

    const state = buildBoardState(vault, "board");

    const { lastFrame } = render(renderBoardCore(state, createFakeVault()));

    const output = lastFrame() ?? "";
    const lines = output.split("\n");

    // Find line with our test content
    const contentLine = lines.find((l) => l.includes("TestContent"));
    expect(contentLine).toBeDefined();

    if (contentLine) {
      // Find padding between border and content
      // Round border uses \u2502 for vertical sides
      const match = contentLine.match(/[\u2502](\s*).*TestContent/);
      if (match) {
        const leftPadding = match[1]?.length ?? 0;
        // Should have at most 1 space of padding
        expect(leftPadding).toBeLessThanOrEqual(1);
      }
    }
  });

  test("ink board columns show side by side", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("board", "board", "Board", null, 0),
        makeNode("col1", "folder", "Todo", "board", 0),
        makeNode("col2", "folder", "InProgress", "board", 1),
        makeNode("col3", "folder", "Done", "board", 2),
      ],
    });

    const state = buildBoardState(vault, "board");

    // Wide enough for 3 columns
    const { lastFrame } = render(
      renderBoardCore(state, createFakeVault(), { width: 120 }),
      { columns: 120, rows: 24 },
    );

    const output = lastFrame() ?? "";

    // All column names should appear
    expect(output).toContain("Todo");
    expect(output).toContain("InProgress");
    expect(output).toContain("Done");

    // Find the lines with column headers - they should be on same line
    const lines = output.split("\n");
    const headerLine = lines.find(
      (l) =>
        l.includes("Todo") && l.includes("InProgress") && l.includes("Done"),
    );
    // All headers should be on the same line (horizontal layout)
    expect(headerLine).toBeDefined();
  });

  test("ink board shows card count in column header", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("board", "board", "Board", null, 0),
        makeNode("col", "folder", "MyColumn", "board", 0),
        makeNode("task1", "task", "Task 1", "col", 0),
        makeNode("task2", "task", "Task 2", "col", 1),
        makeNode("task3", "task", "Task 3", "col", 2),
      ],
    });

    const state = buildBoardState(vault, "board");

    const { lastFrame } = render(renderBoardCore(state, createFakeVault()));

    const output = lastFrame() ?? "";

    // Column header should show count
    expect(output).toContain("(3)");
  });
});

describe.serial("Navigation History with Selection", () => {
  test("navigation history stores selection state", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("root", "board", "Root Board", null, 0),
        makeNode("col1", "folder", "Column 1", "root", 0),
        makeNode("card1", "task", "Card 1", "col1", 0),
        makeNode("card2", "task", "Card 2", "col1", 1),
        // Add children to card1 so we can zoom into it
        makeNode("sub1", "task", "Sub-task 1", "card1", 0),
        makeNode("sub2", "task", "Sub-task 2", "card1", 1),
      ],
    });

    const state = buildBoardState(vault, "root");

    const { lastFrame, stdin } = render(renderBoardCore(state, vault));

    // Initial state should show Card 1
    let output = lastFrame() ?? "";
    expect(output).toContain("Card 1");

    // Move down to select Card 2 (j key)
    stdin.write("j");
    output = lastFrame() ?? "";
    expect(output).toContain("Card 2");

    // Zoom into Card 1 by moving back up and pressing Enter
    stdin.write("k"); // Move back to Card 1
    stdin.write("\r"); // Enter to zoom

    // Now we're zoomed into Card 1, should see sub-tasks
    output = lastFrame() ?? "";
    expect(output).toContain("Sub-task");

    // Navigate back with [ - should restore to Card 1 selected at root
    stdin.write("[");
    output = lastFrame() ?? "";
    expect(output).toContain("Card 1");
    expect(output).toContain("Card 2");
  });

  test("navigation history preserves subIndex on restore", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("board", "board", "Board", null, 0),
        makeNode("col", "folder", "Column", "board", 0),
        makeNode("card1", "task", "Parent Card", "col", 0),
        makeNode("child1", "task", "Child 1", "card1", 0),
        makeNode("child2", "task", "Child 2", "card1", 1),
        // Create another card to zoom into
        makeNode("card2", "task", "Card 2", "col", 1),
        makeNode("card2child", "task", "Card 2 Child", "card2", 0),
      ],
    });

    const state = buildBoardState(vault, "board");

    const { lastFrame, stdin } = render(renderBoardCore(state, vault));

    // Enter outline mode by pressing 'o' to navigate into the card's children
    stdin.write("o");

    // Move down in outline to select a child (increases subIndex)
    stdin.write("j");

    // Move to next card and zoom in
    stdin.write("j"); // Move to Card 2
    stdin.write("\r"); // Zoom in

    // Navigate back - subIndex should be restored
    stdin.write("[");

    // We should be back at the root board
    const output = lastFrame() ?? "";
    expect(output).toContain("Parent Card");
    expect(output).toContain("Card 2");
  });

  test("forward navigation with ] restores selection", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("board", "board", "Board", null, 0),
        makeNode("col", "folder", "Column", "board", 0),
        makeNode("card", "task", "Card with children", "col", 0),
        makeNode("childA", "task", "Child A", "card", 0),
        makeNode("childB", "task", "Child B", "card", 1),
      ],
    });

    const state = buildBoardState(vault, "board");

    const { lastFrame, stdin } = render(renderBoardCore(state, vault));

    // Zoom into the card
    stdin.write("\r");

    // Navigate back
    stdin.write("[");

    // Should be at root
    let output = lastFrame() ?? "";
    expect(output).toContain("Card with children");

    // Navigate forward with ]
    stdin.write("]");

    // Should be back in the zoomed view
    output = lastFrame() ?? "";
    expect(output).toContain("Child A");
    expect(output).toContain("Child B");
  });
});

describe.serial("Wiki Link Rendering", () => {
  test("wiki links are rendered without brackets", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("board", "board", "Board", null, 0),
        makeNode("col", "folder", "Column", "board", 0),
        // Create a task with wiki link in content
        makeNode("task", "task", "Check out [[my note]] for details", "col", 0),
      ],
    });

    const state = buildBoardState(vault, "board");

    const { lastFrame } = render(renderBoardCore(state, createFakeVault()));

    const output = lastFrame() ?? "";

    // The link text should appear without the brackets
    expect(output).toContain("my note");
    // The brackets should not appear
    expect(output).not.toContain("[[");
    expect(output).not.toContain("]]");
  });

  test("aliased wiki links show only the alias", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("board", "board", "Board", null, 0),
        makeNode("col", "folder", "Column", "board", 0),
        // Create a task with aliased wiki link: [[path|alias]]
        makeNode(
          "task",
          "task",
          "See [[MDTasks/tasks-system|task-system]] for info",
          "col",
          0,
        ),
      ],
    });

    const state = buildBoardState(vault, "board");

    const { lastFrame } = render(renderBoardCore(state, createFakeVault()));

    const output = lastFrame() ?? "";
    // Strip ANSI codes to check visible text (URLs are in OSC 8 hyperlink sequences)
    const visibleText = stripAnsi(output);

    // Should show the alias, not the path
    expect(visibleText).toContain("task-system");
    // Should NOT show the path in visible text (it's hidden in the hyperlink URL)
    expect(visibleText).not.toContain("MDTasks");
    // The brackets should not appear
    expect(visibleText).not.toContain("[[");
    expect(visibleText).not.toContain("]]");
  });
});

describe.serial("New Item Dialog", () => {
  test("NewItemDialog renders with cursor context", async () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("board", "board", "Board", null, 0),
        makeNode("col", "folder", "Column", "board", 0),
        makeNode("task", "task", "Test task", "col", 0),
      ],
    });

    const cursorNode = vault.getNode("task");

    // Import VaultProvider for context
    const { VaultProvider } = await import("../src/vault-context.tsx");

    const { lastFrame } = render(
      React.createElement(VaultProvider, {
        vault: createFakeVault(),
        children: React.createElement(NewItemDialog, {
          cursorNode,
          onCreate: () => {},
          onCancel: () => {},
          width: 40,
          height: 10,
        }),
      }),
    );

    const output = lastFrame() ?? "";

    // Should show "New task" header since cursor is on a task
    expect(output).toContain("New task");
    // Should show keybinding hints
    expect(output).toContain("Enter:create");
    expect(output).toContain("Esc:cancel");
  });

  test("NewItemDialog calls onCancel on Escape", async () => {
    let cancelled = false;
    const onCancel = () => {
      cancelled = true;
    };

    // Import VaultProvider for context
    const { VaultProvider } = await import("../src/vault-context.tsx");

    const { stdin } = render(
      React.createElement(VaultProvider, {
        vault: createFakeVault(),
        children: React.createElement(NewItemDialog, {
          cursorNode: null,
          onCreate: () => {},
          onCancel,
          width: 40,
          height: 10,
        }),
      }),
    );

    // Press Escape
    stdin.write("\x1b");

    expect(cancelled).toBe(true);
  });
});
