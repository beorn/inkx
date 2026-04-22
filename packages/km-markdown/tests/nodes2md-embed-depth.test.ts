/**
 * Embed Depth Bug Tests
 *
 * When handleAddNodeAfter creates a section node as a sibling of embed nodes
 * (embed paragraphs with embed_of), the section's heading depth is derived from its
 * position in the tree (parent chain), not from stored data. If a section is
 * incorrectly parented (sibling instead of child), serialization produces a
 * heading at the wrong level, breaking the tree structure on re-parse.
 */

import { describe, test, expect } from "vitest"
import { nodesToMarkdown } from "../src/nodes2md.ts"
import { parseMarkdownWithLinks } from "../src/ast2nodes.ts"
import { makeTestNode } from "./helpers/test-utils.ts"

describe("Embed depth: section created among embeds", () => {
  // Shared target nodes for embed resolution
  const targetNodes = [
    makeTestNode({
      id: "target-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "/repo/File1.md",
      content: "File1",
      name: "abc",
    }),
    makeTestNode({
      id: "target-2",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "/repo/File2.md",
      content: "File2",
      name: "def",
    }),
    makeTestNode({
      id: "target-3",
      type: "h",
      item: {},
      fstype: "mdfile",
      fs_path: "/repo/File3.md",
      content: "File3",
      name: "ghi",
    }),
  ]

  test("section created among embeds gets correct depth in round-trip", () => {
    // Simulate the correct scenario: inner section has depth=3 (child of depth=2 parent)
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: ".",
      content: "Next Actions",

      fs_path: "/repo/next-actions.md",
    })
    const processingSection = makeTestNode({
      id: "sec-processing",
      type: "h",
      item: {},
      fstype: "mdsection",
      parent_id: "file-1",
      parent_idx: 1,
      content: "Processing",
      title: "Processing",
    })
    const embed1 = makeTestNode({
      id: "embed-1",
      type: "p",
      parent_id: "sec-processing",
      parent_idx: 1,
      embed_of: "target-1",
      content: "![[File1#^abc]]",
    })
    const embed2 = makeTestNode({
      id: "embed-2",
      type: "p",
      parent_id: "sec-processing",
      parent_idx: 2,
      embed_of: "target-2",
      content: "![[File2#^def]]",
    })
    // Inner section is a child of "Processing" — tree depth determines heading level
    const innerSection = makeTestNode({
      id: "sec-inner",
      type: "h",
      item: {},
      fstype: "mdsection",
      parent_id: "sec-processing",
      parent_idx: 3,
      content: "",
      title: "",
    })
    const embed3 = makeTestNode({
      id: "embed-3",
      type: "p",
      parent_id: "sec-processing",
      parent_idx: 4,
      embed_of: "target-3",
      content: "![[File3#^ghi]]",
    })

    const allNodes = [fileNode, processingSection, embed1, embed2, innerSection, embed3]
    const lookupNodes = [...allNodes, ...targetNodes]

    // Serialize
    const md = nodesToMarkdown(allNodes, lookupNodes)

    // The inner section should be ### (depth 3), not ## (depth 2)
    expect(md).toContain("### ")

    // Re-parse
    const result = parseMarkdownWithLinks(md, "next-actions.md")
    const sections = result.nodes.filter((n) => n.type === "h" && n.item != null && n.fstype === "mdsection")

    // "Processing" should be a section
    const processing = sections.find((s) => s.content === "Processing")
    expect(processing).toBeDefined()

    // The empty/inner section should be a CHILD of Processing, not a sibling
    const innerSections = sections.filter((s) => s.content !== "Processing")
    expect(innerSections.length).toBeGreaterThanOrEqual(1)

    const reparsedInner = innerSections[0]!
    expect(reparsedInner.parent_id).toBe(processing!.id)
  })

  test("section among embeds gets correct depth from tree structure", () => {
    // Depth is derived from tree position (parent chain), so a child section
    // always gets the correct heading level from its nesting.
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: ".",
      content: "Next Actions",

      fs_path: "/repo/next-actions.md",
    })
    const processingSection = makeTestNode({
      id: "sec-processing",
      type: "h",
      item: {},
      fstype: "mdsection",
      parent_id: "file-1",
      parent_idx: 1,
      content: "Processing",
      title: "Processing",
    })
    const embed1 = makeTestNode({
      id: "embed-1",
      type: "p",
      parent_id: "sec-processing",
      parent_idx: 1,
      embed_of: "target-1",
      content: "![[File1#^abc]]",
    })
    const embed2 = makeTestNode({
      id: "embed-2",
      type: "p",
      parent_id: "sec-processing",
      parent_idx: 2,
      embed_of: "target-2",
      content: "![[File2#^def]]",
    })
    // Child of "Processing" — tree depth gives it ### (depth 3)
    const innerSection = makeTestNode({
      id: "sec-inner",
      type: "h",
      item: {},
      fstype: "mdsection",
      parent_id: "sec-processing",
      parent_idx: 3,
      content: "",
      title: "",
    })
    const embed3 = makeTestNode({
      id: "embed-3",
      type: "p",
      parent_id: "sec-processing",
      parent_idx: 4,
      embed_of: "target-3",
      content: "![[File3#^ghi]]",
    })

    const allNodes = [fileNode, processingSection, embed1, embed2, innerSection, embed3]
    const lookupNodes = [...allNodes, ...targetNodes]

    // Serialize — inner section is ### (depth 3) because it's a child of Processing
    const md = nodesToMarkdown(allNodes, lookupNodes)

    // "Processing" is ## and inner section is ### (correct tree-derived depth)
    const h2Matches = md.match(/^## /gm) ?? []
    const h3Matches = md.match(/^### /gm) ?? []
    expect(h2Matches.length).toBe(1) // Only Processing is ##
    expect(h3Matches.length).toBe(1) // Inner section is ###

    // Re-parse: inner section is correctly a child of Processing
    const result = parseMarkdownWithLinks(md, "next-actions.md")
    const sections = result.nodes.filter((n) => n.type === "h" && n.item != null && n.fstype === "mdsection")

    const processing = sections.find((s) => s.content === "Processing")
    expect(processing).toBeDefined()

    const innerSections = sections.filter((s) => s.content !== "Processing")
    expect(innerSections.length).toBeGreaterThanOrEqual(1)

    // Inner section is a child of Processing (tree structure preserved)
    const reparsedInner = innerSections[0]!
    expect(reparsedInner.parent_id).toBe(processing!.id)
  })

  test("nodes2md serializes nested section as ### heading (depth from tree)", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: ".",
      content: "Document",
    })
    const parentSection = makeTestNode({
      id: "sec-parent",
      type: "h",
      item: {},
      fstype: "mdsection",
      parent_id: "file-1",
      parent_idx: 1,
      content: "Parent",
    })
    // Child of parentSection → grandchild of file → depth 3 (###)
    const childSection = makeTestNode({
      id: "sec-1",
      type: "h",
      item: {},
      fstype: "mdsection",
      parent_id: "sec-parent",
      parent_idx: 1,
      content: "Subsection",
    })

    const md = nodesToMarkdown([fileNode, parentSection, childSection])

    expect(md).toContain("### Subsection")
    expect(md).not.toMatch(/^## Subsection/m)
    expect(md).not.toMatch(/^# Subsection/m)
  })
})
