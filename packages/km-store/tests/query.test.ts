/**
 * Query Language Tests
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  parseQuery,
  executeQuery,
  queryTasks,
  resolveDateQuery,
  type QueryAST,
} from "../src/query.ts";
import {
  setDb,
  closeDb,
  getDb,
  toFts5Query,
  search,
  searchWithSnippet,
} from "../src/db.ts";

describe("Query Parser", () => {
  describe("parseQuery", () => {
    test("parses field:value conditions", () => {
      const ast = parseQuery("status:todo");
      expect(ast.conditions[0]).toMatchObject({
        field: "task_status",
        op: "=",
        value: "todo",
        negated: false,
      });
    });

    test("parses priority:N with alias p:", () => {
      const ast = parseQuery("p:1");
      expect(ast.conditions[0]).toMatchObject({
        field: "priority",
        op: "=",
        value: "1",
        negated: false,
      });
    });

    test("parses @mentions", () => {
      const ast = parseQuery("@bjorn");
      expect(ast.refs[0]).toMatchObject({
        type: "person",
        value: "bjorn",
        negated: false,
      });
    });

    test("parses #tags", () => {
      const ast = parseQuery("#urgent");
      expect(ast.refs[0]).toMatchObject({
        type: "tag",
        value: "urgent",
        negated: false,
      });
    });

    test("parses +projects", () => {
      const ast = parseQuery("+alpha");
      expect(ast.refs[0]).toMatchObject({
        type: "project",
        value: "alpha",
        negated: false,
      });
    });

    test("parses negations with -", () => {
      const ast = parseQuery("-status:done");
      expect(ast.conditions[0]).toMatchObject({
        field: "task_status",
        op: "!=",
        value: "done",
        negated: true,
      });
    });

    test("parses negated @mentions", () => {
      const ast = parseQuery("-@bjorn");
      expect(ast.refs[0]).toMatchObject({
        type: "person",
        value: "bjorn",
        negated: true,
      });
    });

    test("parses plain text terms", () => {
      const ast = parseQuery("search term");
      expect(ast.text).toEqual(["search", "term"]);
    });

    test("parses mixed query", () => {
      const ast = parseQuery("status:todo @bjorn -status:done #urgent");
      expect(ast.conditions.length).toBe(2);
      expect(ast.refs.length).toBe(2);
    });

    test("parses empty query", () => {
      const ast = parseQuery("");
      expect(ast.conditions).toEqual([]);
      expect(ast.refs).toEqual([]);
      expect(ast.text).toEqual([]);
      expect(ast.phrases).toEqual([]);
    });

    test("parses quoted phrases", () => {
      const ast = parseQuery('"budget review"');
      expect(ast.phrases).toEqual(["budget review"]);
      expect(ast.text).toEqual([]);
    });

    test("parses multiple quoted phrases", () => {
      const ast = parseQuery('"first phrase" "second phrase"');
      expect(ast.phrases).toEqual(["first phrase", "second phrase"]);
    });

    test("parses mixed phrases and terms", () => {
      const ast = parseQuery('"exact match" other terms');
      expect(ast.phrases).toEqual(["exact match"]);
      expect(ast.text).toEqual(["other", "terms"]);
    });

    test("parses phrases with field filters", () => {
      const ast = parseQuery('"budget review" status:todo');
      expect(ast.phrases).toEqual(["budget review"]);
      expect(ast.conditions[0]).toMatchObject({
        field: "task_status",
        op: "=",
        value: "todo",
        negated: false,
      });
    });

    test("maps field aliases", () => {
      const ast = parseQuery("due:2026-01-20 start:2026-01-15");
      expect(ast.conditions[0]).toMatchObject({
        field: "due_date",
        op: "=",
        value: "2026-01-20",
        negated: false,
      });
      expect(ast.conditions[1]).toMatchObject({
        field: "scheduled_date",
        op: "=",
        value: "2026-01-15",
        negated: false,
      });
    });

    test("parses comma-separated values", () => {
      const ast = parseQuery("status:todo,blocked");
      expect(ast.conditions[0]).toMatchObject({
        field: "task_status",
        op: "=",
        value: "todo,blocked",
        negated: false,
      });
    });

    test("parses relative path pattern with recursive glob", () => {
      const ast = parseQuery("./inbox/**");
      expect(ast.paths[0]).toMatchObject({
        pattern: "./inbox",
        recursive: true,
        negated: false,
      });
    });

    test("parses absolute path pattern", () => {
      const ast = parseQuery("/projects/alpha");
      expect(ast.paths[0]).toMatchObject({
        pattern: "/projects/alpha",
        recursive: false,
        negated: false,
      });
    });

    test("parses negated path pattern", () => {
      const ast = parseQuery("-./archive/**");
      expect(ast.paths[0]).toMatchObject({
        pattern: "./archive",
        recursive: true,
        negated: true,
      });
    });

    test("parses path ending with slash", () => {
      const ast = parseQuery("inbox/");
      expect(ast.paths[0]).toMatchObject({
        pattern: "inbox/",
        recursive: false,
        negated: false,
      });
    });

    test("parses mixed path patterns and conditions", () => {
      const ast = parseQuery("./inbox/** status:todo -status:done");
      expect(ast.paths.length).toBe(1);
      expect(ast.conditions.length).toBe(2);
    });

    test("tracks offsets for conditions", () => {
      const ast = parseQuery("status:todo");
      expect(ast.conditions[0]?.offset).toEqual({ start: 0, end: 11 });
    });

    test("tracks offsets for refs", () => {
      const ast = parseQuery("@bjorn #tag");
      expect(ast.refs[0]?.offset).toEqual({ start: 0, end: 6 });
      expect(ast.refs[1]?.offset).toEqual({ start: 7, end: 11 });
    });

    test("tracks offsets for phrases", () => {
      const ast = parseQuery('"hello world"');
      expect(ast.phraseTerms[0]?.offset).toEqual({ start: 0, end: 13 });
    });

    test("tracks offsets for text terms", () => {
      const ast = parseQuery("foo bar");
      expect(ast.textTerms[0]?.offset).toEqual({ start: 0, end: 3 });
      expect(ast.textTerms[1]?.offset).toEqual({ start: 4, end: 7 });
    });

    test("tracks offsets for path patterns", () => {
      const ast = parseQuery("./inbox/**");
      expect(ast.paths[0]?.offset).toEqual({ start: 0, end: 10 });
    });
  });
});

describe("Query Executor", () => {
  beforeEach(() => {
    // Create in-memory database
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        parent_id TEXT,
        symlink_to TEXT,
        parent_idx REAL DEFAULT 0,
        fs_path TEXT,
        fs_ino INTEGER,
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
    `);

    // Insert test data
    const now = Date.now();
    db.run(
      `INSERT INTO nodes (id, type, task_status, priority, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "task1",
        "task",
        "todo",
        1,
        "Task for @bjorn #urgent",
        '{"mentions":["bjorn"],"tags":["urgent"]}',
        now,
        now,
        "v1",
        0,
      ],
    );
    db.run(
      `INSERT INTO nodes (id, type, task_status, priority, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "task2",
        "task",
        "done",
        2,
        "Done task @jane",
        '{"mentions":["jane"]}',
        now,
        now,
        "v2",
        1,
      ],
    );
    db.run(
      `INSERT INTO nodes (id, type, task_status, priority, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "task3",
        "task",
        "todo",
        null,
        "Another task +project-alpha",
        '{"projects":["project-alpha"]}',
        now,
        now,
        "v3",
        2,
      ],
    );

    setDb(db);
  });

  afterEach(() => {
    closeDb();
  });

  test("filters by status", () => {
    const ast = parseQuery("status:todo");
    const results = executeQuery(ast, "task");
    expect(results.length).toBe(2);
    expect(results.every((r) => r.task_status === "todo")).toBe(true);
  });

  test("filters by priority", () => {
    const ast = parseQuery("p:1");
    const results = executeQuery(ast, "task");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("task1");
  });

  test("filters by @mention", () => {
    const ast = parseQuery("@bjorn");
    const results = executeQuery(ast, "task");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("task1");
  });

  test("filters by #tag", () => {
    const ast = parseQuery("#urgent");
    const results = executeQuery(ast, "task");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("task1");
  });

  test("filters by +project", () => {
    const ast = parseQuery("+project-alpha");
    const results = executeQuery(ast, "task");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("task3");
  });

  test("excludes with negation", () => {
    const ast = parseQuery("-status:done");
    const results = executeQuery(ast, "task");
    expect(results.length).toBe(2);
    expect(results.every((r) => r.task_status !== "done")).toBe(true);
  });

  test("combines conditions", () => {
    const ast = parseQuery("status:todo @bjorn");
    const results = executeQuery(ast, "task");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("task1");
  });

  test("queryTasks helper works", () => {
    const results = queryTasks("status:todo");
    expect(results.length).toBe(2);
  });

  test("filters with comma-separated values (IN clause)", () => {
    // task1 is todo, task2 is done, task3 is todo
    const results = queryTasks("status:todo,done");
    expect(results.length).toBe(3); // Should match all tasks (todo OR done)
  });

  test("excludes with negated comma-separated values (NOT IN clause)", () => {
    // task1 is todo, task2 is done, task3 is todo
    const results = queryTasks("-status:todo,done");
    expect(results.length).toBe(0); // Nothing left after excluding todo and done
  });
});

describe("Path Pattern Query Execution", () => {
  beforeEach(() => {
    // Create in-memory database with fs_path
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        parent_id TEXT,
        symlink_to TEXT,
        parent_idx REAL DEFAULT 0,
        fs_path TEXT,
        fs_ino INTEGER,
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
    `);

    const now = Date.now();
    // Tasks in different paths
    db.run(
      `INSERT INTO nodes (id, type, task_status, content, fs_path, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "inbox-task1",
        "task",
        "todo",
        "Task in inbox",
        "/vault/inbox/tasks.md",
        "{}",
        now,
        now,
        "v1",
        0,
      ],
    );
    db.run(
      `INSERT INTO nodes (id, type, task_status, content, fs_path, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "inbox-task2",
        "task",
        "todo",
        "Another inbox task",
        "/vault/inbox/notes.md",
        "{}",
        now,
        now,
        "v2",
        1,
      ],
    );
    db.run(
      `INSERT INTO nodes (id, type, task_status, content, fs_path, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "project-task1",
        "task",
        "todo",
        "Task in project",
        "/vault/projects/alpha/tasks.md",
        "{}",
        now,
        now,
        "v3",
        2,
      ],
    );
    db.run(
      `INSERT INTO nodes (id, type, task_status, content, fs_path, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "archive-task1",
        "task",
        "done",
        "Archived task",
        "/vault/archive/2024/tasks.md",
        "{}",
        now,
        now,
        "v4",
        3,
      ],
    );
    db.run(
      `INSERT INTO nodes (id, type, task_status, content, fs_path, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "root-task1",
        "task",
        "todo",
        "Task at root",
        "/vault/root-tasks.md",
        "{}",
        now,
        now,
        "v5",
        4,
      ],
    );

    setDb(db);
  });

  afterEach(() => {
    closeDb();
  });

  test("filters by recursive path pattern (./inbox/**)", () => {
    const ast = parseQuery("./inbox/**");
    const results = executeQuery(ast, "task");
    expect(results.length).toBe(2);
    expect(results.every((r) => r.fs_path?.includes("/inbox"))).toBe(true);
  });

  test("filters by absolute path pattern", () => {
    const ast = parseQuery("/projects/");
    const results = executeQuery(ast, "task");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("project-task1");
  });

  test("filters with recursive nested path pattern", () => {
    const ast = parseQuery("./archive/**");
    const results = executeQuery(ast, "task");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("archive-task1");
  });

  test("excludes with negated path pattern", () => {
    const ast = parseQuery("-./inbox/**");
    const results = executeQuery(ast, "task");
    // Should exclude both inbox tasks
    expect(results.length).toBe(3);
    expect(results.every((r) => !r.fs_path?.includes("/inbox/"))).toBe(true);
  });

  test("combines path pattern with status filter", () => {
    const ast = parseQuery("./inbox/** status:todo");
    const results = executeQuery(ast, "task");
    expect(results.length).toBe(2);
    expect(results.every((r) => r.task_status === "todo")).toBe(true);
    expect(results.every((r) => r.fs_path?.includes("/inbox"))).toBe(true);
  });
});

describe("Date Query Resolution", () => {
  test("resolves 'today' to current date", () => {
    const result = resolveDateQuery("today");
    const today = new Date().toISOString().slice(0, 10);
    expect(result).toEqual({ start: today, end: today });
  });

  test("resolves 'tomorrow' to next day", () => {
    const result = resolveDateQuery("tomorrow");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);
    expect(result).toEqual({ start: tomorrowStr, end: tomorrowStr });
  });

  test("resolves 'yesterday' to previous day", () => {
    const result = resolveDateQuery("yesterday");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    expect(result).toEqual({ start: yesterdayStr, end: yesterdayStr });
  });

  test("resolves 'week' to 7-day range", () => {
    const result = resolveDateQuery("week");
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    expect(result).toEqual({ start: todayStr, end: weekEndStr });
  });

  test("resolves 'past' to dates before today", () => {
    const result = resolveDateQuery("past");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    expect(result).toEqual({ start: "0000-01-01", end: yesterdayStr });
  });

  test("resolves 'overdue' same as 'past'", () => {
    const result = resolveDateQuery("overdue");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    expect(result).toEqual({ start: "0000-01-01", end: yesterdayStr });
  });

  test("resolves exact date (YYYY-MM-DD)", () => {
    const result = resolveDateQuery("2026-01-15");
    expect(result).toEqual({ start: "2026-01-15", end: "2026-01-15" });
  });

  test("resolves date range (YYYY-MM-DD-YYYY-MM-DD)", () => {
    const result = resolveDateQuery("2026-01-01-2026-01-31");
    expect(result).toEqual({ start: "2026-01-01", end: "2026-01-31" });
  });

  test("returns null for invalid value", () => {
    const result = resolveDateQuery("invalid");
    expect(result).toBeNull();
  });
});

describe("Date Query Execution", () => {
  beforeEach(() => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        parent_id TEXT,
        symlink_to TEXT,
        parent_idx REAL DEFAULT 0,
        fs_path TEXT,
        fs_ino INTEGER,
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
    `);

    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    // Task due today
    db.run(
      `INSERT INTO nodes (id, type, task_status, due_date, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "task-today",
        "task",
        "todo",
        today,
        "Task due today",
        "{}",
        now,
        now,
        "v1",
        0,
      ],
    );

    // Task due yesterday (overdue)
    db.run(
      `INSERT INTO nodes (id, type, task_status, due_date, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "task-overdue",
        "task",
        "todo",
        yesterdayStr,
        "Overdue task",
        "{}",
        now,
        now,
        "v2",
        1,
      ],
    );

    // Task due tomorrow
    db.run(
      `INSERT INTO nodes (id, type, task_status, due_date, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "task-tomorrow",
        "task",
        "todo",
        tomorrowStr,
        "Task due tomorrow",
        "{}",
        now,
        now,
        "v3",
        2,
      ],
    );

    // Task with no due date
    db.run(
      `INSERT INTO nodes (id, type, task_status, due_date, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "task-nodue",
        "task",
        "todo",
        null,
        "Task without due date",
        "{}",
        now,
        now,
        "v4",
        3,
      ],
    );

    setDb(db);
  });

  afterEach(() => {
    closeDb();
  });

  test("filters by due:today", () => {
    const results = queryTasks("due:today");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("task-today");
  });

  test("filters by due:tomorrow", () => {
    const results = queryTasks("due:tomorrow");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("task-tomorrow");
  });

  test("filters by due:past (overdue)", () => {
    const results = queryTasks("due:past");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("task-overdue");
  });

  test("filters by due:overdue", () => {
    const results = queryTasks("due:overdue");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("task-overdue");
  });

  test("filters by due:week includes today and tomorrow", () => {
    const results = queryTasks("due:week");
    expect(results.length).toBe(2);
    const ids = results.map((r) => r.id);
    expect(ids).toContain("task-today");
    expect(ids).toContain("task-tomorrow");
  });

  test("negated due:today excludes today's tasks", () => {
    const results = queryTasks("-due:today");
    expect(results.length).toBe(3);
    expect(results.every((r) => r.id !== "task-today")).toBe(true);
  });
});

describe("FTS5 Query Conversion", () => {
  test("converts simple term to prefix query", () => {
    expect(toFts5Query("hello")).toBe("hello*");
  });

  test("converts multiple terms to prefix queries", () => {
    expect(toFts5Query("hello world")).toBe("hello* world*");
  });

  test("converts quoted phrase to FTS5 phrase", () => {
    expect(toFts5Query('"budget review"')).toBe('"budget review"');
  });

  test("converts mixed phrases and terms", () => {
    expect(toFts5Query('"exact phrase" other')).toBe('"exact phrase" other*');
  });

  test("converts negated term to NOT query", () => {
    expect(toFts5Query("-exclude")).toBe("NOT exclude*");
  });

  test("handles multiple quoted phrases", () => {
    expect(toFts5Query('"first phrase" "second phrase"')).toBe(
      '"first phrase" "second phrase"',
    );
  });

  test("handles empty query", () => {
    expect(toFts5Query("")).toBe("");
  });
});

describe("Full-text Search with Phrases", () => {
  beforeEach(() => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        parent_id TEXT,
        symlink_to TEXT,
        parent_idx REAL DEFAULT 0,
        fs_path TEXT,
        fs_ino INTEGER,
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

      CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
        id,
        content,
        content='nodes',
        content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
        INSERT INTO nodes_fts(rowid, id, content) VALUES (new.rowid, new.id, new.content);
      END;
    `);

    const now = Date.now();

    // Insert test data with multi-word content
    db.run(
      `INSERT INTO nodes (id, type, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "doc1",
        "file",
        "The budget review meeting is scheduled for Monday",
        "{}",
        now,
        now,
        "v1",
        0,
      ],
    );

    db.run(
      `INSERT INTO nodes (id, type, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "doc2",
        "file",
        "Please review the budget before the deadline",
        "{}",
        now,
        now,
        "v2",
        1,
      ],
    );

    db.run(
      `INSERT INTO nodes (id, type, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "doc3",
        "file",
        "This document is about quarterly reports",
        "{}",
        now,
        now,
        "v3",
        2,
      ],
    );

    setDb(db);
  });

  afterEach(() => {
    closeDb();
  });

  test("exact phrase search matches only exact phrases", () => {
    const results = search('"budget review"', 10);
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("doc1");
  });

  test("individual terms match documents with those terms in any order", () => {
    const results = search("budget review", 10);
    // Should match both doc1 (budget review) and doc2 (review...budget)
    expect(results.length).toBe(2);
    const ids = results.map((r) => r.id);
    expect(ids).toContain("doc1");
    expect(ids).toContain("doc2");
  });

  test("phrase search does not match non-adjacent terms", () => {
    // "review budget" should NOT match doc1's "budget review"
    const results = search('"review budget"', 10);
    expect(results.length).toBe(0);
  });

  test("searchWithSnippet returns highlighted snippets", () => {
    const results = searchWithSnippet("budget", 10, {
      startMark: "<<",
      endMark: ">>",
    });
    expect(results.length).toBeGreaterThan(0);
    // Check that snippets contain the markers
    const hasHighlight = results.some(
      (r: { snippet: string }) =>
        r.snippet.includes("<<") && r.snippet.includes(">>"),
    );
    expect(hasHighlight).toBe(true);
  });

  test("searchWithSnippet with phrase search", () => {
    const results = searchWithSnippet('"budget review"', 10, {
      startMark: "[",
      endMark: "]",
    });
    expect(results.length).toBe(1);
    expect(results[0]?.node.id).toBe("doc1");
  });
});
