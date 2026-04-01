/**
 * Round-trip Tests for Inline Properties
 *
 * Tests that inline properties (Logseq-style property:: value syntax)
 * are preserved through markdown -> parse -> serialize -> markdown cycles.
 */

import { describe, test, expect } from "vitest"
import { parseMarkdownToNodes } from "../src/ast2nodes.ts"
import { nodesToMarkdown } from "../src/nodes2md.ts"
import { normalizeMarkdown } from "./helpers/test-utils.ts"

describe("Round-trip: Single Property", () => {
  test("preserves single link property", () => {
    const original = "# Test\n\n- [ ] Task blocks:: [[km-a1b2]]\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("blocks:: [[km-a1b2]]")
  })

  test("preserves link property with alias", () => {
    const original = "# Test\n\n- [ ] Task author:: [[john-doe|John Doe]]\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("author:: [[john-doe|John Doe]]")
  })
})

describe("Round-trip: Multiple Link Values", () => {
  test("preserves multiple links in single property", () => {
    const original = "# Test\n\n- [ ] Task blocked-by:: [[a]], [[b]], [[c]]\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("blocked-by:: [[a]], [[b]], [[c]]")
  })

  test("preserves links with mixed aliases", () => {
    const original = "# Test\n\n- [ ] Task deps:: [[task-1|First]], [[task-2]], [[task-3|Third]]\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("deps:: [[task-1|First]], [[task-2]], [[task-3|Third]]")
  })
})

describe("Round-trip: Property Order Preservation", () => {
  test("preserves multiple properties in order", () => {
    const original = "# Test\n\n- [ ] Task blocks:: [[x]] priority:: P1 author:: [[bob]]\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)

    // All properties should be present
    expect(output).toContain("blocks:: [[x]]")
    expect(output).toContain("priority:: P1")
    expect(output).toContain("author:: [[bob]]")

    // priority:: is task metadata (written first by stringifyTaskMetadata),
    // blocks:: and author:: are structural properties (from propsRaw, written after)
    const priorityIdx = output.indexOf("priority::")
    const blocksIdx = output.indexOf("blocks::")
    const authorIdx = output.indexOf("author::")

    expect(priorityIdx).toBeLessThan(blocksIdx)
    expect(blocksIdx).toBeLessThan(authorIdx)
  })

  test("preserves task content before properties", () => {
    const original = "# Test\n\n- [ ] Do the thing status:: active due:: 2026-01-21\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("Do the thing")
    expect(output).toContain("status:: active")
    expect(output).toContain("due:: 2026-01-21")

    // Content should come before properties
    const contentIdx = output.indexOf("Do the thing")
    const statusIdx = output.indexOf("status::")

    expect(contentIdx).toBeLessThan(statusIdx)
  })
})

describe("Round-trip: Text Properties with Special Characters", () => {
  test("preserves text property with special characters", () => {
    const original = "# Test\n\n- [ ] Task reason:: Fixed in PR #123 (urgent)\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("reason:: Fixed in PR #123 (urgent)")
  })

  test("preserves text property with colons", () => {
    const original = "# Test\n\n- [ ] Task note:: Time: 10:30 AM\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("note:: Time: 10:30 AM")
  })

  test("preserves text property with quotes", () => {
    const original = '# Test\n\n- [ ] Task comment:: He said "hello" to her\n'
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)
    expect(output).toContain('comment:: He said "hello"')
  })
})

describe("Round-trip: Number Properties", () => {
  test("preserves integer number property", () => {
    const original = "# Test\n\n- [ ] Task rating:: 5\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("rating:: 5")
  })

  test("preserves decimal number property", () => {
    const original = "# Test\n\n- [ ] Task score:: 3.14\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("score:: 3.14")
  })

  test("preserves negative number property", () => {
    const original = "# Test\n\n- [ ] Task offset:: -10\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("offset:: -10")
  })
})

describe("Round-trip: Date Properties", () => {
  test("preserves date property", () => {
    const original = "# Test\n\n- [ ] Task reviewed:: 2026-01-21\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("reviewed:: 2026-01-21")
  })

  test("preserves multiple date properties", () => {
    const original = "# Test\n\n- [ ] Task created:: 2026-01-01 updated:: 2026-01-21\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("created:: 2026-01-01")
    expect(output).toContain("updated:: 2026-01-21")
  })
})

describe("Round-trip: Double Round-trip Stability", () => {
  test("stable after double round-trip - simple property", () => {
    const original = "# Test\n\n- [ ] Task blocks:: [[km-a1b2]]\n"
    const nodes1 = parseMarkdownToNodes(original, "test.md")
    const md1 = nodesToMarkdown(nodes1)
    const nodes2 = parseMarkdownToNodes(md1, "test.md")
    const md2 = nodesToMarkdown(nodes2)
    expect(normalizeMarkdown(md1)).toBe(normalizeMarkdown(md2))
  })

  test("stable after double round-trip - multiple properties", () => {
    const original = "# Test\n\n- [ ] Task status:: active priority:: P1 owner:: [[alice]]\n"
    const nodes1 = parseMarkdownToNodes(original, "test.md")
    const md1 = nodesToMarkdown(nodes1)
    const nodes2 = parseMarkdownToNodes(md1, "test.md")
    const md2 = nodesToMarkdown(nodes2)
    expect(normalizeMarkdown(md1)).toBe(normalizeMarkdown(md2))
  })

  test("stable after double round-trip - list property", () => {
    const original = "# Test\n\n- [ ] Task deps:: [[a]], [[b]], [[c]]\n"
    const nodes1 = parseMarkdownToNodes(original, "test.md")
    const md1 = nodesToMarkdown(nodes1)
    const nodes2 = parseMarkdownToNodes(md1, "test.md")
    const md2 = nodesToMarkdown(nodes2)
    expect(normalizeMarkdown(md1)).toBe(normalizeMarkdown(md2))
  })

  test("stable after triple round-trip", () => {
    const original = "# Test\n\n- [ ] Task blocks:: [[km-a1b2]] rating:: 5 note:: Important\n"

    const nodes1 = parseMarkdownToNodes(original, "test.md")
    const md1 = nodesToMarkdown(nodes1)

    const nodes2 = parseMarkdownToNodes(md1, "test.md")
    const md2 = nodesToMarkdown(nodes2)

    const nodes3 = parseMarkdownToNodes(md2, "test.md")
    const md3 = nodesToMarkdown(nodes3)

    // After first round-trip, should be stable
    expect(normalizeMarkdown(md2)).toBe(normalizeMarkdown(md3))
  })
})

describe("Round-trip: Mixed Content with Properties", () => {
  test("preserves full document with H1, sections, tasks with and without properties", () => {
    const original = `# Project Tasks

## To Do

- [ ] First task without properties
- [ ] Second task status:: pending priority:: P2
- [ ] Third task blocked-by:: [[task-1]], [[task-2]]

## In Progress

- [/] Working on feature owner:: [[alice]] started:: 2026-01-15

## Done

- [x] Completed task done:: 2026-01-20
`

    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)

    // Structure preserved
    expect(output).toContain("# Project Tasks")
    expect(output).toContain("## To Do")
    expect(output).toContain("## In Progress")
    expect(output).toContain("## Done")

    // Tasks without properties
    expect(output).toContain("First task without properties")

    // Tasks with properties
    expect(output).toContain("status:: pending")
    expect(output).toContain("priority:: P2")
    expect(output).toContain("blocked-by:: [[task-1]], [[task-2]]")
    expect(output).toContain("owner:: [[alice]]")
    expect(output).toContain("started:: 2026-01-15")
    expect(output).toContain("done:: 2026-01-20")
  })

  test("preserves properties alongside task metadata (migrated to key:: value)", () => {
    const original = "# Test\n\n- [ ] Task status:: active 📅 2026-02-01 ⏫\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("status:: active")
    // Emoji dates migrated to key:: value on roundtrip
    expect(output).toContain("due:: 2026-02-01")
    // Emoji priority (⏫) is no longer extracted — no priority:: emitted
    expect(output).not.toContain("priority::")
  })

  test("preserves properties alongside tags and mentions", () => {
    const original = "# Test\n\n- [ ] Task #important @alice owner:: [[bob]] +project-x\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)

    expect(output).toContain("#important")
    expect(output).toContain("@alice")
    expect(output).toContain("owner:: [[bob]]")
    expect(output).toContain("+project-x")
  })
})

describe("Properties: Parsed Values in data.props", () => {
  test("link property stored in data.props after parse", () => {
    const original = "# Test\n\n- [ ] Task blocks:: [[km-a1b2]]\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const task = nodes.find((n) => n.type === "p" && n.item != null && n.item?.task?.marker)

    expect(task).toBeDefined()
    expect(task!.data).toBeDefined()
    expect(task!.data!.props).toBeDefined()

    const props = task!.data!.props as Record<string, { type: string; target?: string }>
    expect(props.blocks).toEqual({
      type: "link",
      target: "km-a1b2",
    })
  })

  test("number property stored in data.props after parse", () => {
    const original = "# Test\n\n- [ ] Task rating:: 5\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const task = nodes.find((n) => n.type === "p" && n.item != null && n.item?.task?.marker)

    expect(task).toBeDefined()
    expect(task!.data!.props).toBeDefined()

    const props = task!.data!.props as Record<string, { type: string; value?: number }>
    expect(props.rating).toEqual({
      type: "number",
      value: 5,
    })
  })

  test("date property stored in data.props after parse", () => {
    const original = "# Test\n\n- [ ] Task reviewed:: 2026-01-21\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const task = nodes.find((n) => n.type === "p" && n.item != null && n.item?.task?.marker)

    expect(task).toBeDefined()
    expect(task!.data!.props).toBeDefined()

    const props = task!.data!.props as Record<string, { type: string; value?: string }>
    expect(props.reviewed).toEqual({
      type: "date",
      value: "2026-01-21",
    })
  })

  test("text property stored in data.props after parse", () => {
    const original = "# Test\n\n- [ ] Task note:: This is a note\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const task = nodes.find((n) => n.type === "p" && n.item != null && n.item?.task?.marker)

    expect(task).toBeDefined()
    expect(task!.data!.props).toBeDefined()

    const props = task!.data!.props as Record<string, { type: string; value?: string }>
    expect(props.note).toEqual({
      type: "text",
      value: "This is a note",
    })
  })

  test("list property stored in data.props after parse", () => {
    const original = "# Test\n\n- [ ] Task deps:: [[a]], [[b]], [[c]]\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const task = nodes.find((n) => n.type === "p" && n.item != null && n.item?.task?.marker)

    expect(task).toBeDefined()
    expect(task!.data!.props).toBeDefined()

    const props = task!.data!.props as Record<
      string,
      { type: string; values?: Array<{ type: string; target: string }> }
    >
    expect(props.deps).toBeDefined()
    expect(props.deps!.type).toBe("list")
    expect(props.deps!.values).toHaveLength(3)
    expect(props.deps!.values![0]).toEqual({ type: "link", target: "a" })
    expect(props.deps!.values![1]).toEqual({ type: "link", target: "b" })
    expect(props.deps!.values![2]).toEqual({ type: "link", target: "c" })
  })

  test("propsRaw stored for round-trip preservation", () => {
    const original = "# Test\n\n- [ ] Task blocks:: [[km-a1b2]] rating:: 5\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const task = nodes.find((n) => n.type === "p" && n.item != null && n.item?.task?.marker)

    expect(task).toBeDefined()
    expect(task!.data!.propsRaw).toBeDefined()

    const propsRaw = task!.data!.propsRaw as Record<string, string>
    expect(propsRaw.blocks).toBe("[[km-a1b2]]")
    expect(propsRaw.rating).toBe("5")
  })

  test("multiple properties all stored correctly", () => {
    const original = "# Test\n\n- [ ] Task status:: active priority:: 1 owner:: [[alice]]\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const task = nodes.find((n) => n.type === "p" && n.item != null && n.item?.task?.marker)

    expect(task).toBeDefined()
    expect(task!.data!.props).toBeDefined()
    expect(task!.data!.propsRaw).toBeDefined()

    const props = task!.data!.props as Record<string, { type: string }>
    expect(props.status).toBeDefined()
    expect(props.priority).toBeDefined()
    expect(props.owner).toBeDefined()
    expect(props.status!.type).toBe("text")
    expect(props.priority!.type).toBe("number")
    expect(props.owner!.type).toBe("link")

    const propsRaw = task!.data!.propsRaw as Record<string, string>
    expect(propsRaw.status).toBe("active")
    expect(propsRaw.priority).toBe("1")
    expect(propsRaw.owner).toBe("[[alice]]")
  })
})

describe("Properties: Edge Cases", () => {
  test("handles property name with hyphens", () => {
    const original = "# Test\n\n- [ ] Task blocked-by:: [[other-task]]\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("blocked-by:: [[other-task]]")
  })

  test("handles property name with underscores", () => {
    const original = "# Test\n\n- [ ] Task created_at:: 2026-01-21\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("created_at:: 2026-01-21")
  })

  test("handles property name with numbers", () => {
    const original = "# Test\n\n- [ ] Task field2:: value\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("field2:: value")
  })

  test("handles empty task with only properties", () => {
    const original = "# Test\n\n- [ ] status:: active\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)
    expect(output).toContain("status:: active")
  })

  test("handles task with wikilink in content (not property)", () => {
    const original = "# Test\n\n- [ ] Check [[reference]] for status:: active\n"
    const nodes = parseMarkdownToNodes(original, "test.md")
    const output = nodesToMarkdown(nodes)

    // Both wikilink and property should be preserved
    expect(output).toContain("[[reference]]")
    expect(output).toContain("status:: active")
  })
})
