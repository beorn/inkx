import { describe, it, expect } from "vitest"
import { serializeResult, deserializeResult } from "../serialize.ts"

describe("serializeResult", () => {
  it("serializes Map for getNodesBatch", () => {
    const map = new Map([
      ["a", { id: "a" }],
      ["b", { id: "b" }],
    ])
    const result = serializeResult("getNodesBatch", map)
    expect(result).toEqual({
      __map: true,
      entries: [
        ["a", { id: "a" }],
        ["b", { id: "b" }],
      ],
    })
  })

  it("serializes Map for getChildCounts", () => {
    const map = new Map([
      ["x", 3],
      ["y", 0],
    ])
    const result = serializeResult("getChildCounts", map)
    expect(result).toEqual({
      __map: true,
      entries: [
        ["x", 3],
        ["y", 0],
      ],
    })
  })

  it("passes through arrays unchanged", () => {
    const arr = [{ id: "a" }]
    expect(serializeResult("getChildren", arr)).toBe(arr)
  })

  it("passes through null", () => {
    expect(serializeResult("getNode", null)).toBeNull()
  })

  it("passes through primitives", () => {
    expect(serializeResult("addNode", "new-id")).toBe("new-id")
  })
})

describe("deserializeResult", () => {
  it("deserializes Map entries for getNodesBatch", () => {
    const data = { __map: true, entries: [["a", { id: "a" }]] }
    const result = deserializeResult("getNodesBatch", data)
    expect(result).toBeInstanceOf(Map)
    expect((result as Map<string, unknown>).get("a")).toEqual({ id: "a" })
  })

  it("passes through non-map data", () => {
    const data = [{ id: "a" }]
    expect(deserializeResult("getChildren", data)).toBe(data)
  })
})
