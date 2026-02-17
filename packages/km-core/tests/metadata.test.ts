/**
 * Tests for unified inline metadata — key:: value format.
 *
 * Covers:
 * - extractMetadata: text → { clean, entries }
 * - stringifyMetadata: content + entries → content with metadata appended
 * - splitMultiValue: comma-separated string → array
 * - Round-trip: stringify → extract recovers entries
 */
import { describe, test, expect } from "vitest"
import { extractMetadata, stringifyMetadata, splitMultiValue } from "../src/metadata.ts"

// =============================================================================
// extractMetadata
// =============================================================================

describe("extractMetadata", () => {
  describe("single key:: value", () => {
    test("extracts simple value", () => {
      const { clean, entries } = extractMetadata("Task due:: 2026-02-15")
      expect(clean).toBe("Task")
      expect(entries.due).toBe("2026-02-15")
    })

    test("extracts date with time", () => {
      const { clean, entries } = extractMetadata("Meeting due:: 2026-02-15T14:30")
      expect(clean).toBe("Meeting")
      expect(entries.due).toBe("2026-02-15T14:30")
    })

    test("extracts color", () => {
      const { clean, entries } = extractMetadata("Column Name color:: yellow")
      expect(clean).toBe("Column Name")
      expect(entries.color).toBe("yellow")
    })

    test("extracts priority", () => {
      const { clean, entries } = extractMetadata("Task p:: 1")
      expect(clean).toBe("Task")
      expect(entries.p).toBe("1")
    })

    test("extracts hyphenated key", () => {
      const { clean, entries } = extractMetadata("Task blocked-by:: other-task")
      expect(clean).toBe("Task")
      expect(entries["blocked-by"]).toBe("other-task")
    })
  })

  describe("quoted values", () => {
    test("extracts quoted value with spaces", () => {
      const { clean, entries } = extractMetadata('Heading add:: "due:past"')
      expect(clean).toBe("Heading")
      expect(entries.add).toBe("due:past")
    })

    test("extracts quoted value with colons", () => {
      const { clean, entries } = extractMetadata('Task sync:: "status:blocked"')
      expect(clean).toBe("Task")
      expect(entries.sync).toBe("status:blocked")
    })

    test("handles escaped quotes in value", () => {
      const { clean, entries } = extractMetadata('Note desc:: "say \\"hello\\""')
      expect(clean).toBe("Note")
      expect(entries.desc).toBe('say "hello"')
    })
  })

  describe("multi-value (comma-separated)", () => {
    test("extracts comma-separated value as raw string", () => {
      const { entries } = extractMetadata("Heading add:: due:past,status:blocked")
      expect(entries.add).toBe("due:past,status:blocked")
    })

    test("splitMultiValue parses the comma-separated value", () => {
      const { entries } = extractMetadata("Heading add:: due:past,status:blocked")
      expect(splitMultiValue(entries.add!)).toEqual(["due:past", "status:blocked"])
    })
  })

  describe("multiple keys", () => {
    test("extracts all metadata in order", () => {
      const { clean, entries } = extractMetadata(
        "Big task due:: 2026-06-01 start:: 2026-05-15 p:: 2 recur:: FREQ=MONTHLY",
      )
      expect(clean).toBe("Big task")
      expect(entries.due).toBe("2026-06-01")
      expect(entries.start).toBe("2026-05-15")
      expect(entries.p).toBe("2")
      expect(entries.recur).toBe("FREQ=MONTHLY")
    })

    test("extracts section rules", () => {
      const { clean, entries } = extractMetadata(
        'Column Name add:: "due:past" color:: yellow collapse:: true limit:: 3',
      )
      expect(clean).toBe("Column Name")
      expect(entries.add).toBe("due:past")
      expect(entries.color).toBe("yellow")
      expect(entries.collapse).toBe("true")
      expect(entries.limit).toBe("3")
    })

    test("mixed task and custom metadata", () => {
      const { clean, entries } = extractMetadata("Task due:: 2026-02-15 rating:: 5")
      expect(clean).toBe("Task")
      expect(entries.due).toBe("2026-02-15")
      expect(entries.rating).toBe("5")
    })
  })

  describe("no metadata", () => {
    test("returns plain text unchanged", () => {
      const { clean, entries } = extractMetadata("Just a normal task")
      expect(clean).toBe("Just a normal task")
      expect(Object.keys(entries)).toHaveLength(0)
    })

    test("handles empty string", () => {
      const { clean, entries } = extractMetadata("")
      expect(clean).toBe("")
      expect(Object.keys(entries)).toHaveLength(0)
    })
  })

  describe("does NOT match without required space", () => {
    test("std::string is not metadata (no space after ::)", () => {
      const { clean, entries } = extractMetadata("Implement std::string wrapper")
      expect(clean).toBe("Implement std::string wrapper")
      expect(Object.keys(entries)).toHaveLength(0)
    })

    test("MyClass::method is not metadata", () => {
      const { clean, entries } = extractMetadata("Fix MyClass::method bug")
      expect(clean).toBe("Fix MyClass::method bug")
      expect(Object.keys(entries)).toHaveLength(0)
    })

    test("Rust::trait is not metadata", () => {
      const { clean, entries } = extractMetadata("Add Rust::trait support")
      expect(clean).toBe("Add Rust::trait support")
      expect(Object.keys(entries)).toHaveLength(0)
    })
  })

  describe("edge cases", () => {
    test("metadata at start of text", () => {
      const { clean, entries } = extractMetadata("due:: 2026-02-15 Task description")
      expect(clean).toBe("Task description")
      expect(entries.due).toBe("2026-02-15")
    })

    test("metadata in middle of text", () => {
      const { clean, entries } = extractMetadata("Task due:: 2026-02-15 is important")
      expect(clean).toBe("Task is important")
      expect(entries.due).toBe("2026-02-15")
    })

    test("last key wins for duplicate keys", () => {
      const { entries } = extractMetadata("Task p:: 1 p:: 3")
      expect(entries.p).toBe("3")
    })

    test("preserves wikilinks in clean text", () => {
      const { clean, entries } = extractMetadata("Task [[project]] due:: 2026-02-15")
      expect(clean).toBe("Task [[project]]")
      expect(entries.due).toBe("2026-02-15")
    })
  })
})

// =============================================================================
// stringifyMetadata
// =============================================================================

describe("stringifyMetadata", () => {
  test("appends single entry", () => {
    expect(stringifyMetadata("Task", { due: "2026-02-15" })).toBe("Task due:: 2026-02-15")
  })

  test("appends multiple entries", () => {
    expect(stringifyMetadata("Task", { due: "2026-06-01", start: "2026-05-15", p: "2" })).toBe(
      "Task due:: 2026-06-01 start:: 2026-05-15 p:: 2",
    )
  })

  test("quotes values with spaces", () => {
    expect(stringifyMetadata("Heading", { add: "due:past items" })).toBe('Heading add:: "due:past items"')
  })

  test("does not duplicate existing metadata", () => {
    expect(stringifyMetadata("Task due:: 2026-02-15", { due: "2026-02-15" })).toBe("Task due:: 2026-02-15")
  })

  test("appends only missing metadata", () => {
    expect(stringifyMetadata("Task due:: 2026-02-15", { due: "2026-02-15", p: "1" })).toBe(
      "Task due:: 2026-02-15 p:: 1",
    )
  })

  test("does not append to empty content", () => {
    expect(stringifyMetadata("", { due: "2026-02-15" })).toBe("")
  })

  test("skips undefined/empty values", () => {
    expect(stringifyMetadata("Task", { due: "2026-02-15", color: "" })).toBe("Task due:: 2026-02-15")
  })
})

// =============================================================================
// splitMultiValue
// =============================================================================

describe("splitMultiValue", () => {
  test("splits comma-separated values", () => {
    expect(splitMultiValue("val1,val2")).toEqual(["val1", "val2"])
  })

  test("splits three values", () => {
    expect(splitMultiValue("a,b,c")).toEqual(["a", "b", "c"])
  })

  test("handles quoted segments", () => {
    expect(splitMultiValue('"val 1","val 2"')).toEqual(["val 1", "val 2"])
  })

  test("handles mixed quoted and unquoted", () => {
    expect(splitMultiValue('simple,"with spaces"')).toEqual(["simple", "with spaces"])
  })

  test("single value returns array with one element", () => {
    expect(splitMultiValue("simple")).toEqual(["simple"])
  })

  test("empty string returns empty array", () => {
    expect(splitMultiValue("")).toEqual([])
  })

  test("trims whitespace around values", () => {
    expect(splitMultiValue("a , b , c")).toEqual(["a", "b", "c"])
  })
})

// =============================================================================
// Round-trip: stringify → extract
// =============================================================================

describe("round-trip", () => {
  test("stringify then extract recovers entries", () => {
    const entries = { due: "2026-01-15", start: "2026-01-10", p: "1", recur: "FREQ=DAILY" }
    const stringified = stringifyMetadata("Task", entries)
    expect(stringified).toBe("Task due:: 2026-01-15 start:: 2026-01-10 p:: 1 recur:: FREQ=DAILY")

    const { clean, entries: parsed } = extractMetadata(stringified)
    expect(clean).toBe("Task")
    expect(parsed).toEqual(entries)
  })

  test("round-trip with quoted values", () => {
    const entries = { add: "due:past items", color: "yellow" }
    const stringified = stringifyMetadata("Column", entries)
    const { clean, entries: parsed } = extractMetadata(stringified)
    expect(clean).toBe("Column")
    expect(parsed.add).toBe("due:past items")
    expect(parsed.color).toBe("yellow")
  })

  test("round-trip with multi-value", () => {
    const entries = { add: "due:past,status:blocked" }
    const stringified = stringifyMetadata("Column", entries)
    const { entries: parsed } = extractMetadata(stringified)
    expect(parsed.add).toBe("due:past,status:blocked")
    expect(splitMultiValue(parsed.add!)).toEqual(["due:past", "status:blocked"])
  })
})
