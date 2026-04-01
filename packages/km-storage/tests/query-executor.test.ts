/**
 * Query Executor Tests
 *
 * Tests for executeQuery, queryTasks, search, and searchWithSnippet --
 * all require an in-memory SQLite database.
 *
 * See query-parser.test.ts for pure parsing tests.
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import type { Database } from "bun:sqlite"
import { parseQuery, executeQuery, queryTasks } from "../src/query.ts"
import { search, searchWithSnippet } from "../src/db.ts"
import { createTestDatabase, seedTestData, formatDate, today, offsetDate } from "./query-test-helpers.ts"

describe("Query Executor", () => {
  let db: Database

  beforeEach(() => {
    db = createTestDatabase()
    seedTestData(db, [
      {
        id: "task1",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        priority: "P1",
        content: "Task for @bjorn #urgent",
        data: '{"mentions":["bjorn"],"tags":["urgent"]}',
      },
      {
        id: "task2",
        type: "p",
        item: { task: { marker: "[x]", status: "done" } },
        priority: "P2",
        content: "Done task @jane",
        data: '{"mentions":["jane"]}',
      },
      {
        id: "task3",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        priority: null,
        content: "Another task +project-alpha",
        data: '{"projects":["project-alpha"]}',
      },
    ])
  })

  afterEach(() => {
    db.close()
  })

  // Basic filter tests using test.each
  test.each([
    ["status:todo", 2, (r: { item?: { task?: { status?: string } } }) => r.item?.task?.status === "todo"],
    ["status:done", 1, (r: { item?: { task?: { status?: string } } }) => r.item?.task?.status === "done"],
    ["priority:P1", 1, (r: { id: string }) => r.id === "task1"],
    ["@bjorn", 1, (r: { id: string }) => r.id === "task1"],
    ["#urgent", 1, (r: { id: string }) => r.id === "task1"],
    ["+project-alpha", 1, (r: { id: string }) => r.id === "task3"],
    ["-status:done", 2, (r: { item?: { task?: { status?: string } } }) => r.item?.task?.status !== "done"],
  ] as const)("filters with %s", (query, expectedCount, predicate) => {
    const ast = parseQuery(query)
    const results = executeQuery(db, ast, "task")
    expect(results.length).toBe(expectedCount)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test predicate union
    expect(results.every(predicate as (r: any) => boolean)).toBe(true)
  })

  test("combines conditions", () => {
    const ast = parseQuery("status:todo @bjorn")
    const results = executeQuery(db, ast, "task")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("task1")
  })

  test("queryTasks helper works", () => {
    const results = queryTasks(db, "status:todo")
    expect(results.length).toBe(2)
  })

  test("filters with comma-separated values (IN clause)", () => {
    const results = queryTasks(db, "status:todo,done")
    expect(results.length).toBe(3)
  })

  test("excludes with negated comma-separated values (NOT IN clause)", () => {
    const results = queryTasks(db, "-status:todo,done")
    expect(results.length).toBe(0)
  })
})

describe("Path Pattern Query Execution", () => {
  let db: Database

  beforeEach(() => {
    db = createTestDatabase()
    seedTestData(db, [
      {
        id: "inbox-task1",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "Task in inbox",
        fs_path: "/repo/inbox/tasks.md",
      },
      {
        id: "inbox-task2",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "Another inbox task",
        fs_path: "/repo/inbox/notes.md",
      },
      {
        id: "project-task1",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "Task in project",
        fs_path: "/repo/projects/alpha/tasks.md",
      },
      {
        id: "archive-task1",
        type: "p",
        item: { task: { marker: "[x]", status: "done" } },
        content: "Archived task",
        fs_path: "/repo/archive/2024/tasks.md",
      },
      {
        id: "root-task1",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "Task at root",
        fs_path: "/repo/root-tasks.md",
      },
    ])
  })

  afterEach(() => {
    db.close()
  })

  test.each([
    ["./inbox/**", 2, (r: { fs_path?: string | null }) => r.fs_path?.includes("/inbox") ?? false],
    ["/projects/", 1, (r: { id: string }) => r.id === "project-task1"],
    ["./archive/**", 1, (r: { id: string }) => r.id === "archive-task1"],
    ["-./inbox/**", 3, (r: { fs_path?: string | null }) => !(r.fs_path?.includes("/inbox/") ?? false)],
  ] as const)("filters by path pattern %s", (query, expectedCount, predicate) => {
    const ast = parseQuery(query)
    const results = executeQuery(db, ast, "task")
    expect(results.length).toBe(expectedCount)
    expect(results.every(predicate)).toBe(true)
  })

  test("combines path pattern with status filter", () => {
    const ast = parseQuery("./inbox/** status:todo")
    const results = executeQuery(db, ast, "task")
    expect(results.length).toBe(2)
    expect(results.every((r) => r.item?.task?.status === "todo")).toBe(true)
    expect(results.every((r) => r.fs_path?.includes("/inbox"))).toBe(true)
  })
})

describe("Date Query Execution", () => {
  let db: Database

  beforeEach(() => {
    db = createTestDatabase()
    seedTestData(db, [
      {
        id: "task-today",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "Task due today",
        due_at: formatDate(today()),
      },
      {
        id: "task-overdue",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "Overdue task",
        due_at: formatDate(offsetDate(-1)),
      },
      {
        id: "task-tomorrow",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "Task due tomorrow",
        due_at: formatDate(offsetDate(1)),
      },
      {
        id: "task-nodue",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "Task without due date",
        due_at: null,
      },
    ])
  })

  afterEach(() => {
    db.close()
  })

  test.each([
    ["due:today", ["task-today"]],
    ["due:tomorrow", ["task-tomorrow"]],
    ["due:past", ["task-overdue"]],
    ["due:overdue", ["task-overdue"]],
  ] as const)("filters by %s", (query, expectedIds) => {
    const results = queryTasks(db, query)
    expect(results.length).toBe(expectedIds.length)
    for (const id of expectedIds) {
      expect(results.some((r) => r.id === id)).toBe(true)
    }
  })

  test("filters by due:week includes today and tomorrow", () => {
    const results = queryTasks(db, "due:week")
    expect(results.length).toBe(2)
    expect(results.map((r) => r.id)).toContain("task-today")
    expect(results.map((r) => r.id)).toContain("task-tomorrow")
  })

  test("negated due:today excludes today's tasks", () => {
    const results = queryTasks(db, "-due:today")
    expect(results.length).toBe(3)
    expect(results.every((r) => r.id !== "task-today")).toBe(true)
  })
})

describe("Full-text Search with Phrases", () => {
  let db: Database

  beforeEach(() => {
    db = createTestDatabase()
    seedTestData(db, [
      {
        id: "doc1",
        type: "h",
        item: {},
        fstype: "mdfile",
        content: "The budget review meeting is scheduled for Monday",
      },
      {
        id: "doc2",
        type: "h",
        item: {},
        fstype: "mdfile",
        content: "Please review the budget before the deadline",
      },
      {
        id: "doc3",
        type: "h",
        item: {},
        fstype: "mdfile",
        content: "This document is about quarterly reports",
      },
    ])
  })

  afterEach(() => {
    db.close()
  })

  test.each([
    ['"budget review"', 1, ["doc1"]],
    ["budget review", 2, ["doc1", "doc2"]],
    ['"review budget"', 0, []],
  ] as const)("phrase search %s finds %d results", (query, count, expectedIds) => {
    const results = search(db, query, 10)
    expect(results.length).toBe(count)
    for (const id of expectedIds) {
      expect(results.some((r) => r.id === id)).toBe(true)
    }
  })

  test("searchWithSnippet returns highlighted snippets", () => {
    const results = searchWithSnippet(db, "budget", 10, {
      startMark: "<<",
      endMark: ">>",
    })
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((r: { snippet: string }) => r.snippet.includes("<<") && r.snippet.includes(">>"))).toBe(true)
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
  let db: Database

  beforeEach(() => {
    db = createTestDatabase()
    seedTestData(db, [
      {
        id: "task1",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "Regular checkbox task",
      },
      {
        id: "section1",
        type: "h",
        item: { task: { marker: "[/]", status: "wip" } },
        content: "Project Phase 1",
      },
      {
        id: "file1",
        type: "h",
        item: { task: { marker: "[x]", status: "done" } },
        fstype: "mdfile",
        content: "Completed Document",
        fs_path: "/repo/completed.md",
      },
      {
        id: "para1",
        type: "p",
        item: { task: { marker: "[!]", status: "blocked" } },
        content: "Waiting on external review",
      },
      {
        id: "section2",
        type: "h",
        item: {},
        content: "Normal section",
      },
    ])
  })

  afterEach(() => {
    db.close()
  })

  test.each([
    ["status:todo", 1, "task1", "p"],
    ["status:wip", 1, "section1", "h"],
    ["status:done", 1, "file1", "h"],
    ["status:blocked", 1, "para1", "p"],
  ] as const)("%s matches correct node type", (query, count, expectedId, expectedType) => {
    const ast = parseQuery(query)
    const results = executeQuery(db, ast)
    expect(results.length).toBe(count)
    expect(results[0]!.id).toBe(expectedId)
    expect(results[0]!.type).toBe(expectedType)
  })

  test("type:task matches all nodes with task_marker", () => {
    const ast = parseQuery("type:task")
    const results = executeQuery(db, ast)
    expect(results.length).toBe(4)
    expect(results.map((r) => r.id).sort()).toEqual(["file1", "para1", "section1", "task1"])
  })

  test("type:section matches sections regardless of status", () => {
    const ast = parseQuery("type:section")
    const results = executeQuery(db, ast)
    expect(results.length).toBe(2)
    expect(results.map((r) => r.id)).toContain("section1")
    expect(results.map((r) => r.id)).toContain("section2")
  })

  test("combining type and status filters", () => {
    const ast = parseQuery("type:section status:wip")
    const results = executeQuery(db, ast)
    expect(results.length).toBe(1)
    expect(results[0]?.id).toBe("section1")
  })

  test("queryTasks only returns type:task nodes", () => {
    const results = queryTasks(db, "status:todo")
    expect(results.length).toBe(1)
    expect(results[0]?.type).toBe("p")
  })

  test("-status:done excludes nodes with that status, any type", () => {
    const ast = parseQuery("-status:done")
    const results = executeQuery(db, ast)
    expect(results.length).toBe(4)
    expect(results.every((r) => r.item?.task?.status !== "done")).toBe(true)
  })

  test("status:todo,wip matches multiple statuses across types", () => {
    const ast = parseQuery("status:todo,wip")
    const results = executeQuery(db, ast)
    expect(results.length).toBe(2)
    expect(results.map((r) => r.id)).toContain("task1")
    expect(results.map((r) => r.id)).toContain("section1")
  })
})

/**
 * Property Query Tests (km-props)
 *
 * Tests for inline property queries using prop::value syntax.
 * Properties are stored as PropertyValue objects in data.props.
 */
describe("Property Query Execution", () => {
  let db: Database

  beforeEach(() => {
    db = createTestDatabase()
    seedTestData(db, [
      {
        id: "task-rated",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "Book review rating:: 5",
        data: JSON.stringify({
          props: { rating: { type: "number", value: 5 } },
          propsRaw: { rating: "5" },
        }),
      },
      {
        id: "task-blocked",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        name: "blocked-task",
        content: "Deploy blocked-by:: [[blocker-task]]",
        data: JSON.stringify({
          props: { "blocked-by": { type: "link", target: "blocker-task" } },
          propsRaw: { "blocked-by": "[[blocker-task]]" },
        }),
      },
      {
        id: "blocker-task",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        name: "blocker-task",
        content: "This blocks other tasks",
      },
      {
        id: "task-unblocked",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        name: "unblocked-task",
        content: "Was blocked blocked-by:: [[done-blocker]]",
        data: JSON.stringify({
          props: { "blocked-by": { type: "link", target: "done-blocker" } },
          propsRaw: { "blocked-by": "[[done-blocker]]" },
        }),
      },
      {
        id: "done-blocker",
        type: "p",
        item: { task: { marker: "[x]", status: "done" } },
        name: "done-blocker",
        content: "Completed blocker",
      },
      {
        id: "task-authored",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "Document author:: alice",
        data: JSON.stringify({
          props: { author: { type: "text", value: "alice" } },
          propsRaw: { author: "alice" },
        }),
      },
      {
        id: "task-low-rated",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "Mediocre book rating:: 2",
        data: JSON.stringify({
          props: { rating: { type: "number", value: 2 } },
          propsRaw: { rating: "2" },
        }),
      },
      {
        id: "task-plain",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "Plain task without properties",
      },
      {
        id: "task-multi-blocked",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        name: "multi-blocked-task",
        content: "Multi blocked blocked-by:: [[blocker-task]], [[done-blocker]]",
        data: JSON.stringify({
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
      },
    ])
  })

  afterEach(() => {
    db.close()
  })

  test("prop::* matches nodes with any value for that property", () => {
    const ast = parseQuery("rating::*")
    const results = executeQuery(db, ast, "task")
    expect(results.length).toBe(2)
    expect(results.map((r) => r.id)).toContain("task-rated")
    expect(results.map((r) => r.id)).toContain("task-low-rated")
  })

  test("-prop::* excludes nodes with that property", () => {
    const ast = parseQuery("-rating::*")
    const results = executeQuery(db, ast, "task")
    expect(results.every((r) => r.id !== "task-rated")).toBe(true)
    expect(results.every((r) => r.id !== "task-low-rated")).toBe(true)
  })

  // Numeric comparison tests using test.each
  test.each([
    ["rating::5", 1, ["task-rated"]],
    ["rating::>3", 1, ["task-rated"]],
    ["rating::<3", 1, ["task-low-rated"]],
    ["rating::>=2", 2, ["task-rated", "task-low-rated"]],
    ["rating::<=2", 1, ["task-low-rated"]],
  ] as const)("numeric comparison %s", (query, count, expectedIds) => {
    const ast = parseQuery(query)
    const results = executeQuery(db, ast, "task")
    expect(results.length).toBe(count)
    for (const id of expectedIds) {
      expect(results.some((r) => r.id === id)).toBe(true)
    }
  })

  test("prop::text matches text property value", () => {
    const ast = parseQuery("author::alice")
    const results = executeQuery(db, ast, "task")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("task-authored")
  })

  test("prop::target matches link property target", () => {
    const ast = parseQuery("blocked-by::blocker-task")
    const results = executeQuery(db, ast, "task")
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.some((r) => r.id === "task-blocked")).toBe(true)
  })

  test("blocked:true matches tasks with unresolved blockers", () => {
    const ast = parseQuery("blocked:true")
    const results = executeQuery(db, ast, "task")
    const ids = results.map((r) => r.id)
    expect(ids).toContain("task-blocked")
    expect(ids).toContain("task-multi-blocked")
    expect(ids).not.toContain("task-unblocked")
    expect(ids).not.toContain("task-plain")
  })

  test("blocked:false matches tasks without blockers or with all blockers done", () => {
    const ast = parseQuery("blocked:false")
    const results = executeQuery(db, ast, "task")
    const ids = results.map((r) => r.id)
    expect(ids).toContain("task-unblocked")
    expect(ids).toContain("task-plain")
    expect(ids).not.toContain("task-blocked")
    expect(ids).not.toContain("task-multi-blocked")
  })

  test("combines property query with status filter", () => {
    const ast = parseQuery("status:todo rating::>3")
    const results = executeQuery(db, ast, "task")
    expect(results.length).toBe(1)
    expect(results[0]?.id).toBe("task-rated")
  })

  test("combines blocked:false with status:todo", () => {
    const ast = parseQuery("status:todo blocked:false")
    const results = executeQuery(db, ast, "task")
    expect(results.every((r) => r.item?.task?.status === "todo")).toBe(true)
    expect(results.every((r) => r.id !== "task-blocked" && r.id !== "task-multi-blocked")).toBe(true)
  })
})

/**
 * Phrase search via executeQuery (km-storage.query-bugs)
 *
 * The parser populates ast.phrases, but executeQuery must use them
 * to filter results (via content LIKE for phrase ordering).
 */
describe("Phrase Search in executeQuery", () => {
  let db: Database

  beforeEach(() => {
    db = createTestDatabase()
    seedTestData(db, [
      {
        id: "doc1",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "The budget review meeting is scheduled",
      },
      {
        id: "doc2",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "Please review the budget before deadline",
      },
      {
        id: "doc3",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "Quarterly reports are ready",
      },
    ])
  })

  afterEach(() => {
    db.close()
  })

  test('quoted phrase "budget review" only matches exact phrase order', () => {
    const ast = parseQuery('"budget review"')
    const results = executeQuery(db, ast)
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("doc1")
  })

  test("unquoted terms match independently (both docs with budget or review)", () => {
    const ast = parseQuery("budget review")
    const results = executeQuery(db, ast)
    expect(results.length).toBe(2)
    expect(results.map((r) => r.id)).toContain("doc1")
    expect(results.map((r) => r.id)).toContain("doc2")
  })

  test('phrase with no match returns empty: "review budget" (wrong order)', () => {
    const ast = parseQuery('"review budget"')
    const results = executeQuery(db, ast)
    expect(results.length).toBe(0)
  })

  test("phrase combined with field filter", () => {
    const ast = parseQuery('"budget review" status:todo')
    const results = executeQuery(db, ast, "task")
    expect(results.length).toBe(1)
    expect(results[0]!.id).toBe("doc1")
  })
})

/**
 * Negated ref conditions (km-storage.query-bugs)
 *
 * Negated @mention / #tag / +project must check the specific JSON array path,
 * not the entire JSON blob. Otherwise -@alice would exclude nodes that happen
 * to have "alice" anywhere in their data.
 */
describe("Negated Ref Conditions", () => {
  let db: Database

  beforeEach(() => {
    db = createTestDatabase()
    seedTestData(db, [
      {
        id: "t1",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "Task for @alice #frontend +alpha",
        data: '{"mentions":["alice"],"tags":["frontend"],"projects":["alpha"]}',
      },
      {
        id: "t2",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "Task for @bob #backend +beta",
        data: '{"mentions":["bob"],"tags":["backend"],"projects":["beta"]}',
      },
      {
        id: "t3",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "Task with no refs",
        data: "{}",
      },
      {
        // This node has "alice" as a tag but NOT in mentions.
        // A buggy negated -@alice that checks the whole JSON blob
        // would wrongly exclude this node because "alice" appears
        // in the tags array.
        id: "t4",
        type: "p",
        item: { task: { marker: "[ ]", status: "todo" } },
        content: "Task #alice +gamma",
        data: '{"tags":["alice"],"projects":["gamma"]}',
      },
    ])
  })

  afterEach(() => {
    db.close()
  })

  test("-@alice excludes only nodes with alice in mentions, not in tags", () => {
    const ast = parseQuery("-@alice")
    const results = executeQuery(db, ast)
    const ids = results.map((r) => r.id)
    expect(ids).not.toContain("t1") // has alice in mentions
    expect(ids).toContain("t2") // bob in mentions
    expect(ids).toContain("t3") // no mentions
    expect(ids).toContain("t4") // alice-review in tags, NOT in mentions
  })

  test("-#frontend excludes only nodes with frontend in tags", () => {
    const ast = parseQuery("-#frontend")
    const results = executeQuery(db, ast)
    const ids = results.map((r) => r.id)
    expect(ids).not.toContain("t1") // has frontend tag
    expect(ids).toContain("t2")
    expect(ids).toContain("t3")
    expect(ids).toContain("t4")
  })

  test("-+alpha excludes only nodes with alpha in projects", () => {
    const ast = parseQuery("-+alpha")
    const results = executeQuery(db, ast)
    const ids = results.map((r) => r.id)
    expect(ids).not.toContain("t1") // has alpha project
    expect(ids).toContain("t2")
    expect(ids).toContain("t3")
    expect(ids).toContain("t4")
  })
})
