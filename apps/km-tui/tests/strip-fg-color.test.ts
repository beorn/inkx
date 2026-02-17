import { describe, test, expect } from "vitest"
import { stripFgColor } from "../src/text/rich.ts"

describe("stripFgColor", () => {
  test("strips basic fg colors", () => {
    expect(stripFgColor("\x1b[31mred\x1b[0m")).toBe("red\x1b[22;39m")
  })

  const preserved: Array<[string, string, string]> = [
    ["underline", "\x1b[4munderlined\x1b[24m", "\x1b[4munderlined\x1b[24m"],
    ["bold", "\x1b[1mbold\x1b[22m", "\x1b[1mbold\x1b[22m"],
    ["italic", "\x1b[3mitalic\x1b[23m", "\x1b[3mitalic\x1b[23m"],
    ["strikethrough", "\x1b[9mstrike\x1b[29m", "\x1b[9mstrike\x1b[29m"],
  ]

  for (const [name, input, expected] of preserved) {
    test(`preserves ${name}`, () => {
      expect(stripFgColor(input)).toBe(expected)
    })
  }

  test("strips fg but preserves underline in combined sequence", () => {
    const result = stripFgColor("\x1b[4;31mtext\x1b[0m")
    expect(result).toContain("\x1b[4m")
    expect(result).not.toContain("31")
  })

  const strippedFg: Array<[string, string, string]> = [
    ["256-color fg", "\x1b[38;5;196mred256\x1b[0m", "38;5;196"],
    ["truecolor fg", "\x1b[38;2;255;0;0mtruered\x1b[0m", "38;2;255;0;0"],
  ]

  for (const [name, input, absent] of strippedFg) {
    test(`strips ${name}`, () => {
      expect(stripFgColor(input)).not.toContain(absent)
    })
  }

  test("strips dim", () => {
    expect(stripFgColor("\x1b[2mdim\x1b[22m")).not.toContain("\x1b[2m")
  })

  test("plain text passes through unchanged", () => {
    expect(stripFgColor("hello")).toBe("hello")
  })
})
