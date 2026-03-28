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
})
