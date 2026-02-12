/**
 * Display Utilities Tests
 *
 * Tests for display name computation and ancestor collapsing functions.
 */

import { describe, it, expect, test } from "vitest"
import type { KNode } from "@km/core"
import {
  getNodeDisplayName,
  getTypeIndicator,
  normalizeName,
  namesAreSimilar,
  getCollapsedTypeSuffix,
  collapseRedundantAncestors,
  collapseAncestorsWithTypes,
  getParentContext,
} from "../src/display.ts"

// Helper to create test nodes with minimal required properties
function createNode(id: string, overrides: Partial<KNode> = {}): KNode {
  return {
    id,
    type: "section",
    parent_id: null,
    parent_idx: 0,
    link_to: null,
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "test",
    ...overrides,
  }
}

// Helper to create a chain of folder/file/section nodes with specified titles
type NodeChainSpec = { type: "folder" | "file" | "section"; title: string }
function createNodeChain(specs: NodeChainSpec[]): KNode[] {
  return specs.map((spec, i) => createNode(`${spec.type}${i + 1}`, { type: spec.type, title: spec.title }))
}

// =============================================================================
// getNodeDisplayName
// =============================================================================

describe("getNodeDisplayName", () => {
  describe("priority 1: frontmatter title (data.name)", () => {
    it("returns data.name when present", () => {
      const node = createNode("abc123", {
        data: { name: "My Project" },
        title: "Section Title",
        content: "Some content",
      })
      expect(getNodeDisplayName(node)).toBe("My Project")
    })
  })

  describe("priority 2: pre-parsed title", () => {
    it("returns node.title when data.name is absent", () => {
      const node = createNode("abc123", {
        title: "Section Title",
        content: "Some content",
      })
      expect(getNodeDisplayName(node)).toBe("Section Title")
    })

    it("returns data.title when node.title is absent", () => {
      const node = createNode("abc123", {
        data: { title: "Data Title" },
        content: "Some content",
      })
      expect(getNodeDisplayName(node)).toBe("Data Title")
    })

    it("strips inline rules from title", () => {
      const node = createNode("abc123", {
        title: "Work default=true",
      })
      expect(getNodeDisplayName(node)).toBe("Work")
    })

    it("strips backtick-wrapped rules", () => {
      const node = createNode("abc123", {
        title: "Done `collapse=true`",
      })
      expect(getNodeDisplayName(node)).toBe("Done")
    })

    it("truncates long titles to 50 chars", () => {
      const longTitle = "A".repeat(100)
      const node = createNode("abc123", { title: longTitle })
      expect(getNodeDisplayName(node)).toHaveLength(50)
    })
  })

  describe("priority 3: file node H1 heading", () => {
    it("uses first section title for file nodes", () => {
      const fileNode = createNode("file123", { type: "file" })
      const sectionNode = createNode("section123", {
        type: "section",
        title: "Project Overview",
      })

      const getChildren = (id: string) => (id === "file123" ? [sectionNode] : [])

      expect(getNodeDisplayName(fileNode, getChildren)).toBe("Project Overview")
    })

    it("uses first section content if title is absent", () => {
      const fileNode = createNode("file123", { type: "file" })
      const sectionNode = createNode("section123", {
        type: "section",
        content: "# Heading\nParagraph content",
      })

      const getChildren = (id: string) => (id === "file123" ? [sectionNode] : [])

      expect(getNodeDisplayName(fileNode, getChildren)).toBe("# Heading")
    })

    it("strips rules from section content", () => {
      const fileNode = createNode("file123", { type: "file" })
      const sectionNode = createNode("section123", {
        type: "section",
        content: "Work default=true\nMore content",
      })

      const getChildren = (id: string) => (id === "file123" ? [sectionNode] : [])

      expect(getNodeDisplayName(fileNode, getChildren)).toBe("Work")
    })
  })

  describe("priority 4: node content", () => {
    it("returns first line of content for tasks", () => {
      const node = createNode("task123", {
        type: "task",
        content: "Fix the bug\nMore details here",
      })
      expect(getNodeDisplayName(node)).toBe("Fix the bug")
    })

    it("truncates long content to 50 chars", () => {
      const longContent = "B".repeat(100) + "\nSecond line"
      const node = createNode("task123", { content: longContent })
      expect(getNodeDisplayName(node)).toHaveLength(50)
    })
  })

  describe("priority 5: filename", () => {
    it("uses filename without .md extension", () => {
      const node = createNode("file123", {
        type: "file",
        fs_path: "/path/to/my-project.md",
      })
      expect(getNodeDisplayName(node)).toBe("my-project")
    })

    it("returns filename as-is if no .md extension", () => {
      const node = createNode("file123", {
        type: "file",
        fs_path: "/path/to/readme",
      })
      expect(getNodeDisplayName(node)).toBe("readme")
    })
  })

  describe("priority 6: short ID fallback", () => {
    it("returns first 8 chars of ID when nothing else available", () => {
      const node = createNode("abcdefghijklmnop")
      expect(getNodeDisplayName(node)).toBe("abcdefgh")
    })

    it("returns short ID from fs_path if filename is .md only", () => {
      const node = createNode("abcdefgh12345", {
        fs_path: "/path/to/.md",
      })
      expect(getNodeDisplayName(node)).toBe("abcdefgh")
    })
  })
})

// =============================================================================
// getTypeIndicator
// =============================================================================

describe("getTypeIndicator", () => {
  test.each([
    { type: "folder", expected: "/" },
    { type: "file", expected: ".md" },
    { type: "section", expected: "#" },
    { type: "task", expected: "" },
    { type: "root", expected: "" },
    { type: "block", expected: "" },
    { type: "unknown", expected: "" },
  ])("returns $expected for $type", ({ type, expected }) => {
    expect(getTypeIndicator(type)).toBe(expected)
  })
})

// =============================================================================
// normalizeName
// =============================================================================

describe("normalizeName", () => {
  test.each([
    // Removes leading # from sections
    { input: "# Heading", expected: "heading" },
    { input: "## Sub Heading", expected: "sub heading" },
    { input: "### Deep Heading", expected: "deep heading" },
    // Removes .md extension
    { input: "project.md", expected: "project" },
    { input: "MY-FILE.MD", expected: "my file" },
    // Treats hyphens and underscores as spaces
    { input: "my-project", expected: "my project" },
    { input: "my_project", expected: "my project" },
    { input: "my-cool_project", expected: "my cool project" },
    // Removes special characters
    { input: "project@2024!", expected: "project2024" },
    { input: "file (1)", expected: "file 1" },
    // Collapses whitespace
    { input: "my   project", expected: "my project" },
    { input: "  trim  me  ", expected: "trim me" },
    // Lowercases everything
    { input: "MyProject", expected: "myproject" },
    { input: "UPPERCASE", expected: "uppercase" },
    // Handles empty strings
    { input: "", expected: "" },
    // Handles unicode characters (non-word chars stripped)
    { input: "cafe", expected: "cafe" },
    { input: "caf\u00e9", expected: "caf" },
    // Combined transformations
    { input: "## My-Cool_Project.md", expected: "my cool project" },
  ])("normalizes '$input' to '$expected'", ({ input, expected }) => {
    expect(normalizeName(input)).toBe(expected)
  })
})

// =============================================================================
// namesAreSimilar
// =============================================================================

describe("namesAreSimilar", () => {
  test.each([
    // Identical names
    { a: "project", b: "project", expected: true },
    // Case differences
    { a: "Project", b: "project", expected: true },
    { a: "PROJECT", b: "project", expected: true },
    // Separator differences
    { a: "my-project", b: "my_project", expected: true },
    { a: "my project", b: "my-project", expected: true },
    // With/without .md extension
    { a: "project.md", b: "project", expected: true },
    { a: "readme.md", b: "README", expected: true },
    // Section heading with filename
    { a: "# Project", b: "project.md", expected: true },
    { a: "## My Project", b: "my-project.md", expected: true },
    // Different names
    { a: "project", b: "other", expected: false },
    { a: "foo", b: "bar", expected: false },
    // Empty strings
    { a: "", b: "", expected: true },
    { a: "", b: "something", expected: false },
  ])("namesAreSimilar('$a', '$b') = $expected", ({ a, b, expected }) => {
    expect(namesAreSimilar(a, b)).toBe(expected)
  })
})

// =============================================================================
// getCollapsedTypeSuffix
// =============================================================================

describe("getCollapsedTypeSuffix", () => {
  it("returns empty string without getChildren", () => {
    const node = createNode("folder123", { type: "folder", title: "Project" })
    expect(getCollapsedTypeSuffix(node)).toBe("")
  })

  it("returns empty string for single node without matching children", () => {
    const folderNode = createNode("folder123", {
      type: "folder",
      title: "Project",
    })
    const otherNode = createNode("other", { type: "file", title: "Other" })

    const getChildren = (id: string) => (id === "folder123" ? [otherNode] : [])

    expect(getCollapsedTypeSuffix(folderNode, getChildren)).toBe("")
  })

  it("returns combined indicators for folder > file chain", () => {
    const folderNode = createNode("folder123", {
      type: "folder",
      title: "Project",
    })
    const fileNode = createNode("file123", { type: "file", title: "Project" })

    const getChildren = (id: string) => (id === "folder123" ? [fileNode] : [])

    expect(getCollapsedTypeSuffix(folderNode, getChildren)).toBe("/ .md")
  })

  it("returns combined indicators for folder > file > section chain", () => {
    const folderNode = createNode("folder123", {
      type: "folder",
      title: "Project",
    })
    const fileNode = createNode("file123", { type: "file", title: "Project" })
    const sectionNode = createNode("section123", {
      type: "section",
      title: "Project",
    })

    const getChildren = (id: string) => {
      if (id === "folder123") return [fileNode]
      if (id === "file123") return [sectionNode]
      return []
    }

    expect(getCollapsedTypeSuffix(folderNode, getChildren)).toBe("/ .md #")
  })

  it("stops at non-matching name", () => {
    const folderNode = createNode("folder123", {
      type: "folder",
      title: "Project",
    })
    const fileNode = createNode("file123", { type: "file", title: "Project" })
    const sectionNode = createNode("section123", {
      type: "section",
      title: "Intro",
    })

    const getChildren = (id: string) => {
      if (id === "folder123") return [fileNode]
      if (id === "file123") return [sectionNode]
      return []
    }

    expect(getCollapsedTypeSuffix(folderNode, getChildren)).toBe("/ .md")
  })
})

// =============================================================================
// collapseRedundantAncestors
// =============================================================================

describe("collapseRedundantAncestors", () => {
  it("returns empty array for empty input", () => {
    expect(collapseRedundantAncestors([])).toEqual([])
  })

  test.each([
    {
      desc: "single node unchanged",
      chain: [{ type: "file" as const, title: "Project" }],
      expectedIds: ["file1"],
    },
    {
      desc: "collapses folder and file with same name",
      chain: [
        { type: "folder" as const, title: "Project" },
        { type: "file" as const, title: "Project" },
      ],
      expectedIds: ["file2"],
    },
    {
      desc: "collapses folder, file, and section with same name",
      chain: [
        { type: "folder" as const, title: "Project" },
        { type: "file" as const, title: "Project" },
        { type: "section" as const, title: "# Project" },
      ],
      expectedIds: ["section3"],
    },
    {
      desc: "preserves nodes with different names",
      chain: [
        { type: "folder" as const, title: "Projects" },
        { type: "file" as const, title: "My Project" },
        { type: "section" as const, title: "# Details" },
      ],
      expectedIds: ["folder1", "file2", "section3"],
    },
    {
      desc: "handles partial collapsing",
      chain: [
        { type: "folder" as const, title: "Project" },
        { type: "file" as const, title: "Project" },
        { type: "section" as const, title: "# Details" },
      ],
      expectedIds: ["file2", "section3"],
    },
  ])("$desc", ({ chain, expectedIds }) => {
    const nodes = createNodeChain(chain)
    const result = collapseRedundantAncestors(nodes)
    expect(result.map((n) => n.id)).toEqual(expectedIds)
  })
})

// =============================================================================
// collapseAncestorsWithTypes
// =============================================================================

describe("collapseAncestorsWithTypes", () => {
  it("returns empty array for empty input", () => {
    expect(collapseAncestorsWithTypes([])).toEqual([])
  })

  test.each([
    {
      desc: "single node with empty typeSuffix",
      chain: [{ type: "file" as const, title: "Project" }],
      expected: [{ id: "file1", typeSuffix: "" }],
    },
    {
      desc: "includes type suffix for collapsed folder > file",
      chain: [
        { type: "folder" as const, title: "Project" },
        { type: "file" as const, title: "Project" },
      ],
      expected: [{ id: "file2", typeSuffix: "/ .md" }],
    },
    {
      desc: "full type suffix for folder > file > section",
      chain: [
        { type: "folder" as const, title: "Project" },
        { type: "file" as const, title: "Project" },
        { type: "section" as const, title: "# Project" },
      ],
      expected: [{ id: "section3", typeSuffix: "/ .md #" }],
    },
  ])("$desc", ({ chain, expected }) => {
    const nodes = createNodeChain(chain)
    const result = collapseAncestorsWithTypes(nodes)
    expect(result.map((r) => ({ id: r.node.id, typeSuffix: r.typeSuffix }))).toEqual(expected)
  })

  it("handles multiple collapsed groups", () => {
    const nodes = [
      createNode("folder1", { type: "folder", title: "Alpha" }),
      createNode("file1", { type: "file", title: "Alpha" }),
      createNode("folder2", { type: "folder", title: "Beta" }),
      createNode("file2", { type: "file", title: "Beta" }),
    ]
    const result = collapseAncestorsWithTypes(nodes)
    expect(result.map((r) => ({ id: r.node.id, typeSuffix: r.typeSuffix }))).toEqual([
      { id: "file1", typeSuffix: "/ .md" },
      { id: "file2", typeSuffix: "/ .md" },
    ])
  })
})

// =============================================================================
// getParentContext
// =============================================================================

describe("getParentContext", () => {
  it("returns null without getNode function", () => {
    const node = createNode("task1", { parent_id: "parent1" })
    expect(getParentContext(node)).toBeNull()
  })

  it("returns null for node without parent", () => {
    const node = createNode("root1", { parent_id: null })
    const getNode = () => null
    expect(getParentContext(node, null, getNode)).toBeNull()
  })

  it("returns file parent display name", () => {
    const taskNode = createNode("task1", { parent_id: "file1" })
    const fileNode = createNode("file1", {
      type: "file",
      title: "Project Tasks",
      parent_id: null,
    })

    const getNode = (id: string) => (id === "file1" ? fileNode : null)
    expect(getParentContext(taskNode, null, getNode)).toBe("Project Tasks")
  })

  it("skips board columns and finds file parent", () => {
    const taskNode = createNode("task1", { parent_id: "column1" })
    const columnNode = createNode("column1", {
      type: "section",
      title: "In Progress",
      parent_id: "file1",
      rules: { add: "@next.md/## Inbox" }, // Has rules = board column
    })
    const fileNode = createNode("file1", {
      type: "file",
      title: "Board",
      parent_id: null,
    })

    const getNode = (id: string) => {
      if (id === "column1") return columnNode
      if (id === "file1") return fileNode
      return null
    }

    expect(getParentContext(taskNode, null, getNode)).toBe("Board")
  })

  it("returns meaningful section without rules", () => {
    const taskNode = createNode("task1", { parent_id: "section1" })
    const sectionNode = createNode("section1", {
      type: "section",
      title: "Important Tasks",
      parent_id: null,
      // No rules - not a board column
    })

    const getNode = (id: string) => (id === "section1" ? sectionNode : null)
    expect(getParentContext(taskNode, null, getNode)).toBe("Important Tasks")
  })

  it("skips specified skipParentId", () => {
    const taskNode = createNode("task1", { parent_id: "column1" })
    const columnNode = createNode("column1", {
      type: "section",
      title: "In Progress",
      parent_id: "file1",
    })
    const fileNode = createNode("file1", {
      type: "file",
      title: "Board",
      parent_id: null,
    })

    const getNode = (id: string) => {
      if (id === "column1") return columnNode
      if (id === "file1") return fileNode
      return null
    }

    expect(getParentContext(taskNode, "column1", getNode)).toBe("Board")
  })

  it("follows link_to for transclusion nodes", () => {
    const linkedNode = createNode("linked1", {
      link_to: "original1",
      parent_id: "board-column",
    })
    const originalNode = createNode("original1", {
      parent_id: "original-file",
    })
    const originalFile = createNode("original-file", {
      type: "file",
      title: "Original File",
      parent_id: null,
    })
    const boardColumn = createNode("board-column", {
      type: "section",
      title: "Board Column",
      rules: { add: "somewhere" },
    })

    const getNode = (id: string) => {
      if (id === "original1") return originalNode
      if (id === "original-file") return originalFile
      if (id === "board-column") return boardColumn
      return null
    }

    // Should follow link_to and return original file's context
    expect(getParentContext(linkedNode, null, getNode)).toBe("Original File")
  })

  it("returns null when walking up finds nothing", () => {
    const taskNode = createNode("task1", { parent_id: "section1" })
    const sectionNode = createNode("section1", {
      type: "section",
      title: "Column",
      parent_id: "section2",
      rules: { sync: "somewhere" }, // Has rules - board column
    })
    const sectionNode2 = createNode("section2", {
      type: "section",
      title: "Another Column",
      parent_id: null,
      rules: { add: "elsewhere" }, // Also has rules
    })

    const getNode = (id: string) => {
      if (id === "section1") return sectionNode
      if (id === "section2") return sectionNode2
      return null
    }

    expect(getParentContext(taskNode, null, getNode)).toBeNull()
  })
})
