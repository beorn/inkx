/**
 * @silvery/selection — OccurrencePath helper tests
 *
 * Phase 1 of @km/tui/cursor-is-path-no-global-subscriptions.
 * Path identity disambiguates duplicate visual occurrences of the same
 * source id (embeds / symlinks / portals / sticky virtual lists).
 */

import { describe, expect, test } from "vitest"
import {
  isPathPrefix,
  pathAppend,
  pathChildAfter,
  pathLeaf,
  pathsEqual,
  type ID,
  type OccurrencePath,
} from "../src/index.ts"

const id = (s: string) => s as ID
const path = (...ids: string[]): OccurrencePath => ids.map(id)

describe("pathsEqual", () => {
  test("same reference is equal", () => {
    const p = path("a", "b")
    expect(pathsEqual(p, p)).toBe(true)
  })

  test("structurally equal paths are equal", () => {
    expect(pathsEqual(path("a", "b", "c"), path("a", "b", "c"))).toBe(true)
  })

  test("different lengths are not equal", () => {
    expect(pathsEqual(path("a"), path("a", "b"))).toBe(false)
  })

  test("different elements at any position are not equal", () => {
    expect(pathsEqual(path("a", "b"), path("a", "c"))).toBe(false)
    expect(pathsEqual(path("a", "b", "c"), path("a", "b", "d"))).toBe(false)
  })

  test("null is equal only to null", () => {
    expect(pathsEqual(null, null)).toBe(true)
    expect(pathsEqual(null, path())).toBe(false)
    expect(pathsEqual(path(), null)).toBe(false)
  })

  test("empty paths are equal (root visible-tree)", () => {
    expect(pathsEqual(path(), path())).toBe(true)
  })

  test("disambiguates duplicate-occurrence ids", () => {
    // Same leaf id 'leaf', different visual occurrences.
    const occA = path("col-1", "card-X", "leaf")
    const occB = path("col-1", "card-Y", "leaf")
    expect(pathsEqual(occA, occB)).toBe(false)
    expect(pathLeaf(occA)).toBe(pathLeaf(occB))
  })
})

describe("isPathPrefix", () => {
  test("equal paths are prefixes", () => {
    expect(isPathPrefix(path("a", "b"), path("a", "b"))).toBe(true)
  })

  test("strict prefix returns true", () => {
    expect(isPathPrefix(path("a"), path("a", "b", "c"))).toBe(true)
    expect(isPathPrefix(path("a", "b"), path("a", "b", "c"))).toBe(true)
  })

  test("longer prefix candidate returns false", () => {
    expect(isPathPrefix(path("a", "b", "c"), path("a", "b"))).toBe(false)
  })

  test("divergent paths return false", () => {
    expect(isPathPrefix(path("a", "x"), path("a", "y", "z"))).toBe(false)
  })

  test("empty path is prefix of everything", () => {
    expect(isPathPrefix(path(), path("a", "b"))).toBe(true)
    expect(isPathPrefix(path(), path())).toBe(true)
  })
})

describe("pathLeaf", () => {
  test("returns last element", () => {
    expect(pathLeaf(path("a", "b", "c"))).toBe("c")
  })

  test("returns null for empty path", () => {
    expect(pathLeaf(path())).toBeNull()
  })

  test("returns null for null", () => {
    expect(pathLeaf(null)).toBeNull()
  })
})

describe("pathChildAfter", () => {
  test("returns the id one step past prefix", () => {
    expect(pathChildAfter(path("col"), path("col", "card", "item"))).toBe("card")
    expect(pathChildAfter(path("col", "card"), path("col", "card", "item"))).toBe("item")
  })

  test("returns null when prefix equals path", () => {
    expect(pathChildAfter(path("a", "b"), path("a", "b"))).toBeNull()
  })

  test("returns null when prefix does not prefix path", () => {
    expect(pathChildAfter(path("a", "x"), path("a", "y", "z"))).toBeNull()
    expect(pathChildAfter(path("a", "b", "c"), path("a", "b"))).toBeNull()
  })

  test("empty prefix returns first id", () => {
    expect(pathChildAfter(path(), path("a", "b"))).toBe("a")
  })
})

describe("pathAppend", () => {
  test("appends id without mutating input", () => {
    const p = path("a", "b")
    const next = pathAppend(p, id("c"))
    expect(next).toStrictEqual(path("a", "b", "c"))
    expect(p).toStrictEqual(path("a", "b"))
  })

  test("works on empty path", () => {
    expect(pathAppend(path(), id("a"))).toStrictEqual(path("a"))
  })
})
