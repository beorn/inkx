/**
 * Slate Schema Tests
 */

import { describe, test, expect } from "vitest"
import {
  createParagraph,
  createEmptyDocument,
  descendantsToText,
  textToDescendants,
} from "../../src/editor/schema.ts"

describe("createParagraph", () => {
  test("creates paragraph with text", () => {
    const para = createParagraph("Hello")
    expect(para.type).toBe("paragraph")
    expect(para.children).toHaveLength(1)
    expect(para.children[0]!.text).toBe("Hello")
  })

  test("creates paragraph with empty text", () => {
    const para = createParagraph("")
    expect(para.children[0]!.text).toBe("")
  })
})

describe("createEmptyDocument", () => {
  test("creates document with one empty paragraph", () => {
    const doc = createEmptyDocument()
    expect(doc).toHaveLength(1)
    expect((doc[0] as any).type).toBe("paragraph")
    expect((doc[0] as any).children[0].text).toBe("")
  })
})

describe("descendantsToText", () => {
  test("single paragraph", () => {
    const text = descendantsToText([createParagraph("Hello world")])
    expect(text).toBe("Hello world")
  })

  test("multiple paragraphs joined with newlines", () => {
    const text = descendantsToText([
      createParagraph("First line"),
      createParagraph("Second line"),
      createParagraph("Third line"),
    ])
    expect(text).toBe("First line\nSecond line\nThird line")
  })

  test("empty paragraph", () => {
    const text = descendantsToText([createParagraph("")])
    expect(text).toBe("")
  })

  test("paragraph with multiple text nodes", () => {
    const para = {
      type: "paragraph" as const,
      children: [
        { text: "Hello " },
        { text: "world", bold: true as const },
      ],
    }
    const text = descendantsToText([para])
    expect(text).toBe("Hello world")
  })
})

describe("textToDescendants", () => {
  test("single line", () => {
    const desc = textToDescendants("Hello")
    expect(desc).toHaveLength(1)
    expect((desc[0] as any).type).toBe("paragraph")
    expect((desc[0] as any).children[0].text).toBe("Hello")
  })

  test("multiple lines become paragraphs", () => {
    const desc = textToDescendants("First\nSecond\nThird")
    expect(desc).toHaveLength(3)
    expect((desc[0] as any).children[0].text).toBe("First")
    expect((desc[1] as any).children[0].text).toBe("Second")
    expect((desc[2] as any).children[0].text).toBe("Third")
  })

  test("empty string returns empty document", () => {
    const desc = textToDescendants("")
    expect(desc).toHaveLength(1)
    expect((desc[0] as any).children[0].text).toBe("")
  })

  test("round-trip preserves text", () => {
    const original = "Line one\nLine two\nLine three"
    const descendants = textToDescendants(original)
    const result = descendantsToText(descendants)
    expect(result).toBe(original)
  })
})
