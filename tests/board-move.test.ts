/**
 * Test board move mode
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { render } from "ink-testing-library";
import React from "react";
import { InkBoardTestable } from "../src/cli/commands/board/InkBoard.tsx";
import type { BoardState } from "../src/cli/commands/board/types.ts";
import { resetDb, getDb, setDb } from "../src/node/db.ts";
import { Database } from "bun:sqlite";

// Create a mock board state
function createMockBoardState(): BoardState {
  const now = Date.now();

  return {
    rootId: "root",
    rootPath: "/test",
    columns: [
      {
        node: {
          id: "col1",
          type: "section",
          parent_id: "root",
          parent_idx: 0,
          symlink_to: null,
          content: "Column 1",
          data: {},
          created_at: now,
          updated_at: now,
          version: "",
        },
        cards: [
          {
            node: {
              id: "card1",
              type: "section",
              parent_id: "col1",
              parent_idx: 0,
              symlink_to: null,
              content: "Card A",
              data: {},
              created_at: now,
              updated_at: now,
              version: "",
            },
            children: [],
          },
          {
            node: {
              id: "card2",
              type: "section",
              parent_id: "col1",
              parent_idx: 1,
              symlink_to: null,
              content: "Card B",
              data: {},
              created_at: now,
              updated_at: now,
              version: "",
            },
            children: [],
          },
        ],
      },
      {
        node: {
          id: "col2",
          type: "section",
          parent_id: "root",
          parent_idx: 1,
          symlink_to: null,
          content: "Column 2",
          data: {},
          created_at: now,
          updated_at: now,
          version: "",
        },
        cards: [
          {
            node: {
              id: "card3",
              type: "section",
              parent_id: "col2",
              parent_idx: 0,
              symlink_to: null,
              content: "Card C",
              data: {},
              created_at: now,
              updated_at: now,
              version: "",
            },
            children: [],
          },
        ],
      },
    ],
    colIndex: 0,
    cardIndex: 0,
    selectedCards: new Set(),
    visualMode: false,
    zoomStack: [],
  };
}

describe("Board move mode", () => {
  let db: Database;

  beforeEach(() => {
    // Set up in-memory database
    db = new Database(":memory:");
    db.exec(`
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
    `);
    setDb(db);
  });

  afterEach(() => {
    db.close();
  });

  it("renders the board", () => {
    const state = createMockBoardState();
    const { lastFrame } = render(
      React.createElement(InkBoardTestable, {
        initialState: state,
        testWidth: 80,
        testHeight: 24,
      })
    );

    const frame = lastFrame();
    expect(frame).toContain("Column 1");
    expect(frame).toContain("Card A");
  });

  it("shows board path", () => {
    const state = createMockBoardState();
    const { lastFrame } = render(
      React.createElement(InkBoardTestable, {
        initialState: state,
        testWidth: 80,
        testHeight: 24,
      })
    );

    const frame = lastFrame();
    expect(frame).toContain("/test");
  });
});
