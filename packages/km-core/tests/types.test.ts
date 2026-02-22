/**
 * Tests for @km/core type utilities
 */
import { describe, test, expect } from "vitest"
import {
  getMarkerForStatus,
  getStatusForMarker,
  extractTitleTaskMarker,
  markToMarker,
  isOutline,
  isListItem,
  isItem,
  isLink,
  isBlock,
  type TaskStatus,
} from "../src/types.ts"

describe("getMarkerForStatus", () => {
  test("maps 'done' to '[x]'", () => {
    expect(getMarkerForStatus("done")).toBe("[x]")
  })

  test("maps 'wip' to '[/]'", () => {
    expect(getMarkerForStatus("wip")).toBe("[/]")
  })

  test("maps 'blocked' to '[!]'", () => {
    expect(getMarkerForStatus("blocked")).toBe("[!]")
  })

  test("maps 'dropped' to '[-]'", () => {
    expect(getMarkerForStatus("dropped")).toBe("[-]")
  })

  test("maps 'todo' to '[ ]'", () => {
    expect(getMarkerForStatus("todo")).toBe("[ ]")
  })
})

describe("getStatusForMarker", () => {
  test("returns undefined for undefined", () => {
    expect(getStatusForMarker(undefined)).toBeUndefined()
  })

  test("parses full bracket markers", () => {
    expect(getStatusForMarker("[x]")).toBe("done")
    expect(getStatusForMarker("[X]")).toBe("done")
    expect(getStatusForMarker("[ ]")).toBe("todo")
    expect(getStatusForMarker("[/]")).toBe("wip")
    expect(getStatusForMarker("[!]")).toBe("blocked")
    expect(getStatusForMarker("[-]")).toBe("dropped")
  })

  test("parses single char markers (backwards compat)", () => {
    expect(getStatusForMarker("x")).toBe("done")
    expect(getStatusForMarker(" ")).toBe("todo")
  })
})

describe("markToMarker", () => {
  test("wraps single char in brackets", () => {
    expect(markToMarker("x")).toBe("[x]")
    expect(markToMarker(" ")).toBe("[ ]")
    expect(markToMarker("/")).toBe("[/]")
  })
})

describe("extractTitleTaskMarker", () => {
  test("extracts marker from title", () => {
    expect(extractTitleTaskMarker("[ ] Todo task")).toEqual({
      marker: "[ ]",
      cleanText: "Todo task",
    })
    expect(extractTitleTaskMarker("[x] Done task")).toEqual({
      marker: "[x]",
      cleanText: "Done task",
    })
  })

  test("returns undefined marker for non-task text", () => {
    expect(extractTitleTaskMarker("Regular text")).toEqual({
      marker: undefined,
      cleanText: "Regular text",
    })
  })
})

describe("type predicates", () => {
  test("isOutline", () => {
    expect(isOutline("oi")).toBe(true)
    expect(isOutline("li")).toBe(false)
    expect(isOutline("p")).toBe(false)
  })

  test("isListItem", () => {
    expect(isListItem("li")).toBe(true)
    expect(isListItem("oi")).toBe(false)
  })

  test("isItem", () => {
    expect(isItem("oi")).toBe(true)
    expect(isItem("li")).toBe(true)
    expect(isItem("p")).toBe(false)
    expect(isItem("link")).toBe(false)
  })

  test("isLink", () => {
    expect(isLink("link")).toBe(true)
    expect(isLink("p")).toBe(false)
  })

  test("isBlock", () => {
    expect(isBlock("p")).toBe(true)
    expect(isBlock("code")).toBe(true)
    expect(isBlock("oi")).toBe(false)
    expect(isBlock("li")).toBe(false)
    expect(isBlock("link")).toBe(false)
  })
})
