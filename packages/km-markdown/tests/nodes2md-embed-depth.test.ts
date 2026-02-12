/**
 * Embed Depth Bug Tests
 *
 * When handleAddNodeAfter creates a section node as a sibling of embed nodes
 * (paragraphs with link_to), the section defaults to depth=2 because embeds
 * have no data.depth for the TUI to infer from. If the parent section is also
 * depth=2, serialization produces a ## heading that the parser interprets as
 * a SIBLING rather than a CHILD -- breaking the tree structure on re-parse.
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
      type: "file",
      fs_path: "/repo/File1.md",
      content: "File1",
      block_id: "abc",
    }),
    makeTestNode({
      id: "target-2",
      type: "file",
      fs_path: "/repo/File2.md",
      content: "File2",
      block_id: "def",
    }),
    makeTestNode({
      id: "target-3",
      type: "file",
      fs_path: "/repo/File3.md",
      content: "File3",
      block_id: "ghi",
    }),
  ]

  test("section created among embeds gets correct depth in round-trip", () => {
    // Simulate the correct scenario: inner section has depth=3 (child of depth=2 parent)
    const fileNode = makeTestNode({
      id: "file-1",
      type: "file",
      parent_id: ".",
      content: "Next Actions",
      data: { depth: 1 },
      fs_path: "/repo/next-actions.md",
    })
    const processingSection = makeTestNode({
      id: "sec-processing",
      type: "section",
      parent_id: "file-1",
      parent_idx: 1,
      content: "Processing",
      title: "Processing",
      data: { depth: 2 },
    })
    const embed1 = makeTestNode({
      id: "embed-1",
      type: "paragraph",
      parent_id: "sec-processing",
      parent_idx: 1,
      link_to: "target-1",
      content: "![[File1#^abc]]",
    })
    const embed2 = makeTestNode({
      id: "embed-2",
      type: "paragraph",
      parent_id: "sec-processing",
      parent_idx: 2,
      link_to: "target-2",
      content: "![[File2#^def]]",
    })
    // CORRECT depth: 3 means this is a child of "Processing" (depth=2)
    const innerSection = makeTestNode({
      id: "sec-inner",
      type: "section",
      parent_id: "sec-processing",
      parent_idx: 3,
      content: "",
      title: "",
      data: { depth: 3 },
    })
    const embed3 = makeTestNode({
      id: "embed-3",
      type: "paragraph",
      parent_id: "sec-processing",
      parent_idx: 4,
      link_to: "target-3",
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
    const sections = result.nodes.filter((n) => n.type === "section")

    // "Processing" should be a section
    const processing = sections.find((s) => s.content === "Processing")
    expect(processing).toBeDefined()

    // The empty/inner section should be a CHILD of Processing, not a sibling
    const innerSections = sections.filter((s) => s.content !== "Processing")
    expect(innerSections.length).toBeGreaterThanOrEqual(1)

    const reparsedInner = innerSections[0]!
    expect(reparsedInner.parent_id).toBe(processing!.id)
  })

  test("section with depth=2 among depth=2 children BREAKS round-trip (documents the bug)", () => {
    // Simulate the bug: inner section has depth=2 (same as parent) due to missing depth
    const fileNode = makeTestNode({
      id: "file-1",
      type: "file",
      parent_id: ".",
      content: "Next Actions",
      data: { depth: 1 },
      fs_path: "/repo/next-actions.md",
    })
    const processingSection = makeTestNode({
      id: "sec-processing",
      type: "section",
      parent_id: "file-1",
      parent_idx: 1,
      content: "Processing",
      title: "Processing",
      data: { depth: 2 },
    })
    const embed1 = makeTestNode({
      id: "embed-1",
      type: "paragraph",
      parent_id: "sec-processing",
      parent_idx: 1,
      link_to: "target-1",
      content: "![[File1#^abc]]",
    })
    const embed2 = makeTestNode({
      id: "embed-2",
      type: "paragraph",
      parent_id: "sec-processing",
      parent_idx: 2,
      link_to: "target-2",
      content: "![[File2#^def]]",
    })
    // BUGGY depth: 2 (same as parent) — simulates what happens when
    // handleAddNodeAfter creates a section with no depth info from embed siblings
    const innerSection = makeTestNode({
      id: "sec-inner",
      type: "section",
      parent_id: "sec-processing",
      parent_idx: 3,
      content: "",
      title: "",
      data: { depth: 2 },
    })
    const embed3 = makeTestNode({
      id: "embed-3",
      type: "paragraph",
      parent_id: "sec-processing",
      parent_idx: 4,
      link_to: "target-3",
      content: "![[File3#^ghi]]",
    })

    const allNodes = [fileNode, processingSection, embed1, embed2, innerSection, embed3]
    const lookupNodes = [...allNodes, ...targetNodes]

    // Serialize — the inner section comes out as ## (depth 2)
    const md = nodesToMarkdown(allNodes, lookupNodes)

    // Both "Processing" and the inner section are ## headings
    const h2Matches = md.match(/^## /gm) ?? []
    expect(h2Matches.length).toBe(2) // Both are ## — this is the bug in serialization

    // Re-parse: parser sees two ## headings and makes them siblings under file
    const result = parseMarkdownWithLinks(md, "next-actions.md")
    const sections = result.nodes.filter((n) => n.type === "section")

    const processing = sections.find((s) => s.content === "Processing")
    expect(processing).toBeDefined()

    const fileId = result.nodes.find((n) => n.type === "file")!.id
    const innerSections = sections.filter((s) => s.content !== "Processing")
    expect(innerSections.length).toBeGreaterThanOrEqual(1)

    // BUG: The inner section becomes a sibling of Processing (parent = file)
    // instead of a child of Processing (parent = processing section)
    const reparsedInner = innerSections[0]!
    expect(reparsedInner.parent_id).toBe(fileId) // Sibling — broken tree structure
    expect(reparsedInner.parent_id).not.toBe(processing!.id) // NOT a child — that's the bug
  })

  test("nodes2md serializes depth=3 section as ### heading", () => {
    const fileNode = makeTestNode({
      id: "file-1",
      type: "file",
      parent_id: ".",
      content: "Document",
      data: { depth: 1 },
    })
    const section = makeTestNode({
      id: "sec-1",
      type: "section",
      parent_id: "file-1",
      parent_idx: 1,
      content: "Subsection",
      data: { depth: 3 },
    })

    const md = nodesToMarkdown([fileNode, section])

    expect(md).toContain("### Subsection")
    expect(md).not.toMatch(/^## Subsection/m)
    expect(md).not.toMatch(/^# Subsection/m)
  })
})
