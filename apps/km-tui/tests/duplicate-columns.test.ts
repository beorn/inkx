/**
 * Column Derivation Tests
 *
 * Tests for deriveColumnsFromRepo:
 * - Deduplication of columns with same fs_path
 * - Markdown file sections produce multiple columns when zoomed in
 */

import { describe, test, expect } from "vitest"
import { createFakeRepo } from "@km/storage"
import type { KNode } from "@km/core"
import { deriveColumnsFromRepo } from "../src/hooks/use-columns.ts"

function makeNode(overrides: Partial<KNode> & { id: string; type: string }): KNode {
  return {
    parent_id: null,
    parent_idx: 0,
    content: "",
    data: {},
    embed_source: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
    ...overrides,
  } as KNode
}

describe("duplicate column deduplication", () => {
  test("deduplicates columns with same fs_path, keeping the one with children", () => {
    // Simulate the Asana import bug: two oi nodes for @next.md,
    // one with children (populated) and one empty
    const root = makeNode({ id: "root", type: "h", item: true, fstype: "repo", parent_id: null })
    const nextPopulated = makeNode({
      id: "next-1",
      type: "h",
      item: true,
      fstype: "mdfile",
      parent_id: "root",
      parent_idx: 0,
      title: "Next Actions",
      fs_path: "@next.md",
      name: "@next",
    })
    const nextEmpty = makeNode({
      id: "next-2",
      type: "h",
      item: true,
      fstype: "mdfile",
      parent_id: "root",
      parent_idx: 1,
      title: "Next Actions",
      fs_path: "@next.md",
      name: "@next",
    })
    const task1 = makeNode({
      id: "task-1",
      type: "p",
      item: true,
      parent_id: "next-1",
      parent_idx: 0,
      content: "Do something",
    })
    const task2 = makeNode({
      id: "task-2",
      type: "p",
      item: true,
      parent_id: "next-1",
      parent_idx: 1,
      content: "Do something else",
    })
    const otherCol = makeNode({
      id: "other-col",
      type: "h",
      item: true,
      fstype: "mdfile",
      parent_id: "root",
      parent_idx: 2,
      title: "Other",
      fs_path: "other.md",
      name: "other",
    })

    const repo = createFakeRepo({
      nodes: [root, nextPopulated, nextEmpty, task1, task2, otherCol],
    })

    const columns = deriveColumnsFromRepo(repo, "root", new Map())

    // Should produce 2 columns (Next Actions + Other), NOT 3
    expect(columns.length).toBe(2)
    // The surviving column should be the populated one
    expect(columns[0]!.node.id).toBe("next-1")
    expect(columns[0]!.cardNodes.length).toBe(2)
    expect(columns[1]!.node.id).toBe("other-col")
  })

  test("deduplicates when empty column comes first", () => {
    const root = makeNode({ id: "root", type: "h", item: true, fstype: "repo", parent_id: null })
    const nextEmpty = makeNode({
      id: "next-empty",
      type: "h",
      item: true,
      fstype: "mdfile",
      parent_id: "root",
      parent_idx: 0,
      title: "Next Actions",
      fs_path: "@next.md",
      name: "@next",
    })
    const nextPopulated = makeNode({
      id: "next-pop",
      type: "h",
      item: true,
      fstype: "mdfile",
      parent_id: "root",
      parent_idx: 1,
      title: "Next Actions",
      fs_path: "@next.md",
      name: "@next",
    })
    const task = makeNode({
      id: "task-1",
      type: "p",
      item: true,
      parent_id: "next-pop",
      parent_idx: 0,
      content: "Task",
    })

    const repo = createFakeRepo({
      nodes: [root, nextEmpty, nextPopulated, task],
    })

    const columns = deriveColumnsFromRepo(repo, "root", new Map())

    expect(columns.length).toBe(1)
    // Should keep the populated one regardless of order
    expect(columns[0]!.node.id).toBe("next-pop")
    expect(columns[0]!.cardNodes.length).toBe(1)
  })

  test("does not deduplicate nodes without fs_path", () => {
    const root = makeNode({ id: "root", type: "h", item: true, fstype: "repo", parent_id: null })
    const col1 = makeNode({
      id: "col-1",
      type: "h",
      item: true,
      fstype: "mdsection",
      parent_id: "root",
      parent_idx: 0,
      title: "Section A",
    })
    const col2 = makeNode({
      id: "col-2",
      type: "h",
      item: true,
      fstype: "mdsection",
      parent_id: "root",
      parent_idx: 1,
      title: "Section A",
    })

    const repo = createFakeRepo({
      nodes: [root, col1, col2],
    })

    const columns = deriveColumnsFromRepo(repo, "root", new Map())

    // Both should remain — same title but no fs_path, so not duplicates
    expect(columns.length).toBe(2)
  })
})

// Index file expansion tests removed — folder+file merge needs deeper design.
// See bead km-storage.folder-file-merge for the design discussion.

describe("markdown file columns", () => {
  test("zooming into an md file with H2 sections produces multiple columns", () => {
    // Simulate an md file (mdfile) with H2 sections (mdsection) as children.
    // When zoomed into the md file, each section should become a column.
    const mdFile = makeNode({
      id: "early-orbit",
      type: "h",
      item: true,
      fstype: "mdfile",
      parent_id: "root",
      parent_idx: 0,
      title: "Early Orbit",
      fs_path: "early-orbit.md",
      name: "early-orbit",
    })
    const section1 = makeNode({
      id: "overview",
      type: "h",
      item: true,
      fstype: "mdsection",
      parent_id: "early-orbit",
      parent_idx: 0,
      content: "Overview & Inbox",
      title: "Overview & Inbox",
    })
    const section2 = makeNode({
      id: "milestones",
      type: "h",
      item: true,
      fstype: "mdsection",
      parent_id: "early-orbit",
      parent_idx: 1,
      content: "MAPLE Milestones",
      title: "MAPLE Milestones",
    })
    const section3 = makeNode({
      id: "program",
      type: "h",
      item: true,
      fstype: "mdsection",
      parent_id: "early-orbit",
      parent_idx: 2,
      content: "MAPLE Program",
      title: "MAPLE Program",
    })
    // Tasks inside sections (become cards in each column)
    const task1 = makeNode({
      id: "task-1",
      type: "h",
      item: true,
      fstype: "mdsection",
      parent_id: "overview",
      parent_idx: 0,
      content: "Prepare immigration questions",
    })
    const task2 = makeNode({
      id: "task-2",
      type: "h",
      item: true,
      fstype: "mdsection",
      parent_id: "milestones",
      parent_idx: 0,
      content: "Company incorporated",
    })

    const repo = createFakeRepo({
      nodes: [mdFile, section1, section2, section3, task1, task2],
    })

    // Zooming into the md file means rootId = "early-orbit"
    const columns = deriveColumnsFromRepo(repo, "early-orbit", new Map())

    // Should produce 3 columns (one per H2 section), NOT 1
    expect(columns.length).toBe(3)
    expect(columns[0]!.node.id).toBe("overview")
    expect(columns[0]!.cardNodes.length).toBe(1) // task-1
    expect(columns[1]!.node.id).toBe("milestones")
    expect(columns[1]!.cardNodes.length).toBe(1) // task-2
    expect(columns[2]!.node.id).toBe("program")
    expect(columns[2]!.cardNodes.length).toBe(0) // no tasks
  })

  test("md file with body content before sections gets body + section columns", () => {
    // Some md files have leading paragraphs before the first heading
    const mdFile = makeNode({
      id: "notes",
      type: "h",
      item: true,
      fstype: "mdfile",
      parent_id: "root",
      parent_idx: 0,
      title: "Notes",
      fs_path: "notes.md",
    })
    const bodyParagraph = makeNode({
      id: "body-p",
      type: "p",
      parent_id: "notes",
      parent_idx: 0,
      content: "This file contains important notes.",
    })
    const section1 = makeNode({
      id: "sec-1",
      type: "h",
      item: true,
      fstype: "mdsection",
      parent_id: "notes",
      parent_idx: 1,
      content: "Section A",
      title: "Section A",
    })
    const section2 = makeNode({
      id: "sec-2",
      type: "h",
      item: true,
      fstype: "mdsection",
      parent_id: "notes",
      parent_idx: 2,
      content: "Section B",
      title: "Section B",
    })

    const repo = createFakeRepo({
      nodes: [mdFile, bodyParagraph, section1, section2],
    })

    const columns = deriveColumnsFromRepo(repo, "notes", new Map())

    // Should produce 3: virtual body column + 2 section columns
    expect(columns.length).toBe(3)
    expect(columns[0]!.isVirtual).toBe(true) // body column
    expect(columns[0]!.cardNodes.length).toBe(1) // the paragraph
    expect(columns[1]!.node.id).toBe("sec-1")
    expect(columns[2]!.node.id).toBe("sec-2")
  })
})
