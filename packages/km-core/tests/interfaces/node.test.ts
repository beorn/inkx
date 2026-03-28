import { describe, it, expect } from "vitest"
import { KNode } from "../../src/interfaces/node.ts"

describe("KNode namespace", () => {
  describe("KNode.isOutline", () => {
    it("true for heading items", () => {
      expect(KNode.isOutline({ type: "h", item: true })).toBe(true)
    })

    it("false for non-heading items", () => {
      expect(KNode.isOutline({ type: "p", item: true })).toBe(false)
    })

    it("false for heading non-items", () => {
      expect(KNode.isOutline({ type: "h", item: false })).toBe(false)
      expect(KNode.isOutline({ type: "h" })).toBe(false)
    })
  })

  describe("KNode.isListItem", () => {
    it("true for non-heading items", () => {
      expect(KNode.isListItem({ type: "p", item: true })).toBe(true)
      expect(KNode.isListItem({ type: "code", item: true })).toBe(true)
    })

    it("false for heading items (those are outlines)", () => {
      expect(KNode.isListItem({ type: "h", item: true })).toBe(false)
    })

    it("false for non-items", () => {
      expect(KNode.isListItem({ type: "p" })).toBe(false)
    })
  })

  describe("KNode.isItem", () => {
    it("true when item is true", () => {
      expect(KNode.isItem({ type: "h", item: true })).toBe(true)
      expect(KNode.isItem({ type: "p", item: true })).toBe(true)
    })

    it("false when item is false or undefined", () => {
      expect(KNode.isItem({ type: "p", item: false })).toBe(false)
      expect(KNode.isItem({ type: "p" })).toBe(false)
    })
  })

  describe("KNode.isBlock", () => {
    it("true when not an item", () => {
      expect(KNode.isBlock({ type: "p" })).toBe(true)
      expect(KNode.isBlock({ type: "p", item: false })).toBe(true)
    })

    it("false when item is true", () => {
      expect(KNode.isBlock({ type: "p", item: true })).toBe(false)
    })
  })

  describe("KNode.isEmbed", () => {
    it("true when embed_source is set", () => {
      expect(KNode.isEmbed({ embed_source: "some-id" })).toBe(true)
    })

    it("false when embed_source is null or undefined", () => {
      expect(KNode.isEmbed({ embed_source: null })).toBe(false)
      expect(KNode.isEmbed({})).toBe(false)
    })
  })

  describe("KNode.isTask", () => {
    it("true with explicit task_status", () => {
      expect(KNode.isTask({ task_status: "todo" })).toBe(true)
    })

    it("true with implicit task properties", () => {
      expect(KNode.isTask({ due_at: "2026-02-20" })).toBe(true)
      expect(KNode.isTask({ priority: "P2" })).toBe(true)
      expect(KNode.isTask({ start_at: "2026-01-01" })).toBe(true)
      expect(KNode.isTask({ assigned_to: "bjorn" })).toBe(true)
      expect(KNode.isTask({ rrule: "FREQ=DAILY" })).toBe(true)
    })

    it("false with no task properties", () => {
      expect(KNode.isTask({})).toBe(false)
    })

    it("false with null/empty properties", () => {
      expect(KNode.isTask({ task_status: null, due_at: null, priority: null })).toBe(false)
    })
  })

  describe("KNode.matches", () => {
    it("matches when all props equal", () => {
      const node = { type: "h", item: true, name: "test" }
      expect(KNode.matches(node, { type: "h", item: true })).toBe(true)
    })

    it("fails when any prop differs", () => {
      const node = { type: "h", item: true, name: "test" }
      expect(KNode.matches(node, { type: "p" })).toBe(false)
    })

    it("matches empty props", () => {
      expect(KNode.matches({ type: "p" }, {})).toBe(true)
    })
  })
})
