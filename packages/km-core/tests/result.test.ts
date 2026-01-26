import { describe, expect, it } from "bun:test"
import {
  Ok,
  Err,
  OkVoid,
  isOk,
  isErr,
  map,
  andThen,
  all,
  tryCatch,
  type Result,
} from "../src/result.ts"

describe("Result type", () => {
  describe("Ok/Err constructors", () => {
    it("creates success result with Ok", () => {
      const result = Ok(42)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toBe(42)
    })

    it("creates failure result with Err", () => {
      const result = Err("error")
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe("error")
    })

    it("OkVoid creates void success", () => {
      expect(OkVoid.ok).toBe(true)
      if (OkVoid.ok) expect(OkVoid.value).toBeUndefined()
    })
  })

  describe("type guards", () => {
    it("isOk narrows to success", () => {
      const result: Result<number, string> = Ok(42)
      if (isOk(result)) {
        expect(result.value).toBe(42)
      } else {
        throw new Error("Should be Ok")
      }
    })

    it("isErr narrows to failure", () => {
      const result: Result<number, string> = Err("oops")
      if (isErr(result)) {
        expect(result.error).toBe("oops")
      } else {
        throw new Error("Should be Err")
      }
    })
  })

  describe("map", () => {
    it("transforms success value", () => {
      const result = map(Ok(2), (x) => x * 3)
      expect(result).toEqual(Ok(6))
    })

    it("passes through error", () => {
      const result = map(Err("fail") as Result<number, string>, (x) => x * 3)
      expect(result).toEqual(Err("fail"))
    })
  })

  describe("andThen", () => {
    it("chains success to success", () => {
      const result = andThen(Ok(2), (x) => Ok(x * 3))
      expect(result).toEqual(Ok(6))
    })

    it("chains success to error", () => {
      const result = andThen(Ok(2), () => Err("failed"))
      expect(result).toEqual(Err("failed"))
    })

    it("short-circuits on error", () => {
      const result = andThen(Err("first") as Result<number, string>, () =>
        Ok(99),
      )
      expect(result).toEqual(Err("first"))
    })
  })

  describe("all", () => {
    it("collects all success values", () => {
      const result = all([Ok(1), Ok(2), Ok(3)])
      expect(result).toEqual(Ok([1, 2, 3]))
    })

    it("returns first error", () => {
      const result = all([Ok(1), Err("bad"), Ok(3)] as Result<number, string>[])
      expect(result).toEqual(Err("bad"))
    })

    it("handles empty array", () => {
      const result = all([])
      expect(result).toEqual(Ok([]))
    })
  })

  describe("tryCatch", () => {
    it("wraps successful execution", () => {
      const result = tryCatch(() => 42)
      expect(result).toEqual(Ok(42))
    })

    it("wraps thrown Error", () => {
      const result = tryCatch(() => {
        throw new Error("boom")
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toBe("boom")
      }
    })

    it("wraps thrown non-Error", () => {
      const result = tryCatch(() => {
        throw new Error("string error")
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.message).toBe("string error")
      }
    })
  })
})
