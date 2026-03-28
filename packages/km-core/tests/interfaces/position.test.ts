import { describe, it, expect } from "vitest"
import { Position } from "../../src/interfaces/position.ts"

describe("Position namespace", () => {
  describe("Position.of", () => {
    it("returns slot of a node in its parent", () => {
      expect(Position.of({ id: "card-2", parent_id: "board-A", parent_idx: 1 })).toEqual({
        parentId: "board-A",
        childIdx: 1,
      })
    })

    it("returns null for root (no parent)", () => {
      expect(Position.of({ id: "root", parent_id: null, parent_idx: 0 })).toBeNull()
    })

    it("preserves parent_idx as childIdx", () => {
      expect(Position.of({ id: "x", parent_id: "y", parent_idx: 42 })).toEqual({
        parentId: "y",
        childIdx: 42,
      })
    })
  })

  describe("Position.first", () => {
    it("creates Position with childIdx 0", () => {
      expect(Position.first("board-A")).toEqual({ parentId: "board-A", childIdx: 0 })
    })
  })

  describe("Position.last", () => {
    it("creates Position with childIdx -1", () => {
      expect(Position.last("board-A")).toEqual({ parentId: "board-A", childIdx: -1 })
    })
  })

  describe("Position.equals", () => {
    it("true for identical positions", () => {
      expect(Position.equals({ parentId: "a", childIdx: 0 }, { parentId: "a", childIdx: 0 })).toBe(true)
    })

    it("false for different parentId", () => {
      expect(Position.equals({ parentId: "a", childIdx: 0 }, { parentId: "b", childIdx: 0 })).toBe(false)
    })

    it("false for different childIdx", () => {
      expect(Position.equals({ parentId: "a", childIdx: 0 }, { parentId: "a", childIdx: -1 })).toBe(false)
    })
  })

  describe("Position.after", () => {
    it("returns slot after a node", () => {
      expect(Position.after({ id: "card-2", parent_id: "board-A", parent_idx: 1 })).toEqual({
        parentId: "board-A",
        childIdx: 2,
      })
    })

    it("returns null for root node", () => {
      expect(Position.after({ id: "root", parent_id: null, parent_idx: 0 })).toBeNull()
    })

    it("childIdx is parent_idx + 1", () => {
      expect(Position.after({ id: "x", parent_id: "y", parent_idx: 42 })).toEqual({
        parentId: "y",
        childIdx: 43,
      })
    })
  })

  describe("Position.before", () => {
    it("returns slot before a node", () => {
      expect(Position.before({ id: "card-2", parent_id: "board-A", parent_idx: 1 })).toEqual({
        parentId: "board-A",
        childIdx: 0,
      })
    })

    it("returns null for root node", () => {
      expect(Position.before({ id: "root", parent_id: null, parent_idx: 0 })).toBeNull()
    })

    it("childIdx is parent_idx - 1", () => {
      expect(Position.before({ id: "x", parent_id: "y", parent_idx: 42 })).toEqual({
        parentId: "y",
        childIdx: 41,
      })
    })

    it("can produce negative childIdx for first child", () => {
      expect(Position.before({ id: "first", parent_id: "parent", parent_idx: 0 })).toEqual({
        parentId: "parent",
        childIdx: -1,
      })
    })
  })
})
