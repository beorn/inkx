/**
 * Tests for rich text rendering (Layer 1)
 */

import { describe, it, expect } from "vitest"
import { createTerm } from "inkx"
import { displayLength, stripAnsi, renderRich, renderPlain } from "../../src/text/rich.ts"

// Create a term with forced color for testing
const term = createTerm({ color: "truecolor" })
const style = term

// ============================================================================
// ANSI Utilities
// ============================================================================

describe("stripAnsi", () => {
  it("strips simple ANSI escape codes", () => {
    const text = "\x1b[31mred\x1b[0m"
    expect(stripAnsi(text)).toBe("red")
  })

  it("strips complex ANSI escape codes with multiple params", () => {
    const text = "\x1b[1;31;4mstyle\x1b[0m"
    expect(stripAnsi(text)).toBe("style")
  })
})

describe("displayLength", () => {
  it("returns length of plain text", () => {
    expect(displayLength("hello")).toBe(5)
  })

  it("excludes ANSI escape codes from count", () => {
    const styled = style.red("hello")
    expect(displayLength(styled)).toBe(5)
  })

  it("handles multiple ANSI codes", () => {
    const styled = style.red("a") + style.blue("b") + style.green("c")
    expect(displayLength(styled)).toBe(3)
  })

  it("handles nested styles", () => {
    const styled = style.bold.red("bold red")
    expect(displayLength(styled)).toBe(8)
  })

  it("handles empty string", () => {
    expect(displayLength("")).toBe(0)
  })

  it("handles string with only ANSI codes", () => {
    expect(displayLength("\x1b[31m\x1b[0m")).toBe(0)
  })
})

describe("stripAnsi", () => {
  it("removes all ANSI escape codes", () => {
    const styled = style.red("hello")
    expect(stripAnsi(styled)).toBe("hello")
  })

  it("preserves plain text", () => {
    expect(stripAnsi("hello world")).toBe("hello world")
  })

  it("handles multiple styles", () => {
    const styled = style.red("a") + " " + style.blue("b")
    expect(stripAnsi(styled)).toBe("a b")
  })

  it("handles empty string", () => {
    expect(stripAnsi("")).toBe("")
  })
})

// ============================================================================
// Rich Text Rendering
// ============================================================================

describe("renderRich", () => {
  describe("inline property highlighting", () => {
    it("styles bracketed inline fields instead of stripping", () => {
      const result = renderRich("Task [due:: 2024-01-15]")
      // Should contain the key and value (not stripped)
      expect(result).toContain("due")
      expect(result).toContain("::")
      expect(result).toContain("2024-01-15")
      // Should have ANSI styling applied
      expect(result).not.toBe("Task due:: 2024-01-15")
    })

    it("styles bare inline properties", () => {
      const result = renderRich("Task blocked-by:: [[other]] rating:: 5")
      expect(result).toContain("blocked-by")
      expect(result).toContain("rating")
      // Should have ANSI styling applied
      expect(result).not.toBe("Task blocked-by:: [[other]] rating:: 5")
    })

    it("applies styling to property keys and values", () => {
      const plain = renderRich("plain text")
      const withProp = renderRich("plain text due:: 2024-01-15")
      // With property should be longer (has ANSI codes)
      expect(withProp.length).toBeGreaterThan(plain.length)
    })
  })

  describe("wiki link styling", () => {
    it("renders wiki links - brackets stripped, green + underlined", () => {
      const result = renderRich("See [[note]]")
      // Wiki link brackets should be removed
      expect(stripAnsi(result)).toBe("See note")
      // Should not contain the raw wiki link syntax
      expect(result).not.toContain("[[")
      expect(result).not.toContain("]]")
      // Internal links are green (32) + underlined
      expect(result).toContain("\x1b[32m")
      expect(result).toContain("\x1b[4m")
    })

    it("uses alias when present", () => {
      const result = renderRich("See [[path/to/note|My Note]]")
      expect(stripAnsi(result)).toBe("See My Note")
    })

    it("handles multiple wiki links", () => {
      const result = renderRich("Link to [[one]] and [[two]]")
      expect(stripAnsi(result)).toBe("Link to one and two")
    })

    it("handles wiki links with paths", () => {
      const result = renderRich("See [[folder/subfolder/note]]")
      expect(stripAnsi(result)).toBe("See folder/subfolder/note")
    })

    it("strips embed syntax ![[target]] like a wiki link", () => {
      const result = renderRich("![[2026 @Kaiser Guide.pdf]]")
      expect(stripAnsi(result)).not.toContain("!")
      expect(stripAnsi(result)).not.toContain("[[")
      expect(stripAnsi(result)).not.toContain("]]")
    })

    it("strips embed syntax with alias ![[target|alias]]", () => {
      const result = renderRich("![[path/to/note|My Note]]")
      expect(stripAnsi(result)).toBe("My Note")
    })

    it("strips embed syntax mixed with text", () => {
      const result = renderRich("See ![[embedded]] here")
      expect(stripAnsi(result)).toBe("See embedded here")
      expect(stripAnsi(result)).not.toContain("!")
    })
  })

  describe("markdown link styling", () => {
    it("renders [text](url) links as cyan underlined text", () => {
      const result = renderRich("Click [Google](https://google.com)")
      expect(stripAnsi(result)).toBe("Click Google")
      // Should not contain raw link syntax (brackets)
      expect(result).not.toContain("](")
      // Link text is underlined
      expect(result).toContain("\x1b[4m") // underline start
      // External links are cyan (36)
      expect(result).toContain("\x1b[36m")
    })

    it("handles links with complex URLs", () => {
      const result = renderRich("See [docs](https://example.com/path?query=1)")
      expect(stripAnsi(result)).toBe("See docs")
    })

    it("handles multiple markdown links", () => {
      const result = renderRich("[one](url1) and [two](url2)")
      expect(stripAnsi(result)).toBe("one and two")
    })

    it("handles links with title attribute", () => {
      // [text](url "title") - common markdown extension
      const result = renderRich('Check [Example](https://example.com "Example Site")')
      // The title is part of the URL portion, so it gets stripped
      expect(stripAnsi(result)).toBe("Check Example")
    })
  })

  describe("link type differentiation", () => {
    it("uses different colors for internal vs external links", () => {
      const wikiResult = renderRich("See [[internal note]]")
      const mdResult = renderRich("See [external](https://example.com)")

      // Internal wiki links use green (32)
      expect(wikiResult).toContain("\x1b[32m")
      expect(wikiResult).not.toContain("\x1b[36m")

      // External markdown links use cyan (36)
      expect(mdResult).toContain("\x1b[36m")
      expect(mdResult).not.toContain("\x1b[32m")
    })

    it("distinguishes link types in mixed content", () => {
      const result = renderRich("See [[internal]] and [external](https://example.com)")
      const plain = stripAnsi(result)
      expect(plain).toBe("See internal and external")

      // Both colors present
      expect(result).toContain("\x1b[32m") // green for wiki
      expect(result).toContain("\x1b[36m") // cyan for markdown
    })
  })

  describe("markdown formatting", () => {
    const formats: Array<[string, string, string]> = [
      ["**bold**", "This is **bold** text", "This is bold text"],
      ["*italic*", "This is *italic* text", "This is italic text"],
      ["_italic_", "This is _italic_ text", "This is italic text"],
      ["`code`", "Use `code` here", "Use code here"],
      ["~~strikethrough~~", "This is ~~deleted~~ text", "This is deleted text"],
      ["mixed", "**bold** and *italic* and `code`", "bold and italic and code"],
      ["mixed bold+italic", "**bold** text and _italic_ emphasis", "bold text and italic emphasis"],
      ["**bold only**", "**bold text**", "bold text"],
    ]

    for (const [label, input, expected] of formats) {
      it(`renders ${label} — markers stripped`, () => {
        expect(stripAnsi(renderRich(input))).toBe(expected)
      })
    }
  })

  describe("edge cases", () => {
    it("handles empty string", () => {
      expect(renderRich("")).toBe("")
    })

    it("handles text with no formatting", () => {
      expect(renderRich("plain text")).toBe("plain text")
    })

    it("cleans up multiple spaces", () => {
      const result = renderRich("word   word")
      expect(stripAnsi(result)).toBe("word word")
    })

    it("trims whitespace", () => {
      const result = renderRich("  text  ")
      expect(result).toBe("text")
    })
  })
})

// ============================================================================
// Plain Text Rendering
// ============================================================================

describe("renderPlain", () => {
  const cases: Array<[string, string, string]> = [
    ["wiki link brackets", "See [[note]]", "See note"],
    ["wiki link alias", "See [[path|alias]]", "See alias"],
    ["inline fields", "Task [due:: 2024-01-15]", "Task"],
    ["plain text", "hello world", "hello world"],
    ["empty string", "", ""],
    ["whitespace cleanup", "word   [field:: value]   word", "word word"],
    ["markdown links", "Click [Google](https://google.com)", "Click Google"],
    ["multiple markdown links", "[one](url1) and [two](url2)", "one and two"],
    ["embed syntax", "![[Some File.pdf]]", "Some File.pdf"],
    ["embed with alias", "![[path|My Alias]]", "My Alias"],
  ]

  for (const [label, input, expected] of cases) {
    it(`${label}: '${input}' → '${expected}'`, () => {
      expect(renderPlain(input)).toBe(expected)
    })
  }

  it("does not add ANSI codes", () => {
    const result = renderPlain("**bold** and [[link]]")
    expect(result).toBe(stripAnsi(result))
  })
})
