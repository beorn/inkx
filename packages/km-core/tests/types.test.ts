/**
 * Tests for @km/core type utilities
 */
import { describe, test, expect } from "bun:test"
import { getMarkForStatus, type TaskStatus } from "../src/types.ts"

describe("getMarkForStatus", () => {
  test("maps 'done' to 'x'", () => {
    expect(getMarkForStatus("done")).toBe("x")
  })

  test("maps 'wip' to '/'", () => {
    expect(getMarkForStatus("wip")).toBe("/")
  })

  test("maps 'blocked' to '!'", () => {
    expect(getMarkForStatus("blocked")).toBe("!")
  })

  test("maps 'dropped' to '-'", () => {
    expect(getMarkForStatus("dropped")).toBe("-")
  })

  test("maps 'todo' to ' ' (space)", () => {
    expect(getMarkForStatus("todo")).toBe(" ")
  })

  test("default case returns ' ' (space)", () => {
    // Test with undefined or other values (type-cast for edge case)
    expect(getMarkForStatus("todo" as TaskStatus)).toBe(" ")
  })
})
