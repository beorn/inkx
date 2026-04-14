/**
 * kmast integration and roundtrip tests.
 *
 * Verifies the full pipeline end-to-end:
 *   markdown → kmast (AST data fields) → KNode (node properties) → markdown (identical roundtrip)
 *
 * These tests exercise all km extensions in concert (block IDs, task marks,
 * inline props, refs, wikilinks, heading task marks) via the combined
 * km()/kmFromMarkdown() factory, then verify roundtrip fidelity through
 * parseMarkdownWithLinks → nodesToMarkdown.
 */

import { describe, expect, test } from "vitest"
import { fromMarkdown } from "mdast-util-from-markdown"
import type { Heading } from "mdast"
import type { KmWikilink } from "../../src/kmast/types.ts"
import { km, kmFromMarkdown } from "../../src/extensions/index.ts"
import { parseMarkdownWithLinks, nodesToMarkdown, parseMarkdown } from "../../src/index.ts"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse markdown with all km extensions applied (AST-level) */
function parse(md: string) {
  return fromMarkdown(md, {
    extensions: [km()],
    mdastExtensions: kmFromMarkdown(),
  })
}

/** Walk tree to find all KmWikilink nodes */
function findWikilinks(tree: any): KmWikilink[] {
  const links: KmWikilink[] = []
  function walk(node: any) {
    if (node.type === "kmWikilink") links.push(node)
    if (node.children) node.children.forEach(walk)
  }
  walk(tree)
  return links
}

/** Roundtrip: markdown → KNode[] → markdown */
function roundtrip(md: string): string {
  const { nodes } = parseMarkdownWithLinks(md, "test.md")
  return nodesToMarkdown(nodes)
}

// ---------------------------------------------------------------------------
// kmast integration: data fields
// ---------------------------------------------------------------------------

describe("kmast integration: data fields", () => {
  describe("listItem.data.taskMark", () => {
    test.each([
      { mark: " ", input: "- [ ] Open task", checked: false },
      { mark: "x", input: "- [x] Done task", checked: true },
      { mark: "X", input: "- [X] Done uppercase", checked: true },
      { mark: "/", input: "- [/] WIP task", checked: null },
      { mark: "-", input: "- [-] Dropped task", checked: null },
      { mark: "!", input: "- [!] Blocked task", checked: null },
    ])("[$mark] → taskMark='$mark', checked=$checked", ({ mark, input, checked }) => {
      const tree = parse(input)
      const list = tree.children[0] as any
      expect(list.type).toBe("list")
      const item = list.children[0]
      expect(item.data.taskMark).toBe(mark)
      expect(item.checked).toBe(checked)
    })
  })

  describe("listItem.data.blockId", () => {
    test("block ID is extracted and stripped from list item text", () => {
      const tree = parse("- Task with ID ^abc123")
      const list = tree.children[0] as any
      const item = list.children[0]
      expect(item.data?.blockId).toBe("abc123")
      // Block ID hoisted to listItem and its inner paragraph
      const para = item.children[0]
      expect(para.data?.blockId).toBe("abc123")
    })

    test("no block ID on item without one", () => {
      const tree = parse("- Plain item")
      const list = tree.children[0] as any
      const item = list.children[0]
      expect(item.data?.blockId).toBeUndefined()
    })
  })

  describe("paragraph.data.tags, .mentions, .projects", () => {
    test("extracts tags from paragraph", () => {
      const tree = parse("Text #urgent #bug")
      const para = tree.children[0]!
      expect(para.data?.tags).toEqual(["urgent", "bug"])
    })

    test("extracts mentions from paragraph", () => {
      const tree = parse("Assigned to @alice @bob")
      const para = tree.children[0]!
      expect(para.data?.mentions).toEqual(["alice", "bob"])
    })

    test("extracts projects from paragraph", () => {
      const tree = parse("For +backend +api")
      const para = tree.children[0]!
      expect(para.data?.projects).toEqual(["backend", "api"])
    })

    test("extracts all ref types together", () => {
      const tree = parse("#tag @user +proj")
      const para = tree.children[0]!
      expect(para.data?.tags).toEqual(["tag"])
      expect(para.data?.mentions).toEqual(["user"])
      expect(para.data?.projects).toEqual(["proj"])
    })

    test("no refs set on plain text", () => {
      const tree = parse("Plain paragraph")
      const para = tree.children[0]!
      expect(para.data?.tags).toBeUndefined()
      expect(para.data?.mentions).toBeUndefined()
      expect(para.data?.projects).toBeUndefined()
    })

    test("refs hoisted from list item paragraph to listItem", () => {
      const tree = parse("- Task #urgent @alice +backend")
      const list = tree.children[0] as any
      const item = list.children[0]
      expect(item.data?.tags).toEqual(["urgent"])
      expect(item.data?.mentions).toEqual(["alice"])
      expect(item.data?.projects).toEqual(["backend"])
    })
  })

  describe("paragraph.data.props, .propsRaw, .cleanText", () => {
    test("extracts typed props from paragraph", () => {
      const tree = parse("Task rating:: 5 due:: 2025-01-15")
      const para = tree.children[0]!
      expect(para.data?.props).toEqual({
        rating: { type: "number", value: 5 },
        due: { type: "date", value: "2025-01-15" },
      })
      expect(para.data?.propsRaw).toEqual({ rating: "5", due: "2025-01-15" })
      expect(para.data?.cleanText).toBe("Task")
    })

    test("link property value", () => {
      const tree = parse("Task blocked-by:: [[other]]")
      const para = tree.children[0]!
      expect(para.data?.props?.["blocked-by"]).toEqual({ type: "link", target: "other" })
      expect(para.data?.propsRaw?.["blocked-by"]).toBe("[[other]]")
    })

    test("no props on plain paragraph", () => {
      const tree = parse("No properties here")
      const para = tree.children[0]!
      expect(para.data?.props).toBeUndefined()
      expect(para.data?.propsRaw).toBeUndefined()
    })

    test("props hoisted from list item paragraph to listItem", () => {
      const tree = parse("- Task priority:: 2")
      const list = tree.children[0] as any
      const item = list.children[0]
      expect(item.data?.props).toEqual({ priority: { type: "number", value: 2 } })
      expect(item.data?.propsRaw).toEqual({ priority: "2" })
      expect(item.data?.cleanText).toBe("Task")
    })
  })

  describe("heading.data fields", () => {
    test("heading with block ID", () => {
      const tree = parse("## Section Title ^blk1")
      const heading = tree.children[0]!
      expect(heading.type).toBe("heading")
      expect(heading.data?.blockId).toBe("blk1")
    })

    test("heading with task mark", () => {
      const tree = parse("### [x] Done heading")
      const heading = tree.children[0]! as Heading
      expect(heading.type).toBe("heading")
      expect(heading.data?.taskMark).toBe("x")
    })

    test("heading with inline properties", () => {
      const tree = parse("## Column km.add:: status:todo")
      const heading = tree.children[0]!
      expect(heading.data?.propsRaw).toEqual({ "km.add": "status:todo" })
      expect(heading.data?.cleanText).toBe("Column")
      // km.* keys excluded from typed props
      expect(heading.data?.props).toEqual({})
    })

    test("heading with non-km property", () => {
      const tree = parse("## Section color:: blue")
      const heading = tree.children[0]!
      expect(heading.data?.props).toEqual({ color: { type: "text", value: "blue" } })
      expect(heading.data?.propsRaw).toEqual({ color: "blue" })
      expect(heading.data?.cleanText).toBe("Section")
    })

    test("heading with tags", () => {
      const tree = parse("## Section #important")
      const heading = tree.children[0]!
      expect(heading.data?.tags).toEqual(["important"])
    })
  })

  describe("KmWikilink nodes", () => {
    test("simple wikilink", () => {
      const tree = parse("See [[target page]]")
      const links = findWikilinks(tree)
      expect(links).toHaveLength(1)
      expect(links[0]).toMatchObject({
        type: "kmWikilink",
        target: "target page",
        embedded: false,
      })
      expect(links[0]!.alias).toBeUndefined()
    })

    test("wikilink with alias", () => {
      const tree = parse("See [[target|display text]]")
      const links = findWikilinks(tree)
      expect(links).toHaveLength(1)
      expect(links[0]).toMatchObject({
        type: "kmWikilink",
        target: "target",
        alias: "display text",
        embedded: false,
      })
    })

    test("embedded wikilink", () => {
      const tree = parse("![[image.png]]")
      const links = findWikilinks(tree)
      expect(links).toHaveLength(1)
      expect(links[0]).toMatchObject({
        type: "kmWikilink",
        target: "image.png",
        embedded: true,
      })
    })

    test("wikilink with section and block ref", () => {
      const tree = parse("[[page#heading#^block]]")
      const links = findWikilinks(tree)
      expect(links).toHaveLength(1)
      expect(links[0]).toMatchObject({
        target: "page",
        section: "heading",
        blockRef: "block",
      })
    })

    test("multiple wikilinks in one paragraph", () => {
      const tree = parse("Link [[A]] and [[B|alias]] here")
      const links = findWikilinks(tree)
      expect(links).toHaveLength(2)
      expect(links[0]!.target).toBe("A")
      expect(links[1]!.target).toBe("B")
      expect(links[1]!.alias).toBe("alias")
    })
  })
})

// ---------------------------------------------------------------------------
// kmast integration: combined features
// ---------------------------------------------------------------------------

describe("kmast integration: combined features", () => {
  test("list item with ALL km extensions at once", () => {
    const md = "- [/] Task #urgent @alice +project blocked-by:: [[other]] ^abc"
    const tree = parse(md)
    const list = tree.children[0] as any
    expect(list.type).toBe("list")
    const item = list.children[0]

    // Task mark
    expect(item.data.taskMark).toBe("/")
    expect(item.checked).toBe(null)

    // Block ID
    expect(item.data.blockId).toBe("abc")

    // Refs (hoisted to listItem)
    expect(item.data.tags).toEqual(["urgent"])
    expect(item.data.mentions).toEqual(["alice"])
    expect(item.data.projects).toEqual(["project"])

    // Inline property (hoisted to listItem)
    expect(item.data.props?.["blocked-by"]).toEqual({ type: "link", target: "other" })
    expect(item.data.propsRaw?.["blocked-by"]).toBe("[[other]]")

    // Clean text (no props, no block ID suffix)
    expect(item.data.cleanText).toBe("Task #urgent @alice +project")
  })

  test("list item with block ID, task mark, and simple text property", () => {
    const md = "- [x] Finished status:: done ^xyz"
    const tree = parse(md)
    const list = tree.children[0] as any
    const item = list.children[0]

    expect(item.data.taskMark).toBe("x")
    expect(item.checked).toBe(true)
    expect(item.data.blockId).toBe("xyz")
    expect(item.data.props?.status).toEqual({ type: "text", value: "done" })
    expect(item.data.cleanText).toBe("Finished")
  })

  test("paragraph with refs, property, and block ID", () => {
    const md = "Description #feature @bob priority:: 3 ^ref1"
    const tree = parse(md)
    const para = tree.children[0]!

    expect(para.data?.blockId).toBe("ref1")
    expect(para.data?.tags).toEqual(["feature"])
    expect(para.data?.mentions).toEqual(["bob"])
    expect(para.data?.props?.priority).toEqual({ type: "number", value: 3 })
    expect(para.data?.cleanText).toBe("Description #feature @bob")
  })

  test("heading with task mark, property, and block ID", () => {
    const md = "## [/] In Progress km.sync:: status:wip ^h1"
    const tree = parse(md)
    const heading = tree.children[0]! as Heading

    expect(heading.data?.taskMark).toBe("/")
    expect(heading.data?.blockId).toBe("h1")
    expect(heading.data?.propsRaw?.["km.sync"]).toBe("status:wip")
    expect(heading.data?.props).toEqual({}) // km.* excluded from typed props
    expect(heading.data?.cleanText).toBe("In Progress")
  })

  test("paragraph with wikilinks and refs", () => {
    const md = "See [[Project A]] and [[Other|alias]] #important @lead"
    const tree = parse(md)
    const para = tree.children[0]!

    // Refs
    expect(para.data?.tags).toEqual(["important"])
    expect(para.data?.mentions).toEqual(["lead"])

    // Wikilinks as child nodes
    const links = findWikilinks(tree)
    expect(links).toHaveLength(2)
    expect(links[0]!.target).toBe("Project A")
    expect(links[1]!.target).toBe("Other")
    expect(links[1]!.alias).toBe("alias")
  })

  test("multiple list items each have independent data", () => {
    const md = ["- [x] Done #tag1 rating:: 5 ^id1", "- [ ] Open #tag2 @user ^id2", "- [/] WIP status:: active"].join(
      "\n",
    )
    const tree = parse(md)
    const list = tree.children[0] as any
    const items = list.children

    expect(items).toHaveLength(3)

    // Item 1
    expect(items[0].data.taskMark).toBe("x")
    expect(items[0].data.blockId).toBe("id1")
    expect(items[0].data.tags).toEqual(["tag1"])
    expect(items[0].data.props?.rating).toEqual({ type: "number", value: 5 })

    // Item 2
    expect(items[1].data.taskMark).toBe(" ")
    expect(items[1].data.blockId).toBe("id2")
    expect(items[1].data.tags).toEqual(["tag2"])
    expect(items[1].data.mentions).toEqual(["user"])

    // Item 3
    expect(items[2].data.taskMark).toBe("/")
    expect(items[2].data.blockId).toBeUndefined()
    expect(items[2].data.props?.status).toEqual({ type: "text", value: "active" })
  })
})

// ---------------------------------------------------------------------------
// kmast integration: heading rules
// ---------------------------------------------------------------------------

describe("kmast integration: heading rules", () => {
  test("km.add:: in heading propsRaw", () => {
    const tree = parse("## Ready km.add:: status:todo")
    const heading = tree.children[0]!
    expect(heading.data?.propsRaw?.["km.add"]).toBe("status:todo")
    expect(heading.data?.cleanText).toBe("Ready")
    expect(heading.data?.props).toEqual({})
  })

  test("km.sync:: in heading propsRaw", () => {
    const tree = parse("## Active km.sync:: status:wip")
    const heading = tree.children[0]!
    expect(heading.data?.propsRaw?.["km.sync"]).toBe("status:wip")
    expect(heading.data?.cleanText).toBe("Active")
  })

  test("km.collapse:: true", () => {
    const tree = parse("## Archive km.collapse:: true")
    const heading = tree.children[0]!
    expect(heading.data?.propsRaw?.["km.collapse"]).toBe("true")
    expect(heading.data?.cleanText).toBe("Archive")
  })

  test("km.limit:: in heading propsRaw", () => {
    const tree = parse("## WIP km.limit:: 3")
    const heading = tree.children[0]!
    expect(heading.data?.propsRaw?.["km.limit"]).toBe("3")
    expect(heading.data?.cleanText).toBe("WIP")
  })

  test("km.color:: in heading propsRaw", () => {
    const tree = parse("## Highlight km.color:: cyan")
    const heading = tree.children[0]!
    expect(heading.data?.propsRaw?.["km.color"]).toBe("cyan")
    expect(heading.data?.cleanText).toBe("Highlight")
  })

  test("km.default:: true in heading propsRaw", () => {
    const tree = parse("## Inbox km.default:: true")
    const heading = tree.children[0]!
    expect(heading.data?.propsRaw?.["km.default"]).toBe("true")
    expect(heading.data?.cleanText).toBe("Inbox")
  })

  test("multiple km.* rules on one heading", () => {
    const tree = parse("## Column km.sync:: status:wip km.limit:: 5 km.color:: green")
    const heading = tree.children[0]!
    expect(heading.data?.propsRaw?.["km.sync"]).toBe("status:wip")
    expect(heading.data?.propsRaw?.["km.limit"]).toBe("5")
    expect(heading.data?.propsRaw?.["km.color"]).toBe("green")
    expect(heading.data?.cleanText).toBe("Column")
    expect(heading.data?.props).toEqual({})
  })

  test("duplicate km.add values are comma-concatenated", () => {
    const tree = parse("## Col km.add:: query1 km.add:: query2")
    const heading = tree.children[0]!
    expect(heading.data?.propsRaw?.["km.add"]).toBe("query1, query2")
    expect(heading.data?.cleanText).toBe("Col")
  })

  test("heading with task mark AND km rules", () => {
    const tree = parse("## [x] Done km.collapse:: true")
    const heading = tree.children[0]! as Heading
    expect(heading.data?.taskMark).toBe("x")
    expect(heading.data?.propsRaw?.["km.collapse"]).toBe("true")
    expect(heading.data?.cleanText).toBe("Done")
  })

  test("heading with mixed km.* and non-km properties", () => {
    const tree = parse("## Section km.color:: blue label:: important")
    const heading = tree.children[0]!
    expect(heading.data?.propsRaw?.["km.color"]).toBe("blue")
    expect(heading.data?.propsRaw?.["label"]).toBe("important")
    expect(heading.data?.props?.label).toEqual({ type: "text", value: "important" })
    // km.* excluded from typed props
    expect(heading.data?.props?.["km.color"]).toBeUndefined()
    expect(heading.data?.cleanText).toBe("Section")
  })
})

// ---------------------------------------------------------------------------
// kmast roundtrip
// ---------------------------------------------------------------------------

describe("kmast roundtrip", () => {
  test("plain paragraph roundtrips", () => {
    const output = roundtrip("Simple paragraph text.")
    expect(output).toContain("Simple paragraph text")
  })

  test("task with custom marks roundtrips", () => {
    const md = [
      "- [ ] Open task",
      "- [x] Done task",
      "- [/] WIP task",
      "- [-] Dropped task",
      "- [!] Blocked task",
    ].join("\n")
    const output = roundtrip(md)
    expect(output).toContain("- [ ]")
    expect(output).toContain("- [x]")
    expect(output).toContain("- [/]")
    expect(output).toContain("- [-]")
    expect(output).toContain("- [!]")
    expect(output).toContain("Open task")
    expect(output).toContain("Done task")
    expect(output).toContain("WIP task")
    expect(output).toContain("Dropped task")
    expect(output).toContain("Blocked task")
  })

  test("task with tags roundtrips", () => {
    const output = roundtrip("- [ ] Task #urgent #feature")
    expect(output).toContain("#urgent")
    expect(output).toContain("#feature")
  })

  test("task with mentions roundtrips", () => {
    const output = roundtrip("- [ ] Assign @alice")
    expect(output).toContain("@alice")
  })

  test("task with inline properties roundtrips", () => {
    const output = roundtrip("- [ ] Task due:: 2025-03-15")
    expect(output).toContain("due:: 2025-03-15")
  })

  test("wikilink roundtrips", () => {
    const output = roundtrip("See [[Target Page]] here.")
    expect(output).toContain("[[Target Page]]")
  })

  test("aliased wikilink roundtrips", () => {
    const output = roundtrip("See [[target|display text]] here.")
    expect(output).toContain("[[target|display text]]")
  })

  test("embedded wikilink roundtrips", () => {
    const output = roundtrip("![[image.png]]")
    expect(output).toContain("![[image.png]]")
  })

  test("block IDs roundtrip", () => {
    const output = roundtrip("- Task text ^abc123")
    expect(output).toContain("^abc123")
    expect(output).toContain("Task text")
  })

  test("heading with km rules roundtrips", () => {
    const md = "## Ready km.add:: status:todo"
    const output = roundtrip(md)
    expect(output).toContain("Ready")
    expect(output).toContain("km.add:: status:todo")
  })

  test("heading with km.sync and km.limit roundtrips", () => {
    const md = "## In Progress km.sync:: status:wip km.limit:: 3"
    const output = roundtrip(md)
    expect(output).toContain("km.sync:: status:wip")
    expect(output).toContain("km.limit:: 3")
  })

  test("heading with km.collapse roundtrips", () => {
    const md = "## Archive km.collapse:: true"
    const output = roundtrip(md)
    expect(output).toContain("km.collapse:: true")
  })

  test("heading with km.color roundtrips", () => {
    const md = "## Section km.color:: cyan"
    const output = roundtrip(md)
    expect(output).toContain("km.color:: cyan")
  })

  test("heading with km.default roundtrips", () => {
    const md = "## Inbox km.default:: true"
    const output = roundtrip(md)
    expect(output).toContain("km.default:: true")
  })

  test("heading with task mark roundtrips", () => {
    const md = "### [/] WIP heading"
    const output = roundtrip(md)
    expect(output).toContain("[/]")
    expect(output).toContain("WIP heading")
  })

  test("complex document with all features roundtrips", () => {
    // Note: H1 is merged into file node by parseMarkdownWithLinks,
    // so H1-level km.* rules don't appear in the roundtrip output
    const md = `# Board

## Ready km.add:: status:todo

- [ ] Task one #feature @alice
- [!] Blocked task blocked-by:: [[other]] ^b1

## In Progress km.sync:: status:wip km.limit:: 3

- [/] WIP task +backend
- [x] Done task

## Archive km.collapse:: true

- [-] Dropped task`

    const output = roundtrip(md)
    expect(output).toContain("km.add:: status:todo")
    expect(output).toContain("#feature")
    expect(output).toContain("@alice")
    expect(output).toContain("[!]")
    expect(output).toContain("blocked-by:: [[other]]")
    expect(output).toContain("^b1")
    expect(output).toContain("km.sync:: status:wip")
    expect(output).toContain("km.limit:: 3")
    expect(output).toContain("[/]")
    expect(output).toContain("+backend")
    expect(output).toContain("km.collapse:: true")
    expect(output).toContain("[-]")
    expect(output).toContain("Dropped task")
  })

  test("double roundtrip is stable", () => {
    const md = `## Column km.add:: query1 km.color:: blue

- [/] Task #tag @user priority:: 2 ^id1
- [ ] Another task blocked-by:: [[dep]] ^id2`

    const output1 = roundtrip(md)
    const output2 = roundtrip(output1)
    // Normalize for comparison (trim trailing whitespace, collapse blank lines)
    const norm = (s: string) =>
      s
        .split("\n")
        .map((l) => l.trimEnd())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    expect(norm(output1)).toBe(norm(output2))
  })

  test("KNode properties are correct after parsing combined features", () => {
    const md = `# Project Board

## Inbox km.default:: true km.add:: status:todo

- [ ] Buy groceries #errand @alice due:: 2025-06-01

## Done km.collapse:: true

- [x] Ship feature +backend`

    const { nodes } = parseMarkdownWithLinks(md, "test.md")

    // File node
    const fileNode = nodes.find((n) => n.type === "h" && n.item != null && n.fstype === "mdfile")
    expect(fileNode).toBeDefined()
    expect(fileNode!.title).toBe("Project Board")

    // Sections
    const sections = nodes.filter((n) => n.type === "h" && n.item != null && n.fstype === "mdsection")
    const inbox = sections.find((s) => s.title === "Inbox")
    expect(inbox).toBeDefined()
    expect(inbox!.rules?.default).toBe(true)
    expect(inbox!.rules?.add).toBe("status:todo")

    const done = sections.find((s) => s.title === "Done")
    expect(done).toBeDefined()
    expect(done!.rules?.collapse).toBe(true)

    // Tasks
    const tasks = nodes.filter((n) => n.type === "p" && n.item != null && n.item?.task?.marker)
    expect(tasks).toHaveLength(2)

    const grocery = tasks.find((t) => t.content?.includes("Buy groceries"))
    expect(grocery).toBeDefined()
    expect(grocery!.item?.task?.status).toBe("todo")
    expect(grocery!.due_at).toBe("2025-06-01")

    const ship = tasks.find((t) => t.content?.includes("Ship feature"))
    expect(ship).toBeDefined()
    expect(ship!.item?.task?.status).toBe("done")
  })
})

// ===========================================================================
// Heading-level task refs/props — km-markdown.heading-task-refs
//
// Heading-level tasks (`#### [ ] title #tagA @person priority:: P1`) must
// populate tags/mentions/projects/props/propsRaw in node.data, the same way
// list-item tasks do. The ast2nodes heading handler was building headingData
// only from rules + mdSource, ignoring the tags/mentions/props that
// kmRefsTransform and kmInlinePropTransform had already extracted into
// heading.data.*. Reported by the taxes session.
// ===========================================================================

describe("heading-task refs/props extraction (km-markdown.heading-task-refs)", () => {
  const { parseMarkdownToNodes } = require("../../src/ast2nodes.ts") as typeof import("../../src/ast2nodes.ts")

  test("list-item task extracts tags/mentions/props (baseline)", () => {
    const md = "- [ ] title #tagA @person priority:: P1 status:: reported"
    const nodes = parseMarkdownToNodes(md, "test.md")
    const task = nodes.find((n: { item?: { task?: unknown } }) => n.item?.task !== undefined)
    expect(task).toBeDefined()
    expect(task!.data?.tags).toContain("tagA")
    expect(task!.data?.mentions).toContain("person")
    const propsRaw = (task!.data as { propsRaw?: Record<string, string> })?.propsRaw
    expect(propsRaw?.priority).toBe("P1")
    expect(propsRaw?.status).toBe("reported")
  })

  test("heading-level task extracts tags/mentions/props (regression)", () => {
    const md = "#### [ ] title #tagA @person priority:: P1 status:: reported\n"
    const nodes = parseMarkdownToNodes(md, "test.md")
    const task = nodes.find((n: { item?: { task?: unknown } }) => n.item?.task !== undefined)
    expect(task, "heading-task node should exist").toBeDefined()
    expect(task!.data?.tags).toContain("tagA")
    expect(task!.data?.mentions).toContain("person")
    const propsRaw = (task!.data as { propsRaw?: Record<string, string> })?.propsRaw
    expect(propsRaw?.priority).toBe("P1")
    expect(propsRaw?.status).toBe("reported")
  })

  test("heading with km.* rules still routes them to rules, not propsRaw", () => {
    const md = "## Column km.collapse:: true km.add:: +project\n"
    const nodes = parseMarkdownToNodes(md, "test.md")
    // Skip the file-level h node (fstype mdfile) — we want the section heading
    const heading = nodes.find(
      (n: { type: string; fstype?: string }) => n.type === "h" && n.fstype === "mdsection",
    )
    expect(heading, "section heading should exist").toBeDefined()
    // km.* rules live in node.rules
    expect((heading as { rules?: { collapse?: boolean } }).rules?.collapse).toBe(true)
    // And are NOT mirrored into user propsRaw
    const propsRaw = (heading!.data as { propsRaw?: Record<string, string> })?.propsRaw
    expect(propsRaw?.["km.collapse"]).toBeUndefined()
    expect(propsRaw?.["km.add"]).toBeUndefined()
  })

  test("heading with +project tag populates projects[]", () => {
    const md = "### [ ] ship release +km\n"
    const nodes = parseMarkdownToNodes(md, "test.md")
    const task = nodes.find((n: { item?: { task?: unknown } }) => n.item?.task !== undefined)
    expect(task).toBeDefined()
    expect(task!.data?.projects).toContain("km")
  })
})
