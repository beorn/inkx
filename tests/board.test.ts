/**
 * Board Tests
 *
 * Tests for the boardliner TUI state management and rendering
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// Set test environment before imports
const TEST_DIR = join(import.meta.dir, ".test-board");
process.env.KM_PATH = TEST_DIR;

import {
  resetDb,
  closeDb,
  getNode,
  getChildren,
} from "../src/node/db.ts";

import {
  emitNodeCreated,
  setKmPath,
  setDatabase,
} from "../src/node/emit.ts";

import { applyEvent } from "../src/node/db.ts";

import type { NodeType } from "../src/node/types.ts";
import { ulid } from "ulid";

import {
  createEmptyState,
  initBoardState,
  buildBoardState,
  handleKey,
  handleSearchKey,
  getNodeDisplayName,
  getCurrentCard,
  getCurrentColumn,
} from "../src/cli/commands/board/state.ts";

import {
  renderBoard,
  renderBoardStatic,
  renderCard,
  renderStatusBar,
  renderHelp,
  getStatusIcon,
  defaultRenderOptions,
} from "../src/cli/commands/board/render.ts";

import type { BoardState, CardState, ColumnState } from "../src/cli/commands/board/types.ts";

// Test helpers
function createTestNode(
  type: NodeType,
  content?: string,
  parentId?: string | null,
  extra?: Record<string, unknown>
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

describe("Board State", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmPath(TEST_DIR);
    setDatabase({ applyEvent });
    resetDb();
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("createEmptyState returns valid empty state", () => {
    const state = createEmptyState();
    expect(state.rootId).toBeNull();
    expect(state.columns).toHaveLength(0);
    expect(state.colIndex).toBe(0);
    expect(state.cardIndex).toBe(0);
    expect(state.selectedCards.size).toBe(0);
    expect(state.visualMode).toBe(false);
    expect(state.searchMode).toBe(false);
    expect(state.helpMode).toBe(false);
  });

  test("buildBoardState creates columns from children", () => {
    // Create a root with two children (columns)
    const rootId = createTestNode("board", "Test Board");
    const col1Id = createTestNode("folder", "Column 1", rootId);
    const col2Id = createTestNode("folder", "Column 2", rootId);

    // Add cards to columns
    createTestNode("task", "Card 1.1", col1Id);
    createTestNode("task", "Card 1.2", col1Id);
    createTestNode("task", "Card 2.1", col2Id);

    const state = buildBoardState(rootId);

    expect(state.rootId).toBe(rootId);
    expect(state.columns).toHaveLength(2);
    expect(state.columns[0].cards).toHaveLength(2);
    expect(state.columns[1].cards).toHaveLength(1);
  });

  test("initBoardState groups root nodes by name", () => {
    // Create root nodes - two with same name, one different
    createTestNode("folder", "Projects");
    createTestNode("folder", "Projects"); // Duplicate name
    createTestNode("folder", "Archive");

    const state = initBoardState();

    expect(state).not.toBeNull();
    expect(state!.rootId).toBeNull(); // null means root level view
    expect(state!.columns).toHaveLength(2); // Grouped by unique name
  });

  test("initBoardState returns null for empty database", () => {
    const state = initBoardState();
    expect(state).toBeNull();
  });

  test("getNodeDisplayName returns content", () => {
    const id = createTestNode("task", "Test Task");
    const node = getNode(id)!;
    expect(getNodeDisplayName(node)).toBe("Test Task");
  });

  test("getNodeDisplayName returns data.name if present", () => {
    const id = createTestNode("folder", undefined, null, { data: { name: "My Folder" } });
    const node = getNode(id)!;
    expect(getNodeDisplayName(node)).toBe("My Folder");
  });

  test("getCurrentCard returns current card", () => {
    const rootId = createTestNode("board", "Board");
    const colId = createTestNode("folder", "Column", rootId);
    const cardId = createTestNode("task", "Card", colId);

    const state = buildBoardState(rootId);
    const card = getCurrentCard(state);

    expect(card).not.toBeNull();
    expect(card!.node.id).toBe(cardId);
  });

  test("getCurrentColumn returns current column", () => {
    const rootId = createTestNode("board", "Board");
    const colId = createTestNode("folder", "Column", rootId);

    const state = buildBoardState(rootId);
    const col = getCurrentColumn(state);

    expect(col).not.toBeNull();
    expect(col!.node.id).toBe(colId);
  });
});

describe("Board Key Handling", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmPath(TEST_DIR);
    setDatabase({ applyEvent });
    resetDb();
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  function createTestBoard(): BoardState {
    const rootId = createTestNode("board", "Test Board");
    const col1Id = createTestNode("folder", "Todo", rootId);
    const col2Id = createTestNode("folder", "Done", rootId);
    createTestNode("task", "Task 1", col1Id);
    createTestNode("task", "Task 2", col1Id);
    createTestNode("task", "Task 3", col2Id);
    return buildBoardState(rootId);
  }

  test("h key moves left", () => {
    const state = createTestBoard();
    state.colIndex = 1;
    const result = handleKey(state, "h");
    expect(result.state.colIndex).toBe(0);
    expect(result.action).toBeNull();
  });

  test("l key moves right", () => {
    const state = createTestBoard();
    const result = handleKey(state, "l");
    expect(result.state.colIndex).toBe(1);
    expect(result.action).toBeNull();
  });

  test("j key moves down", () => {
    const state = createTestBoard();
    const result = handleKey(state, "j");
    expect(result.state.cardIndex).toBe(1);
    expect(result.action).toBeNull();
  });

  test("k key moves up", () => {
    const state = createTestBoard();
    state.cardIndex = 1;
    const result = handleKey(state, "k");
    expect(result.state.cardIndex).toBe(0);
    expect(result.action).toBeNull();
  });

  test("g jumps to first card", () => {
    const state = createTestBoard();
    state.cardIndex = 1;
    const result = handleKey(state, "g");
    expect(result.state.cardIndex).toBe(0);
  });

  test("G jumps to last card", () => {
    const state = createTestBoard();
    const result = handleKey(state, "G");
    expect(result.state.cardIndex).toBe(1); // Column 1 has 2 cards
  });

  test("q returns quit action", () => {
    const state = createTestBoard();
    const result = handleKey(state, "q");
    expect(result.action).toBe("quit");
  });

  test("? enables help mode", () => {
    const state = createTestBoard();
    const result = handleKey(state, "?");
    expect(result.state.helpMode).toBe(true);
  });

  test("/ enables search mode", () => {
    const state = createTestBoard();
    const result = handleKey(state, "/");
    expect(result.state.searchMode).toBe(true);
    expect(result.state.searchQuery).toBe("");
  });

  test("v toggles visual mode", () => {
    const state = createTestBoard();
    const result1 = handleKey(state, "v");
    expect(result1.state.visualMode).toBe(true);
    expect(result1.state.selectedCards.size).toBe(1);

    const result2 = handleKey(result1.state, "v");
    expect(result2.state.visualMode).toBe(false);
    expect(result2.state.selectedCards.size).toBe(0);
  });

  test("space toggles selection", () => {
    const state = createTestBoard();
    const result1 = handleKey(state, " ");
    expect(result1.state.selectedCards.size).toBe(1);

    const result2 = handleKey(result1.state, " ");
    expect(result2.state.selectedCards.size).toBe(0);
  });

  test("Tab toggles fold", () => {
    const state = createTestBoard();
    const card = getCurrentCard(state)!;

    const result1 = handleKey(state, "\t");
    expect(result1.state.foldedCards.has(card.node.id)).toBe(true);

    const result2 = handleKey(result1.state, "\t");
    expect(result2.state.foldedCards.has(card.node.id)).toBe(false);
  });
});

describe("Board Search", () => {
  test("handleSearchKey adds characters", () => {
    const state = createEmptyState();
    state.searchMode = true;

    const r1 = handleSearchKey(state, "t");
    expect(r1.state.searchQuery).toBe("t");

    const r2 = handleSearchKey(r1.state, "e");
    expect(r2.state.searchQuery).toBe("te");

    const r3 = handleSearchKey(r2.state, "s");
    expect(r3.state.searchQuery).toBe("tes");
  });

  test("handleSearchKey backspace removes character", () => {
    const state = createEmptyState();
    state.searchMode = true;
    state.searchQuery = "test";

    const result = handleSearchKey(state, "\x7F");
    expect(result.state.searchQuery).toBe("tes");
  });

  test("handleSearchKey enter exits search", () => {
    const state = createEmptyState();
    state.searchMode = true;
    state.searchQuery = "test";

    const result = handleSearchKey(state, "\r");
    expect(result.exitSearch).toBe(true);
    expect(result.state.searchMode).toBe(false);
  });

  test("handleSearchKey escape exits search", () => {
    const state = createEmptyState();
    state.searchMode = true;

    const result = handleSearchKey(state, "\x1B");
    expect(result.exitSearch).toBe(true);
  });
});

describe("Board Rendering", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmPath(TEST_DIR);
    setDatabase({ applyEvent });
    resetDb();
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("renderBoardStatic renders columns", () => {
    const rootId = createTestNode("board", "Board");
    const col1Id = createTestNode("folder", "Todo", rootId);
    createTestNode("folder", "Done", rootId);
    createTestNode("task", "Task 1", col1Id);

    const state = buildBoardState(rootId);
    const output = renderBoardStatic(state, 80);

    expect(output).toContain("Todo");
    expect(output).toContain("Done");
    expect(output).toContain("Task 1");
  });

  test("renderBoardStatic handles empty board", () => {
    const state = createEmptyState();
    const output = renderBoardStatic(state, 80);
    expect(output).toContain("Empty board");
  });

  test("renderStatusBar shows visual mode", () => {
    const state = createEmptyState();
    state.visualMode = true;

    const output = renderStatusBar(state, 80);
    expect(output).toContain("VISUAL");
  });

  test("renderStatusBar shows selection count", () => {
    const state = createEmptyState();
    state.selectedCards.add("card-1");
    state.selectedCards.add("card-2");

    const output = renderStatusBar(state, 80);
    expect(output).toContain("2 selected");
  });

  test("renderHelp contains keybindings", () => {
    const output = renderHelp(80);
    expect(output).toContain("Navigation");
    expect(output).toContain("h / Ctrl+B");
    expect(output).toContain("Move to left column");
  });

  test("getStatusIcon returns correct icons", () => {
    expect(getStatusIcon("done")).toContain("✓");
    expect(getStatusIcon("in_progress")).toContain("◐");
    expect(getStatusIcon("blocked")).toContain("⊘");
    expect(getStatusIcon("waiting")).toContain("◷");
    expect(getStatusIcon(undefined)).toContain("○");
  });

  test("renderCard includes content", () => {
    const cardState: CardState = {
      node: {
        id: "test-card",
        type: "task",
        parent_id: null,
        sort_order: 0,
        symlink_to: null,
        content: "My Test Task",
        data: {},
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      },
      children: [],
    };

    const output = renderCard(cardState, 40, false, false, false);
    expect(output).toContain("My Test Task");
  });

  test("renderCard shows children when not folded", () => {
    const cardState: CardState = {
      node: {
        id: "test-card",
        type: "task",
        parent_id: null,
        sort_order: 0,
        symlink_to: null,
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
          sort_order: 0,
          symlink_to: null,
          content: "Child Task 1",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        },
      ],
    };

    const output = renderCard(cardState, 40, false, false, false);
    expect(output).toContain("Child Task 1");
  });

  test("renderCard shows item count when folded", () => {
    const cardState: CardState = {
      node: {
        id: "test-card",
        type: "task",
        parent_id: null,
        sort_order: 0,
        symlink_to: null,
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
          sort_order: 0,
          symlink_to: null,
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
          sort_order: 1,
          symlink_to: null,
          content: "Child 2",
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "v1",
        },
      ],
    };

    const output = renderCard(cardState, 40, false, false, true);
    expect(output).toContain("▶ 2"); // Collapsed indicator with count
    expect(output).not.toContain("Child 1");
  });
});

describe("Board Zoom Navigation", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmPath(TEST_DIR);
    setDatabase({ applyEvent });
    resetDb();
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("Enter zooms into card with children", () => {
    const rootId = createTestNode("board", "Board");
    const colId = createTestNode("folder", "Column", rootId);
    const cardId = createTestNode("task", "Card", colId);
    const subCardId = createTestNode("task", "Sub-card", cardId);

    const state = buildBoardState(rootId);

    // Enter should zoom into the card
    const result = handleKey(state, "\r");

    expect(result.state.rootId).toBe(cardId);
    expect(result.state.zoomStack).toContain(rootId);
    expect(result.action).toBeNull();
  });

  test("Escape zooms out", () => {
    const rootId = createTestNode("board", "Board");
    const colId = createTestNode("folder", "Column", rootId);
    const cardId = createTestNode("task", "Card", colId);
    createTestNode("task", "Sub-card", cardId);

    // Start zoomed in
    const state = buildBoardState(cardId);
    state.zoomStack = [rootId];

    const result = handleKey(state, "\x1B");

    expect(result.state.rootId).toBe(rootId);
    expect(result.state.zoomStack).toHaveLength(0);
    expect(result.action).toBeNull();
  });

  test("Escape quits when at root", () => {
    const rootId = createTestNode("board", "Board");
    const state = buildBoardState(rootId);

    const result = handleKey(state, "\x1B");
    expect(result.action).toBe("quit");
  });
});
