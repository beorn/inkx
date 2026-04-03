/**
 * Query Parser Tests
 *
 * Tests for parseQuery, resolveDateQuery, toFts5Query, and property
 * query parsing — pure functions with no database dependency.
 *
 * See query-executor.test.ts for database execution tests.
 */

import { describe, test, expect } from "vitest"
import { parseQuery, resolveDateQuery } from "../src/query.ts"
import { toFts5Query } from "../src/db/db.ts"

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

    test("parses priority:P1", () => {
      const ast = parseQuery("priority:P1")
      expect(ast.conditions[0]).toMatchObject({
        field: "priority",
        op: "=",
        value: "P1",
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
        field: "due_at",
        op: "=",
        value: "2026-01-20",
        negated: false,
      })
      expect(ast.conditions[1]).toMatchObject({
        field: "start_at",
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
        pattern: "./inbox/**",
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
        pattern: "./archive/**",
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

describe("Date Query Resolution", () => {
  // Helper to format date in local timezone (matches implementation)
  function formatDate(d: Date): string {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
  }

  test("resolves 'today' to current date", () => {
    const result = resolveDateQuery("today")
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = formatDate(today)
    expect(result).toEqual({ start: todayStr, end: todayStr })
  })

  test("resolves 'tomorrow' to next day", () => {
    const result = resolveDateQuery("tomorrow")
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = formatDate(tomorrow)
    expect(result).toEqual({ start: tomorrowStr, end: tomorrowStr })
  })

  test("resolves 'yesterday' to previous day", () => {
    const result = resolveDateQuery("yesterday")
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = formatDate(yesterday)
    expect(result).toEqual({ start: yesterdayStr, end: yesterdayStr })
  })

  test("resolves 'week' to 7-day range", () => {
    const result = resolveDateQuery("week")
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = formatDate(today)
    const weekEnd = new Date(today)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const weekEndStr = formatDate(weekEnd)
    expect(result).toEqual({ start: todayStr, end: weekEndStr })
  })

  test("resolves 'past' to dates before today", () => {
    const result = resolveDateQuery("past")
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = formatDate(yesterday)
    expect(result).toEqual({ start: "0000-01-01", end: yesterdayStr })
  })

  test("resolves 'overdue' same as 'past'", () => {
    const result = resolveDateQuery("overdue")
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = formatDate(yesterday)
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
    expect(toFts5Query('"first phrase" "second phrase"')).toBe('"first phrase" "second phrase"')
  })

  test("handles empty query", () => {
    expect(toFts5Query("")).toBe("")
  })

  test("handles trailing hyphen (ready-) without producing invalid FTS5", () => {
    // "ready-" should not produce "ready-*" which FTS5 interprets as "ready" NOT "*"
    const result = toFts5Query("ready-")
    // The result should be valid FTS5 — either escaped or stripped
    // It should NOT contain a bare hyphen adjacent to the wildcard
    expect(result).not.toBe("ready-*")
    // Should still find "ready" matches
    expect(result).toContain("ready")
  })

  test("handles backtick character without producing invalid FTS5", () => {
    const result = toFts5Query("`")
    // Should not produce "`*" which is invalid FTS5
    expect(result).not.toBe("`*")
  })

  test("handles other FTS5 special characters safely", () => {
    // Characters that are special in FTS5: ( ) { } : ^ ~ + *
    for (const char of ["(", ")", "{", "}", ":", "^", "~", "+", "*"]) {
      const result = toFts5Query(`test${char}`)
      // Should not throw and should produce something reasonable
      expect(result).toBeDefined()
    }
  })

  test("handles query with only special characters", () => {
    const result = toFts5Query("-")
    // A bare "-" has no term to negate — should produce empty or safe output
    expect(result).toBeDefined()
  })
})

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
