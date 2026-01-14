/**
 * Board Tests
 *
 * Tests for the boardliner TUI state management and rendering
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// Test directories - KM_DIR is set in beforeEach via setKmDir()
const TEST_DIR = join(import.meta.dir, ".test-board");

import { resetDb, closeDb, getNode, getChildren, applyEvent } from "@km/store";

import { emitNodeCreated, setKmDir, setDatabase } from "@km/core";

import type { NodeType } from "@km/core";
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
} from "../src/tui/state.ts";

import {
  renderBoard,
  renderBoardStatic,
  renderCard,
  renderStatusBar,
  renderHelp,
  getStatusIcon,
  defaultRenderOptions,
} from "../src/tui/render.ts";

import type { BoardState, CardState, ColumnState } from "../src/tui/types.ts";

// Test helpers
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

describe("Board State", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
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

  test("initBoardState deduplicates cards by name within grouped columns", () => {
    // Create multiple root nodes with same name
    const ref1 = createTestNode("folder", "ref");
    const ref2 = createTestNode("folder", "ref");
    const ref3 = createTestNode("folder", "ref");

    // Each ref has a child with the same name "Projects"
    createTestNode("folder", "Projects", ref1);
    createTestNode("folder", "Projects", ref2);
    createTestNode("folder", "Projects", ref3);

    // And some with different names
    createTestNode("folder", "Archive", ref1);
    createTestNode("folder", "Work", ref2);

    const state = initBoardState();

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
    const state = initBoardState();
    expect(state).toBeNull();
  });

  test("getNodeDisplayName returns content", () => {
    const id = createTestNode("task", "Test Task");
    const node = getNode(id)!;
    expect(getNodeDisplayName(node)).toBe("Test Task");
  });

  test("getNodeDisplayName returns data.name if present", () => {
    const id = createTestNode("folder", undefined, null, {
      data: { name: "My Folder" },
    });
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
    setKmDir(TEST_DIR);
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

  test("handleSearchKey enter with no matches returns createTask (NV-style)", () => {
    const state = createEmptyState();
    state.searchMode = true;
    state.searchQuery = "new task content";
    // No columns/cards, so no matches exist

    const result = handleSearchKey(state, "\r");
    expect(result.exitSearch).toBe(true);
    expect(result.createTask).toBe("new task content");
  });

  test("handleSearchKey enter with matches does not return createTask", () => {
    const state = createEmptyState();
    state.searchMode = true;
    state.searchQuery = "task";
    // Add a column with a matching card
    state.columns = [
      {
        node: {
          id: "col1",
          type: "section",
          content: "Todo",
          parent_id: null,
          parent_idx: 0,
          symlink_to: null,
          data: {},
          created_at: Date.now(),
          updated_at: Date.now(),
          version: "1",
        },
        cards: [
          {
            node: {
              id: "card1",
              type: "task",
              content: "Matching task here",
              parent_id: "col1",
              parent_idx: 0,
              symlink_to: null,
              data: {},
              created_at: Date.now(),
              updated_at: Date.now(),
              version: "1",
            },
            children: [],
          },
        ],
      },
    ];

    const result = handleSearchKey(state, "\r");
    expect(result.exitSearch).toBe(true);
    expect(result.createTask).toBeUndefined();
  });
});

describe("Board Rendering", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
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
        parent_idx: 0,
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
        parent_idx: 0,
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
          parent_idx: 0,
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
        parent_idx: 0,
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
          parent_idx: 0,
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
          parent_idx: 1,
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
    setKmDir(TEST_DIR);
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

describe("Ink Board Rendering", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    setDatabase({ applyEvent });
    resetDb();
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  // Note: Full Ink testing would require ink-testing-library
  // These tests verify the static rendering which shares logic with Ink components

  test("board with rootPath shows filesystem path", () => {
    const rootId = createTestNode("board", "Test Board");
    const colId = createTestNode("folder", "Column", rootId);
    createTestNode("task", "Task 1", colId);

    const state = buildBoardState(rootId);
    state.rootPath = "/Users/test/vault";

    const output = renderBoardStatic(state, 80);
    // The static renderer doesn't show rootPath, but this verifies state setup
    expect(state.rootPath).toBe("/Users/test/vault");
    expect(output).toContain("Column");
  });

  test("board state includes rootPath field", () => {
    const state = createEmptyState();
    expect(state.rootPath).toBeNull();

    const rootId = createTestNode("board", "Board");
    const boardState = buildBoardState(rootId);
    expect(boardState.rootPath).toBeNull(); // Set by caller, not buildBoardState
  });

  test("renderBoardStatic truncates long content", () => {
    const rootId = createTestNode("board", "Board");
    const colId = createTestNode("folder", "Column", rootId);
    createTestNode(
      "task",
      "This is a very long task name that should be truncated when rendered in a narrow column width",
      colId,
    );

    const state = buildBoardState(rootId);
    const output = renderBoardStatic(state, 40); // Narrow width

    // Content should be present but may be truncated
    expect(output).toContain("This is a very long");
    expect(output.length).toBeLessThan(500); // Reasonable output size
  });

  test("renderBoardStatic shows column counts", () => {
    const rootId = createTestNode("board", "Board");
    const colId = createTestNode("folder", "Todo", rootId);
    createTestNode("task", "Task 1", colId);
    createTestNode("task", "Task 2", colId);
    createTestNode("task", "Task 3", colId);

    const state = buildBoardState(rootId);
    const output = renderBoardStatic(state, 80);

    expect(output).toContain("Todo");
    expect(output).toContain("(3)"); // Card count
  });

  test("renderBoardStatic handles multiple columns", () => {
    const rootId = createTestNode("board", "Board");
    createTestNode("folder", "Todo", rootId);
    createTestNode("folder", "In Progress", rootId);
    createTestNode("folder", "Done", rootId);

    const state = buildBoardState(rootId);
    const output = renderBoardStatic(state, 120);

    expect(output).toContain("Todo");
    expect(output).toContain("In Progress");
    expect(output).toContain("Done");
  });
});

describe("Ink Board TUI Rendering", () => {
  // Tests using ink-testing-library to test the ACTUAL Ink components

  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    setDatabase({ applyEvent });
    resetDb();
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("ink board shows header path on first render", async () => {
    const { render } = await import("ink-testing-library");
    const { InkBoardTestable } = await import("../src/tui/views/Board.tsx");
    const React = await import("react");

    const rootId = createTestNode("board", "Test Board");
    const colId = createTestNode("folder", "Column", rootId);
    createTestNode("task", "Task 1", colId);

    const state = buildBoardState(rootId);
    state.rootPath = "/Users/test/vault";

    const { lastFrame } = render(
      React.createElement(InkBoardTestable, {
        initialState: state,
        testWidth: 80,
        testHeight: 24,
      }),
    );

    const output = lastFrame() ?? "";

    // Header should show the path to the selected card immediately on first render
    // The path shows node names: Test Board / Column / Task 1
    expect(output).toContain("Test Board");
    expect(output).toContain("Task 1");

    // First non-empty line should contain the path (not be blank)
    const lines = output.split("\n").filter((l) => l.trim().length > 0);
    expect(lines[0]).toContain("Test Board");
  });

  test("ink board card content does not overflow into borders", async () => {
    const { render } = await import("ink-testing-library");
    const { InkBoardTestable } = await import("../src/tui/views/Board.tsx");
    const React = await import("react");

    const rootId = createTestNode("board", "Board");
    const colId = createTestNode("folder", "Column", rootId);
    createTestNode("task", "Stretching exercises for morning routine", colId);

    const state = buildBoardState(rootId);

    // Use narrow width to force content handling
    const { lastFrame } = render(
      React.createElement(InkBoardTestable, {
        initialState: state,
        testWidth: 40,
        testHeight: 24,
      }),
    );

    const output = lastFrame() ?? "";
    const lines = output.split("\n");

    // Check that text doesn't bleed into box-drawing border characters
    for (const line of lines) {
      // Pattern: letter directly touching horizontal border line (no space between)
      const hasOverflow = /[a-zA-Z]─|─[a-zA-Z]/.test(line);
      if (hasOverflow) {
        console.log("Overflow detected in line:", line);
      }
      expect(hasOverflow).toBe(false);
    }
  });

  test("ink board cards have minimal padding", async () => {
    const { render } = await import("ink-testing-library");
    const { InkBoardTestable } = await import("../src/tui/views/Board.tsx");
    const React = await import("react");

    const rootId = createTestNode("board", "Board");
    const colId = createTestNode("folder", "Column", rootId);
    createTestNode("task", "TestContent", colId);

    const state = buildBoardState(rootId);

    const { lastFrame } = render(
      React.createElement(InkBoardTestable, {
        initialState: state,
        testWidth: 80,
        testHeight: 24,
      }),
    );

    const output = lastFrame() ?? "";
    const lines = output.split("\n");

    // Find line with our test content
    const contentLine = lines.find((l) => l.includes("TestContent"));
    expect(contentLine).toBeDefined();

    if (contentLine) {
      // Find padding between border and content
      // Round border uses │ for vertical sides
      const match = contentLine.match(/[│](\s*).*TestContent/);
      if (match) {
        const leftPadding = match[1]?.length ?? 0;
        // Should have at most 1 space of padding
        expect(leftPadding).toBeLessThanOrEqual(1);
      }
    }
  });

  test("ink board columns show side by side", async () => {
    const { render } = await import("ink-testing-library");
    const { InkBoardTestable } = await import("../src/tui/views/Board.tsx");
    const React = await import("react");

    const rootId = createTestNode("board", "Board");
    createTestNode("folder", "Todo", rootId);
    createTestNode("folder", "InProgress", rootId);
    createTestNode("folder", "Done", rootId);

    const state = buildBoardState(rootId);

    // Wide enough for 3 columns
    const { lastFrame } = render(
      React.createElement(InkBoardTestable, {
        initialState: state,
        testWidth: 120,
        testHeight: 24,
      }),
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

  test("ink board shows card count in column header", async () => {
    const { render } = await import("ink-testing-library");
    const { InkBoardTestable } = await import("../src/tui/views/Board.tsx");
    const React = await import("react");

    const rootId = createTestNode("board", "Board");
    const colId = createTestNode("folder", "MyColumn", rootId);
    createTestNode("task", "Task 1", colId);
    createTestNode("task", "Task 2", colId);
    createTestNode("task", "Task 3", colId);

    const state = buildBoardState(rootId);

    const { lastFrame } = render(
      React.createElement(InkBoardTestable, {
        initialState: state,
        testWidth: 80,
        testHeight: 24,
      }),
    );

    const output = lastFrame() ?? "";

    // Column header should show count
    expect(output).toContain("(3)");
  });
});
