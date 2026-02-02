/**
 * Tests for rich text rendering (Layer 1)
 */

import { describe, it, expect } from "vitest"
import { createTerm } from "inkx"
import {
  displayLength,
  stripAnsi,
  renderRich,
  renderPlain,
} from "../../src/text/rich.ts"

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
  describe("inline field stripping", () => {
    it("strips simple inline fields", () => {
      const result = renderRich("Task [due:: 2024-01-15]")
      expect(stripAnsi(result)).toBe("Task")
    })

    it("strips multiple inline fields", () => {
      const result = renderRich("Task [due:: 2024-01-15] [priority:: 1]")
      expect(stripAnsi(result)).toBe("Task")
    })

    it("preserves text around inline fields", () => {
      const result = renderRich("Start [field:: value] end")
      expect(stripAnsi(result)).toBe("Start end")
    })

    it("handles inline fields with complex values", () => {
      const result = renderRich("Task [scheduled:: 2024-01-15 10:00]")
      expect(stripAnsi(result)).toBe("Task")
    })
  })

  describe("wiki link styling", () => {
    it("renders wiki links - brackets stripped", () => {
      const result = renderRich("See [[note]]")
      // Wiki link brackets should be removed
      expect(stripAnsi(result)).toBe("See note")
      // Should not contain the raw wiki link syntax
      expect(result).not.toContain("[[")
      expect(result).not.toContain("]]")
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
  })

  describe("markdown link styling", () => {
    it("renders [text](url) links as underlined text", () => {
      const result = renderRich("Click [Google](https://google.com)")
      expect(stripAnsi(result)).toBe("Click Google")
      // Should not contain raw link syntax (brackets)
      expect(result).not.toContain("](")
      // Link text is underlined (OSC 8 hyperlinks disabled due to wrap-ansi incompatibility)
      expect(result).toContain("\x1b[4m") // underline start
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
      const result = renderRich(
        'Check [Example](https://example.com "Example Site")',
      )
      // The title is part of the URL portion, so it gets stripped
      expect(stripAnsi(result)).toBe("Check Example")
    })
  })

  describe("markdown formatting", () => {
    it("renders **bold** text - markers stripped", () => {
      const result = renderRich("This is **bold** text")
      expect(stripAnsi(result)).toBe("This is bold text")
      // Should not contain raw bold markers
      expect(result).not.toContain("**")
    })

    it("renders *italic* text - markers stripped", () => {
      const result = renderRich("This is *italic* text")
      expect(stripAnsi(result)).toBe("This is italic text")
      // Should not contain raw italic marker (but could contain ** from other tests)
      expect(stripAnsi(result)).not.toContain("*")
    })

    it("renders _italic_ text with underscores - markers stripped", () => {
      const result = renderRich("This is _italic_ text")
      expect(stripAnsi(result)).toBe("This is italic text")
      // Should not contain raw underscore markers
      expect(stripAnsi(result)).not.toContain("_")
    })

    it("handles mixed bold and underscore italic", () => {
      const result = renderRich("**bold** text and _italic_ emphasis")
      expect(stripAnsi(result)).toBe("bold text and italic emphasis")
    })

    it("renders `code` text - markers stripped", () => {
      const result = renderRich("Use `code` here")
      expect(stripAnsi(result)).toBe("Use code here")
      // Should not contain raw backticks
      expect(result).not.toContain("`")
    })

    it("renders ~~strikethrough~~ text", () => {
      const result = renderRich("This is ~~deleted~~ text")
      expect(stripAnsi(result)).toBe("This is deleted text")
    })

    it("handles mixed formatting", () => {
      const result = renderRich("**bold** and *italic* and `code`")
      expect(stripAnsi(result)).toBe("bold and italic and code")
    })

    it("does not confuse * in ** with italic", () => {
      const result = renderRich("**bold text**")
      expect(stripAnsi(result)).toBe("bold text")
      // Should only have bold, not italic applied to the asterisks
    })
  })

  describe("edge cases", () => {
    it("handles empty string", () => {
      expect(renderRich("")).toBe("")
    })

    it("handles text with no formatting", () => {
      expect(renderRich("plain text")).toBe("plain text")
    })

    it("cleans up multiple spaces", () => {
      const result = renderRich("word   [field:: value]   word")
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
  it("strips wiki link brackets but keeps text", () => {
    expect(renderPlain("See [[note]]")).toBe("See note")
  })

  it("uses alias from wiki links", () => {
    expect(renderPlain("See [[path|alias]]")).toBe("See alias")
  })

  it("strips inline fields", () => {
    expect(renderPlain("Task [due:: 2024-01-15]")).toBe("Task")
  })

  it("preserves plain text", () => {
    expect(renderPlain("hello world")).toBe("hello world")
  })

  it("handles empty string", () => {
    expect(renderPlain("")).toBe("")
  })

  it("cleans up whitespace", () => {
    expect(renderPlain("word   [field:: value]   word")).toBe("word word")
  })

  it("does not add ANSI codes", () => {
    const result = renderPlain("**bold** and [[link]]")
    // Should not contain any ANSI escape codes
    expect(result).toBe(stripAnsi(result))
  })

  it("strips markdown links [text](url) → text", () => {
    expect(renderPlain("Click [Google](https://google.com)")).toBe(
      "Click Google",
    )
  })

  it("handles multiple markdown links", () => {
    expect(renderPlain("[one](url1) and [two](url2)")).toBe("one and two")
  })
})
