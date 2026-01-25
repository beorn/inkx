import { describe, expect, test } from "bun:test"
import {
  DEFAULT_HARNESS,
  getDefaultHarness,
  validateHarness,
  listHarnesses,
} from "../src/harness.ts"

describe("DEFAULT_HARNESS", () => {
  test("has required fields", () => {
    expect(DEFAULT_HARNESS.name).toBe("general")
    expect(DEFAULT_HARNESS.tools).toBeArray()
    expect(DEFAULT_HARNESS.tools.length).toBeGreaterThan(0)
  })

  test("includes common tools", () => {
    expect(DEFAULT_HARNESS.tools).toContain("read_file")
    expect(DEFAULT_HARNESS.tools).toContain("write_file")
  })

  test("has constraints", () => {
    expect(DEFAULT_HARNESS.constraints).toBeDefined()
    expect(DEFAULT_HARNESS.constraints?.max_tokens_per_session).toBeGreaterThan(
      0,
    )
  })
})

describe("getDefaultHarness", () => {
  test("returns the default harness", () => {
    const harness = getDefaultHarness()
    expect(harness).toBe(DEFAULT_HARNESS)
  })
})

describe("validateHarness", () => {
  test("validates correct harness", () => {
    const valid = {
      name: "test",
      tools: ["read_file"],
    }
    expect(validateHarness(valid)).toBe(true)
  })

  test("validates wrapped harness format", () => {
    const wrapped = {
      harness: {
        name: "test",
        tools: ["read_file"],
      },
    }
    expect(validateHarness(wrapped)).toBe(true)
  })

  test("rejects missing name", () => {
    const invalid = {
      tools: ["read_file"],
    }
    expect(validateHarness(invalid)).toBe(false)
  })

  test("rejects missing tools", () => {
    const invalid = {
      name: "test",
    }
    expect(validateHarness(invalid)).toBe(false)
  })

  test("rejects non-array tools", () => {
    const invalid = {
      name: "test",
      tools: "read_file",
    }
    expect(validateHarness(invalid)).toBe(false)
  })

  test("rejects null", () => {
    expect(validateHarness(null)).toBe(false)
  })

  test("rejects non-object", () => {
    expect(validateHarness("string")).toBe(false)
    expect(validateHarness(123)).toBe(false)
  })

  test("accepts optional fields", () => {
    const valid = {
      name: "test",
      description: "A test harness",
      tools: ["read_file"],
      connectors: [{ type: "github", permissions: ["read"] }],
      constraints: { read_only: true },
    }
    expect(validateHarness(valid)).toBe(true)
  })
})

describe("listHarnesses", () => {
  test("includes general harness", () => {
    const harnesses = listHarnesses()
    expect(harnesses).toContain("general")
  })

  test("returns sorted array", () => {
    const harnesses = listHarnesses()
    const sorted = [...harnesses].sort()
    expect(harnesses).toEqual(sorted)
  })
})
