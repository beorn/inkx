import { describe, expect, it } from "vitest"
import { boundary, precondition, unimplemented, ok, type OpResult } from "../src/errors.ts"

describe("OpError constructors", () => {
  it("boundary creates boundary error", () => {
    const result = boundary("up")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toEqual({ type: "boundary", direction: "up" })
    }
  })

  it("boundary with message", () => {
    const result = boundary("left", "at first column")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toEqual({
        type: "boundary",
        direction: "left",
        message: "at first column",
      })
    }
  })

  it("precondition creates precondition error", () => {
    const result = precondition("currentNode")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toEqual({
        type: "precondition",
        missing: "currentNode",
      })
    }
  })

  it("unimplemented creates unimplemented error", () => {
    const result = unimplemented("multiselect drag")
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toEqual({
        type: "unimplemented",
        feature: "multiselect drag",
      })
    }
  })

  it("ok creates success result", () => {
    const result = ok()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBeUndefined()
    }
  })

  it("OpResult type can hold any OpError", () => {
    const results: OpResult[] = [boundary("down"), precondition("selection"), unimplemented("paste"), ok()]

    expect(results[0]!.ok).toBe(false)
    expect(results[1]!.ok).toBe(false)
    expect(results[2]!.ok).toBe(false)
    expect(results[3]!.ok).toBe(true)
  })
})
