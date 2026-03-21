/**
 * Tests for km-task-mark micromark tokenizer extension.
 *
 * Verifies that all km task marks (space, x, X, /, -, !) are correctly
 * parsed into mdast listItem nodes with `checked` and `data.taskMark`.
 */

/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- Test file accesses untyped AST nodes from markdown parser */

import { describe, expect, test } from "vitest"
import { fromMarkdown } from "mdast-util-from-markdown"
import { gfmAutolinkLiteralFromMarkdown } from "mdast-util-gfm-autolink-literal"
import { gfmFootnoteFromMarkdown } from "mdast-util-gfm-footnote"
import { gfmStrikethroughFromMarkdown } from "mdast-util-gfm-strikethrough"
import { gfmTableFromMarkdown } from "mdast-util-gfm-table"
import { gfmAutolinkLiteral } from "micromark-extension-gfm-autolink-literal"
import { gfmFootnote } from "micromark-extension-gfm-footnote"
import { gfmStrikethrough } from "micromark-extension-gfm-strikethrough"
import { gfmTable } from "micromark-extension-gfm-table"
import { combineExtensions } from "micromark-util-combine-extensions"
import { kmTaskMark, kmTaskMarkFromMarkdown } from "../../src/extensions/km-task-mark.ts"

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function parse(md: string) {
  return fromMarkdown(md, {
    extensions: [
      combineExtensions([gfmAutolinkLiteral(), gfmFootnote(), gfmStrikethrough(), gfmTable(), kmTaskMark()]),
    ],
    mdastExtensions: [
      gfmAutolinkLiteralFromMarkdown(),
      gfmFootnoteFromMarkdown(),
      gfmStrikethroughFromMarkdown(),
      gfmTableFromMarkdown(),
      kmTaskMarkFromMarkdown(),
    ],
  })
}

/** Extract the first listItem from a parsed tree */
function firstListItem(md: string): any {
  const tree = parse(md)
  const list = tree.children[0]!
  expect(list.type).toBe("list")
  return (list as any).children[0]
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("km-task-mark", () => {
  describe("standard GFM marks", () => {
    test("[ ] → unchecked (checked=false, taskMark=' ')", () => {
      const item = firstListItem("- [ ] My task")
      expect(item.checked).toBe(false)
      expect(item.data.taskMark).toBe(" ")
    })

    test("[x] → checked (checked=true, taskMark='x')", () => {
      const item = firstListItem("- [x] Done task")
      expect(item.checked).toBe(true)
      expect(item.data.taskMark).toBe("x")
    })

    test("[X] → checked (checked=true, taskMark='X')", () => {
      const item = firstListItem("- [X] Done task uppercase")
      expect(item.checked).toBe(true)
      expect(item.data.taskMark).toBe("X")
    })
  })

  describe("km custom marks", () => {
    test("[/] → wip (checked=null, taskMark='/')", () => {
      const item = firstListItem("- [/] In progress task")
      expect(item.checked).toBe(null)
      expect(item.data.taskMark).toBe("/")
    })

    test("[-] → dropped (checked=null, taskMark='-')", () => {
      const item = firstListItem("- [-] Dropped task")
      expect(item.checked).toBe(null)
      expect(item.data.taskMark).toBe("-")
    })

    test("[!] → blocked (checked=null, taskMark='!')", () => {
      const item = firstListItem("- [!] Blocked task")
      expect(item.checked).toBe(null)
      expect(item.data.taskMark).toBe("!")
    })
  })

  describe("non-marks", () => {
    test("[a] is NOT parsed as a task", () => {
      const item = firstListItem("- [a] Not a task")
      expect(item.checked).toBeNull()
      expect(item.data?.taskMark).toBeUndefined()
    })

    test("[?] is NOT parsed as a task", () => {
      const item = firstListItem("- [?] Not a task")
      expect(item.checked).toBeNull()
      expect(item.data?.taskMark).toBeUndefined()
    })

    test("[1] is NOT parsed as a task", () => {
      const item = firstListItem("- [1] Not a task")
      expect(item.checked).toBeNull()
      expect(item.data?.taskMark).toBeUndefined()
    })
  })

  describe("position constraints", () => {
    test("only first-content-of-list-item gets parsed", () => {
      // [x] appearing mid-paragraph should NOT be treated as a task mark
      const tree = parse("- Hello [x] world")
      const list = tree.children[0] as any
      const item = list.children[0]
      expect(item.checked).toBeNull()
      expect(item.data?.taskMark).toBeUndefined()
    })

    test("second paragraph [x] is not parsed as task", () => {
      // A list item with two paragraphs — only the first would get the mark
      const md = "- First paragraph\n\n  [x] Second paragraph"
      const tree = parse(md)
      const list = tree.children[0] as any
      const item = list.children[0]
      // The first paragraph has no mark, so the item is not a task
      expect(item.checked).toBeNull()
    })
  })

  describe("nested lists with different marks", () => {
    test("parent and child can have different marks", () => {
      const md = "- [x] Parent done\n  - [/] Child in progress\n  - [!] Child blocked"
      const tree = parse(md)
      const outerList = tree.children[0] as any
      const parentItem = outerList.children[0]
      expect(parentItem.checked).toBe(true)
      expect(parentItem.data.taskMark).toBe("x")

      // Nested list is a child of the parent list item
      const innerList = parentItem.children.find((c: any) => c.type === "list")
      expect(innerList).toBeDefined()

      const child1 = innerList.children[0]
      expect(child1.checked).toBe(null)
      expect(child1.data.taskMark).toBe("/")

      const child2 = innerList.children[1]
      expect(child2.checked).toBe(null)
      expect(child2.data.taskMark).toBe("!")
    })
  })

  describe("text content", () => {
    test("leading whitespace after mark is stripped", () => {
      const item = firstListItem("- [x] Task text")
      // The first paragraph's text should be "Task text" (space after ] stripped)
      const paragraph = item.children.find((c: any) => c.type === "paragraph")
      expect(paragraph).toBeDefined()
      const text = paragraph.children[0]
      expect(text.type).toBe("text")
      expect(text.value).toBe("Task text")
    })

    test("custom mark also strips leading whitespace", () => {
      const item = firstListItem("- [/] WIP stuff")
      const paragraph = item.children.find((c: any) => c.type === "paragraph")
      expect(paragraph).toBeDefined()
      const text = paragraph.children[0]
      expect(text.value).toBe("WIP stuff")
    })

    test("unchecked mark strips leading whitespace", () => {
      const item = firstListItem("- [ ] Todo item")
      const paragraph = item.children.find((c: any) => c.type === "paragraph")
      expect(paragraph).toBeDefined()
      const text = paragraph.children[0]
      expect(text.value).toBe("Todo item")
    })
  })

  describe("list marker variants", () => {
    test("works with * list marker", () => {
      const item = firstListItem("* [/] Asterisk list")
      expect(item.checked).toBe(null)
      expect(item.data.taskMark).toBe("/")
    })

    test("works with + list marker", () => {
      const item = firstListItem("+ [-] Plus list")
      expect(item.checked).toBe(null)
      expect(item.data.taskMark).toBe("-")
    })

    test("works with ordered list", () => {
      const item = firstListItem("1. [!] Ordered blocked")
      expect(item.checked).toBe(null)
      expect(item.data.taskMark).toBe("!")
    })
  })

  describe("all marks in one list", () => {
    test("mixed marks in a single list", () => {
      const md = [
        "- [ ] Unchecked",
        "- [x] Checked",
        "- [X] Checked upper",
        "- [/] WIP",
        "- [-] Dropped",
        "- [!] Blocked",
      ].join("\n")
      const tree = parse(md)
      const list = tree.children[0] as any
      const items = list.children

      expect(items).toHaveLength(6)
      expect(items[0].checked).toBe(false)
      expect(items[0].data.taskMark).toBe(" ")
      expect(items[1].checked).toBe(true)
      expect(items[1].data.taskMark).toBe("x")
      expect(items[2].checked).toBe(true)
      expect(items[2].data.taskMark).toBe("X")
      expect(items[3].checked).toBe(null)
      expect(items[3].data.taskMark).toBe("/")
      expect(items[4].checked).toBe(null)
      expect(items[4].data.taskMark).toBe("-")
      expect(items[5].checked).toBe(null)
      expect(items[5].data.taskMark).toBe("!")
    })
  })
})
