/**
 * Elaborate Board Move Tests
 *
 * Tests for node moving via board TUI including:
 * - Fresh disk-based repos (not just in-memory)
 * - Move card between columns (H/L keys)
 * - Move card within column (K/J keys)
 * - Event persistence to events.jsonl
 * - State projection after event replay
 * - Multi-card selection moves
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { rmSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";

import { InkBoardTestable } from "../src/commands/board/InkBoard.tsx";
import {
  buildBoardState,
  handleKey,
  getCurrentCard,
} from "../src/commands/board/state.ts";
import {
  resetDb,
  closeDb,
  getNode,
  applyEvent,
  setDb,
} from "@km/store";
import {
  emitNodeCreated,
  setKmDir,
  setDatabase,
  getEventsPath,
} from "@km/core";
import type { NodeType, Event } from "@km/core";
import { ulid } from "ulid";
import { Database } from "bun:sqlite";

// Test directory for disk-based tests
const TEST_DIR = join(import.meta.dir, ".test-board-move-elaborate");

// Helper to create nodes via emit
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
    parent_idx: extra?.parent_idx ?? 0,
    content,
    ...extra,
  });
  return id;
}

// Helper to create a standard test board
function createStandardBoard(): {
  rootId: string;
  col1Id: string;
  col2Id: string;
  col3Id: string;
  card1Id: string;
  card2Id: string;
  card3Id: string;
  card4Id: string;
} {
  const rootId = createTestNode("board", "Test Board");

  // Three columns
  const col1Id = createTestNode("folder", "Todo", rootId, { parent_idx: 0 });
  const col2Id = createTestNode("folder", "InProgress", rootId, {
    parent_idx: 1,
  });
  const col3Id = createTestNode("folder", "Done", rootId, { parent_idx: 2 });

  // Cards in columns with explicit parent_idx
  const card1Id = createTestNode("task", "Task 1", col1Id, { parent_idx: 0 });
  const card2Id = createTestNode("task", "Task 2", col1Id, { parent_idx: 1 });
  const card3Id = createTestNode("task", "Task 3", col2Id, { parent_idx: 0 });
  const card4Id = createTestNode("task", "Task 4", col3Id, { parent_idx: 0 });

  return {
    rootId,
    col1Id,
    col2Id,
    col3Id,
    card1Id,
    card2Id,
    card3Id,
    card4Id,
  };
}

describe("Board Move - Fresh Disk-Based Repo", () => {
  beforeEach(() => {
    // Ensure clean state - close any existing db first
    try {
      closeDb();
    } catch {
      // Ignore if already closed
    }

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

  it("persists move events to events.jsonl", () => {
    const { rootId, card1Id, col2Id } = createStandardBoard();

    // Build state and move card1 to col2 (L key moves right)
    const state = buildBoardState(rootId);
    expect(state.colIndex).toBe(0);
    expect(getCurrentCard(state)?.node.id).toBe(card1Id);

    // Press L to move card to next column
    const result = handleKey(state, "L");
    expect(result.action).toBe("refresh");

    // Verify event was persisted
    const eventsPath = getEventsPath();
    expect(existsSync(eventsPath)).toBe(true);

    const events = readFileSync(eventsPath, "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Event);

    // Find the move event
    const moveEvent = events.find((e) => e.type === "node_moved");
    expect(moveEvent).toBeDefined();
    expect(moveEvent?.target).toBe(card1Id);
    expect(moveEvent?.data.parent_id).toBe(col2Id);
    expect(typeof moveEvent?.data.parent_idx).toBe("number");
  });

  it("state reflects move after event application", () => {
    const { rootId, card1Id, col2Id } = createStandardBoard();

    // Verify initial state
    let node = getNode(card1Id);
    expect(node?.parent_id).not.toBe(col2Id);

    // Build state and move
    const state = buildBoardState(rootId);
    handleKey(state, "L");

    // Verify node was moved in database
    node = getNode(card1Id);
    expect(node?.parent_id).toBe(col2Id);
  });

  it("moves card up within column (K key)", () => {
    const { rootId, card2Id, col1Id } = createStandardBoard();

    // Start at second card
    const state = buildBoardState(rootId);
    state.cardIndex = 1; // Select card2

    expect(getCurrentCard(state)?.node.id).toBe(card2Id);

    // Move up with K
    const result = handleKey(state, "K");
    expect(result.action).toBe("refresh");

    // Verify card moved (parent_idx should be less than before)
    const node = getNode(card2Id);
    expect(node?.parent_id).toBe(col1Id);
    expect(node?.parent_idx).toBeLessThan(0); // Should be before first card
  });

  it("moves card down within column (J key)", () => {
    const { rootId, card1Id, col1Id } = createStandardBoard();

    const state = buildBoardState(rootId);
    expect(getCurrentCard(state)?.node.id).toBe(card1Id);

    // Move down with J
    const result = handleKey(state, "J");
    expect(result.action).toBe("refresh");

    // Verify card moved (parent_idx should be greater)
    const node = getNode(card1Id);
    expect(node?.parent_id).toBe(col1Id);
    expect(node?.parent_idx).toBeGreaterThan(1); // Should be after second card
  });

  it("moves card to previous column (H key)", () => {
    const { rootId, card3Id, col1Id, col2Id } = createStandardBoard();

    // Start in second column
    const state = buildBoardState(rootId);
    state.colIndex = 1;
    expect(getCurrentCard(state)?.node.id).toBe(card3Id);
    expect(getCurrentCard(state)?.node.parent_id).toBe(col2Id);

    // Move left with H
    const result = handleKey(state, "H");
    expect(result.action).toBe("refresh");

    // Verify card moved to first column
    const node = getNode(card3Id);
    expect(node?.parent_id).toBe(col1Id);
  });

  it("handles moving to empty column", () => {
    const rootId = createTestNode("board", "Test Board");
    const col1Id = createTestNode("folder", "Full", rootId, { parent_idx: 0 });
    const col2Id = createTestNode("folder", "Empty", rootId, { parent_idx: 1 });
    const cardId = createTestNode("task", "Only Card", col1Id, {
      parent_idx: 0,
    });

    const state = buildBoardState(rootId);
    expect(getCurrentCard(state)?.node.id).toBe(cardId);

    // Move to empty column
    const result = handleKey(state, "L");
    expect(result.action).toBe("refresh");

    const node = getNode(cardId);
    expect(node?.parent_id).toBe(col2Id);
    expect(node?.parent_idx).toBe(0); // First card in empty column
  });

  it("replays events from events.jsonl correctly", () => {
    const { rootId, card1Id, col2Id } = createStandardBoard();

    // Move a card
    const state = buildBoardState(rootId);
    handleKey(state, "L");

    // Close db and reset
    closeDb();

    // Re-read events and replay to fresh db
    const eventsPath = getEventsPath();
    const events = readFileSync(eventsPath, "utf-8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Event);

    // Create fresh database
    resetDb();

    // Replay all events
    for (const event of events) {
      applyEvent(event);
    }

    // Verify state is correct after replay
    const node = getNode(card1Id);
    expect(node?.parent_id).toBe(col2Id);
  });

  it("prevents move at boundary (first column, H key)", () => {
    const { rootId, card1Id, col1Id } = createStandardBoard();

    const state = buildBoardState(rootId);
    expect(state.colIndex).toBe(0); // Already at first column

    // Try to move left - should not trigger action
    const result = handleKey(state, "H");
    expect(result.action).toBeNull();

    // Card should not have moved
    const node = getNode(card1Id);
    expect(node?.parent_id).toBe(col1Id);
  });

  it("prevents move at boundary (last column, L key)", () => {
    const { rootId, card4Id, col3Id } = createStandardBoard();

    // Move to last column
    const state = buildBoardState(rootId);
    state.colIndex = 2;
    expect(getCurrentCard(state)?.node.id).toBe(card4Id);

    // Try to move right - should not trigger action
    const result = handleKey(state, "L");
    expect(result.action).toBeNull();

    // Card should not have moved
    const node = getNode(card4Id);
    expect(node?.parent_id).toBe(col3Id);
  });

  it("prevents move up at first position (K key)", () => {
    const { rootId, card1Id, col1Id } = createStandardBoard();

    const state = buildBoardState(rootId);
    expect(state.cardIndex).toBe(0); // Already at first card

    // Try to move up - should not trigger action
    const result = handleKey(state, "K");
    expect(result.action).toBeNull();

    // Card should not have moved
    const node = getNode(card1Id);
    expect(node?.parent_id).toBe(col1Id);
  });

  it("handles fractional index calculations correctly", () => {
    // Create board with specific indices
    const rootId = createTestNode("board", "Test Board");
    const colId = createTestNode("folder", "Column", rootId);

    // Create cards with specific indices
    const cardAId = createTestNode("task", "Card A", colId, { parent_idx: 0 });
    const cardBId = createTestNode("task", "Card B", colId, { parent_idx: 10 });
    const cardCId = createTestNode("task", "Card C", colId, {
      parent_idx: 20,
    });

    // Move card C between A and B
    const state = buildBoardState(rootId);
    state.cardIndex = 2; // Select Card C

    // Move up twice to get between A and B
    handleKey(state, "K"); // C moves before B
    const nodeAfterFirst = getNode(cardCId);
    expect(nodeAfterFirst?.parent_idx).toBeGreaterThan(0);
    expect(nodeAfterFirst?.parent_idx).toBeLessThan(10);
  });
});

describe("Board Move - In-Memory Mode", () => {
  let localDb: Database;

  beforeEach(() => {
    // Set up in-memory database
    localDb = new Database(":memory:");
    localDb.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        parent_id TEXT,
        symlink_to TEXT,
        parent_idx REAL DEFAULT 0,
        fs_path TEXT,
        fs_ino INTEGER,
        md_line INTEGER,
        md_pos INTEGER,
        md_slug TEXT,
        task_status TEXT,
        task_mark TEXT,
        assigned_to TEXT,
        due_date TEXT,
        scheduled_date TEXT,
        priority INTEGER,
        content TEXT,
        content_hash TEXT,
        data JSON DEFAULT '{}',
        created_at INTEGER,
        updated_at INTEGER,
        version TEXT
      );
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS links (
        source_id TEXT NOT NULL,
        target_id TEXT,
        target_name TEXT NOT NULL,
        section TEXT,
        block_id TEXT,
        alias TEXT,
        resolved_at INTEGER,
        PRIMARY KEY (source_id, target_name)
      );
    `);
    setDb(localDb);
    setDatabase({ applyEvent });
  });

  afterEach(() => {
    // Use closeDb() to properly reset db state for next test suite
    closeDb();
    // Also close our local reference
    try {
      localDb.close();
    } catch {
      // Already closed by closeDb
    }
  });

  it("renders board with move indicators in TUI", async () => {
    const now = Date.now();

    // Insert nodes directly
    const rootId = ulid();
    const col1Id = ulid();
    const cardId = ulid();

    localDb.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, content, data, created_at, updated_at, version)
       VALUES (?, 'board', null, 0, 'Board', '{}', ?, ?, '')`,
      [rootId, now, now]
    );
    localDb.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, content, data, created_at, updated_at, version)
       VALUES (?, 'folder', ?, 0, 'Column', '{}', ?, ?, '')`,
      [col1Id, rootId, now, now]
    );
    localDb.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, content, data, created_at, updated_at, version)
       VALUES (?, 'task', ?, 0, 'Test Card', '{}', ?, ?, '')`,
      [cardId, col1Id, now, now]
    );

    const state = buildBoardState(rootId);

    const { lastFrame } = render(
      React.createElement(InkBoardTestable, {
        initialState: state,
        testWidth: 80,
        testHeight: 24,
      })
    );

    const frame = lastFrame() ?? "";
    expect(frame).toContain("Column");
    expect(frame).toContain("Test Card");
  });

  it("updates TUI state after move", async () => {
    const now = Date.now();

    // Create a board with 2 columns
    const rootId = ulid();
    const col1Id = ulid();
    const col2Id = ulid();
    const cardId = ulid();

    localDb.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, content, data, created_at, updated_at, version)
       VALUES (?, 'board', null, 0, 'Board', '{}', ?, ?, '')`,
      [rootId, now, now]
    );
    localDb.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, content, data, created_at, updated_at, version)
       VALUES (?, 'folder', ?, 0, 'Source', '{}', ?, ?, '')`,
      [col1Id, rootId, now, now]
    );
    localDb.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, content, data, created_at, updated_at, version)
       VALUES (?, 'folder', ?, 1, 'Target', '{}', ?, ?, '')`,
      [col2Id, rootId, now, now]
    );
    localDb.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, content, data, created_at, updated_at, version)
       VALUES (?, 'task', ?, 0, 'Moving Card', '{}', ?, ?, '')`,
      [cardId, col1Id, now, now]
    );

    // Build initial state
    let state = buildBoardState(rootId);
    expect(state.columns[0]?.cards.length).toBe(1);
    expect(state.columns[1]?.cards.length).toBe(0);

    // Move card right
    handleKey(state, "L");

    // Rebuild state to see changes
    state = buildBoardState(rootId);
    expect(state.columns[0]?.cards.length).toBe(0);
    expect(state.columns[1]?.cards.length).toBe(1);
  });
});

describe("Board Move - Multi-card Selection", () => {
  beforeEach(() => {
    // Ensure clean state - close any existing db first
    try {
      closeDb();
    } catch {
      // Ignore if already closed
    }

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

  it("moves multiple selected cards with x (status cycle)", () => {
    const { rootId, card1Id, card2Id } = createStandardBoard();

    // Select multiple cards
    const state = buildBoardState(rootId);
    state.selectedCards.add(card1Id);
    state.selectedCards.add(card2Id);

    // Cycle status for all selected
    handleKey(state, "x");

    // Both should have changed status
    const node1 = getNode(card1Id);
    const node2 = getNode(card2Id);
    expect(node1?.task_status).toBe("in_progress");
    expect(node2?.task_status).toBe("in_progress");
  });

  it("sets priority for multiple selected cards", () => {
    const { rootId, card1Id, card2Id } = createStandardBoard();

    const state = buildBoardState(rootId);
    state.selectedCards.add(card1Id);
    state.selectedCards.add(card2Id);

    // Set priority 1
    handleKey(state, "1");

    const node1 = getNode(card1Id);
    const node2 = getNode(card2Id);
    expect(node1?.priority).toBe(1);
    expect(node2?.priority).toBe(1);
  });
});

describe("Board Move - Edge Cases", () => {
  beforeEach(() => {
    // Ensure clean state - close any existing db first
    try {
      closeDb();
    } catch {
      // Ignore if already closed
    }

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

  it("handles board with single column", () => {
    const rootId = createTestNode("board", "Board");
    const colId = createTestNode("folder", "Only Column", rootId);
    const cardId = createTestNode("task", "Card", colId);

    const state = buildBoardState(rootId);

    // Try to move left - should not work
    let result = handleKey(state, "H");
    expect(result.action).toBeNull();

    // Try to move right - should not work
    result = handleKey(state, "L");
    expect(result.action).toBeNull();

    // Card should still be in same column
    const node = getNode(cardId);
    expect(node?.parent_id).toBe(colId);
  });

  it("handles column with single card", () => {
    const rootId = createTestNode("board", "Board");
    const colId = createTestNode("folder", "Column", rootId);
    createTestNode("task", "Only Card", colId);

    const state = buildBoardState(rootId);

    // Try to move up - should not work (already first)
    let result = handleKey(state, "K");
    expect(result.action).toBeNull();

    // Try to move down - should not work (already last)
    result = handleKey(state, "J");
    expect(result.action).toBeNull();
  });

  it("handles empty column navigation", () => {
    const rootId = createTestNode("board", "Board");
    createTestNode("folder", "Empty", rootId, { parent_idx: 0 });
    const col2Id = createTestNode("folder", "Full", rootId, { parent_idx: 1 });
    createTestNode("task", "Card", col2Id);

    const state = buildBoardState(rootId);
    expect(state.columns[0]?.cards.length).toBe(0);
    expect(state.columns[1]?.cards.length).toBe(1);

    // Navigate to empty column
    handleKey(state, "h"); // Should not crash

    // No card to move in empty column
    const result = handleKey(state, "L");
    expect(result.action).toBeNull();
  });

  it("preserves card order after multiple moves", () => {
    const rootId = createTestNode("board", "Board");
    const colId = createTestNode("folder", "Column", rootId);

    // Create cards A, B, C, D with indices 0, 1, 2, 3
    const cardAId = createTestNode("task", "A", colId, { parent_idx: 0 });
    createTestNode("task", "B", colId, { parent_idx: 1 });
    createTestNode("task", "C", colId, { parent_idx: 2 });
    const cardDId = createTestNode("task", "D", colId, { parent_idx: 3 });

    // Move D up one position - state must be rebuilt after each move
    // to get fresh parent_idx values (like the real TUI does on "refresh")
    let state = buildBoardState(rootId);
    state.cardIndex = 3; // Select D
    handleKey(state, "K"); // D moves before C

    // Rebuild state after move (simulating "refresh" action)
    state = buildBoardState(rootId);
    // Find D's new position
    const col = state.columns[0];
    if (col) {
      state.cardIndex = col.cards.findIndex((c) => c.node.id === cardDId);
    }
    handleKey(state, "K"); // D moves before B

    state = buildBoardState(rootId);
    const col2 = state.columns[0];
    if (col2) {
      state.cardIndex = col2.cards.findIndex((c) => c.node.id === cardDId);
    }
    handleKey(state, "K"); // D moves before A

    // Rebuild and verify order
    state = buildBoardState(rootId);

    // Get indices - D should now be first
    const nodeA = getNode(cardAId);
    const nodeD = getNode(cardDId);

    // D should now be before A (at position 0)
    expect(nodeD!.parent_idx).toBeLessThan(nodeA!.parent_idx);

    // Verify the visual order in state matches
    const finalCol = state.columns[0];
    expect(finalCol).toBeDefined();
    expect(finalCol!.cards[0]?.node.id).toBe(cardDId);
    expect(finalCol!.cards[1]?.node.id).toBe(cardAId);
  });
});
