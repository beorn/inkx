import { describe, test, expect } from "vitest"
import { stripFgColor } from "../src/text/rich.ts"

describe("stripFgColor", () => {
  test("strips basic fg colors", () => {
    // \x1b[31m (red fg) is stripped entirely; \x1b[0m (reset) becomes \x1b[22;39m
    expect(stripFgColor("\x1b[31mred\x1b[0m")).toBe("red\x1b[22;39m")
  })

  test("preserves underline", () => {
    const input = "\x1b[4munderlined\x1b[24m"
    expect(stripFgColor(input)).toBe(input)
  })

  test("strips fg but preserves underline in combined sequence", () => {
    // underline + red fg
    const input = "\x1b[4;31mtext\x1b[0m"
    const result = stripFgColor(input)
    expect(result).toContain("\x1b[4m")
    expect(result).not.toContain("31")
  })

  test("preserves bold", () => {
    const input = "\x1b[1mbold\x1b[22m"
    expect(stripFgColor(input)).toBe(input)
  })

  test("preserves italic", () => {
    const input = "\x1b[3mitalic\x1b[23m"
    expect(stripFgColor(input)).toBe(input)
  })

  test("strips 256-color fg", () => {
    const input = "\x1b[38;5;196mred256\x1b[0m"
    const result = stripFgColor(input)
    expect(result).not.toContain("38;5;196")
  })

  test("strips truecolor fg", () => {
    const input = "\x1b[38;2;255;0;0mtruered\x1b[0m"
    const result = stripFgColor(input)
    expect(result).not.toContain("38;2;255;0;0")
  })

  test("strips dim", () => {
    const input = "\x1b[2mdim\x1b[22m"
    const result = stripFgColor(input)
    expect(result).not.toContain("\x1b[2m")
  })

  test("preserves strikethrough", () => {
    const input = "\x1b[9mstrike\x1b[29m"
    expect(stripFgColor(input)).toBe(input)
  })

  test("plain text passes through unchanged", () => {
    expect(stripFgColor("hello")).toBe("hello")
  })
})
