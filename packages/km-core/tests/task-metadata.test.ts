/**
 * Tests for task metadata — shared extraction, stringify, and parse.
 *
 * Covers:
 * - extractTaskMetadata: text → { dueDate, priority, ... } (shared by parser + editor)
 * - stringifyTaskMetadata: node fields → appended text metadata
 * - parseTaskMetadataFromText: edited text → { cleanContent, fields }
 * - Round-trip: stringify → parse recovers original fields
 */
import { describe, test, expect } from "vitest"
import { extractTaskMetadata, stringifyTaskMetadata, parseTaskMetadataFromText } from "../src/task-metadata.ts"
import type { KNode } from "../src/types.ts"

function makeNode(overrides: Partial<KNode> = {}): KNode {
  return {
    id: "test-node",
    type: "li",
    name: "",
    content: "",
    parent_id: "parent",
    depth: 0,
    ...overrides,
  } as KNode
}

describe("stringifyTaskMetadata", () => {
  describe("due date", () => {
    test("appends due: from due_at field", () => {
      const node = makeNode({ content: "Task", due_at: "2025-03-15" })
      expect(stringifyTaskMetadata("Task", node)).toBe("Task due:2025-03-15")
    })

    test("appends due: with time from due_at", () => {
      const node = makeNode({ content: "Meeting", due_at: "2025-03-15T14:30" })
      expect(stringifyTaskMetadata("Meeting", node)).toBe("Meeting due:2025-03-15T14:30")
    })

    test("appends due: from legacy due_date field", () => {
      const node = makeNode({ content: "Task", due_date: "2025-01-20" })
      expect(stringifyTaskMetadata("Task", node)).toBe("Task due:2025-01-20")
    })

    test("does not duplicate if due: already in content", () => {
      const node = makeNode({ content: "Task due:2025-03-15", due_at: "2025-03-15" })
      expect(stringifyTaskMetadata("Task due:2025-03-15", node)).toBe("Task due:2025-03-15")
    })

    test("does not duplicate if emoji 📅 already in content", () => {
      const node = makeNode({ content: "Task 📅 2025-03-15", due_at: "2025-03-15" })
      expect(stringifyTaskMetadata("Task 📅 2025-03-15", node)).toBe("Task 📅 2025-03-15")
    })
  })

  describe("start/scheduled date", () => {
    test("appends start: from start_at field", () => {
      const node = makeNode({ content: "Task", start_at: "2025-03-10" })
      expect(stringifyTaskMetadata("Task", node)).toBe("Task start:2025-03-10")
    })

    test("appends start: with time", () => {
      const node = makeNode({ content: "Task", start_at: "2025-03-10T09:00" })
      expect(stringifyTaskMetadata("Task", node)).toBe("Task start:2025-03-10T09:00")
    })

    test("does not duplicate if start: already in content", () => {
      const node = makeNode({ content: "Task start:2025-03-10", start_at: "2025-03-10" })
      expect(stringifyTaskMetadata("Task start:2025-03-10", node)).toBe("Task start:2025-03-10")
    })

    test("does not duplicate if emoji ⏳ already in content", () => {
      const node = makeNode({ content: "Task ⏳ 2025-03-10", start_at: "2025-03-10" })
      expect(stringifyTaskMetadata("Task ⏳ 2025-03-10", node)).toBe("Task ⏳ 2025-03-10")
    })
  })

  describe("priority", () => {
    test("appends p:1 for priority 1", () => {
      const node = makeNode({ content: "Task", priority: 1 })
      expect(stringifyTaskMetadata("Task", node)).toBe("Task p:1")
    })

    test("appends p:2 for priority 2", () => {
      const node = makeNode({ content: "Task", priority: 2 })
      expect(stringifyTaskMetadata("Task", node)).toBe("Task p:2")
    })

    test("appends p:3 for priority 3", () => {
      const node = makeNode({ content: "Task", priority: 3 })
      expect(stringifyTaskMetadata("Task", node)).toBe("Task p:3")
    })

    test("does not duplicate if p:N already in content", () => {
      const node = makeNode({ content: "Task p:1", priority: 1 })
      expect(stringifyTaskMetadata("Task p:1", node)).toBe("Task p:1")
    })

    test("does not duplicate if emoji ⏫ already in content", () => {
      const node = makeNode({ content: "Task ⏫", priority: 1 })
      expect(stringifyTaskMetadata("Task ⏫", node)).toBe("Task ⏫")
    })
  })

  describe("recurrence", () => {
    test("appends recur: from recurrence field", () => {
      const node = makeNode({ content: "Review", recurrence: "FREQ=WEEKLY" })
      expect(stringifyTaskMetadata("Review", node)).toBe("Review recur:FREQ=WEEKLY")
    })

    test("appends recur: from data.recurrence", () => {
      const node = makeNode({ content: "Review", data: { recurrence: "every week" } })
      expect(stringifyTaskMetadata("Review", node)).toBe("Review recur:every week")
    })

    test("does not duplicate if recur: already in content", () => {
      const node = makeNode({ content: "Review recur:FREQ=WEEKLY", recurrence: "FREQ=WEEKLY" })
      expect(stringifyTaskMetadata("Review recur:FREQ=WEEKLY", node)).toBe("Review recur:FREQ=WEEKLY")
    })

    test("does not duplicate if emoji 🔁 already in content", () => {
      const node = makeNode({ content: "Review 🔁 every week", recurrence: "every week" })
      expect(stringifyTaskMetadata("Review 🔁 every week", node)).toBe("Review 🔁 every week")
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
        priority: 2,
        recurrence: "FREQ=MONTHLY",
      })
      expect(stringifyTaskMetadata("Big task", node)).toBe(
        "Big task due:2025-06-01 start:2025-05-15 p:2 recur:FREQ=MONTHLY",
      )
    })

    test("only appends metadata not already present (mixed formats)", () => {
      // Content has emoji due date and text priority — only start and recurrence should be appended
      const node = makeNode({
        content: "Task 📅 2025-06-01 p:2",
        due_at: "2025-06-01",
        start_at: "2025-05-15",
        priority: 2,
        recurrence: "FREQ=WEEKLY",
      })
      expect(stringifyTaskMetadata("Task 📅 2025-06-01 p:2", node)).toBe(
        "Task 📅 2025-06-01 p:2 start:2025-05-15 recur:FREQ=WEEKLY",
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
  test("strips due date and returns clean content", () => {
    const result = parseTaskMetadataFromText("Ideas due:2026-02-15")
    expect(result.cleanContent).toBe("Ideas")
    expect(result.due_at).toBe("2026-02-15")
  })

  test("strips due date with time", () => {
    const result = parseTaskMetadataFromText("Meeting due:2026-02-15T14:30")
    expect(result.cleanContent).toBe("Meeting")
    expect(result.due_at).toBe("2026-02-15T14:30")
  })

  test("strips start date", () => {
    const result = parseTaskMetadataFromText("Task start:2026-03-10")
    expect(result.cleanContent).toBe("Task")
    expect(result.start_at).toBe("2026-03-10")
  })

  test("strips start date with time", () => {
    const result = parseTaskMetadataFromText("Task start:2026-03-10T09:00")
    expect(result.cleanContent).toBe("Task")
    expect(result.start_at).toBe("2026-03-10T09:00")
  })

  test("strips priority", () => {
    const result = parseTaskMetadataFromText("Task p:2")
    expect(result.cleanContent).toBe("Task")
    expect(result.priority).toBe(2)
  })

  test("strips recurrence", () => {
    const result = parseTaskMetadataFromText("Review recur:FREQ=WEEKLY")
    expect(result.cleanContent).toBe("Review")
    expect(result.recurrence).toBe("FREQ=WEEKLY")
  })

  test("strips multiple metadata", () => {
    const result = parseTaskMetadataFromText("Big task due:2026-06-01 start:2026-05-15 p:2 recur:FREQ=MONTHLY")
    expect(result.cleanContent).toBe("Big task")
    expect(result.due_at).toBe("2026-06-01")
    expect(result.start_at).toBe("2026-05-15")
    expect(result.priority).toBe(2)
    expect(result.recurrence).toBe("FREQ=MONTHLY")
  })

  test("returns plain text when no metadata", () => {
    const result = parseTaskMetadataFromText("Just a normal task")
    expect(result.cleanContent).toBe("Just a normal task")
    expect(result.due_at).toBeUndefined()
    expect(result.start_at).toBeUndefined()
    expect(result.priority).toBeUndefined()
    expect(result.recurrence).toBeUndefined()
  })

  test("round-trip: stringify then parse recovers fields", () => {
    const node = makeNode({
      content: "Task",
      due_at: "2026-01-15",
      start_at: "2026-01-10",
      priority: 1,
      recurrence: "FREQ=DAILY",
    })
    const stringified = stringifyTaskMetadata("Task", node)
    expect(stringified).toBe("Task due:2026-01-15 start:2026-01-10 p:1 recur:FREQ=DAILY")

    const parsed = parseTaskMetadataFromText(stringified)
    expect(parsed.cleanContent).toBe("Task")
    expect(parsed.due_at).toBe("2026-01-15")
    expect(parsed.start_at).toBe("2026-01-10")
    expect(parsed.priority).toBe(1)
    expect(parsed.recurrence).toBe("FREQ=DAILY")
  })

  test("handles user-edited date (changed from original)", () => {
    // User edits "Ideas due:2026-02-15" → "Ideas due:2026-03-01"
    const result = parseTaskMetadataFromText("Ideas due:2026-03-01")
    expect(result.cleanContent).toBe("Ideas")
    expect(result.due_at).toBe("2026-03-01")
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
  describe("text format (key:value)", () => {
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

    test("extracts priority", () => {
      const result = extractTaskMetadata("Task p:2")
      expect(result.priority).toBe(2)
    })

    test("extracts recurrence", () => {
      const result = extractTaskMetadata("Review recur:FREQ=WEEKLY")
      expect(result.recurrence).toBe("FREQ=WEEKLY")
    })

    test("extracts all metadata", () => {
      const result = extractTaskMetadata("Big task due:2026-06-01 start:2026-05-15 p:2 recur:FREQ=MONTHLY")
      expect(result.dueDate).toBe("2026-06-01")
      expect(result.startDate).toBe("2026-05-15")
      expect(result.priority).toBe(2)
      expect(result.recurrence).toBe("FREQ=MONTHLY")
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

    test("extracts priority ⏫ as 1", () => {
      const result = extractTaskMetadata("Task ⏫")
      expect(result.priority).toBe(1)
    })

    test("extracts priority 🔼 as 2", () => {
      const result = extractTaskMetadata("Task 🔼")
      expect(result.priority).toBe(2)
    })

    test("extracts priority 🔽 as 3", () => {
      const result = extractTaskMetadata("Task 🔽")
      expect(result.priority).toBe(3)
    })

    test("extracts recurrence from 🔁", () => {
      const result = extractTaskMetadata("Task 🔁 every week")
      expect(result.recurrence).toBe("every week")
    })
  })

  describe("text format takes precedence over emoji", () => {
    test("due: overrides 📅", () => {
      const result = extractTaskMetadata("Task due:2026-04-01 📅 2026-03-15")
      expect(result.dueDate).toBe("2026-04-01")
    })

    test("p: overrides ⏫", () => {
      const result = extractTaskMetadata("Task p:3 ⏫")
      expect(result.priority).toBe(3)
    })
  })

  describe("no metadata", () => {
    test("returns empty for plain text", () => {
      const result = extractTaskMetadata("Just a normal task")
      expect(result.dueDate).toBeUndefined()
      expect(result.startDate).toBeUndefined()
      expect(result.priority).toBeUndefined()
      expect(result.recurrence).toBeUndefined()
    })
  })
})
