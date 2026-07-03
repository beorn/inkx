import { describe, expect, it } from "vitest"
import { createOrderedSet, EMPTY_ORDERED_SET } from "../src/ordered-set.ts"

describe("OrderedSet", () => {
  it("preserves array order", () => {
    const set = createOrderedSet(["C", "A", "B"])
    expect([...set]).toEqual(["C", "A", "B"])
  })

  it("has() returns true for included items", () => {
    const set = createOrderedSet(["A", "B", "C"])
    expect(set.has("A")).toBe(true)
    expect(set.has("B")).toBe(true)
    expect(set.has("C")).toBe(true)
  })

  it("has() returns false for missing items", () => {
    const set = createOrderedSet(["A", "B"])
    expect(set.has("Z")).toBe(false)
    expect(set.has("")).toBe(false)
  })

  it("length matches", () => {
    expect(createOrderedSet(["A", "B", "C"]).length).toBe(3)
    expect(createOrderedSet([]).length).toBe(0)
  })

  it("supports indexed access", () => {
    const set = createOrderedSet(["X", "Y", "Z"])
    expect(set[0]).toBe("X")
    expect(set[1]).toBe("Y")
    expect(set[2]).toBe("Z")
  })

  it("supports for-of iteration", () => {
    const set = createOrderedSet([1, 2, 3])
    const collected: number[] = []
    for (const item of set) {
      collected.push(item)
    }
    expect(collected).toEqual([1, 2, 3])
  })

  it("supports Array methods (map, filter)", () => {
    const set = createOrderedSet([1, 2, 3, 4])
    expect(set.map((x) => x * 2)).toEqual([2, 4, 6, 8])
    expect(set.filter((x) => x % 2 === 0)).toEqual([2, 4])
  })

  it("does not mutate the source array", () => {
    const source = ["A", "B"]
    const set = createOrderedSet(source)
    // Source array should remain unchanged
    expect(source).toEqual(["A", "B"])
    expect(set.has("A")).toBe(true)
  })

  describe("EMPTY_ORDERED_SET", () => {
    it("has length 0", () => {
      expect(EMPTY_ORDERED_SET.length).toBe(0)
    })

    it("has() returns false for anything", () => {
      expect(EMPTY_ORDERED_SET.has("A" as never)).toBe(false)
    })

    it("iterates zero items", () => {
      expect([...EMPTY_ORDERED_SET]).toEqual([])
    })
  })

  describe("with duplicates", () => {
    it("preserves array behavior (keeps dupes)", () => {
      const set = createOrderedSet(["A", "A", "B"])
      expect(set.length).toBe(3) // array behavior: dupes kept
      expect(set.has("A")).toBe(true)
      expect(set.has("B")).toBe(true)
    })
  })
})
