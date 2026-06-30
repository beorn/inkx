import { describe, expect, it } from "vitest"
import { formatTextLines } from "../src/pipeline/render-text"
import { stripAnsi } from "../src/unicode"

describe("formatTextLines", () => {
  it("hard-wraps ANSI-styled text without exposing partial SGR parameters", () => {
    const styled =
      "\x1b[38;2;225;228;232m" +
      'cd "$(git rev-parse --show-toplevel)" && rg --glob "ag/packages/code/**/*.{ts,tsx}" --glob "vendor/silvery/packages/ag-react/src/**/*.tsx"' +
      "\x1b[0m"

    const lines = formatTextLines(styled, 42, "hard")
    const visible = lines.map((line) => stripAnsi(line)).join("\n")

    expect(visible).toContain("--glob")
    expect(visible).not.toMatch(/\b\d{1,3};\d{1,3};\d{1,3}m/)
    expect(visible).not.toContain("[38;2")
  })
})
