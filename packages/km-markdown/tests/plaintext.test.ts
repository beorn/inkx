/**
 * Plain Text File Parsing Tests
 *
 * Tests for parsing .txt files into km nodes and round-trip serialization.
 */

import { describe, test, expect } from "vitest"

import { parsePlainTextToNodes } from "../src/ast2nodes.ts"
import { nodesToMarkdown } from "../src/nodes2md.ts"

describe("parsePlainTextToNodes", () => {
  test("creates a single file node with raw content", () => {
    const content = "Hello, this is plain text."
    const result = parsePlainTextToNodes(content, "notes.txt")

    expect(result.nodes).toHaveLength(1)
    expect(result.wikilinks).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)

    const fileNode = result.nodes[0]!
    expect(fileNode.type).toBe("h")
    expect(fileNode.item).toEqual({})
    expect(fileNode.fstype).toBe("txtfile")
    expect(fileNode.content).toBe("Hello, this is plain text.")
    expect(fileNode.name).toBe("notes")
    expect(fileNode.title).toBe("notes")
    expect(fileNode.parent_id).toBeNull()
  })

  test("preserves whitespace and newlines exactly", () => {
    const content = "Line 1\n  indented\n\n\nmultiple blanks\n\ttabbed"
    const result = parsePlainTextToNodes(content, "test.txt")

    expect(result.nodes[0]!.content).toBe(content)
  })

  test("preserves empty content", () => {
    const result = parsePlainTextToNodes("", "empty.txt")

    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0]!.content).toBe("")
  })

  test("handles filename without extension", () => {
    const result = parsePlainTextToNodes("content", "noext")

    expect(result.nodes[0]!.name).toBe("noext")
  })

  test("strips .txt extension from name", () => {
    const result = parsePlainTextToNodes("content", "my-notes.txt")

    expect(result.nodes[0]!.name).toBe("my-notes")
  })

  test("handles path with directories", () => {
    const result = parsePlainTextToNodes("content", "docs/notes/todo.txt")

    expect(result.nodes[0]!.fs_path).toBe("docs/notes/todo.txt")
    expect(result.nodes[0]!.name).toBe("todo")
  })

  test("preserves fs metadata", () => {
    const result = parsePlainTextToNodes("content", "test.txt", 12345, 1700000000000)

    const node = result.nodes[0]!
    expect(node.fs_ino).toBe(12345)
    expect(node.fs_mtime).toBe(1700000000000)
  })

  test("does not parse markdown syntax", () => {
    const content = "# Not a heading\n- [ ] Not a task\n**not bold**"
    const result = parsePlainTextToNodes(content, "test.txt")

    // Should be a single file node, no section or task nodes
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0]!.content).toBe(content)
  })

  test("preserves special characters", () => {
    const content = "Special chars: @mention #tag +project [[wikilink]] ![[embed]]"
    const result = parsePlainTextToNodes(content, "test.txt")

    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0]!.content).toBe(content)
    // No wikilinks should be extracted
    expect(result.wikilinks).toHaveLength(0)
  })
})

describe("Plain text round-trip", () => {
  test("parse then serialize preserves content exactly", () => {
    const content = "Hello world\nSecond line\n\nThird paragraph"
    const result = parsePlainTextToNodes(content, "test.txt")
    const serialized = nodesToMarkdown(result.nodes)

    expect(serialized).toBe(content)
  })

  test("round-trip preserves empty file", () => {
    const content = ""
    const result = parsePlainTextToNodes(content, "test.txt")
    const serialized = nodesToMarkdown(result.nodes)

    expect(serialized).toBe(content)
  })

  test("round-trip preserves trailing newline", () => {
    const content = "Line 1\nLine 2\n"
    const result = parsePlainTextToNodes(content, "test.txt")
    const serialized = nodesToMarkdown(result.nodes)

    expect(serialized).toBe(content)
  })

  test("round-trip preserves markdown-like content as raw text", () => {
    const content = "# Heading\n- [x] Task\n```code```\n> quote"
    const result = parsePlainTextToNodes(content, "test.txt")
    const serialized = nodesToMarkdown(result.nodes)

    expect(serialized).toBe(content)
  })
})
