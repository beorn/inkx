/**
 * Block ID Tests
 *
 * Tests for the ^block-id feature:
 * - Parser: extracting block IDs from markdown content
 * - Serializer: appending block IDs to output
 * - On-demand generation: assignBlockId callback for embeds
 * - Round-trip: block IDs survive parse -> serialize cycles
 * - Embed references: block IDs used in ![[file#^id]] syntax
 */

import { describe, test, expect } from "vitest"
import type { KNode } from "@km/core"
import { parseMarkdownToNodes } from "../src/ast2nodes.ts"
import { nodesToMarkdown } from "../src/nodes2md.ts"
import { roundtrip, parse, makeTestNode, normalizeMarkdown } from "./helpers/test-utils.ts"

// ---------------------------------------------------------------------------
// 1. Parser: ^block-id suffix extraction
// ---------------------------------------------------------------------------

describe("Parser: block_id extraction", () => {
  test("task with block_id", () => {
    const nodes = parse(`- [ ] Buy groceries ^k7m2`)
    const task = nodes.find((n) => n.type === "p" && n.item != null && n.item?.task?.marker)

    expect(task).toBeDefined()
    expect(task!.block_id).toBe("k7m2")
    expect(task!.content).toBe("Buy groceries")
  })

  test("task with metadata and block_id", () => {
    const nodes = parse(`- [ ] Buy groceries 📅 2025-03-15 ^k7m2`)
    const task = nodes.find((n) => n.type === "p" && n.item != null && n.item?.task?.marker)

    expect(task).toBeDefined()
    expect(task!.block_id).toBe("k7m2")
    // Content should be clean (metadata stripped to node fields), and no ^id
    expect(task!.content).toBe("Buy groceries")
    expect(task!.due_at).toBe("2025-03-15")
    expect(task!.content).not.toContain("^k7m2")
  })

  test("unordered list item with block_id", () => {
    const nodes = parse(`- Some item ^abc1`)
    const ul = nodes.find((n) => n.type === "p" && n.item != null && !n.item?.task?.marker)

    expect(ul).toBeDefined()
    expect(ul!.block_id).toBe("abc1")
    expect(ul!.content).toBe("Some item")
  })

  test("paragraph with block_id", () => {
    const nodes = parse(`Some paragraph text ^xyz9`)
    const para = nodes.find((n) => n.type === "p")

    expect(para).toBeDefined()
    expect(para!.block_id).toBe("xyz9")
    expect(para!.content).toBe("Some paragraph text")
  })

  test("heading/section with block_id", () => {
    const nodes = parse(`# Doc\n\n## My Section ^def3\n\nContent here.`)
    const section = nodes.find((n) => n.type === "h" && n.item != null && n.fstype === "mdsection")

    expect(section).toBeDefined()
    expect(section!.block_id).toBe("def3")
    // The content field preserves the original heading text (including ^block-id for round-trip)
    // but the title should be clean
    expect(section!.title).toBe("My Section")
  })

  test("no block_id when ^ has no space before it (math expression)", () => {
    const nodes = parse(`- [ ] Math: x^2 + y^2`)
    const task = nodes.find((n) => n.type === "p" && n.item != null && n.item?.task?.marker)

    expect(task).toBeDefined()
    expect(task!.block_id).toBeUndefined()
    expect(task!.content).toContain("x^2")
  })

  test("no block_id when ^word is not at end of line", () => {
    const nodes = parse(`- [ ] Use ^caret in text then more words`)
    const task = nodes.find((n) => n.type === "p" && n.item != null && n.item?.task?.marker)

    expect(task).toBeDefined()
    expect(task!.block_id).toBeUndefined()
    expect(task!.content).toContain("^caret")
  })

  test("no block_id when none present", () => {
    const nodes = parse(`- [ ] Just a task`)
    const task = nodes.find((n) => n.type === "p" && n.item != null && n.item?.task?.marker)

    expect(task).toBeDefined()
    expect(task!.block_id).toBeUndefined()
    expect(task!.content).toBe("Just a task")
  })

  test("block_id with hyphens and underscores", () => {
    const nodes = parse(`- [ ] Task ^my-block_id`)
    const task = nodes.find((n) => n.type === "p" && n.item != null && n.item?.task?.marker)

    expect(task).toBeDefined()
    expect(task!.block_id).toBe("my-block_id")
    expect(task!.content).toBe("Task")
  })

  test("completed task with block_id", () => {
    const nodes = parse(`- [x] Done task ^d0n3`)
    const task = nodes.find((n) => n.type === "p" && n.item != null && n.item?.task?.marker)

    expect(task).toBeDefined()
    expect(task!.block_id).toBe("d0n3")
    expect(task!.item?.task?.status).toBe("done")
    expect(task!.content).toBe("Done task")
  })

  test("ordered list item with block_id", () => {
    const nodes = parse(`1. First item ^ol01`)
    const ol = nodes.find((n) => n.type === "p" && n.item != null && n.item?.list === "1.")

    expect(ol).toBeDefined()
    expect(ol!.block_id).toBe("ol01")
    expect(ol!.content).toBe("First item")
  })
})

// ---------------------------------------------------------------------------
// 2. Serializer: ^block-id suffix output
// ---------------------------------------------------------------------------

describe("Serializer: block_id output", () => {
  test("task with block_id appends ^id to output", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "test.md",
      content: "Test",
    })
    const task = makeTestNode({
      id: "task-1",
      type: "p",
      item: { list: "-", task: { status: "todo", marker: "[ ]" } },
      parent_id: "file-1",
      parent_idx: 1,
      content: "Buy groceries",
      block_id: "k7m2",
    })

    const md = nodesToMarkdown([fileNode, task])
    expect(md).toContain("- [ ] Buy groceries ^k7m2")
  })

  test("ul with block_id appends ^id to output", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "test.md",
      content: "Test",
    })
    const ul = makeTestNode({
      id: "ul-1",
      type: "p",
      item: { list: "-" },
      parent_id: "file-1",
      parent_idx: 1,
      content: "Some item",
      block_id: "abc1",
    })

    const md = nodesToMarkdown([fileNode, ul])
    expect(md).toContain("- Some item ^abc1")
  })

  test("paragraph with block_id appends ^id to output", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "test.md",
      content: "Test",
    })
    const para = makeTestNode({
      id: "para-1",
      type: "p",
      parent_id: "file-1",
      parent_idx: 1,
      content: "Some paragraph text",
      block_id: "xyz9",
    })

    const md = nodesToMarkdown([fileNode, para])
    expect(md).toContain("Some paragraph text ^xyz9")
  })

  test("section/heading with block_id appends ^id to heading line", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "test.md",
      content: "Doc",
    })
    const section = makeTestNode({
      id: "sec-1",
      type: "h",
      item: {},
      fstype: "mdsection",
      parent_id: "file-1",
      parent_idx: 1,
      content: "My Section",
      title: "My Section",
      block_id: "def3",
    })

    const md = nodesToMarkdown([fileNode, section])
    expect(md).toContain("## My Section ^def3")
  })

  test("node without block_id has no ^ suffix", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "test.md",
      content: "Test",
    })
    const task = makeTestNode({
      id: "task-1",
      type: "p",
      item: { list: "-", task: { status: "todo", marker: "[ ]" } },
      parent_id: "file-1",
      parent_idx: 1,
      content: "Normal task",
    })

    const md = nodesToMarkdown([fileNode, task])
    expect(md).toContain("- [ ] Normal task")
    expect(md).not.toContain("^")
  })

  test("ol with block_id appends ^id to output", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "test.md",
      content: "Test",
    })
    const ol = makeTestNode({
      id: "ol-1",
      type: "p",
      item: { list: "1." },
      parent_id: "file-1",
      parent_idx: 1,
      content: "Numbered item",
      block_id: "n1m2",
    })

    const md = nodesToMarkdown([fileNode, ol])
    expect(md).toContain("1. Numbered item ^n1m2")
  })
})

// ---------------------------------------------------------------------------
// 3. On-demand block ID generation
// ---------------------------------------------------------------------------

describe("On-demand block ID generation", () => {
  test("assignBlockId callback is called for target without block_id", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "board.md",
      content: "Board",
    })
    const targetFileNode = makeTestNode({
      id: "target-file",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "inbox.md",
      content: "Inbox",
    })
    const targetTask = makeTestNode({
      id: "task-1",
      type: "p",
      parent_id: "target-file",
      content: "Buy groceries",
      item: { task: { status: "todo", marker: "[ ]" } },
    })
    const embedNode = makeTestNode({
      id: "embed-1",
      type: "p",
      parent_id: "file-1",
      parent_idx: 1,
      embed_of: "task-1",
      content: "Buy groceries",
    })

    const calls: Array<{ nodeId: string; blockId: string }> = []
    const assignBlockId = (nodeId: string, blockId: string) => {
      calls.push({ nodeId, blockId })
    }

    const md = nodesToMarkdown([fileNode, embedNode, targetFileNode, targetTask], undefined, assignBlockId)

    // Callback should have been called for the target task
    expect(calls).toHaveLength(1)
    expect(calls[0]!.nodeId).toBe("task-1")
    expect(calls[0]!.blockId).toMatch(/^[a-z0-9]+$/)

    // The generated ID should appear in the embed reference
    expect(md).toContain(`![[inbox#^${calls[0]!.blockId}]]`)
  })

  test("assignBlockId callback is NOT called when target has block_id", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "board.md",
      content: "Board",
    })
    const targetFileNode = makeTestNode({
      id: "target-file",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "inbox.md",
      content: "Inbox",
    })
    const targetTask = makeTestNode({
      id: "task-1",
      type: "p",
      parent_id: "target-file",
      content: "Buy groceries",
      item: { task: { status: "todo", marker: "[ ]" } },
      block_id: "existing1",
    })
    const embedNode = makeTestNode({
      id: "embed-1",
      type: "p",
      parent_id: "file-1",
      parent_idx: 1,
      embed_of: "task-1",
      content: "Buy groceries",
    })

    const calls: Array<{ nodeId: string; blockId: string }> = []
    const assignBlockId = (nodeId: string, blockId: string) => {
      calls.push({ nodeId, blockId })
    }

    const md = nodesToMarkdown([fileNode, embedNode, targetFileNode, targetTask], undefined, assignBlockId)

    // Should NOT call the callback since target already has block_id
    expect(calls).toHaveLength(0)
    // Should use the existing block_id
    expect(md).toContain("![[inbox#^existing1]]")
  })

  test("without assignBlockId callback, embed falls back to content-based reference", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "board.md",
      content: "Board",
    })
    const targetFileNode = makeTestNode({
      id: "target-file",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "inbox.md",
      content: "Inbox",
    })
    const targetTask = makeTestNode({
      id: "task-1",
      type: "p",
      parent_id: "target-file",
      content: "Buy groceries",
      item: { task: { status: "todo", marker: "[ ]" } },
    })
    const embedNode = makeTestNode({
      id: "embed-1",
      type: "p",
      parent_id: "file-1",
      parent_idx: 1,
      embed_of: "task-1",
      content: "Buy groceries",
    })

    // No assignBlockId callback
    const md = nodesToMarkdown([fileNode, embedNode, targetFileNode, targetTask])

    // Should fall back to content-based reference
    expect(md).toContain("![[inbox#Buy groceries]]")
    expect(md).not.toMatch(/\^[a-z0-9]{4}/)
  })

  test("generated block_id avoids collisions with existing IDs", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "board.md",
      content: "Board",
    })
    const targetFileNode = makeTestNode({
      id: "target-file",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "inbox.md",
      content: "Inbox",
    })
    // First task has an existing block_id
    const task1 = makeTestNode({
      id: "task-1",
      type: "p",
      parent_id: "target-file",
      content: "Task one",
      item: { task: { status: "todo", marker: "[ ]" }, list: "-" },
      block_id: "abcd",
    })
    // Second task needs a generated block_id
    const task2 = makeTestNode({
      id: "task-2",
      type: "p",
      parent_id: "target-file",
      content: "Task two",
    })
    const embed1 = makeTestNode({
      id: "embed-1",
      type: "p",
      parent_id: "file-1",
      parent_idx: 1,
      embed_of: "task-1",
      content: "Task one",
    })
    const embed2 = makeTestNode({
      id: "embed-2",
      type: "p",
      parent_id: "file-1",
      parent_idx: 2,
      embed_of: "task-2",
      content: "Task two",
      item: { task: { status: "todo", marker: "[ ]" } },
    })

    const calls: Array<{ nodeId: string; blockId: string }> = []
    const assignBlockId = (nodeId: string, blockId: string) => {
      calls.push({ nodeId, blockId })
    }

    nodesToMarkdown([fileNode, embed1, embed2, targetFileNode, task1, task2], undefined, assignBlockId)

    // Only task-2 should get a generated ID (task-1 already has one)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.nodeId).toBe("task-2")
    // The generated ID should differ from the existing one
    expect(calls[0]!.blockId).not.toBe("abcd")
  })
})

// ---------------------------------------------------------------------------
// 4. Round-trip tests
// ---------------------------------------------------------------------------

describe("Round-trip: block_id preservation", () => {
  test("task with block_id survives round-trip", () => {
    const output = roundtrip(`- [ ] Buy groceries ^k7m2`)
    expect(output).toContain("^k7m2")
    expect(output).toContain("Buy groceries")
  })

  test("section with block_id survives round-trip", () => {
    const output = roundtrip(`# Doc\n\n## Section Title ^abc1\n\nContent here`)
    expect(output).toContain("^abc1")
    expect(output).toContain("Section Title")
    expect(output).toContain("Content here")
  })

  test("unordered list item with block_id survives round-trip", () => {
    const output = roundtrip(`- Item text ^xy12`)
    expect(output).toContain("^xy12")
    expect(output).toContain("Item text")
  })

  test("paragraph with block_id survives round-trip", () => {
    const output = roundtrip(`Some paragraph ^z99a`)
    expect(output).toContain("^z99a")
    expect(output).toContain("Some paragraph")
  })

  test("double round-trip stability with block_id", () => {
    const original = `- [ ] Buy groceries ^k7m2`
    const md1 = roundtrip(original)
    const md2 = roundtrip(md1)

    expect(normalizeMarkdown(md1)).toBe(normalizeMarkdown(md2))
    expect(md2).toContain("^k7m2")
  })

  test("task with metadata and block_id survives round-trip", () => {
    const output = roundtrip(`- [ ] Task 📅 2025-12-25 ⏫ ^m3n4`)
    expect(output).toContain("^m3n4")
    // Emoji dates migrated to key:: value on roundtrip
    expect(output).toContain("due:: 2025-12-25")
    // Emoji priority (⏫) stays as plain text — not stripped, not extracted
    expect(output).toContain("⏫")
    expect(output).not.toContain("priority::")
    expect(output).toContain("Task")
  })

  test("mixed document with some nodes having block_ids and some not", () => {
    const original = `# Document

## Section ^s1

- [ ] Task with ID ^t1
- [ ] Task without ID
- Regular item ^i1
- Regular item without ID

Some paragraph ^p1

Another paragraph without ID`

    const output = roundtrip(original)

    // Block IDs preserved
    expect(output).toContain("^s1")
    expect(output).toContain("^t1")
    expect(output).toContain("^i1")
    expect(output).toContain("^p1")

    // Content preserved
    expect(output).toContain("Task with ID")
    expect(output).toContain("Task without ID")
    expect(output).toContain("Regular item")
    expect(output).toContain("Some paragraph")
    expect(output).toContain("Another paragraph without ID")

    // No spurious block IDs added to nodes without them
    const lines = output.split("\n")
    const taskWithoutIdLine = lines.find((l) => l.includes("Task without ID"))
    expect(taskWithoutIdLine).not.toContain("^")
  })

  test("double round-trip stability for mixed document", () => {
    const original = `# Doc

## Section ^s1

- [ ] Task ^t1
- [ ] Other task

Paragraph ^p1`

    const md1 = roundtrip(original)
    const md2 = roundtrip(md1)

    expect(normalizeMarkdown(md1)).toBe(normalizeMarkdown(md2))
  })

  test("block_id with various character types survives round-trip", () => {
    const output = roundtrip(`- [ ] Task with hyphen ^my-id`)
    expect(output).toContain("^my-id")

    const output2 = roundtrip(`- [ ] Task with underscore ^my_id`)
    expect(output2).toContain("^my_id")

    const output3 = roundtrip(`- [ ] Task with mixed ^a1-b2_c3`)
    expect(output3).toContain("^a1-b2_c3")
  })

  test("completed task with block_id survives round-trip", () => {
    const output = roundtrip(`- [x] Done task ^done1`)
    expect(output).toContain("^done1")
    expect(output).toContain("[x]")
    expect(output).toContain("Done task")
  })

  test("wip task with block_id survives round-trip", () => {
    const output = roundtrip(`- [/] In progress ^wip1`)
    expect(output).toContain("^wip1")
    expect(output).toContain("[/]")
  })
})

// ---------------------------------------------------------------------------
// 5. Block ID in embed references
// ---------------------------------------------------------------------------

describe("Embed references with block_id", () => {
  test("task with block_id produces ![[filename#^blockid]] embed", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "board.md",
      content: "Board",
    })
    const targetFileNode = makeTestNode({
      id: "target-file",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "inbox.md",
      content: "Inbox",
    })
    const targetTask = makeTestNode({
      id: "task-1",
      type: "p",
      parent_id: "target-file",
      content: "Buy groceries",
      item: { task: { status: "todo", marker: "[ ]" } },
      block_id: "k7m2",
    })
    const embedNode = makeTestNode({
      id: "embed-1",
      type: "p",
      parent_id: "file-1",
      parent_idx: 1,
      embed_of: "task-1",
      content: "Buy groceries",
    })

    const md = nodesToMarkdown([fileNode, embedNode, targetFileNode, targetTask])
    expect(md).toContain("![[inbox#^k7m2]]")
    // Should NOT contain the task content as a raw checkbox
    expect(md).not.toContain("- [ ] Buy groceries")
  })

  test("section with block_id produces ![[filename#^blockid]] embed", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "board.md",
      content: "Board",
    })
    const targetFileNode = makeTestNode({
      id: "target-file",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "notes.md",
      content: "Notes",
    })
    const targetSection = makeTestNode({
      id: "section-1",
      type: "h",
      item: {},
      fstype: "mdsection",
      parent_id: "target-file",
      parent_idx: 1,
      title: "My Section",
      content: "My Section",
      block_id: "s1a2",
    })
    const embedNode = makeTestNode({
      id: "embed-1",
      type: "p",
      parent_id: "file-1",
      parent_idx: 1,
      embed_of: "section-1",
      content: "![[notes#My Section]]",
    })

    const md = nodesToMarkdown([fileNode, embedNode, targetFileNode, targetSection])
    expect(md).toContain("![[notes#^s1a2]]")
  })

  test("ul with block_id produces embed with ^blockid", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "board.md",
      content: "Board",
    })
    const targetFileNode = makeTestNode({
      id: "target-file",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "notes.md",
      content: "Notes",
    })
    const targetUl = makeTestNode({
      id: "ul-1",
      type: "p",
      parent_id: "target-file",
      content: "Important item",
      block_id: "ul01",
    })
    const embedNode = makeTestNode({
      id: "embed-1",
      type: "p",
      parent_id: "file-1",
      parent_idx: 1,
      embed_of: "ul-1",
      content: "Important item",
    })

    const md = nodesToMarkdown([fileNode, embedNode, targetFileNode, targetUl])
    expect(md).toContain("![[notes#^ul01]]")
  })

  test("embed prefers block_id over content-based reference", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "board.md",
      content: "Board",
    })
    const targetFileNode = makeTestNode({
      id: "target-file",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "inbox.md",
      content: "Inbox",
    })
    const targetTask = makeTestNode({
      id: "task-1",
      type: "p",
      parent_id: "target-file",
      content: "Buy groceries",
      item: { task: { status: "todo", marker: "[ ]" } },
      block_id: "k7m2",
    })
    const embedNode = makeTestNode({
      id: "embed-1",
      type: "p",
      parent_id: "file-1",
      parent_idx: 1,
      embed_of: "task-1",
      content: "Buy groceries",
    })

    const md = nodesToMarkdown([fileNode, embedNode, targetFileNode, targetTask])

    // Should use block_id reference, not content-based
    expect(md).toContain("![[inbox#^k7m2]]")
    expect(md).not.toContain("![[inbox#Buy groceries]]")
  })

  test("embed without block_id and no callback uses content-based reference", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "board.md",
      content: "Board",
    })
    const targetFileNode = makeTestNode({
      id: "target-file",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "inbox.md",
      content: "Inbox",
    })
    const targetTask = makeTestNode({
      id: "task-1",
      type: "p",
      parent_id: "target-file",
      content: "Buy groceries",
      item: { task: { status: "todo", marker: "[ ]" } },
      // No block_id
    })
    const embedNode = makeTestNode({
      id: "embed-1",
      type: "p",
      parent_id: "file-1",
      parent_idx: 1,
      embed_of: "task-1",
      content: "Buy groceries",
    })

    // No assignBlockId callback
    const md = nodesToMarkdown([fileNode, embedNode, targetFileNode, targetTask])

    expect(md).toContain("![[inbox#Buy groceries]]")
  })

  test("multiple embeds: some targets with block_id, some without", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "board.md",
      content: "Board",
    })
    const targetFileNode = makeTestNode({
      id: "target-file",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "inbox.md",
      content: "Inbox",
    })
    const taskWithId = makeTestNode({
      id: "task-1",
      type: "p",
      parent_id: "target-file",
      content: "Task with ID",
      item: { task: { status: "todo", marker: "[ ]" }, list: "-" },
      block_id: "has1",
    })
    const taskWithoutId = makeTestNode({
      id: "task-2",
      type: "p",
      parent_id: "target-file",
      content: "Task without ID",
    })
    const embed1 = makeTestNode({
      id: "embed-1",
      type: "p",
      parent_id: "file-1",
      parent_idx: 1,
      embed_of: "task-1",
      content: "Task with ID",
    })
    const embed2 = makeTestNode({
      id: "embed-2",
      type: "p",
      parent_id: "file-1",
      parent_idx: 2,
      embed_of: "task-2",
      content: "Task without ID",
      item: { task: { status: "todo", marker: "[ ]" } },
    })

    const md = nodesToMarkdown([fileNode, embed1, embed2, targetFileNode, taskWithId, taskWithoutId])

    // First embed uses block_id
    expect(md).toContain("![[inbox#^has1]]")
    // Second embed uses content-based reference (no callback provided)
    expect(md).toContain("![[inbox#Task without ID]]")
  })
})
