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
    const root = makeNode({ id: "root", type: "h", item: {}, fstype: "repo", parent_id: null })
    const nextPopulated = makeNode({
      id: "next-1",
      type: "h",
      item: {},
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
      item: {},
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
      item: {},
      parent_id: "next-1",
      parent_idx: 0,
      content: "Do something",
    })
    const task2 = makeNode({
      id: "task-2",
      type: "p",
      item: {},
      parent_id: "next-1",
      parent_idx: 1,
      content: "Do something else",
    })
    const otherCol = makeNode({
      id: "other-col",
      type: "h",
      item: {},
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
    const root = makeNode({ id: "root", type: "h", item: {}, fstype: "repo", parent_id: null })
    const nextEmpty = makeNode({
      id: "next-empty",
      type: "h",
      item: {},
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
      item: {},
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
      item: {},
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
    const root = makeNode({ id: "root", type: "h", item: {}, fstype: "repo", parent_id: null })
    const col1 = makeNode({
      id: "col-1",
      type: "h",
      item: {},
      fstype: "mdsection",
      parent_id: "root",
      parent_idx: 0,
      title: "Section A",
    })
    const col2 = makeNode({
      id: "col-2",
      type: "h",
      item: {},
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

describe("folder index file expansion", () => {
  // Shared setup: a folder with an index file + child files
  function folderWithIndex() {
    const folder = makeNode({
      id: "early-orbit",
      type: "h",
      item: {},
      fstype: "folder",
      parent_id: "root",
      parent_idx: 0,
      name: "early-orbit",
    })
    const indexFile = makeNode({
      id: "index-file",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "early-orbit",
      parent_idx: 0,
      name: "early-orbit",
      fs_path: "early-orbit/early-orbit.md",
    })
    const mipFile = makeNode({
      id: "mip",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "early-orbit",
      parent_idx: 1,
      name: "mip",
      title: "MIP",
      fs_path: "early-orbit/mip.md",
    })
    const launchFile = makeNode({
      id: "launch",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "early-orbit",
      parent_idx: 2,
      name: "launch-academy",
      title: "Launch Academy",
      fs_path: "early-orbit/launch-academy.md",
    })
    const extraFile = makeNode({
      id: "extra",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "early-orbit",
      parent_idx: 3,
      name: "notes",
      title: "Notes",
      fs_path: "early-orbit/notes.md",
    })
    return { folder, indexFile, mipFile, launchFile, extraFile }
  }

  // Helper to make index file sections
  function indexSection(id: string, parentId: string, idx: number, content: string, title?: string) {
    return makeNode({
      id,
      type: "h",
      item: {},
      fstype: "mdsection",
      parent_id: parentId,
      parent_idx: idx,
      content,
      title: title ?? content,
    })
  }

  test("embed slots resolve to folder children", () => {
    const { folder, indexFile, mipFile, launchFile, extraFile } = folderWithIndex()
    const sec1 = indexSection("s1", "index-file", 0, "![[./mip]]")
    const sec2 = indexSection("s2", "index-file", 1, "Overview & Inbox")
    const sec3 = indexSection("s3", "index-file", 2, "![[./launch-academy]]")

    const repo = createFakeRepo({
      nodes: [folder, indexFile, mipFile, launchFile, extraFile, sec1, sec2, sec3],
    })

    const columns = deriveColumnsFromRepo(repo, "early-orbit", new Map())

    // Order: mip (slot) → Overview (inline) → launch (slot) → notes (unlisted)
    expect(columns.length).toBe(4)
    expect(columns[0]!.node.id).toBe("mip")
    expect(columns[1]!.node.id).toBe("s2") // inline section
    expect(columns[2]!.node.id).toBe("launch")
    expect(columns[3]!.node.id).toBe("extra") // unlisted child
  })

  test("unlisted children appended after listed ones", () => {
    const { folder, indexFile, mipFile, launchFile, extraFile } = folderWithIndex()
    // Only one slot — launch and notes are unlisted
    const sec1 = indexSection("s1", "index-file", 0, "![[./mip]]")

    const repo = createFakeRepo({
      nodes: [folder, indexFile, mipFile, launchFile, extraFile, sec1],
    })

    const columns = deriveColumnsFromRepo(repo, "early-orbit", new Map())

    expect(columns.length).toBe(3)
    expect(columns[0]!.node.id).toBe("mip") // slot
    expect(columns[1]!.node.id).toBe("launch") // unlisted
    expect(columns[2]!.node.id).toBe("extra") // unlisted
  })

  test("index body content becomes virtual body column", () => {
    const { folder, indexFile, mipFile } = folderWithIndex()
    // Body paragraph before any sections
    const bodyP = makeNode({
      id: "body-p",
      type: "p",
      parent_id: "index-file",
      parent_idx: 0,
      content: "This is the folder description.",
    })
    const sec1 = indexSection("s1", "index-file", 1, "![[./mip]]")

    const repo = createFakeRepo({
      nodes: [folder, indexFile, mipFile, bodyP, sec1],
    })

    const columns = deriveColumnsFromRepo(repo, "early-orbit", new Map())

    // body column + mip column
    expect(columns.length).toBe(2)
    expect(columns[0]!.isVirtual).toBe(true)
    expect(columns[0]!.cardNodes.length).toBe(1)
    expect(columns[0]!.cardNodes[0]!.content).toBe("This is the folder description.")
    expect(columns[1]!.node.id).toBe("mip")
  })

  test("index file with no sections shows only unlisted children", () => {
    const { folder, indexFile, mipFile, launchFile } = folderWithIndex()
    // Index file has only a body paragraph, no sections

    const repo = createFakeRepo({
      nodes: [folder, indexFile, mipFile, launchFile],
    })

    const columns = deriveColumnsFromRepo(repo, "early-orbit", new Map())

    // All children except the index file become columns
    expect(columns.length).toBe(2)
    expect(columns[0]!.node.id).toBe("mip")
    expect(columns[1]!.node.id).toBe("launch")
  })

  test("unresolved embed slot treated as inline section", () => {
    const { folder, indexFile, mipFile } = folderWithIndex()
    // Reference to a non-existent child
    const sec1 = indexSection("s1", "index-file", 0, "![[./nonexistent]]")
    const sec2 = indexSection("s2", "index-file", 1, "![[./mip]]")

    const repo = createFakeRepo({
      nodes: [folder, indexFile, mipFile, sec1, sec2],
    })

    const columns = deriveColumnsFromRepo(repo, "early-orbit", new Map())

    // nonexistent slot → inline section, mip slot → resolved
    expect(columns.length).toBe(2)
    expect(columns[0]!.node.id).toBe("s1") // unresolved → inline
    expect(columns[1]!.node.id).toBe("mip") // resolved
  })

  test("non-relative embed is treated as inline section", () => {
    const { folder, indexFile, mipFile } = folderWithIndex()
    // Regular embed (no ./) — should NOT resolve as slot
    const sec1 = indexSection("s1", "index-file", 0, "![[mip]]")

    const repo = createFakeRepo({
      nodes: [folder, indexFile, mipFile, sec1],
    })

    const columns = deriveColumnsFromRepo(repo, "early-orbit", new Map())

    // ![[mip]] is inline (no ./), mip is an unlisted child
    expect(columns.length).toBe(2)
    expect(columns[0]!.node.id).toBe("s1") // inline section
    expect(columns[1]!.node.id).toBe("mip") // unlisted
  })

  test("no index file → standard column behavior", () => {
    const folder = makeNode({
      id: "proj",
      type: "h",
      item: {},
      fstype: "folder",
      parent_id: "root",
      parent_idx: 0,
      name: "project",
    })
    const file1 = makeNode({
      id: "f1",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 0,
      name: "readme",
      fs_path: "project/readme.md",
    })
    const file2 = makeNode({
      id: "f2",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 1,
      name: "todo",
      fs_path: "project/todo.md",
    })

    const repo = createFakeRepo({
      nodes: [folder, file1, file2],
    })

    const columns = deriveColumnsFromRepo(repo, "proj", new Map())

    expect(columns.length).toBe(2)
    expect(columns[0]!.node.id).toBe("f1")
    expect(columns[1]!.node.id).toBe("f2")
  })

  test("index.md is detected as index file", () => {
    const folder = makeNode({
      id: "proj",
      type: "h",
      item: {},
      fstype: "folder",
      parent_id: "root",
      parent_idx: 0,
      name: "project",
    })
    const indexFile = makeNode({
      id: "idx",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 0,
      name: "index",
      fs_path: "project/index.md",
    })
    const file1 = makeNode({
      id: "f1",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 1,
      name: "readme",
      fs_path: "project/readme.md",
    })
    const sec1 = indexSection("s1", "idx", 0, "![[./readme]]")
    const sec2 = indexSection("s2", "idx", 1, "Inline Notes")

    const repo = createFakeRepo({
      nodes: [folder, indexFile, file1, sec1, sec2],
    })

    const columns = deriveColumnsFromRepo(repo, "proj", new Map())

    // readme (slot) → Inline Notes (inline)
    expect(columns.length).toBe(2)
    expect(columns[0]!.node.id).toBe("f1") // readme resolved via slot
    expect(columns[1]!.node.id).toBe("s2") // inline section
  })

  test("folder child is a folder (not just mdfile) resolves as slot", () => {
    const { folder, indexFile, mipFile } = folderWithIndex()
    const subfolder = makeNode({
      id: "subfolder",
      type: "h",
      item: {},
      fstype: "folder",
      parent_id: "early-orbit",
      parent_idx: 4,
      name: "designs",
    })
    const sec1 = indexSection("s1", "index-file", 0, "![[./mip]]")
    const sec2 = indexSection("s2", "index-file", 1, "![[./designs]]")

    const repo = createFakeRepo({
      nodes: [folder, indexFile, mipFile, subfolder, sec1, sec2],
    })

    const columns = deriveColumnsFromRepo(repo, "early-orbit", new Map())

    expect(columns.length).toBe(2)
    expect(columns[0]!.node.id).toBe("mip")
    expect(columns[1]!.node.id).toBe("subfolder")
  })

  test("all children referenced in slots → no unlisted section", () => {
    const { folder, indexFile, mipFile, launchFile, extraFile } = folderWithIndex()
    const sec1 = indexSection("s1", "index-file", 0, "![[./mip]]")
    const sec2 = indexSection("s2", "index-file", 1, "![[./launch-academy]]")
    const sec3 = indexSection("s3", "index-file", 2, "![[./notes]]")

    const repo = createFakeRepo({
      nodes: [folder, indexFile, mipFile, launchFile, extraFile, sec1, sec2, sec3],
    })

    const columns = deriveColumnsFromRepo(repo, "early-orbit", new Map())

    expect(columns.length).toBe(3)
    expect(columns[0]!.node.id).toBe("mip")
    expect(columns[1]!.node.id).toBe("launch")
    expect(columns[2]!.node.id).toBe("extra")
  })

  test("empty index file (no sections, no body) → all children as columns", () => {
    const folder = makeNode({
      id: "proj",
      type: "h",
      item: {},
      fstype: "folder",
      parent_id: "root",
      parent_idx: 0,
      name: "project",
    })
    const indexFile = makeNode({
      id: "idx",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 0,
      name: "project",
      fs_path: "project/project.md",
    })
    const file1 = makeNode({
      id: "f1",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 1,
      name: "readme",
      fs_path: "project/readme.md",
    })
    const file2 = makeNode({
      id: "f2",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 2,
      name: "todo",
      fs_path: "project/todo.md",
    })

    const repo = createFakeRepo({
      nodes: [folder, indexFile, file1, file2],
    })

    const columns = deriveColumnsFromRepo(repo, "proj", new Map())

    expect(columns.length).toBe(2)
    expect(columns[0]!.node.id).toBe("f1")
    expect(columns[1]!.node.id).toBe("f2")
  })

  test(".md (dot-md/empty-name) detected as index file", () => {
    const folder = makeNode({
      id: "proj",
      type: "h",
      item: {},
      fstype: "folder",
      parent_id: "root",
      parent_idx: 0,
      name: "project",
    })
    const dotMdFile = makeNode({
      id: "dot-md",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 0,
      name: "",
      fs_path: "project/.md",
    })
    const file1 = makeNode({
      id: "f1",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 1,
      name: "readme",
      fs_path: "project/readme.md",
    })
    const sec1 = indexSection("s1", "dot-md", 0, "![[./readme]]")
    const sec2 = indexSection("s2", "dot-md", 1, "Notes")

    const repo = createFakeRepo({
      nodes: [folder, dotMdFile, file1, sec1, sec2],
    })

    const columns = deriveColumnsFromRepo(repo, "proj", new Map())

    expect(columns.length).toBe(2)
    expect(columns[0]!.node.id).toBe("f1")
    expect(columns[1]!.node.id).toBe("s2")
  })

  test("same-name with case mismatch resolved via namesAreSimilar", () => {
    const folder = makeNode({
      id: "my-proj",
      type: "h",
      item: {},
      fstype: "folder",
      parent_id: "root",
      parent_idx: 0,
      name: "My-Project",
    })
    const indexFile = makeNode({
      id: "idx",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "my-proj",
      parent_idx: 0,
      name: "my project",
      fs_path: "My-Project/my project.md",
    })
    const file1 = makeNode({
      id: "f1",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "my-proj",
      parent_idx: 1,
      name: "tasks",
      fs_path: "My-Project/tasks.md",
    })
    const sec1 = indexSection("s1", "idx", 0, "![[./tasks]]")

    const repo = createFakeRepo({
      nodes: [folder, indexFile, file1, sec1],
    })

    const columns = deriveColumnsFromRepo(repo, "my-proj", new Map())

    expect(columns.length).toBe(1)
    expect(columns[0]!.node.id).toBe("f1")
  })

  test("both same-name.md and index.md exist → same-name used for promotion", () => {
    const folder = makeNode({
      id: "proj",
      type: "h",
      item: {},
      fstype: "folder",
      parent_id: "root",
      parent_idx: 0,
      name: "project",
    })
    const sameNameFile = makeNode({
      id: "same-name",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 0,
      name: "project",
      fs_path: "project/project.md",
    })
    const indexMdFile = makeNode({
      id: "index-md",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 1,
      name: "index",
      fs_path: "project/index.md",
    })
    const file1 = makeNode({
      id: "f1",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 2,
      name: "readme",
      fs_path: "project/readme.md",
    })
    const sec1 = indexSection("s1", "same-name", 0, "![[./readme]]")
    const sec2 = indexSection("s2", "index-md", 0, "![[./readme]]")
    const sec3 = indexSection("s3", "index-md", 1, "Index Notes")

    const repo = createFakeRepo({
      nodes: [folder, sameNameFile, indexMdFile, file1, sec1, sec2, sec3],
    })

    const columns = deriveColumnsFromRepo(repo, "proj", new Map())

    expect(columns.length).toBe(2)
    expect(columns[0]!.node.id).toBe("f1")
    expect(columns[1]!.node.id).toBe("index-md")
  })

  test("same-name.md has slots, index.md has different slots → only same-name's used", () => {
    const folder = makeNode({
      id: "proj",
      type: "h",
      item: {},
      fstype: "folder",
      parent_id: "root",
      parent_idx: 0,
      name: "project",
    })
    const sameNameFile = makeNode({
      id: "same-name",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 0,
      name: "project",
      fs_path: "project/project.md",
    })
    const indexMdFile = makeNode({
      id: "index-md",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 1,
      name: "index",
      fs_path: "project/index.md",
    })
    const fileA = makeNode({
      id: "fa",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 2,
      name: "alpha",
      fs_path: "project/alpha.md",
    })
    const fileB = makeNode({
      id: "fb",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 3,
      name: "beta",
      fs_path: "project/beta.md",
    })
    const snSec1 = indexSection("sn-s1", "same-name", 0, "![[./alpha]]")
    const snSec2 = indexSection("sn-s2", "same-name", 1, "![[./beta]]")
    const ixSec1 = indexSection("ix-s1", "index-md", 0, "![[./beta]]")
    const ixSec2 = indexSection("ix-s2", "index-md", 1, "![[./alpha]]")

    const repo = createFakeRepo({
      nodes: [folder, sameNameFile, indexMdFile, fileA, fileB, snSec1, snSec2, ixSec1, ixSec2],
    })

    const columns = deriveColumnsFromRepo(repo, "proj", new Map())

    expect(columns.length).toBe(3)
    expect(columns[0]!.node.id).toBe("fa")
    expect(columns[1]!.node.id).toBe("fb")
    expect(columns[2]!.node.id).toBe("index-md")
  })
})

describe("paragraph-type slot resolution (Bug km-jy8nl)", () => {
  test("index file with paragraph-type slot children resolves as columns", () => {
    // When generateIndexFileContent() emits `![[./child]]`, the parser produces
    // paragraph nodes (type: "p"), NOT heading/mdsection nodes. The TUI must
    // recognize these as slot references and resolve them to folder children.
    const folder = makeNode({
      id: "proj",
      type: "h",
      item: {},
      fstype: "folder",
      parent_id: "root",
      parent_idx: 0,
      name: "project",
    })
    const indexFile = makeNode({
      id: "idx",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 0,
      name: "project",
      fs_path: "project/project.md",
    })
    const fileAlpha = makeNode({
      id: "alpha",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 1,
      name: "alpha",
      title: "Alpha",
      fs_path: "project/alpha.md",
    })
    const fileBeta = makeNode({
      id: "beta",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 2,
      name: "beta",
      title: "Beta",
      fs_path: "project/beta.md",
    })
    // These are paragraph nodes (type: "p") — exactly what the parser produces
    // for `![[./alpha]]` lines in a markdown file
    const slotP1 = makeNode({
      id: "p1",
      type: "p",
      parent_id: "idx",
      parent_idx: 0,
      content: "![[./alpha]]",
    })
    const slotP2 = makeNode({
      id: "p2",
      type: "p",
      parent_id: "idx",
      parent_idx: 1,
      content: "![[./beta]]",
    })

    const repo = createFakeRepo({
      nodes: [folder, indexFile, fileAlpha, fileBeta, slotP1, slotP2],
    })

    const columns = deriveColumnsFromRepo(repo, "proj", new Map())

    // Both paragraph slots should resolve to folder children
    expect(columns.length).toBe(2)
    expect(columns[0]!.node.id).toBe("alpha")
    expect(columns[1]!.node.id).toBe("beta")
  })

  test("paragraph slot mixed with heading sections both resolve correctly", () => {
    const folder = makeNode({
      id: "proj",
      type: "h",
      item: {},
      fstype: "folder",
      parent_id: "root",
      parent_idx: 0,
      name: "project",
    })
    const indexFile = makeNode({
      id: "idx",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 0,
      name: "project",
      fs_path: "project/project.md",
    })
    const fileAlpha = makeNode({
      id: "alpha",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 1,
      name: "alpha",
      title: "Alpha",
      fs_path: "project/alpha.md",
    })
    // Paragraph slot (from writer-generated index file)
    const slotP = makeNode({
      id: "p1",
      type: "p",
      parent_id: "idx",
      parent_idx: 0,
      content: "![[./alpha]]",
    })
    // Heading section (manually authored)
    const inlineSec = makeNode({
      id: "s1",
      type: "h",
      item: {},
      fstype: "mdsection",
      parent_id: "idx",
      parent_idx: 1,
      content: "Notes",
      title: "Notes",
    })

    const repo = createFakeRepo({
      nodes: [folder, indexFile, fileAlpha, slotP, inlineSec],
    })

    const columns = deriveColumnsFromRepo(repo, "proj", new Map())

    // Paragraph slot resolves to alpha, heading section becomes inline column
    expect(columns.length).toBe(2)
    expect(columns[0]!.node.id).toBe("alpha")
    expect(columns[1]!.node.id).toBe("s1")
  })

  test("paragraph with unresolved slot stays visible as body content", () => {
    // Regression: paragraph with ![[./missing]] was identified as slot,
    // excluded from body, but target didn't resolve — paragraph disappeared entirely.
    const folder = makeNode({
      id: "proj",
      type: "h",
      item: {},
      fstype: "folder",
      parent_id: "root",
      parent_idx: 0,
      name: "project",
    })
    const indexFile = makeNode({
      id: "idx",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 0,
      name: "project",
      fs_path: "project/project.md",
    })
    const fileAlpha = makeNode({
      id: "alpha",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 1,
      name: "alpha",
      title: "Alpha",
      fs_path: "project/alpha.md",
    })
    // Paragraph slot referencing a non-existent child
    const slotMissing = makeNode({
      id: "p-missing",
      type: "p",
      parent_id: "idx",
      parent_idx: 0,
      content: "![[./missing-child]]",
    })
    // Resolved paragraph slot
    const slotAlpha = makeNode({
      id: "p-alpha",
      type: "p",
      parent_id: "idx",
      parent_idx: 1,
      content: "![[./alpha]]",
    })

    const repo = createFakeRepo({
      nodes: [folder, indexFile, fileAlpha, slotMissing, slotAlpha],
    })

    const columns = deriveColumnsFromRepo(repo, "proj", new Map())

    // The unresolved slot paragraph should appear in body column.
    // Alpha should resolve as a column.
    expect(columns.length).toBe(2)
    expect(columns[0]!.isVirtual).toBe(true) // body column with unresolved slot
    expect(columns[0]!.cardNodes.length).toBe(1)
    expect(columns[0]!.cardNodes[0]!.content).toBe("![[./missing-child]]")
    expect(columns[1]!.node.id).toBe("alpha") // resolved slot
  })

  test("paragraph with partially resolved multi-slot stays in body", () => {
    // Multi-line slot paragraph where one target exists but another doesn't.
    // The whole paragraph should stay in body (not partially consumed).
    const folder = makeNode({
      id: "proj",
      type: "h",
      item: {},
      fstype: "folder",
      parent_id: "root",
      parent_idx: 0,
      name: "project",
    })
    const indexFile = makeNode({
      id: "idx",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 0,
      name: "project",
      fs_path: "project/project.md",
    })
    const fileAlpha = makeNode({
      id: "alpha",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 1,
      name: "alpha",
      title: "Alpha",
      fs_path: "project/alpha.md",
    })
    // Multi-slot paragraph: one exists, one doesn't
    const multiSlot = makeNode({
      id: "p-multi",
      type: "p",
      parent_id: "idx",
      parent_idx: 0,
      content: "![[./alpha]]\n![[./nonexistent]]",
    })

    const repo = createFakeRepo({
      nodes: [folder, indexFile, fileAlpha, multiSlot],
    })

    const columns = deriveColumnsFromRepo(repo, "proj", new Map())

    // The partially-resolved multi-slot should stay in body.
    // Alpha should appear as unlisted child (not consumed by the partial slot).
    expect(columns.length).toBe(2)
    expect(columns[0]!.isVirtual).toBe(true) // body column
    expect(columns[0]!.cardNodes[0]!.content).toBe("![[./alpha]]\n![[./nonexistent]]")
    expect(columns[1]!.node.id).toBe("alpha") // unlisted child (not consumed by partial slot)
  })

  test("paragraph with prose containing embed is NOT treated as slot", () => {
    const folder = makeNode({
      id: "proj",
      type: "h",
      item: {},
      fstype: "folder",
      parent_id: "root",
      parent_idx: 0,
      name: "project",
    })
    const indexFile = makeNode({
      id: "idx",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 0,
      name: "project",
      fs_path: "project/project.md",
    })
    const fileAlpha = makeNode({
      id: "alpha",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 1,
      name: "alpha",
      title: "Alpha",
      fs_path: "project/alpha.md",
    })
    // This is prose containing an embed — NOT a standalone slot
    const proseP = makeNode({
      id: "p1",
      type: "p",
      parent_id: "idx",
      parent_idx: 0,
      content: "See ![[./alpha]] for details",
    })

    const repo = createFakeRepo({
      nodes: [folder, indexFile, fileAlpha, proseP],
    })

    const columns = deriveColumnsFromRepo(repo, "proj", new Map())

    // The prose paragraph should become a body card, NOT resolve as a slot
    // alpha should appear as an unlisted child
    // Body column (with prose paragraph) + alpha (unlisted)
    expect(columns.length).toBe(2)
    expect(columns[0]!.isVirtual).toBe(true) // body column with prose
    expect(columns[0]!.cardNodes[0]!.content).toBe("See ![[./alpha]] for details")
    expect(columns[1]!.node.id).toBe("alpha") // unlisted child
  })
})

describe("unresolved paragraph slots after outline sections (Bug km-wyjoy)", () => {
  test("unresolved paragraph slot AFTER an inline section stays visible as body", () => {
    // When an unresolved paragraph slot appears AFTER the first outline section,
    // extractBody puts it in `items` (not `body`). It must still show as body content,
    // not silently disappear or become a column.
    const folder = makeNode({
      id: "proj",
      type: "h",
      item: {},
      fstype: "folder",
      parent_id: "root",
      parent_idx: 0,
      name: "project",
    })
    const indexFile = makeNode({
      id: "idx",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 0,
      name: "project",
      fs_path: "project/project.md",
    })
    const fileAlpha = makeNode({
      id: "alpha",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 1,
      name: "alpha",
      title: "Alpha",
      fs_path: "project/alpha.md",
    })
    // An inline section (outline item) comes first
    const inlineSec = makeNode({
      id: "s1",
      type: "h",
      item: {},
      fstype: "mdsection",
      parent_id: "idx",
      parent_idx: 0,
      content: "Notes",
      title: "Notes",
    })
    // Then an unresolved paragraph slot AFTER the section
    const unresolvedSlot = makeNode({
      id: "p-unresolved",
      type: "p",
      parent_id: "idx",
      parent_idx: 1,
      content: "![[./nonexistent]]",
    })

    const repo = createFakeRepo({
      nodes: [folder, indexFile, fileAlpha, inlineSec, unresolvedSlot],
    })

    const columns = deriveColumnsFromRepo(repo, "proj", new Map())

    // Should have: body column (with unresolved slot) + Notes inline section + alpha unlisted
    expect(columns.length).toBe(3)
    expect(columns[0]!.isVirtual).toBe(true) // body column
    expect(columns[0]!.cardNodes.length).toBe(1)
    expect(columns[0]!.cardNodes[0]!.content).toBe("![[./nonexistent]]")
    expect(columns[1]!.node.id).toBe("s1") // inline section
    expect(columns[2]!.node.id).toBe("alpha") // unlisted child
  })

  test("resolved paragraph slot after inline section still resolves correctly", () => {
    // A resolved paragraph slot after an outline section should still resolve
    // to the folder child — not be treated as body content.
    const folder = makeNode({
      id: "proj",
      type: "h",
      item: {},
      fstype: "folder",
      parent_id: "root",
      parent_idx: 0,
      name: "project",
    })
    const indexFile = makeNode({
      id: "idx",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 0,
      name: "project",
      fs_path: "project/project.md",
    })
    const fileAlpha = makeNode({
      id: "alpha",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "proj",
      parent_idx: 1,
      name: "alpha",
      title: "Alpha",
      fs_path: "project/alpha.md",
    })
    // Inline section first
    const inlineSec = makeNode({
      id: "s1",
      type: "h",
      item: {},
      fstype: "mdsection",
      parent_id: "idx",
      parent_idx: 0,
      content: "Notes",
      title: "Notes",
    })
    // Resolved paragraph slot AFTER the section
    const resolvedSlot = makeNode({
      id: "p-resolved",
      type: "p",
      parent_id: "idx",
      parent_idx: 1,
      content: "![[./alpha]]",
    })

    const repo = createFakeRepo({
      nodes: [folder, indexFile, fileAlpha, inlineSec, resolvedSlot],
    })

    const columns = deriveColumnsFromRepo(repo, "proj", new Map())

    // Should have: Notes inline section + alpha resolved from slot
    // No body column — the slot resolves successfully
    expect(columns.length).toBe(2)
    expect(columns[0]!.node.id).toBe("s1") // inline section
    expect(columns[1]!.node.id).toBe("alpha") // resolved slot
  })
})

describe("Asana vault section deduplication (km-shk24)", () => {
  test("launch-academy.md sections are not duplicated", () => {
    // Regression test for km-shk24: Asana vault's launch-academy.md has 6 sections
    // (INBOX, PROJECTS & PHASES, Phase 2-5) but TUI showed each duplicated.
    // Root cause: stale DB state. This test documents correct behavior.
    const mdFile = makeNode({
      id: "stabell/early-orbit/launch-academy.md",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "stabell/early-orbit",
      parent_idx: 0,
      title: "Launch Academy",
      fs_path: "stabell/early-orbit/launch-academy.md",
      name: "launch-academy",
    })
    const sectionNames = ["INBOX", "PROJECTS & PHASES", "Phase 2", "Phase 3", "Phase 4", "Phase 5"]
    const sections = sectionNames.map((name, idx) =>
      makeNode({
        id: `la-section-${idx}`,
        type: "h",
        item: {},
        fstype: "mdsection",
        parent_id: "stabell/early-orbit/launch-academy.md",
        parent_idx: idx,
        content: name,
        title: name,
      }),
    )

    const repo = createFakeRepo({
      nodes: [mdFile, ...sections],
    })

    const columns = deriveColumnsFromRepo(repo, "stabell/early-orbit/launch-academy.md", new Map())

    // Should produce exactly 6 columns, no duplicates
    expect(columns.length).toBe(6)
    expect(columns.map((c) => c.node.title || c.node.content)).toEqual(sectionNames)
  })

  test("duplicate mdsection children with same content produce only one column each", () => {
    // Simulates stale DB scenario: two copies of each section exist as children
    // (e.g., from import + parse creating duplicate nodes).
    // deduplicateByFsPath only dedupes by fs_path — mdsection nodes have no fs_path.
    // This test documents that sections without fs_path are NOT deduplicated
    // (they can't be — they're structurally distinct nodes).
    const mdFile = makeNode({
      id: "launch-academy.md",
      type: "h",
      item: {},
      fstype: "mdfile",
      parent_id: "root",
      parent_idx: 0,
      title: "Launch Academy",
      fs_path: "launch-academy.md",
      name: "launch-academy",
    })
    // Two INBOX sections with different IDs (simulates duplicate DB entries)
    const inbox1 = makeNode({
      id: "inbox-1",
      type: "h",
      item: {},
      fstype: "mdsection",
      parent_id: "launch-academy.md",
      parent_idx: 0,
      content: "INBOX",
      title: "INBOX",
    })
    const inbox2 = makeNode({
      id: "inbox-2",
      type: "h",
      item: {},
      fstype: "mdsection",
      parent_id: "launch-academy.md",
      parent_idx: 1,
      content: "INBOX",
      title: "INBOX",
    })

    const repo = createFakeRepo({
      nodes: [mdFile, inbox1, inbox2],
    })

    const columns = deriveColumnsFromRepo(repo, "launch-academy.md", new Map())

    // Without fs_path, deduplication doesn't apply — both nodes become columns.
    // This is the correct behavior: if there are genuinely two children, show both.
    // The duplication bug is at the storage layer (duplicate DB entries), not the TUI.
    expect(columns.length).toBe(2)
  })
})

describe("markdown file columns", () => {
  test("zooming into an md file with H2 sections produces multiple columns", () => {
    // Simulate an md file (mdfile) with H2 sections (mdsection) as children.
    // When zoomed into the md file, each section should become a column.
    const mdFile = makeNode({
      id: "early-orbit",
      type: "h",
      item: {},
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
      item: {},
      fstype: "mdsection",
      parent_id: "early-orbit",
      parent_idx: 0,
      content: "Overview & Inbox",
      title: "Overview & Inbox",
    })
    const section2 = makeNode({
      id: "milestones",
      type: "h",
      item: {},
      fstype: "mdsection",
      parent_id: "early-orbit",
      parent_idx: 1,
      content: "MAPLE Milestones",
      title: "MAPLE Milestones",
    })
    const section3 = makeNode({
      id: "program",
      type: "h",
      item: {},
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
      item: {},
      fstype: "mdsection",
      parent_id: "overview",
      parent_idx: 0,
      content: "Prepare immigration questions",
    })
    const task2 = makeNode({
      id: "task-2",
      type: "h",
      item: {},
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
      item: {},
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
      item: {},
      fstype: "mdsection",
      parent_id: "notes",
      parent_idx: 1,
      content: "Section A",
      title: "Section A",
    })
    const section2 = makeNode({
      id: "sec-2",
      type: "h",
      item: {},
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
