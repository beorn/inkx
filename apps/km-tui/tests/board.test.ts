/**
 * Board Slow Tests - Integration tests using createFakeVault test double
 * Run with: bun run test:all (includes slow tests)
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
import { stripAnsi } from "../src/layout/index.ts";
import { renderBoardStatic, renderCard } from "../src/render.ts";
import type { CardState } from "../src/types.ts";
import { BoardCore } from "../src/views/Board.tsx";
import { createInitialUIState } from "../src/ui-reducer.ts";
import { createLayoutRegistry } from "../src/card-positions.ts";
import { VaultProvider } from "../src/vault-context.tsx";
import { NewItemDialog } from "../src/views/NewItemDialog.tsx";
import type { TUIBoardState } from "../src/types.ts";

function renderBoardCore(
  state: TUIBoardState,
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

describe.serial("State", () => {
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
        makeNode("proj2", "folder", "Projects", null, 1),
        makeNode("arch", "folder", "Archive", null, 2),
      ],
    });
    const state = initBoardState(vault);
    expect(state).not.toBeNull();
    expect(state!.rootId).toBeNull();
    expect(state!.columns).toHaveLength(2);
  });

  test("initBoardState deduplicates cards by name within grouped columns", () => {
    const vault = createFakeVault({
      nodes: [
        makeNode("ref1", "folder", "ref", null, 0),
        makeNode("ref2", "folder", "ref", null, 1),
        makeNode("ref3", "folder", "ref", null, 2),
        makeNode("p1", "folder", "Projects", "ref1", 0),
        makeNode("p2", "folder", "Projects", "ref2", 0),
        makeNode("p3", "folder", "Projects", "ref3", 0),
        makeNode("a1", "folder", "Archive", "ref1", 1),
        makeNode("w1", "folder", "Work", "ref2", 1),
      ],
    });
    const state = initBoardState(vault);
    expect(state).not.toBeNull();
    expect(state!.columns).toHaveLength(1);
    const cardNames = state!.columns[0]!.cards.map(
      (c) => c.node.content || c.node.data?.name,
    );
    const uniqueNames = new Set(cardNames);
    expect(uniqueNames.size).toBe(3);
    expect(cardNames.length).toBe(3);
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
        makeNode(
          "para",
          "paragraph",
          "All issues tracked with the @issue tag.",
          "root",
          0,
        ),
        makeNode("col1", "section", "Open Issues", "root", 1),
        makeNode("col2", "section", "Closed Issues", "root", 2),
        makeNode("task1", "task", "Fix bug #1", "col1", 0),
        makeNode("task2", "task", "Fix bug #2", "col2", 0),
      ],
    });
    const state = buildBoardState(vault, "root");
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
        makeNode("code", "code", "const x = 1;", "root", 0),
        makeNode("quote", "quote", "Some quote text", "root", 1),
        makeNode("col", "section", "Getting Started", "root", 2),
        makeNode("task", "task", "Install dependencies", "col", 0),
      ],
    });
    const state = buildBoardState(vault, "root");
    expect(state.columns).toHaveLength(2);
    expect(state.columns[0]!.isVirtual).toBe(true);
    expect(state.columns[0]!.cards).toHaveLength(2);
    expect(state.columns[1]!.node.id).toBe("col");
  });
});

describe.serial("Keys", () => {
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
    expect(result.state.cardIndex).toBe(1);
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

describe.serial("Render", () => {
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
    expect(output).toContain("\u25b6 2");
    expect(output).not.toContain("Child 1");
  });
});
