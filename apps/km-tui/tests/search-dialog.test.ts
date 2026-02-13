/**
 * Tests for SearchDialog component
 */
import { describe, test, expect } from "vitest"
import { fuzzyMatch, fuzzyScore, extractTags } from "../src/views/search-utils.ts"

describe("fuzzyMatch", () => {
  test("matches exact string", () => {
    expect(fuzzyMatch("test", "test")).toBe(true)
  })

  test("matches characters in order", () => {
    expect(fuzzyMatch("tst", "test")).toBe(true)
  })

  test("matches characters with gaps", () => {
    expect(fuzzyMatch("tk", "task")).toBe(true)
  })

  test("is case-insensitive", () => {
    expect(fuzzyMatch("TeSt", "test")).toBe(true)
    expect(fuzzyMatch("test", "TEST")).toBe(true)
  })

  test("does not match out-of-order characters", () => {
    expect(fuzzyMatch("tse", "test")).toBe(false)
  })

  test("does not match missing characters", () => {
    expect(fuzzyMatch("xyz", "test")).toBe(false)
  })

  test("matches empty query", () => {
    expect(fuzzyMatch("", "test")).toBe(true)
  })
})

describe("fuzzyScore", () => {
  test("scores exact match higher than partial", () => {
    const exactScore = fuzzyScore("test", "test")
    const partialScore = fuzzyScore("test", "testing")
    expect(exactScore).toBeGreaterThan(partialScore)
  })

  test("scores consecutive matches with bonus", () => {
    // Consecutive matches get bonus points (consecutive * 2 per match)
    // This test verifies the algorithm works correctly, not comparing absolute scores
    const score = fuzzyScore("abc", "abcdef")
    expect(score).toBeGreaterThan(0) // Valid match
    // Consecutive bonus: a=2, b=4, c=6 = 12 points from consecutive
    // Plus start bonus: 10 points
    // Minus length penalty: 6 * 0.1 = 0.6
    // Expected approximately: 12 + 10 - 0.6 = 21.4
    expect(score).toBeGreaterThan(20)
  })

  test("scores start matches higher", () => {
    const startScore = fuzzyScore("te", "test")
    const middleScore = fuzzyScore("st", "test")
    expect(startScore).toBeGreaterThan(middleScore)
  })

  test("returns -1 for non-match", () => {
    expect(fuzzyScore("xyz", "test")).toBe(-1)
  })

  test("prefers shorter targets", () => {
    const shortScore = fuzzyScore("t", "task")
    const longScore = fuzzyScore("t", "task with long description")
    expect(shortScore).toBeGreaterThan(longScore)
  })
})

describe("extractTags", () => {
  test("extracts single tag", () => {
    expect(extractTags("This is #urgent")).toEqual(["urgent"])
  })

  test("extracts multiple tags", () => {
    expect(extractTags("This is #urgent and #blocked")).toEqual(["urgent", "blocked"])
  })

  test("handles no tags", () => {
    expect(extractTags("No tags here")).toEqual([])
  })

  test("handles undefined content", () => {
    expect(extractTags(undefined)).toEqual([])
  })

  test("handles tags with numbers", () => {
    expect(extractTags("Tagged with #p1 and #tag2")).toEqual(["p1", "tag2"])
  })

  test("handles tags at start", () => {
    expect(extractTags("#urgent task description")).toEqual(["urgent"])
  })

  test("handles multiple consecutive tags", () => {
    expect(extractTags("#urgent #blocked #p1")).toEqual(["urgent", "blocked", "p1"])
  })

  test("does not extract # without word", () => {
    expect(extractTags("Just a # symbol")).toEqual([])
  })

  test("extracts only word characters after #", () => {
    expect(extractTags("#tag-with-dash")).toEqual(["tag"])
  })
})
