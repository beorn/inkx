/**
 * Query Language Tests
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { Database } from "bun:sqlite"
import {
  parseQuery,
  executeQuery,
  queryTasks,
  resolveDateQuery,
  type QueryAST,
} from "../src/query.ts"
import {
  setDb,
  closeDb,
  getDb,
  toFts5Query,
  search,
  searchWithSnippet,
} from "../src/db.ts"

describe("Query Parser", () => {
  describe("parseQuery", () => {
    test("parses field:value conditions", () => {
      const ast = parseQuery("status:todo")
      expect(ast.conditions[0]).toMatchObject({
        field: "task_status",
        op: "=",
        value: "todo",
        negated: false,
      })
    })

    test("parses priority:N with alias p:", () => {
      const ast = parseQuery("p:1")
      expect(ast.conditions[0]).toMatchObject({
        field: "priority",
        op: "=",
        value: "1",
        negated: false,
      })
    })

    test("parses @mentions", () => {
      const ast = parseQuery("@bjorn")
      expect(ast.refs[0]).toMatchObject({
        type: "person",
        value: "bjorn",
        negated: false,
      })
    })

    test("parses #tags", () => {
      const ast = parseQuery("#urgent")
      expect(ast.refs[0]).toMatchObject({
        type: "tag",
        value: "urgent",
        negated: false,
      })
    })

    test("parses +projects", () => {
      const ast = parseQuery("+alpha")
      expect(ast.refs[0]).toMatchObject({
        type: "project",
        value: "alpha",
        negated: false,
      })
    })

    test("parses negations with -", () => {
      const ast = parseQuery("-status:done")
      expect(ast.conditions[0]).toMatchObject({
        field: "task_status",
        op: "!=",
        value: "done",
        negated: true,
      })
    })

    test("parses negated @mentions", () => {
      const ast = parseQuery("-@bjorn")
      expect(ast.refs[0]).toMatchObject({
        type: "person",
        value: "bjorn",
        negated: true,
      })
    })

    test("parses plain text terms", () => {
      const ast = parseQuery("search term")
      expect(ast.text).toEqual(["search", "term"])
    })

    test("parses mixed query", () => {
      const ast = parseQuery("status:todo @bjorn -status:done #urgent")
      expect(ast.conditions.length).toBe(2)
      expect(ast.refs.length).toBe(2)
    })

    test("parses empty query", () => {
      const ast = parseQuery("")
      expect(ast.conditions).toEqual([])
      expect(ast.refs).toEqual([])
      expect(ast.text).toEqual([])
      expect(ast.phrases).toEqual([])
    })

    test("parses quoted phrases", () => {
      const ast = parseQuery('"budget review"')
      expect(ast.phrases).toEqual(["budget review"])
      expect(ast.text).toEqual([])
    })

    test("parses multiple quoted phrases", () => {
      const ast = parseQuery('"first phrase" "second phrase"')
      expect(ast.phrases).toEqual(["first phrase", "second phrase"])
    })

    test("parses mixed phrases and terms", () => {
      const ast = parseQuery('"exact match" other terms')
      expect(ast.phrases).toEqual(["exact match"])
      expect(ast.text).toEqual(["other", "terms"])
    })

    test("parses phrases with field filters", () => {
      const ast = parseQuery('"budget review" status:todo')
      expect(ast.phrases).toEqual(["budget review"])
      expect(ast.conditions[0]).toMatchObject({
        field: "task_status",
        op: "=",
        value: "todo",
        negated: false,
      })
    })

    test("maps field aliases", () => {
      const ast = parseQuery("due:2026-01-20 start:2026-01-15")
      expect(ast.conditions[0]).toMatchObject({
        field: "due_date",
        op: "=",
        value: "2026-01-20",
        negated: false,
      })
      expect(ast.conditions[1]).toMatchObject({
        field: "scheduled_date",
        op: "=",
        value: "2026-01-15",
        negated: false,
      })
    })

    test("parses comma-separated values", () => {
      const ast = parseQuery("status:todo,blocked")
      expect(ast.conditions[0]).toMatchObject({
        field: "task_status",
        op: "=",
        value: "todo,blocked",
        negated: false,
      })
    })

    test("parses relative path pattern with recursive glob", () => {
      const ast = parseQuery("./inbox/**")
      expect(ast.paths[0]).toMatchObject({
        pattern: "./inbox",
        recursive: true,
        negated: false,
      })
    })

    test("parses absolute path pattern", () => {
      const ast = parseQuery("/projects/alpha")
      expect(ast.paths[0]).toMatchObject({
        pattern: "/projects/alpha",
        recursive: false,
        negated: false,
      })
    })

    test("parses negated path pattern", () => {
      const ast = parseQuery("-./archive/**")
      expect(ast.paths[0]).toMatchObject({
        pattern: "./archive",
        recursive: true,
        negated: true,
      })
    })

    test("parses path ending with slash", () => {
      const ast = parseQuery("inbox/")
      expect(ast.paths[0]).toMatchObject({
        pattern: "inbox/",
        recursive: false,
        negated: false,
      })
    })

    test("parses mixed path patterns and conditions", () => {
      const ast = parseQuery("./inbox/** status:todo -status:done")
      expect(ast.paths.length).toBe(1)
      expect(ast.conditions.length).toBe(2)
    })

    test("tracks offsets for conditions", () => {
      const ast = parseQuery("status:todo")
      expect(ast.conditions[0]?.offset).toEqual({ start: 0, end: 11 })
    })

    test("tracks offsets for refs", () => {
      const ast = parseQuery("@bjorn #tag")
      expect(ast.refs[0]?.offset).toEqual({ start: 0, end: 6 })
      expect(ast.refs[1]?.offset).toEqual({ start: 7, end: 11 })
    })

    test("tracks offsets for phrases", () => {
      const ast = parseQuery('"hello world"')
      expect(ast.phraseTerms[0]?.offset).toEqual({ start: 0, end: 13 })
    })

    test("tracks offsets for text terms", () => {
      const ast = parseQuery("foo bar")
      expect(ast.textTerms[0]?.offset).toEqual({ start: 0, end: 3 })
      expect(ast.textTerms[1]?.offset).toEqual({ start: 4, end: 7 })
    })

    test("tracks offsets for path patterns", () => {
      const ast = parseQuery("./inbox/**")
      expect(ast.paths[0]?.offset).toEqual({ start: 0, end: 10 })
    })
  })
})

describe("Query Executor", () => {
  beforeEach(() => {
    // Create in-memory database
    const db = new Database(":memory:")
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        parent_id TEXT,
        link_to TEXT,
        link_alias TEXT,
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
    `)

    // Insert test data
    const now = Date.now()
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
    )
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
    )
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
    )

    setDb(db)
  })

  afterEach(() => {
    closeDb()
  })

  test("filters by status", () => {
    const ast = parseQuery("status:todo")
    const results = executeQuery(getDb(), ast, "task")
    expect(results.length).toBe(2)
    expect(results.every((r) => r.task_status === "todo")).toBe(true)
  })

  test("filters by priority", () => {
    const ast = parseQuery("p:1")
    const results = executeQuery(getDb(), ast, "task")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("task1")
  })

  test("filters by @mention", () => {
    const ast = parseQuery("@bjorn")
    const results = executeQuery(getDb(), ast, "task")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("task1")
  })

  test("filters by #tag", () => {
    const ast = parseQuery("#urgent")
    const results = executeQuery(getDb(), ast, "task")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("task1")
  })

  test("filters by +project", () => {
    const ast = parseQuery("+project-alpha")
    const results = executeQuery(getDb(), ast, "task")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("task3")
  })

  test("excludes with negation", () => {
    const ast = parseQuery("-status:done")
    const results = executeQuery(getDb(), ast, "task")
    expect(results.length).toBe(2)
    expect(results.every((r) => r.task_status !== "done")).toBe(true)
  })

  test("combines conditions", () => {
    const ast = parseQuery("status:todo @bjorn")
    const results = executeQuery(getDb(), ast, "task")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("task1")
  })

  test("queryTasks helper works", () => {
    const results = queryTasks(getDb(), "status:todo")
    expect(results.length).toBe(2)
  })

  test("filters with comma-separated values (IN clause)", () => {
    // task1 is todo, task2 is done, task3 is todo
    const results = queryTasks(getDb(), "status:todo,done")
    expect(results.length).toBe(3) // Should match all tasks (todo OR done)
  })

  test("excludes with negated comma-separated values (NOT IN clause)", () => {
    // task1 is todo, task2 is done, task3 is todo
    const results = queryTasks(getDb(), "-status:todo,done")
    expect(results.length).toBe(0) // Nothing left after excluding todo and done
  })
})

describe("Path Pattern Query Execution", () => {
  beforeEach(() => {
    // Create in-memory database with fs_path
    const db = new Database(":memory:")
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        parent_id TEXT,
        link_to TEXT,
        link_alias TEXT,
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
    `)

    const now = Date.now()
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
    )
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
    )
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
    )
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
    )
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
    )

    setDb(db)
  })

  afterEach(() => {
    closeDb()
  })

  test("filters by recursive path pattern (./inbox/**)", () => {
    const ast = parseQuery("./inbox/**")
    const results = executeQuery(getDb(), ast, "task")
    expect(results.length).toBe(2)
    expect(results.every((r) => r.fs_path?.includes("/inbox"))).toBe(true)
  })

  test("filters by absolute path pattern", () => {
    const ast = parseQuery("/projects/")
    const results = executeQuery(getDb(), ast, "task")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("project-task1")
  })

  test("filters with recursive nested path pattern", () => {
    const ast = parseQuery("./archive/**")
    const results = executeQuery(getDb(), ast, "task")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("archive-task1")
  })

  test("excludes with negated path pattern", () => {
    const ast = parseQuery("-./inbox/**")
    const results = executeQuery(getDb(), ast, "task")
    // Should exclude both inbox tasks
    expect(results.length).toBe(3)
    expect(results.every((r) => !r.fs_path?.includes("/inbox/"))).toBe(true)
  })

  test("combines path pattern with status filter", () => {
    const ast = parseQuery("./inbox/** status:todo")
    const results = executeQuery(getDb(), ast, "task")
    expect(results.length).toBe(2)
    expect(results.every((r) => r.task_status === "todo")).toBe(true)
    expect(results.every((r) => r.fs_path?.includes("/inbox"))).toBe(true)
  })
})

describe("Date Query Resolution", () => {
  test("resolves 'today' to current date", () => {
    const result = resolveDateQuery("today")
    const today = new Date().toISOString().slice(0, 10)
    expect(result).toEqual({ start: today, end: today })
  })

  test("resolves 'tomorrow' to next day", () => {
    const result = resolveDateQuery("tomorrow")
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().slice(0, 10)
    expect(result).toEqual({ start: tomorrowStr, end: tomorrowStr })
  })

  test("resolves 'yesterday' to previous day", () => {
    const result = resolveDateQuery("yesterday")
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().slice(0, 10)
    expect(result).toEqual({ start: yesterdayStr, end: yesterdayStr })
  })

  test("resolves 'week' to 7-day range", () => {
    const result = resolveDateQuery("week")
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const weekEnd = new Date()
    weekEnd.setDate(weekEnd.getDate() + 6)
    const weekEndStr = weekEnd.toISOString().slice(0, 10)
    expect(result).toEqual({ start: todayStr, end: weekEndStr })
  })

  test("resolves 'past' to dates before today", () => {
    const result = resolveDateQuery("past")
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().slice(0, 10)
    expect(result).toEqual({ start: "0000-01-01", end: yesterdayStr })
  })

  test("resolves 'overdue' same as 'past'", () => {
    const result = resolveDateQuery("overdue")
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().slice(0, 10)
    expect(result).toEqual({ start: "0000-01-01", end: yesterdayStr })
  })

  test("resolves exact date (YYYY-MM-DD)", () => {
    const result = resolveDateQuery("2026-01-15")
    expect(result).toEqual({ start: "2026-01-15", end: "2026-01-15" })
  })

  test("resolves date range (YYYY-MM-DD-YYYY-MM-DD)", () => {
    const result = resolveDateQuery("2026-01-01-2026-01-31")
    expect(result).toEqual({ start: "2026-01-01", end: "2026-01-31" })
  })

  test("returns null for invalid value", () => {
    const result = resolveDateQuery("invalid")
    expect(result).toBeNull()
  })
})

describe("Date Query Execution", () => {
  beforeEach(() => {
    const db = new Database(":memory:")
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        parent_id TEXT,
        link_to TEXT,
        link_alias TEXT,
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
    `)

    const now = Date.now()
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().slice(0, 10)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = tomorrow.toISOString().slice(0, 10)

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
    )

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
    )

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
    )

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
    )

    setDb(db)
  })

  afterEach(() => {
    closeDb()
  })

  test("filters by due:today", () => {
    const results = queryTasks(getDb(), "due:today")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("task-today")
  })

  test("filters by due:tomorrow", () => {
    const results = queryTasks(getDb(), "due:tomorrow")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("task-tomorrow")
  })

  test("filters by due:past (overdue)", () => {
    const results = queryTasks(getDb(), "due:past")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("task-overdue")
  })

  test("filters by due:overdue", () => {
    const results = queryTasks(getDb(), "due:overdue")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("task-overdue")
  })

  test("filters by due:week includes today and tomorrow", () => {
    const results = queryTasks(getDb(), "due:week")
    expect(results.length).toBe(2)
    const ids = results.map((r) => r.id)
    expect(ids).toContain("task-today")
    expect(ids).toContain("task-tomorrow")
  })

  test("negated due:today excludes today's tasks", () => {
    const results = queryTasks(getDb(), "-due:today")
    expect(results.length).toBe(3)
    expect(results.every((r) => r.id !== "task-today")).toBe(true)
  })
})

describe("FTS5 Query Conversion", () => {
  test("converts simple term to prefix query", () => {
    expect(toFts5Query("hello")).toBe("hello*")
  })

  test("converts multiple terms to prefix queries", () => {
    expect(toFts5Query("hello world")).toBe("hello* world*")
  })

  test("converts quoted phrase to FTS5 phrase", () => {
    expect(toFts5Query('"budget review"')).toBe('"budget review"')
  })

  test("converts mixed phrases and terms", () => {
    expect(toFts5Query('"exact phrase" other')).toBe('"exact phrase" other*')
  })

  test("converts negated term to NOT query", () => {
    expect(toFts5Query("-exclude")).toBe("NOT exclude*")
  })

  test("handles multiple quoted phrases", () => {
    expect(toFts5Query('"first phrase" "second phrase"')).toBe(
      '"first phrase" "second phrase"',
    )
  })

  test("handles empty query", () => {
    expect(toFts5Query("")).toBe("")
  })
})

describe("Full-text Search with Phrases", () => {
  let db: Database

  beforeEach(() => {
    db = new Database(":memory:")
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        parent_id TEXT,
        link_to TEXT,
        link_alias TEXT,
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
    `)

    const now = Date.now()

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
    )

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
    )

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
    )

    setDb(db)
  })

  afterEach(() => {
    closeDb()
  })

  test("exact phrase search matches only exact phrases", () => {
    const results = search(db, '"budget review"', 10)
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("doc1")
  })

  test("individual terms match documents with those terms in any order", () => {
    const results = search(db, "budget review", 10)
    // Should match both doc1 (budget review) and doc2 (review...budget)
    expect(results.length).toBe(2)
    const ids = results.map((r) => r.id)
    expect(ids).toContain("doc1")
    expect(ids).toContain("doc2")
  })

  test("phrase search does not match non-adjacent terms", () => {
    // "review budget" should NOT match doc1's "budget review"
    const results = search(db, '"review budget"', 10)
    expect(results.length).toBe(0)
  })

  test("searchWithSnippet returns highlighted snippets", () => {
    const results = searchWithSnippet(db, "budget", 10, {
      startMark: "<<",
      endMark: ">>",
    })
    expect(results.length).toBeGreaterThan(0)
    // Check that snippets contain the markers
    const hasHighlight = results.some(
      (r: { snippet: string }) =>
        r.snippet.includes("<<") && r.snippet.includes(">>"),
    )
    expect(hasHighlight).toBe(true)
  })

  test("searchWithSnippet with phrase search", () => {
    const results = searchWithSnippet(db, '"budget review"', 10, {
      startMark: "[",
      endMark: "]",
    })
    expect(results.length).toBe(1)
    expect(results[0]?.node.id).toBe("doc1")
  })
})

/**
 * Tests for status on any node type (km-oidi)
 *
 * A node is considered a "task" for workflow purposes if it has task_status,
 * regardless of its type. This allows sections, files, or other nodes to
 * participate in status-based workflows.
 */
describe("Status on Any Node Type", () => {
  beforeEach(() => {
    const db = new Database(":memory:")
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        parent_id TEXT,
        link_to TEXT,
        link_alias TEXT,
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
    `)

    const now = Date.now()

    // Regular task (type: task with status)
    db.run(
      `INSERT INTO nodes (id, type, task_status, task_mark, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "task1",
        "task",
        "todo",
        " ",
        "Regular checkbox task",
        "{}",
        now,
        now,
        "v1",
        0,
      ],
    )

    // Section with status (type: section with task_status)
    db.run(
      `INSERT INTO nodes (id, type, task_status, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "section1",
        "section",
        "wip",
        "Project Phase 1",
        '{"depth": 2}',
        now,
        now,
        "v2",
        1,
      ],
    )

    // File with status (type: file with task_status)
    db.run(
      `INSERT INTO nodes (id, type, task_status, content, fs_path, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "file1",
        "file",
        "done",
        "Completed Document",
        "/vault/completed.md",
        "{}",
        now,
        now,
        "v3",
        2,
      ],
    )

    // Paragraph with status (type: paragraph with task_status)
    db.run(
      `INSERT INTO nodes (id, type, task_status, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "para1",
        "paragraph",
        "blocked",
        "Waiting on external review",
        "{}",
        now,
        now,
        "v4",
        3,
      ],
    )

    // Regular section without status
    db.run(
      `INSERT INTO nodes (id, type, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "section2",
        "section",
        "Normal section",
        '{"depth": 2}',
        now,
        now,
        "v5",
        4,
      ],
    )

    setDb(db)
  })

  afterEach(() => {
    closeDb()
  })

  test("status:todo matches only nodes with that status, any type", () => {
    const ast = parseQuery("status:todo")
    const results = executeQuery(getDb(), ast)
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("task1")
    expect(results[0]!.type).toBe("task")
  })

  test("status:wip matches section with status", () => {
    const ast = parseQuery("status:wip")
    const results = executeQuery(getDb(), ast)
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("section1")
    expect(results[0]!.type).toBe("section")
  })

  test("status:done matches file with status", () => {
    const ast = parseQuery("status:done")
    const results = executeQuery(getDb(), ast)
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("file1")
    expect(results[0]!.type).toBe("file")
  })

  test("status:blocked matches paragraph with status", () => {
    const ast = parseQuery("status:blocked")
    const results = executeQuery(getDb(), ast)
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("para1")
    expect(results[0]!.type).toBe("paragraph")
  })

  test("type:task only matches checkbox-originated nodes", () => {
    const ast = parseQuery("type:task")
    const results = executeQuery(getDb(), ast)
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("task1")
  })

  test("type:section matches sections regardless of status", () => {
    const ast = parseQuery("type:section")
    const results = executeQuery(getDb(), ast)
    expect(results.length).toBe(2)
    const ids = results.map((r) => r.id)
    expect(ids).toContain("section1") // has status
    expect(ids).toContain("section2") // no status
  })

  test("combining type and status filters", () => {
    const ast = parseQuery("type:section status:wip")
    const results = executeQuery(getDb(), ast)
    expect(results.length).toBe(1)
    expect(results[0]?.id).toBe("section1")
  })

  test("queryTasks only returns type:task nodes", () => {
    // queryTasks passes type:"task" to executeQuery
    const results = queryTasks(getDb(), "status:todo")
    expect(results.length).toBe(1)
    expect(results[0]?.type).toBe("task")
  })

  test("-status:done excludes nodes with that status, any type", () => {
    const ast = parseQuery("-status:done")
    const results = executeQuery(getDb(), ast)
    // Should include task1, section1, para1, section2 (no status counts as not done)
    expect(results.length).toBe(4)
    expect(results.every((r) => r.task_status !== "done")).toBe(true)
  })

  test("status:todo,wip matches multiple statuses across types", () => {
    const ast = parseQuery("status:todo,wip")
    const results = executeQuery(getDb(), ast)
    expect(results.length).toBe(2)
    const ids = results.map((r) => r.id)
    expect(ids).toContain("task1") // todo
    expect(ids).toContain("section1") // wip
  })
})

/**
 * Property Query Tests (km-props)
 *
 * Tests for inline property queries using prop::value syntax.
 * Properties are stored as PropertyValue objects in data.props.
 */
describe("Property Query Parser", () => {
  test("parses prop::* (existence check)", () => {
    const ast = parseQuery("rating::*")
    expect(ast.propConditions[0]).toMatchObject({
      prop: "rating",
      op: "exists",
      negated: false,
    })
  })

  test("parses prop::value (string equality)", () => {
    const ast = parseQuery("author::alice")
    expect(ast.propConditions[0]).toMatchObject({
      prop: "author",
      op: "=",
      value: "alice",
      negated: false,
    })
  })

  test("parses prop::N (numeric equality)", () => {
    const ast = parseQuery("rating::5")
    expect(ast.propConditions[0]).toMatchObject({
      prop: "rating",
      op: "=",
      value: 5,
      negated: false,
    })
  })

  test("parses prop::>N (greater than)", () => {
    const ast = parseQuery("rating::>3")
    expect(ast.propConditions[0]).toMatchObject({
      prop: "rating",
      op: ">",
      value: 3,
      negated: false,
    })
  })

  test("parses prop::<N (less than)", () => {
    const ast = parseQuery("priority::<5")
    expect(ast.propConditions[0]).toMatchObject({
      prop: "priority",
      op: "<",
      value: 5,
      negated: false,
    })
  })

  test("parses prop::>=N (greater than or equal)", () => {
    const ast = parseQuery("rating::>=4")
    expect(ast.propConditions[0]).toMatchObject({
      prop: "rating",
      op: ">=",
      value: 4,
      negated: false,
    })
  })

  test("parses prop::<=N (less than or equal)", () => {
    const ast = parseQuery("rating::<=2")
    expect(ast.propConditions[0]).toMatchObject({
      prop: "rating",
      op: "<=",
      value: 2,
      negated: false,
    })
  })

  test("parses negated property existence (-prop::*)", () => {
    const ast = parseQuery("-blocked-by::*")
    expect(ast.propConditions[0]).toMatchObject({
      prop: "blocked-by",
      op: "exists",
      negated: true,
    })
  })

  test("parses negated property value (-prop::value)", () => {
    const ast = parseQuery("-status::blocked")
    expect(ast.propConditions[0]).toMatchObject({
      prop: "status",
      op: "!=",
      value: "blocked",
      negated: true,
    })
  })

  test("parses blocked:true special query", () => {
    const ast = parseQuery("blocked:true")
    expect(ast.specials[0]).toMatchObject({
      type: "blocked",
      value: true,
    })
  })

  test("parses blocked:false special query", () => {
    const ast = parseQuery("blocked:false")
    expect(ast.specials[0]).toMatchObject({
      type: "blocked",
      value: false,
    })
  })

  test("tracks offsets for property conditions", () => {
    const ast = parseQuery("rating::5")
    expect(ast.propConditions[0]?.offset).toEqual({ start: 0, end: 9 })
  })

  test("parses property with hyphenated name", () => {
    const ast = parseQuery("blocked-by::km-123")
    expect(ast.propConditions[0]).toMatchObject({
      prop: "blocked-by",
      op: "=",
      value: "km-123",
    })
  })

  test("parses decimal number in comparison", () => {
    const ast = parseQuery("score::>3.5")
    expect(ast.propConditions[0]).toMatchObject({
      prop: "score",
      op: ">",
      value: 3.5,
    })
  })

  test("parses negative number in comparison", () => {
    const ast = parseQuery("offset::>=-10")
    expect(ast.propConditions[0]).toMatchObject({
      prop: "offset",
      op: ">=",
      value: -10,
    })
  })
})

describe("Property Query Execution", () => {
  beforeEach(() => {
    const db = new Database(":memory:")
    db.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT,
        parent_id TEXT,
        link_to TEXT,
        link_alias TEXT,
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
    `)

    const now = Date.now()

    // Task with rating property (number)
    db.run(
      `INSERT INTO nodes (id, type, task_status, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "task-rated",
        "task",
        "todo",
        "Book review rating:: 5",
        JSON.stringify({
          props: { rating: { type: "number", value: 5 } },
          propsRaw: { rating: "5" },
        }),
        now,
        now,
        "v1",
        0,
      ],
    )

    // Task with blocked-by property (single link)
    db.run(
      `INSERT INTO nodes (id, type, name, task_status, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "task-blocked",
        "task",
        "blocked-task",
        "todo",
        "Deploy blocked-by:: [[blocker-task]]",
        JSON.stringify({
          props: { "blocked-by": { type: "link", target: "blocker-task" } },
          propsRaw: { "blocked-by": "[[blocker-task]]" },
        }),
        now,
        now,
        "v2",
        1,
      ],
    )

    // The blocker task (todo status - not done)
    db.run(
      `INSERT INTO nodes (id, type, name, task_status, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "blocker-task",
        "task",
        "blocker-task",
        "todo",
        "This blocks other tasks",
        "{}",
        now,
        now,
        "v3",
        2,
      ],
    )

    // Task with blocked-by where blocker is done
    db.run(
      `INSERT INTO nodes (id, type, name, task_status, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "task-unblocked",
        "task",
        "unblocked-task",
        "todo",
        "Was blocked blocked-by:: [[done-blocker]]",
        JSON.stringify({
          props: { "blocked-by": { type: "link", target: "done-blocker" } },
          propsRaw: { "blocked-by": "[[done-blocker]]" },
        }),
        now,
        now,
        "v4",
        3,
      ],
    )

    // The done blocker
    db.run(
      `INSERT INTO nodes (id, type, name, task_status, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "done-blocker",
        "task",
        "done-blocker",
        "done",
        "Completed blocker",
        "{}",
        now,
        now,
        "v5",
        4,
      ],
    )

    // Task with author property (text)
    db.run(
      `INSERT INTO nodes (id, type, task_status, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "task-authored",
        "task",
        "todo",
        "Document author:: alice",
        JSON.stringify({
          props: { author: { type: "text", value: "alice" } },
          propsRaw: { author: "alice" },
        }),
        now,
        now,
        "v6",
        5,
      ],
    )

    // Task with low rating
    db.run(
      `INSERT INTO nodes (id, type, task_status, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "task-low-rated",
        "task",
        "todo",
        "Mediocre book rating:: 2",
        JSON.stringify({
          props: { rating: { type: "number", value: 2 } },
          propsRaw: { rating: "2" },
        }),
        now,
        now,
        "v7",
        6,
      ],
    )

    // Task without any properties
    db.run(
      `INSERT INTO nodes (id, type, task_status, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "task-plain",
        "task",
        "todo",
        "Plain task without properties",
        "{}",
        now,
        now,
        "v8",
        7,
      ],
    )

    // Task with blocked-by list (multiple blockers)
    db.run(
      `INSERT INTO nodes (id, type, name, task_status, content, data, created_at, updated_at, version, parent_idx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        "task-multi-blocked",
        "task",
        "multi-blocked-task",
        "todo",
        "Multi blocked blocked-by:: [[blocker-task]], [[done-blocker]]",
        JSON.stringify({
          props: {
            "blocked-by": {
              type: "list",
              values: [
                { type: "link", target: "blocker-task" },
                { type: "link", target: "done-blocker" },
              ],
            },
          },
          propsRaw: { "blocked-by": "[[blocker-task]], [[done-blocker]]" },
        }),
        now,
        now,
        "v9",
        8,
      ],
    )

    setDb(db)
  })

  afterEach(() => {
    closeDb()
  })

  test("prop::* matches nodes with any value for that property", () => {
    const ast = parseQuery("rating::*")
    const results = executeQuery(getDb(), ast, "task")
    expect(results.length).toBe(2)
    const ids = results.map((r) => r.id)
    expect(ids).toContain("task-rated")
    expect(ids).toContain("task-low-rated")
  })

  test("-prop::* excludes nodes with that property", () => {
    const ast = parseQuery("-rating::*")
    const results = executeQuery(getDb(), ast, "task")
    // Should exclude task-rated and task-low-rated
    expect(results.every((r) => r.id !== "task-rated")).toBe(true)
    expect(results.every((r) => r.id !== "task-low-rated")).toBe(true)
  })

  test("prop::N matches exact numeric value", () => {
    const ast = parseQuery("rating::5")
    const results = executeQuery(getDb(), ast, "task")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("task-rated")
  })

  test("prop::>N matches greater than", () => {
    const ast = parseQuery("rating::>3")
    const results = executeQuery(getDb(), ast, "task")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("task-rated") // rating 5 > 3
  })

  test("prop::<N matches less than", () => {
    const ast = parseQuery("rating::<3")
    const results = executeQuery(getDb(), ast, "task")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("task-low-rated") // rating 2 < 3
  })

  test("prop::>=N matches greater than or equal", () => {
    const ast = parseQuery("rating::>=2")
    const results = executeQuery(getDb(), ast, "task")
    expect(results.length).toBe(2) // Both 5 and 2 are >= 2
  })

  test("prop::<=N matches less than or equal", () => {
    const ast = parseQuery("rating::<=2")
    const results = executeQuery(getDb(), ast, "task")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("task-low-rated") // rating 2 <= 2
  })

  test("prop::text matches text property value", () => {
    const ast = parseQuery("author::alice")
    const results = executeQuery(getDb(), ast, "task")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("task-authored")
  })

  test("prop::target matches link property target", () => {
    const ast = parseQuery("blocked-by::blocker-task")
    const results = executeQuery(getDb(), ast, "task")
    // Should match task-blocked (single link) and task-multi-blocked (list containing it)
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some((r) => r.id === "task-blocked")).toBe(true)
  })

  test("blocked:true matches tasks with unresolved blockers", () => {
    const ast = parseQuery("blocked:true")
    const results = executeQuery(getDb(), ast, "task")
    // task-blocked is blocked by blocker-task (todo)
    // task-multi-blocked is blocked by blocker-task (todo) and done-blocker (done)
    // task-unblocked is blocked by done-blocker (done) - should NOT match
    const ids = results.map((r) => r.id)
    expect(ids).toContain("task-blocked")
    expect(ids).toContain("task-multi-blocked") // Has at least one unresolved blocker
    expect(ids).not.toContain("task-unblocked") // Blocker is done
    expect(ids).not.toContain("task-plain") // No blocked-by property
  })

  test("blocked:false matches tasks without blockers or with all blockers done", () => {
    const ast = parseQuery("blocked:false")
    const results = executeQuery(getDb(), ast, "task")
    const ids = results.map((r) => r.id)
    // task-unblocked: blocker is done, so not blocked
    // task-plain: no blocked-by property
    // task-rated, task-low-rated, task-authored: no blocked-by property
    expect(ids).toContain("task-unblocked")
    expect(ids).toContain("task-plain")
    expect(ids).not.toContain("task-blocked") // Still blocked
    expect(ids).not.toContain("task-multi-blocked") // Still has unresolved blocker
  })

  test("combines property query with status filter", () => {
    const ast = parseQuery("status:todo rating::>3")
    const results = executeQuery(getDb(), ast, "task")
    expect(results.length).toBe(1)
    expect(results[0]?.id).toBe("task-rated")
  })

  test("combines blocked:false with status:todo", () => {
    const ast = parseQuery("status:todo blocked:false")
    const results = executeQuery(getDb(), ast, "task")
    // Should return todo tasks that are not blocked
    expect(results.every((r) => r.task_status === "todo")).toBe(true)
    expect(
      results.every(
        (r) => r.id !== "task-blocked" && r.id !== "task-multi-blocked",
      ),
    ).toBe(true)
  })
})
