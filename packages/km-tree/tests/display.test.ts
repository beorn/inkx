/**
 * Display Utilities Tests
 *
 * Tests for display name computation and ancestor collapsing functions.
 */

import { describe, it, expect, test } from "vitest"
import { type KNode, normalizeName, namesAreSimilar } from "@km/core"
import {
  getNodeDisplayName,
  isNodeUntitled,
  getTypeIndicator,
  getCollapsedTypeSuffix,
  collapseRedundantAncestors,
  collapseAncestorsWithTypes,
  getParentContext,
  stripForDisplay,
} from "../src/display.ts"

// Helper to create test nodes with minimal required properties
function createNode(id: string, overrides: Partial<KNode> = {}): KNode {
  return {
    id,
    type: "h",
    item: {},
    fstype: "mdsection",
    parent_id: null,
    parent_idx: 0,
    embed_of: null,
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "test",
    ...overrides,
  }
}

// Map short spec types to oi fstypes
const FSTYPE_MAP = { folder: "folder", file: "mdfile", section: "mdsection" } as const

// Helper to create a chain of folder/file/section nodes with specified titles
type NodeChainSpec = { type: "folder" | "file" | "section"; title: string }
function createNodeChain(specs: NodeChainSpec[]): KNode[] {
  return specs.map((spec, i) =>
    createNode(`${spec.type}${i + 1}`, {
      type: "h",
      item: {},
      fstype: FSTYPE_MAP[spec.type],
      title: spec.title,
    }),
  )
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
        title: "Work km.default:: true",
      })
      expect(getNodeDisplayName(node)).toBe("Work")
    })

    it("strips km.collapse rule from title", () => {
      const node = createNode("abc123", {
        title: "Done km.collapse:: true",
      })
      expect(getNodeDisplayName(node)).toBe("Done")
    })

    it("returns full title without truncation (flex layout handles truncation)", () => {
      const longTitle = "A".repeat(100)
      const node = createNode("abc123", { title: longTitle })
      expect(getNodeDisplayName(node)).toHaveLength(100)
    })

    it("ignores stale data.title when node.title is empty string", () => {
      // Regression: DB data.title can be stale when section heading is cleared.
      // node.title="" (from DB title column, correctly synced) should take
      // precedence over data.title="Waiting" (stale in DB data JSON blob).
      const node = createNode("01KH8939", {
        title: "",
        content: "",
        data: { rules: { color: "yellow" }, title: "Waiting" },
      })
      // content:"" is treated as valid (empty) content, not as "no content"
      expect(getNodeDisplayName(node)).toBe("")
    })

    it("uses data.title when node.title is undefined", () => {
      // When node.title is truly absent (undefined), data.title is a valid fallback
      const node = createNode("abc123", {
        title: undefined,
        data: { title: "From Data" },
      })
      expect(getNodeDisplayName(node)).toBe("From Data")
    })
  })

  describe("priority 3: file node H1 heading", () => {
    it("uses first section title for file nodes", () => {
      const fileNode = createNode("file123", { type: "h", item: {}, fstype: "mdfile" })
      const sectionNode = createNode("section123", {
        type: "h",
        item: {},
        fstype: "mdsection",
        title: "Project Overview",
      })

      const getChildren = (id: string) => (id === "file123" ? [sectionNode] : [])

      expect(getNodeDisplayName(fileNode, getChildren)).toBe("Project Overview")
    })

    it("uses first section content if title is absent", () => {
      const fileNode = createNode("file123", { type: "h", item: {}, fstype: "mdfile" })
      const sectionNode = createNode("section123", {
        type: "h",
        item: {},
        fstype: "mdsection",
        content: "# Heading\nParagraph content",
      })

      const getChildren = (id: string) => (id === "file123" ? [sectionNode] : [])

      expect(getNodeDisplayName(fileNode, getChildren)).toBe("# Heading")
    })

    it("strips rules from section content", () => {
      const fileNode = createNode("file123", { type: "h", item: {}, fstype: "mdfile" })
      const sectionNode = createNode("section123", {
        type: "h",
        item: {},
        fstype: "mdsection",
        content: "Work km.default:: true\nMore content",
      })

      const getChildren = (id: string) => (id === "file123" ? [sectionNode] : [])

      expect(getNodeDisplayName(fileNode, getChildren)).toBe("Work")
    })

    it("ignores stale data.title on first section of file node", () => {
      const fileNode = createNode("file123", { type: "h", item: {}, fstype: "mdfile" })
      const sectionNode = createNode("section123", {
        type: "h",
        item: {},
        fstype: "mdsection",
        title: "",
        content: "",
        data: { title: "Old Stale Title" },
      })

      const getChildren = (id: string) => (id === "file123" ? [sectionNode] : [])

      // Should fall through to short ID, NOT use stale data.title
      expect(getNodeDisplayName(fileNode, getChildren)).toBe("(file123)")
    })
  })

  describe("priority 4: node content", () => {
    it("returns first line of content for list items", () => {
      const node = createNode("task123", {
        type: "p",
        item: {},
        content: "Fix the bug\nMore details here",
      })
      expect(getNodeDisplayName(node)).toBe("Fix the bug")
    })

    it("returns full content without truncation (flex layout handles truncation)", () => {
      const longContent = "B".repeat(100) + "\nSecond line"
      const node = createNode("task123", { content: longContent })
      expect(getNodeDisplayName(node)).toHaveLength(100)
    })
  })

  describe("priority 5: filename", () => {
    it("uses filename without .md extension", () => {
      const node = createNode("file123", {
        type: "h",
        item: {},
        fstype: "mdfile",
        fs_path: "/path/to/my-project.md",
      })
      expect(getNodeDisplayName(node)).toBe("my-project")
    })

    it("returns filename as-is if no .md extension", () => {
      const node = createNode("file123", {
        type: "h",
        item: {},
        fstype: "mdfile",
        fs_path: "/path/to/readme",
      })
      expect(getNodeDisplayName(node)).toBe("readme")
    })
  })

  describe("priority 6: short ID fallback", () => {
    it("returns last 8 chars of ID in parens when nothing else available", () => {
      const node = createNode("abcdefghijklmnop")
      expect(getNodeDisplayName(node)).toBe("(ijklmnop)")
    })

    it("returns short ID in parens from fs_path if filename is .md only", () => {
      const node = createNode("abcdefgh12345", {
        fs_path: "/path/to/.md",
      })
      expect(getNodeDisplayName(node)).toBe("(fgh12345)")
    })

    it("returns empty string for empty-content nodes (new items)", () => {
      // New items are created with content:"" — they should display blank,
      // not show internal IDs like "(XWJE24KP)"
      const node = createNode("01JTEST1234567", {
        type: "p",
        content: "",
      })
      expect(getNodeDisplayName(node)).toBe("")
    })

    it("returns empty string for empty-titled outline items (## with no text)", () => {
      const node = createNode("01JTEST1234567", {
        type: "h",
        item: {},
        fstype: "mdsection",
        title: "",
        content: "",
      })
      expect(getNodeDisplayName(node)).toBe("")
    })
  })
})

// =============================================================================
// isNodeUntitled
// =============================================================================

describe("isNodeUntitled", () => {
  it("returns true for node with no name sources", () => {
    const node = createNode("abc123")
    expect(isNodeUntitled(node)).toBe(true)
  })

  it("returns true for empty-titled outline item (## with no text)", () => {
    const node = createNode("abc123", {
      type: "h",
      item: {},
      fstype: "mdsection",
      title: "",
      content: "",
    })
    expect(isNodeUntitled(node)).toBe(true)
  })

  it("returns false when node has title", () => {
    const node = createNode("abc123", { title: "Waiting" })
    expect(isNodeUntitled(node)).toBe(false)
  })

  it("returns false when node has content", () => {
    const node = createNode("abc123", { content: "Some text" })
    expect(isNodeUntitled(node)).toBe(false)
  })

  it("returns false when node has data.name", () => {
    const node = createNode("abc123", { data: { name: "Named" } })
    expect(isNodeUntitled(node)).toBe(false)
  })

  it("returns false when node has data.title and title is undefined", () => {
    const node = createNode("abc123", { data: { title: "Titled" } })
    expect(isNodeUntitled(node)).toBe(false)
  })

  it("returns true when title is empty string despite stale data.title", () => {
    // Regression: stale data.title should not prevent untitled detection
    const node = createNode("abc123", {
      title: "",
      content: "",
      data: { title: "Waiting" },
    })
    expect(isNodeUntitled(node)).toBe(true)
  })

  it("returns false when node has fs_path", () => {
    const node = createNode("abc123", { fs_path: "/path/to/file.md" })
    expect(isNodeUntitled(node)).toBe(false)
  })

  it("returns false for file node with titled first section", () => {
    const fileNode = createNode("file1", { type: "h", item: {}, fstype: "mdfile" })
    const section = createNode("sec1", { type: "h", item: {}, fstype: "mdsection", title: "Overview" })
    const getChildren = (id: string) => (id === "file1" ? [section] : [])
    expect(isNodeUntitled(fileNode, getChildren)).toBe(false)
  })

  it("returns true for file node with empty first section", () => {
    const fileNode = createNode("file1", { type: "h", item: {}, fstype: "mdfile" })
    const section = createNode("sec1", { type: "h", item: {}, fstype: "mdsection", title: "", content: "" })
    const getChildren = (id: string) => (id === "file1" ? [section] : [])
    expect(isNodeUntitled(fileNode, getChildren)).toBe(true)
  })
})

// =============================================================================
// getTypeIndicator
// =============================================================================

describe("getTypeIndicator", () => {
  test.each([
    { type: "h", item: {}, fstype: "folder", expected: "/" },
    { type: "h", item: {}, fstype: "repo", expected: "/" },
    { type: "h", item: {}, fstype: "file", expected: ".md" },
    { type: "h", item: {}, fstype: "mdfile", expected: ".md" },
    { type: "h", item: {}, fstype: "mdsection", expected: "#" },
    { type: "h", item: {}, fstype: undefined, expected: "" },
    { type: "p", item: {}, fstype: undefined, expected: "" },
    { type: "p", fstype: undefined, expected: "" },
    { type: "code", fstype: undefined, expected: "" },
  ])("returns $expected for type=$type fstype=$fstype", ({ type, fstype, item, expected }) => {
    expect(getTypeIndicator(type, fstype, item)).toBe(expected)
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
    const node = createNode("folder123", { type: "h", item: {}, fstype: "folder", title: "Project" })
    expect(getCollapsedTypeSuffix(node)).toBe("")
  })

  it("returns empty string for single node without matching children", () => {
    const folderNode = createNode("folder123", {
      type: "h",
      item: {},
      fstype: "folder",
      title: "Project",
    })
    const otherNode = createNode("other", { type: "h", item: {}, fstype: "mdfile", title: "Other" })

    const getChildren = (id: string) => (id === "folder123" ? [otherNode] : [])

    expect(getCollapsedTypeSuffix(folderNode, getChildren)).toBe("")
  })

  it("returns combined indicators for folder > file chain", () => {
    const folderNode = createNode("folder123", {
      type: "h",
      item: {},
      fstype: "folder",
      title: "Project",
    })
    const fileNode = createNode("file123", { type: "h", item: {}, fstype: "mdfile", title: "Project" })

    const getChildren = (id: string) => (id === "folder123" ? [fileNode] : [])

    expect(getCollapsedTypeSuffix(folderNode, getChildren)).toBe("/ .md")
  })

  it("returns combined indicators for folder > file > section chain", () => {
    const folderNode = createNode("folder123", {
      type: "h",
      item: {},
      fstype: "folder",
      title: "Project",
    })
    const fileNode = createNode("file123", { type: "h", item: {}, fstype: "mdfile", title: "Project" })
    const sectionNode = createNode("section123", {
      type: "h",
      item: {},
      fstype: "mdsection",
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
      type: "h",
      item: {},
      fstype: "folder",
      title: "Project",
    })
    const fileNode = createNode("file123", { type: "h", item: {}, fstype: "mdfile", title: "Project" })
    const sectionNode = createNode("section123", {
      type: "h",
      item: {},
      fstype: "mdsection",
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
      createNode("folder1", { type: "h", item: {}, fstype: "folder", title: "Alpha" }),
      createNode("file1", { type: "h", item: {}, fstype: "mdfile", title: "Alpha" }),
      createNode("folder2", { type: "h", item: {}, fstype: "folder", title: "Beta" }),
      createNode("file2", { type: "h", item: {}, fstype: "mdfile", title: "Beta" }),
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
      type: "h",
      item: {},
      fstype: "mdfile",
      title: "Project Tasks",
      parent_id: null,
    })

    const getNode = (id: string) => (id === "file1" ? fileNode : null)
    expect(getParentContext(taskNode, null, getNode)).toBe("Project Tasks")
  })

  it("skips board columns and finds file parent", () => {
    const taskNode = createNode("task1", { parent_id: "column1" })
    const columnNode = createNode("column1", {
      type: "h",
      item: {},
      fstype: "mdsection",
      title: "In Progress",
      parent_id: "file1",
      rules: { add: "@next.md/## Inbox" }, // Has rules = board column
    })
    const fileNode = createNode("file1", {
      type: "h",
      item: {},
      fstype: "mdfile",
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
      type: "h",
      item: {},
      fstype: "mdsection",
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
      type: "h",
      item: {},
      fstype: "mdsection",
      title: "In Progress",
      parent_id: "file1",
    })
    const fileNode = createNode("file1", {
      type: "h",
      item: {},
      fstype: "mdfile",
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

  it("follows embed_of for transclusion nodes", () => {
    const linkedNode = createNode("linked1", {
      embed_of: "original1",
      parent_id: "board-column",
    })
    const originalNode = createNode("original1", {
      parent_id: "original-file",
    })
    const originalFile = createNode("original-file", {
      type: "h",
      item: {},
      fstype: "mdfile",
      title: "Original File",
      parent_id: null,
    })
    const boardColumn = createNode("board-column", {
      type: "h",
      item: {},
      fstype: "mdsection",
      title: "Board Column",
      rules: { add: "somewhere" },
    })

    const getNode = (id: string) => {
      if (id === "original1") return originalNode
      if (id === "original-file") return originalFile
      if (id === "board-column") return boardColumn
      return null
    }

    // Should follow embed_of and return original file's context
    expect(getParentContext(linkedNode, null, getNode)).toBe("Original File")
  })

  it("returns null when walking up finds nothing", () => {
    const taskNode = createNode("task1", { parent_id: "section1" })
    const sectionNode = createNode("section1", {
      type: "h",
      item: {},
      fstype: "mdsection",
      title: "Column",
      parent_id: "section2",
      rules: { sync: "somewhere" }, // Has rules - board column
    })
    const sectionNode2 = createNode("section2", {
      type: "h",
      item: {},
      fstype: "mdsection",
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

// =============================================================================
// stripForDisplay — inline ^caret references
// =============================================================================

describe("stripForDisplay", () => {
  it("strips ^block-id at end of text (existing behavior)", () => {
    expect(stripForDisplay("Task title ^abc123")).toBe("Task title")
  })

  it("strips inline ^numeric-id mid-text", () => {
    expect(stripForDisplay("See previous ^1202466275397380")).toBe("See previous")
  })

  it("strips ^numeric-id with no space before caret", () => {
    expect(stripForDisplay("talk to Fidelity^1212075048027297")).toBe("talk to Fidelity")
  })

  it("strips ^numeric-id followed by URL (no space)", () => {
    expect(stripForDisplay("44 most beautiful places ^1209904823302245https://example.com")).toBe(
      "44 most beautiful places https://example.com",
    )
  })

  it("strips ^numeric-id followed by text (no space)", () => {
    expect(stripForDisplay("First long card ^99365004304232more text")).toBe("First long card more text")
  })

  it("strips multiple inline ^numeric-ids", () => {
    expect(stripForDisplay("ref ^1202466275397380 and ^1212075048027297 done")).toBe("ref and done")
  })

  it("does not strip short ^ids inline (only 10+ digits)", () => {
    // Short numeric refs mid-text are not Asana IDs — should be preserved
    expect(stripForDisplay("value ^12345 is good")).toBe("value ^12345 is good")
  })

  it("preserves caret in non-ID contexts mid-text", () => {
    // Regex or math usage of ^ — digits too short to match inline stripping
    expect(stripForDisplay("x^2 + y^2 equals r^2 total")).toBe("x^2 + y^2 equals r^2 total")
  })

  it("handles text with only a ^numeric-id", () => {
    expect(stripForDisplay("^1202466275397380")).toBe("")
  })

  it("strips embed block reference ![[^numericId]]", () => {
    expect(stripForDisplay("![[^1203128650780856]]")).toBe("")
  })

  it("strips embed block reference suffix from title", () => {
    expect(stripForDisplay("Clean-up after trip ![[^1138180707609595]]")).toBe("Clean-up after trip")
  })

  it("preserves ^numeric-id inside inline wikilink [[^id]]", () => {
    expect(stripForDisplay("See [[^1203128650780856]]")).toBe("See [[^1203128650780856]]")
  })

  it("preserves ^numeric-id inside wikilink with alias [[^id|text]]", () => {
    expect(stripForDisplay("See [[^1203128650780856|Related task]]")).toBe("See [[^1203128650780856|Related task]]")
  })

  it("strips ^numeric-id outside wikilinks but preserves inside", () => {
    expect(stripForDisplay("ref ^1202466275397380 and [[^1203128650780856]]")).toBe("ref and [[^1203128650780856]]")
  })

  // ── Embed wikilink syntax ![[target]] ─────────────────────────────────

  it("strips embed wikilink ![[target]] replacing with target name", () => {
    expect(stripForDisplay("![[file.jpg]]")).toBe("file.jpg")
  })

  it("strips embed wikilink from mixed content, keeping target name", () => {
    expect(stripForDisplay("Organize into boxes ![[file.jpg]]")).toBe("Organize into boxes file.jpg")
  })

  it("strips multiple embed wikilinks from mixed content", () => {
    expect(stripForDisplay("See ![[photo.png]] and ![[doc.pdf]]")).toBe("See photo.png and doc.pdf")
  })

  it("strips embed wikilink with alias, using alias for display", () => {
    expect(stripForDisplay("Check ![[file.jpg|My Photo]]")).toBe("Check My Photo")
  })

  it("preserves regular wikilinks [[target]]", () => {
    expect(stripForDisplay("See [[my note]] for details")).toBe("See [[my note]] for details")
  })
})
