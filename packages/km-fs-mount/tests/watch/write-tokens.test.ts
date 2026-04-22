import { describe, expect, test } from "vitest"
import { WriteTokenMap } from "../../src/watch/write-tokens.ts"

describe("WriteTokenMap", () => {
  test("record() + consume() with matching content returns 'ours'", () => {
    const map = new WriteTokenMap()
    const path = "/tmp/test.md"
    const content = "# Hello World\n\nSome content here.\n"

    map.record(path, content)
    expect(map.consume(path, content)).toBe("ours")
  })

  test("consume() with different content returns 'external'", () => {
    const map = new WriteTokenMap()
    const path = "/tmp/test.md"

    map.record(path, "original content")
    expect(map.consume(path, "different content")).toBe("external")
  })

  test("consume() without prior record returns 'external'", () => {
    const map = new WriteTokenMap()
    expect(map.consume("/tmp/unknown.md", "anything")).toBe("external")
  })

  test("token is consumed (one-shot): second consume returns 'external'", () => {
    const map = new WriteTokenMap()
    const path = "/tmp/test.md"
    const content = "# One-shot test\n"

    map.record(path, content)
    expect(map.consume(path, content)).toBe("ours")
    // Second consume — token was already consumed
    expect(map.consume(path, content)).toBe("external")
  })

  test("has() returns true after record, false after consume", () => {
    const map = new WriteTokenMap()
    const path = "/tmp/test.md"
    const content = "some content"

    expect(map.has(path)).toBe(false)

    map.record(path, content)
    expect(map.has(path)).toBe(true)

    map.consume(path, content)
    expect(map.has(path)).toBe(false)
  })

  test("clear() removes all tokens", () => {
    const map = new WriteTokenMap()

    map.record("/tmp/a.md", "content a")
    map.record("/tmp/b.md", "content b")
    map.record("/tmp/c.md", "content c")
    expect(map.size).toBe(3)

    map.clear()
    expect(map.size).toBe(0)
    expect(map.has("/tmp/a.md")).toBe(false)
    expect(map.consume("/tmp/a.md", "content a")).toBe("external")
  })

  test("size tracks number of recorded tokens", () => {
    const map = new WriteTokenMap()
    expect(map.size).toBe(0)

    map.record("/tmp/a.md", "a")
    expect(map.size).toBe(1)

    map.record("/tmp/b.md", "b")
    expect(map.size).toBe(2)

    // Re-record same path replaces token, size unchanged
    map.record("/tmp/a.md", "a-updated")
    expect(map.size).toBe(2)

    map.consume("/tmp/a.md", "a-updated")
    expect(map.size).toBe(1)
  })

  test("re-recording a path updates the hash", () => {
    const map = new WriteTokenMap()
    const path = "/tmp/test.md"

    map.record(path, "version 1")
    map.record(path, "version 2")

    // Old content no longer matches
    expect(map.consume(path, "version 1")).toBe("external")
  })

  test("re-recording after consume of different content works", () => {
    const map = new WriteTokenMap()
    const path = "/tmp/test.md"

    map.record(path, "version 1")
    // External edit consumed the token
    map.consume(path, "external edit")

    // We write again
    map.record(path, "version 2")
    expect(map.consume(path, "version 2")).toBe("ours")
  })
})

describe("WriteTokenMap — delete tracking", () => {
  test("recordDelete() + consumeDelete() returns true", () => {
    const map = new WriteTokenMap()
    const path = "/tmp/test.md"

    map.recordDelete(path)
    expect(map.consumeDelete(path)).toBe(true)
  })

  test("consumeDelete() without prior recordDelete returns false", () => {
    const map = new WriteTokenMap()
    expect(map.consumeDelete("/tmp/unknown.md")).toBe(false)
  })

  test("consumeDelete is one-shot: second call returns false", () => {
    const map = new WriteTokenMap()
    const path = "/tmp/test.md"

    map.recordDelete(path)
    expect(map.consumeDelete(path)).toBe(true)
    expect(map.consumeDelete(path)).toBe(false)
  })

  test("hasDelete() returns true after recordDelete, false after consumeDelete", () => {
    const map = new WriteTokenMap()
    const path = "/tmp/test.md"

    expect(map.hasDelete(path)).toBe(false)
    map.recordDelete(path)
    expect(map.hasDelete(path)).toBe(true)
    map.consumeDelete(path)
    expect(map.hasDelete(path)).toBe(false)
  })

  test("clear() removes delete tombstones too", () => {
    const map = new WriteTokenMap()
    map.recordDelete("/tmp/a.md")
    map.recordDelete("/tmp/b.md")
    expect(map.deleteSize).toBe(2)

    map.clear()
    expect(map.deleteSize).toBe(0)
    expect(map.hasDelete("/tmp/a.md")).toBe(false)
  })

  test("deleteSize tracks number of recorded tombstones", () => {
    const map = new WriteTokenMap()
    expect(map.deleteSize).toBe(0)

    map.recordDelete("/tmp/a.md")
    expect(map.deleteSize).toBe(1)

    map.recordDelete("/tmp/b.md")
    expect(map.deleteSize).toBe(2)

    // Duplicate recordDelete is idempotent (Set behavior)
    map.recordDelete("/tmp/a.md")
    expect(map.deleteSize).toBe(2)

    map.consumeDelete("/tmp/a.md")
    expect(map.deleteSize).toBe(1)
  })

  test("delete tokens and write tokens are independent", () => {
    const map = new WriteTokenMap()
    const path = "/tmp/test.md"

    map.record(path, "content")
    map.recordDelete(path)

    // Write token still works
    expect(map.has(path)).toBe(true)
    expect(map.consume(path, "content")).toBe("ours")

    // Delete token still works after write token consumed
    expect(map.hasDelete(path)).toBe(true)
    expect(map.consumeDelete(path)).toBe(true)
  })
})
