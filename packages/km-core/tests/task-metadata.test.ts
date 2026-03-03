/**
 * Tests for task metadata — shared extraction, stringify, and parse.
 *
 * Covers:
 * - extractTaskMetadata: text → { dueDate, priority, ... } (priority:: only, dates/recurrence 3 formats)
 * - stringifyTaskMetadata: node fields → appended key:: value metadata
 * - parseTaskMetadataFromText: edited text → { cleanContent, fields }
 * - Round-trip: stringify → parse recovers original fields
 * - Format migration: old key:value and emoji → key:: value on save
 */
import { describe, test, expect } from "vitest"
import { extractTaskMetadata, stringifyTaskMetadata, parseTaskMetadataFromText } from "../src/task-metadata.ts"
import type { KNode } from "../src/types.ts"

function makeNode(overrides: Partial<KNode> = {}): KNode {
  return {
    id: "test-node",
    type: "p",
    item: true,
    name: "",
    content: "",
    parent_id: "parent",
    depth: 0,
    ...overrides,
  } as KNode
}

describe("stringifyTaskMetadata", () => {
  describe("due date", () => {
    test("appends due:: from due_at field", () => {
      const node = makeNode({ content: "Task", due_at: "2025-03-15" })
      expect(stringifyTaskMetadata("Task", node)).toBe("Task due:: 2025-03-15")
    })

    test("appends due:: with time from due_at", () => {
      const node = makeNode({ content: "Meeting", due_at: "2025-03-15T14:30" })
      expect(stringifyTaskMetadata("Meeting", node)).toBe("Meeting due:: 2025-03-15T14:30")
    })

    test("appends due:: from due_at field (date-only)", () => {
      const node = makeNode({ content: "Task", due_at: "2025-01-20" })
      expect(stringifyTaskMetadata("Task", node)).toBe("Task due:: 2025-01-20")
    })

    test("does not duplicate if due:: already in content", () => {
      const node = makeNode({ content: "Task due:: 2025-03-15", due_at: "2025-03-15" })
      expect(stringifyTaskMetadata("Task due:: 2025-03-15", node)).toBe("Task due:: 2025-03-15")
    })

    test("preserves old due:value format when values match", () => {
      const node = makeNode({ content: "Task due:2025-03-15", due_at: "2025-03-15" })
      expect(stringifyTaskMetadata("Task due:2025-03-15", node)).toBe("Task due:2025-03-15")
    })

    test("preserves emoji 📅 format when values match", () => {
      const node = makeNode({ content: "Task 📅 2025-03-15", due_at: "2025-03-15" })
      expect(stringifyTaskMetadata("Task 📅 2025-03-15", node)).toBe("Task 📅 2025-03-15")
    })

    test("rewrites to key:: value when due date changes", () => {
      const node = makeNode({ content: "Task due:2025-03-15", due_at: "2025-04-01" })
      expect(stringifyTaskMetadata("Task due:2025-03-15", node)).toBe("Task due:: 2025-04-01")
    })
  })

  describe("start/scheduled date", () => {
    test("appends start:: from start_at field", () => {
      const node = makeNode({ content: "Task", start_at: "2025-03-10" })
      expect(stringifyTaskMetadata("Task", node)).toBe("Task start:: 2025-03-10")
    })

    test("appends start:: with time", () => {
      const node = makeNode({ content: "Task", start_at: "2025-03-10T09:00" })
      expect(stringifyTaskMetadata("Task", node)).toBe("Task start:: 2025-03-10T09:00")
    })

    test("preserves old start:value format when values match", () => {
      const node = makeNode({ content: "Task start:2025-03-10", start_at: "2025-03-10" })
      expect(stringifyTaskMetadata("Task start:2025-03-10", node)).toBe("Task start:2025-03-10")
    })

    test("preserves emoji ⏳ format when values match", () => {
      const node = makeNode({ content: "Task ⏳ 2025-03-10", start_at: "2025-03-10" })
      expect(stringifyTaskMetadata("Task ⏳ 2025-03-10", node)).toBe("Task ⏳ 2025-03-10")
    })
  })

  describe("priority", () => {
    test("appends priority:: P1 for priority P1", () => {
      const node = makeNode({ content: "Task", priority: "P1" })
      expect(stringifyTaskMetadata("Task", node)).toBe("Task priority:: P1")
    })

    test("appends priority:: P2 for priority P2", () => {
      const node = makeNode({ content: "Task", priority: "P2" })
      expect(stringifyTaskMetadata("Task", node)).toBe("Task priority:: P2")
    })

    test("appends priority:: P3 for priority P3", () => {
      const node = makeNode({ content: "Task", priority: "P3" })
      expect(stringifyTaskMetadata("Task", node)).toBe("Task priority:: P3")
    })

    test("migrates old p:N to priority:: on rewrite", () => {
      const node = makeNode({ content: "Task p:1", priority: "P1" })
      expect(stringifyTaskMetadata("Task p:1", node)).toBe("Task priority:: P1")
    })

    test("migrates emoji ⏫ to priority:: on rewrite", () => {
      const node = makeNode({ content: "Task ⏫", priority: "P1" })
      expect(stringifyTaskMetadata("Task ⏫", node)).toBe("Task priority:: P1")
    })
  })

  describe("recurrence", () => {
    test("appends recur:: from rrule field", () => {
      const node = makeNode({ content: "Review", rrule: "FREQ=WEEKLY" })
      expect(stringifyTaskMetadata("Review", node)).toBe("Review recur:: FREQ=WEEKLY")
    })

    test("appends recur:: from data.rrule", () => {
      const node = makeNode({ content: "Review", data: { rrule: "every week" } })
      expect(stringifyTaskMetadata("Review", node)).toBe('Review recur:: "every week"')
    })

    test("preserves old recur:value format when values match", () => {
      const node = makeNode({ content: "Review recur:FREQ=WEEKLY", rrule: "FREQ=WEEKLY" })
      expect(stringifyTaskMetadata("Review recur:FREQ=WEEKLY", node)).toBe("Review recur:FREQ=WEEKLY")
    })

    test("preserves emoji 🔁 format when values match", () => {
      const node = makeNode({ content: "Review 🔁 every week", rrule: "every week" })
      expect(stringifyTaskMetadata("Review 🔁 every week", node)).toBe("Review 🔁 every week")
    })

    test("rewrites to key:: value when rrule changes", () => {
      const node = makeNode({ content: "Review recur:FREQ=WEEKLY", rrule: "FREQ=DAILY" })
      expect(stringifyTaskMetadata("Review recur:FREQ=WEEKLY", node)).toBe("Review recur:: FREQ=DAILY")
    })
  })

  describe("assigned_to", () => {
    test("appends @person when includeAssignedTo is true", () => {
      const node = makeNode({ content: "Task", assigned_to: "bjorn" })
      expect(stringifyTaskMetadata("Task", node, { includeAssignedTo: true })).toBe("Task @bjorn")
    })

    test("does not append @person without includeAssignedTo", () => {
      const node = makeNode({ content: "Task", assigned_to: "bjorn" })
      expect(stringifyTaskMetadata("Task", node)).toBe("Task")
    })

    test("does not duplicate if @person already in content", () => {
      const node = makeNode({ content: "Task @bjorn", assigned_to: "bjorn" })
      expect(stringifyTaskMetadata("Task @bjorn", node, { includeAssignedTo: true })).toBe("Task @bjorn")
    })
  })

  describe("multiple metadata", () => {
    test("appends all missing metadata in order", () => {
      const node = makeNode({
        content: "Big task",
        due_at: "2025-06-01",
        start_at: "2025-05-15",
        priority: "P2",
        rrule: "FREQ=MONTHLY",
      })
      expect(stringifyTaskMetadata("Big task", node)).toBe(
        "Big task due:: 2025-06-01 start:: 2025-05-15 priority:: P2 recur:: FREQ=MONTHLY",
      )
    })

    test("migrates mixed old formats to new format", () => {
      // Content has emoji due date and text priority — both get migrated
      const node = makeNode({
        content: "Task 📅 2025-06-01 p:2",
        due_at: "2025-06-01",
        start_at: "2025-05-15",
        priority: "P2",
        rrule: "FREQ=WEEKLY",
      })
      expect(stringifyTaskMetadata("Task 📅 2025-06-01 p:2", node)).toBe(
        "Task due:: 2025-06-01 start:: 2025-05-15 priority:: P2 recur:: FREQ=WEEKLY",
      )
    })
  })

  describe("empty content", () => {
    test("does not append to empty content", () => {
      const node = makeNode({ content: "", due_at: "2025-03-15" })
      expect(stringifyTaskMetadata("", node)).toBe("")
    })
  })
})

describe("parseTaskMetadataFromText", () => {
  describe("new format (key:: value)", () => {
    test("strips due:: and returns clean content", () => {
      const result = parseTaskMetadataFromText("Ideas due:: 2026-02-15")
      expect(result.cleanContent).toBe("Ideas")
      expect(result.due_at).toBe("2026-02-15")
    })

    test("strips due:: with time", () => {
      const result = parseTaskMetadataFromText("Meeting due:: 2026-02-15T14:30")
      expect(result.cleanContent).toBe("Meeting")
      expect(result.due_at).toBe("2026-02-15T14:30")
    })

    test("strips start::", () => {
      const result = parseTaskMetadataFromText("Task start:: 2026-03-10")
      expect(result.cleanContent).toBe("Task")
      expect(result.start_at).toBe("2026-03-10")
    })

    test("strips priority::", () => {
      const result = parseTaskMetadataFromText("Task priority:: P2")
      expect(result.cleanContent).toBe("Task")
      expect(result.priority).toBe("P2")
    })

    test("strips old p:: key without extracting priority", () => {
      const result = parseTaskMetadataFromText("Task p:: 2")
      expect(result.cleanContent).toBe("Task")
      expect(result.priority).toBeUndefined()
    })

    test("strips recur::", () => {
      const result = parseTaskMetadataFromText("Review recur:: FREQ=WEEKLY")
      expect(result.cleanContent).toBe("Review")
      expect(result.rrule).toBe("FREQ=WEEKLY")
    })

    test("strips all new-format metadata", () => {
      const result = parseTaskMetadataFromText(
        "Big task due:: 2026-06-01 start:: 2026-05-15 priority:: P2 recur:: FREQ=MONTHLY",
      )
      expect(result.cleanContent).toBe("Big task")
      expect(result.due_at).toBe("2026-06-01")
      expect(result.start_at).toBe("2026-05-15")
      expect(result.priority).toBe("P2")
      expect(result.rrule).toBe("FREQ=MONTHLY")
    })
  })

  describe("legacy format (key:value) — backward compat", () => {
    test("strips due:value", () => {
      const result = parseTaskMetadataFromText("Ideas due:2026-02-15")
      expect(result.cleanContent).toBe("Ideas")
      expect(result.due_at).toBe("2026-02-15")
    })

    test("strips due:value with time", () => {
      const result = parseTaskMetadataFromText("Meeting due:2026-02-15T14:30")
      expect(result.cleanContent).toBe("Meeting")
      expect(result.due_at).toBe("2026-02-15T14:30")
    })

    test("strips start:value", () => {
      const result = parseTaskMetadataFromText("Task start:2026-03-10")
      expect(result.cleanContent).toBe("Task")
      expect(result.start_at).toBe("2026-03-10")
    })

    test("strips start:value with time", () => {
      const result = parseTaskMetadataFromText("Task start:2026-03-10T09:00")
      expect(result.cleanContent).toBe("Task")
      expect(result.start_at).toBe("2026-03-10T09:00")
    })

    test("strips p:N from text without extracting priority", () => {
      const result = parseTaskMetadataFromText("Task p:2")
      expect(result.cleanContent).toBe("Task")
      expect(result.priority).toBeUndefined()
    })

    test("strips recur:value", () => {
      const result = parseTaskMetadataFromText("Review recur:FREQ=WEEKLY")
      expect(result.cleanContent).toBe("Review")
      expect(result.rrule).toBe("FREQ=WEEKLY")
    })

    test("strips all legacy metadata (priority not extracted)", () => {
      const result = parseTaskMetadataFromText("Big task due:2026-06-01 start:2026-05-15 p:2 recur:FREQ=MONTHLY")
      expect(result.cleanContent).toBe("Big task")
      expect(result.due_at).toBe("2026-06-01")
      expect(result.start_at).toBe("2026-05-15")
      expect(result.priority).toBeUndefined()
      expect(result.rrule).toBe("FREQ=MONTHLY")
    })
  })

  describe("round-trip", () => {
    test("stringify then parse recovers fields (new format)", () => {
      const node = makeNode({
        content: "Task",
        due_at: "2026-01-15",
        start_at: "2026-01-10",
        priority: "P1",
        rrule: "FREQ=DAILY",
      })
      const stringified = stringifyTaskMetadata("Task", node)
      expect(stringified).toBe("Task due:: 2026-01-15 start:: 2026-01-10 priority:: P1 recur:: FREQ=DAILY")

      const parsed = parseTaskMetadataFromText(stringified)
      expect(parsed.cleanContent).toBe("Task")
      expect(parsed.due_at).toBe("2026-01-15")
      expect(parsed.start_at).toBe("2026-01-10")
      expect(parsed.priority).toBe("P1")
      expect(parsed.rrule).toBe("FREQ=DAILY")
    })

    test("handles user-edited date (new format)", () => {
      const result = parseTaskMetadataFromText("Ideas due:: 2026-03-01")
      expect(result.cleanContent).toBe("Ideas")
      expect(result.due_at).toBe("2026-03-01")
    })

    test("handles user-edited date (legacy format)", () => {
      const result = parseTaskMetadataFromText("Ideas due:2026-03-01")
      expect(result.cleanContent).toBe("Ideas")
      expect(result.due_at).toBe("2026-03-01")
    })
  })

  test("returns plain text when no metadata", () => {
    const result = parseTaskMetadataFromText("Just a normal task")
    expect(result.cleanContent).toBe("Just a normal task")
    expect(result.due_at).toBeUndefined()
    expect(result.start_at).toBeUndefined()
    expect(result.priority).toBeUndefined()
    expect(result.rrule).toBeUndefined()
  })

  test("handles empty string", () => {
    const result = parseTaskMetadataFromText("")
    expect(result.cleanContent).toBe("")
  })
})

// ---------------------------------------------------------------------------
// extractTaskMetadata — shared extraction (used by parser + editor)
// ---------------------------------------------------------------------------

describe("extractTaskMetadata", () => {
  describe("new format (key:: value)", () => {
    test("extracts due:: date", () => {
      const result = extractTaskMetadata("Task due:: 2026-03-15")
      expect(result.dueDate).toBe("2026-03-15")
    })

    test("extracts due:: date with time", () => {
      const result = extractTaskMetadata("Meeting due:: 2026-03-15T14:30")
      expect(result.dueDate).toBe("2026-03-15")
      expect(result.dueTime).toBe("14:30")
    })

    test("extracts start:: date", () => {
      const result = extractTaskMetadata("Task start:: 2026-01-10")
      expect(result.startDate).toBe("2026-01-10")
    })

    test("extracts priority:: value", () => {
      const result = extractTaskMetadata("Task priority:: P2")
      expect(result.priority).toBe("P2")
    })

    test("does not extract p:: as priority", () => {
      const result = extractTaskMetadata("Task p:: 2")
      expect(result.priority).toBeUndefined()
    })

    test("extracts recur::", () => {
      const result = extractTaskMetadata("Review recur:: FREQ=WEEKLY")
      expect(result.rrule).toBe("FREQ=WEEKLY")
    })
  })

  describe("legacy format (key:value)", () => {
    test("extracts due date", () => {
      const result = extractTaskMetadata("Task due:2026-03-15")
      expect(result.dueDate).toBe("2026-03-15")
    })

    test("extracts due date with time", () => {
      const result = extractTaskMetadata("Meeting due:2026-03-15T14:30")
      expect(result.dueDate).toBe("2026-03-15")
      expect(result.dueTime).toBe("14:30")
    })

    test("extracts start date", () => {
      const result = extractTaskMetadata("Task start:2026-01-10")
      expect(result.startDate).toBe("2026-01-10")
    })

    test("extracts start date with time", () => {
      const result = extractTaskMetadata("Task start:2026-01-10T09:00")
      expect(result.startDate).toBe("2026-01-10")
      expect(result.startTime).toBe("09:00")
    })

    test("does not extract legacy p:N as priority", () => {
      const result = extractTaskMetadata("Task p:2")
      expect(result.priority).toBeUndefined()
    })

    test("extracts recurrence", () => {
      const result = extractTaskMetadata("Review recur:FREQ=WEEKLY")
      expect(result.rrule).toBe("FREQ=WEEKLY")
    })

    test("extracts all metadata (priority not extracted from legacy)", () => {
      const result = extractTaskMetadata("Big task due:2026-06-01 start:2026-05-15 p:2 recur:FREQ=MONTHLY")
      expect(result.dueDate).toBe("2026-06-01")
      expect(result.startDate).toBe("2026-05-15")
      expect(result.priority).toBeUndefined()
      expect(result.rrule).toBe("FREQ=MONTHLY")
    })
  })

  describe("emoji format", () => {
    test("extracts due date from 📅", () => {
      const result = extractTaskMetadata("Task 📅 2026-03-15")
      expect(result.dueDate).toBe("2026-03-15")
    })

    test("extracts due date with time from 📅", () => {
      const result = extractTaskMetadata("Task 📅 2026-03-15T14:30")
      expect(result.dueDate).toBe("2026-03-15")
      expect(result.dueTime).toBe("14:30")
    })

    test("extracts start date from ⏳", () => {
      const result = extractTaskMetadata("Task ⏳ 2026-01-10")
      expect(result.startDate).toBe("2026-01-10")
    })

    test("does not extract emoji ⏫🔼🔽 as priority", () => {
      expect(extractTaskMetadata("Task ⏫").priority).toBeUndefined()
      expect(extractTaskMetadata("Task 🔼").priority).toBeUndefined()
      expect(extractTaskMetadata("Task 🔽").priority).toBeUndefined()
    })

    test("extracts recurrence from 🔁", () => {
      const result = extractTaskMetadata("Task 🔁 every week")
      expect(result.rrule).toBe("every week")
    })
  })

  describe("format precedence: new > legacy > emoji (dates/recurrence only)", () => {
    test("key:: value overrides key:value", () => {
      const result = extractTaskMetadata("Task due:: 2026-04-01 due:2026-03-15")
      expect(result.dueDate).toBe("2026-04-01")
    })

    test("key:value overrides emoji", () => {
      const result = extractTaskMetadata("Task due:2026-04-01 📅 2026-03-15")
      expect(result.dueDate).toBe("2026-04-01")
    })
  })

  describe("no metadata", () => {
    test("returns empty for plain text", () => {
      const result = extractTaskMetadata("Just a normal task")
      expect(result.dueDate).toBeUndefined()
      expect(result.startDate).toBeUndefined()
      expect(result.priority).toBeUndefined()
      expect(result.rrule).toBeUndefined()
    })
  })
})
