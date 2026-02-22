import { describe, expect, test } from "vitest"
import { fromMarkdown } from "mdast-util-from-markdown"
import { combineExtensions } from "micromark-util-combine-extensions"
import { gfmAutolinkLiteral } from "micromark-extension-gfm-autolink-literal"
import { gfmFootnote } from "micromark-extension-gfm-footnote"
import { gfmStrikethrough } from "micromark-extension-gfm-strikethrough"
import { gfmTable } from "micromark-extension-gfm-table"
import { gfmAutolinkLiteralFromMarkdown } from "mdast-util-gfm-autolink-literal"
import { gfmFootnoteFromMarkdown } from "mdast-util-gfm-footnote"
import { gfmStrikethroughFromMarkdown } from "mdast-util-gfm-strikethrough"
import { gfmTableFromMarkdown } from "mdast-util-gfm-table"
import { kmBlockIdTransform } from "../../src/extensions/km-block-id.ts"

function parse(md: string) {
  const tree = fromMarkdown(md, {
    extensions: [combineExtensions([gfmAutolinkLiteral(), gfmFootnote(), gfmStrikethrough(), gfmTable()])],
    mdastExtensions: [
      gfmAutolinkLiteralFromMarkdown(),
      gfmFootnoteFromMarkdown(),
      gfmStrikethroughFromMarkdown(),
      gfmTableFromMarkdown(),
    ],
  })
  kmBlockIdTransform(tree)
  return tree
}

describe("kmBlockIdTransform", () => {
  test("paragraph with block ID", () => {
    const tree = parse("Hello world ^abc123")
    const para = tree.children[0]!
    expect(para.type).toBe("paragraph")
    expect(para.data?.blockId).toBe("abc123")
    const text = (para as any).children[0]
    expect(text.value).toBe("Hello world")
  })

  test("heading with block ID", () => {
    const tree = parse("# Title ^def456")
    const heading = tree.children[0]!
    expect(heading.type).toBe("heading")
    expect(heading.data?.blockId).toBe("def456")
    const text = (heading as any).children[0]
    expect(text.value).toBe("Title")
  })

  test("list item with block ID", () => {
    const tree = parse("- Task ^ghi789")
    const list = tree.children[0]! as any
    expect(list.type).toBe("list")
    const listItem = list.children[0]!
    expect(listItem.type).toBe("listItem")
    expect(listItem.data?.blockId).toBe("ghi789")
    // Also hoisted to the paragraph inside the list item
    const para = listItem.children[0]!
    expect(para.type).toBe("paragraph")
    expect(para.data?.blockId).toBe("ghi789")
    const text = para.children[0]
    expect(text.value).toBe("Task")
  })

  test("no block ID when none present", () => {
    const tree = parse("Hello world")
    const para = tree.children[0]!
    expect(para.type).toBe("paragraph")
    expect(para.data?.blockId).toBeUndefined()
    const text = (para as any).children[0]
    expect(text.value).toBe("Hello world")
  })

  test("not a block ID when no space before ^ (math expression)", () => {
    const tree = parse("x^2")
    const para = tree.children[0]!
    expect(para.type).toBe("paragraph")
    expect(para.data?.blockId).toBeUndefined()
    const text = (para as any).children[0]
    expect(text.value).toBe("x^2")
  })

  test("block ID with hyphens and underscores", () => {
    const tree = parse("Text ^my-block_id")
    const para = tree.children[0]!
    expect(para.data?.blockId).toBe("my-block_id")
    const text = (para as any).children[0]
    expect(text.value).toBe("Text")
  })

  test("multiple paragraphs, only last has block ID", () => {
    const tree = parse("First paragraph\n\nSecond paragraph ^blockA")
    expect(tree.children).toHaveLength(2)

    const first = tree.children[0]!
    expect(first.type).toBe("paragraph")
    expect(first.data?.blockId).toBeUndefined()
    expect((first as any).children[0].value).toBe("First paragraph")

    const second = tree.children[1]!
    expect(second.type).toBe("paragraph")
    expect(second.data?.blockId).toBe("blockA")
    expect((second as any).children[0].value).toBe("Second paragraph")
  })

  test("block ID only at end of text, not in middle", () => {
    const tree = parse("Hello ^mid world")
    const para = tree.children[0]!
    expect(para.data?.blockId).toBeUndefined()
    const text = (para as any).children[0]
    expect(text.value).toBe("Hello ^mid world")
  })

  test("list item block ID hoists to both paragraph.data and listItem.data", () => {
    const tree = parse("- Item ^lid1")
    const list = tree.children[0]! as any
    const listItem = list.children[0]!
    const para = listItem.children[0]!

    // Both listItem and its inner paragraph carry the blockId
    expect(listItem.data?.blockId).toBe("lid1")
    expect(para.data?.blockId).toBe("lid1")
  })
})
