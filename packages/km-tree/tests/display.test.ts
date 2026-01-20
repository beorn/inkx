/**
 * Display Utilities Tests
 *
 * Tests for display name computation and ancestor collapsing functions.
 */

import { describe, it, expect } from "bun:test";
import type { KNode } from "@km/core";
import {
  getNodeDisplayName,
  getTypeIndicator,
  normalizeName,
  namesAreSimilar,
  getCollapsedTypeSuffix,
  collapseRedundantAncestors,
  collapseAncestorsWithTypes,
  getParentContext,
} from "../src/display.ts";

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
  };
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
      });
      expect(getNodeDisplayName(node)).toBe("My Project");
    });
  });

  describe("priority 2: pre-parsed title", () => {
    it("returns node.title when data.name is absent", () => {
      const node = createNode("abc123", {
        title: "Section Title",
        content: "Some content",
      });
      expect(getNodeDisplayName(node)).toBe("Section Title");
    });

    it("returns data.title when node.title is absent", () => {
      const node = createNode("abc123", {
        data: { title: "Data Title" },
        content: "Some content",
      });
      expect(getNodeDisplayName(node)).toBe("Data Title");
    });

    it("strips inline rules from title", () => {
      const node = createNode("abc123", {
        title: "Work default=true",
      });
      expect(getNodeDisplayName(node)).toBe("Work");
    });

    it("strips backtick-wrapped rules", () => {
      const node = createNode("abc123", {
        title: "Done `collapse=true`",
      });
      expect(getNodeDisplayName(node)).toBe("Done");
    });

    it("truncates long titles to 50 chars", () => {
      const longTitle = "A".repeat(100);
      const node = createNode("abc123", { title: longTitle });
      expect(getNodeDisplayName(node)).toHaveLength(50);
    });
  });

  describe("priority 3: file node H1 heading", () => {
    it("uses first section title for file nodes", () => {
      const fileNode = createNode("file123", { type: "file" });
      const sectionNode = createNode("section123", {
        type: "section",
        title: "Project Overview",
      });

      const getChildren = (id: string) =>
        id === "file123" ? [sectionNode] : [];

      expect(getNodeDisplayName(fileNode, getChildren)).toBe(
        "Project Overview",
      );
    });

    it("uses first section content if title is absent", () => {
      const fileNode = createNode("file123", { type: "file" });
      const sectionNode = createNode("section123", {
        type: "section",
        content: "# Heading\nParagraph content",
      });

      const getChildren = (id: string) =>
        id === "file123" ? [sectionNode] : [];

      expect(getNodeDisplayName(fileNode, getChildren)).toBe("# Heading");
    });

    it("strips rules from section content", () => {
      const fileNode = createNode("file123", { type: "file" });
      const sectionNode = createNode("section123", {
        type: "section",
        content: "Work default=true\nMore content",
      });

      const getChildren = (id: string) =>
        id === "file123" ? [sectionNode] : [];

      expect(getNodeDisplayName(fileNode, getChildren)).toBe("Work");
    });
  });

  describe("priority 4: node content", () => {
    it("returns first line of content for tasks", () => {
      const node = createNode("task123", {
        type: "task",
        content: "Fix the bug\nMore details here",
      });
      expect(getNodeDisplayName(node)).toBe("Fix the bug");
    });

    it("truncates long content to 50 chars", () => {
      const longContent = "B".repeat(100) + "\nSecond line";
      const node = createNode("task123", { content: longContent });
      expect(getNodeDisplayName(node)).toHaveLength(50);
    });
  });

  describe("priority 5: filename", () => {
    it("uses filename without .md extension", () => {
      const node = createNode("file123", {
        type: "file",
        fs_path: "/path/to/my-project.md",
      });
      expect(getNodeDisplayName(node)).toBe("my-project");
    });

    it("returns filename as-is if no .md extension", () => {
      const node = createNode("file123", {
        type: "file",
        fs_path: "/path/to/readme",
      });
      expect(getNodeDisplayName(node)).toBe("readme");
    });
  });

  describe("priority 6: short ID fallback", () => {
    it("returns first 8 chars of ID when nothing else available", () => {
      const node = createNode("abcdefghijklmnop");
      expect(getNodeDisplayName(node)).toBe("abcdefgh");
    });

    it("returns short ID from fs_path if filename is .md only", () => {
      const node = createNode("abcdefgh12345", {
        fs_path: "/path/to/.md",
      });
      expect(getNodeDisplayName(node)).toBe("abcdefgh");
    });
  });
});

// =============================================================================
// getTypeIndicator
// =============================================================================

describe("getTypeIndicator", () => {
  it("returns / for folder", () => {
    expect(getTypeIndicator("folder")).toBe("/");
  });

  it("returns .md for file", () => {
    expect(getTypeIndicator("file")).toBe(".md");
  });

  it("returns # for section", () => {
    expect(getTypeIndicator("section")).toBe("#");
  });

  it("returns empty string for other types", () => {
    expect(getTypeIndicator("task")).toBe("");
    expect(getTypeIndicator("root")).toBe("");
    expect(getTypeIndicator("block")).toBe("");
    expect(getTypeIndicator("unknown")).toBe("");
  });
});

// =============================================================================
// normalizeName
// =============================================================================

describe("normalizeName", () => {
  it("removes leading # from sections", () => {
    expect(normalizeName("# Heading")).toBe("heading");
    expect(normalizeName("## Sub Heading")).toBe("sub heading");
    expect(normalizeName("### Deep Heading")).toBe("deep heading");
  });

  it("removes .md extension", () => {
    expect(normalizeName("project.md")).toBe("project");
    expect(normalizeName("MY-FILE.MD")).toBe("my file");
  });

  it("treats hyphens and underscores as spaces", () => {
    expect(normalizeName("my-project")).toBe("my project");
    expect(normalizeName("my_project")).toBe("my project");
    expect(normalizeName("my-cool_project")).toBe("my cool project");
  });

  it("removes special characters", () => {
    expect(normalizeName("project@2024!")).toBe("project2024");
    expect(normalizeName("file (1)")).toBe("file 1");
  });

  it("collapses whitespace", () => {
    expect(normalizeName("my   project")).toBe("my project");
    expect(normalizeName("  trim  me  ")).toBe("trim me");
  });

  it("lowercases everything", () => {
    expect(normalizeName("MyProject")).toBe("myproject");
    expect(normalizeName("UPPERCASE")).toBe("uppercase");
  });

  it("handles empty strings", () => {
    expect(normalizeName("")).toBe("");
  });

  it("handles unicode characters", () => {
    expect(normalizeName("cafe")).toBe("cafe");
    // Non-word chars are stripped, so accents get removed
    expect(normalizeName("caf\u00e9")).toBe("caf");
  });

  it("handles combined transformations", () => {
    expect(normalizeName("## My-Cool_Project.md")).toBe("my cool project");
  });
});

// =============================================================================
// namesAreSimilar
// =============================================================================

describe("namesAreSimilar", () => {
  it("matches identical names", () => {
    expect(namesAreSimilar("project", "project")).toBe(true);
  });

  it("matches names differing only in case", () => {
    expect(namesAreSimilar("Project", "project")).toBe(true);
    expect(namesAreSimilar("PROJECT", "project")).toBe(true);
  });

  it("matches names differing in separators", () => {
    expect(namesAreSimilar("my-project", "my_project")).toBe(true);
    expect(namesAreSimilar("my project", "my-project")).toBe(true);
  });

  it("matches with/without .md extension", () => {
    expect(namesAreSimilar("project.md", "project")).toBe(true);
    expect(namesAreSimilar("readme.md", "README")).toBe(true);
  });

  it("matches section heading with filename", () => {
    expect(namesAreSimilar("# Project", "project.md")).toBe(true);
    expect(namesAreSimilar("## My Project", "my-project.md")).toBe(true);
  });

  it("returns false for different names", () => {
    expect(namesAreSimilar("project", "other")).toBe(false);
    expect(namesAreSimilar("foo", "bar")).toBe(false);
  });

  it("handles empty strings", () => {
    expect(namesAreSimilar("", "")).toBe(true);
    expect(namesAreSimilar("", "something")).toBe(false);
  });
});

// =============================================================================
// getCollapsedTypeSuffix
// =============================================================================

describe("getCollapsedTypeSuffix", () => {
  it("returns empty string without getChildren", () => {
    const node = createNode("folder123", { type: "folder", title: "Project" });
    expect(getCollapsedTypeSuffix(node)).toBe("");
  });

  it("returns empty string for single node without matching children", () => {
    const folderNode = createNode("folder123", {
      type: "folder",
      title: "Project",
    });
    const otherNode = createNode("other", { type: "file", title: "Other" });

    const getChildren = (id: string) => (id === "folder123" ? [otherNode] : []);

    expect(getCollapsedTypeSuffix(folderNode, getChildren)).toBe("");
  });

  it("returns combined indicators for folder > file chain", () => {
    const folderNode = createNode("folder123", {
      type: "folder",
      title: "Project",
    });
    const fileNode = createNode("file123", { type: "file", title: "Project" });

    const getChildren = (id: string) => (id === "folder123" ? [fileNode] : []);

    expect(getCollapsedTypeSuffix(folderNode, getChildren)).toBe("/ .md");
  });

  it("returns combined indicators for folder > file > section chain", () => {
    const folderNode = createNode("folder123", {
      type: "folder",
      title: "Project",
    });
    const fileNode = createNode("file123", { type: "file", title: "Project" });
    const sectionNode = createNode("section123", {
      type: "section",
      title: "Project",
    });

    const getChildren = (id: string) => {
      if (id === "folder123") return [fileNode];
      if (id === "file123") return [sectionNode];
      return [];
    };

    expect(getCollapsedTypeSuffix(folderNode, getChildren)).toBe("/ .md #");
  });

  it("stops at non-matching name", () => {
    const folderNode = createNode("folder123", {
      type: "folder",
      title: "Project",
    });
    const fileNode = createNode("file123", { type: "file", title: "Project" });
    const sectionNode = createNode("section123", {
      type: "section",
      title: "Intro",
    });

    const getChildren = (id: string) => {
      if (id === "folder123") return [fileNode];
      if (id === "file123") return [sectionNode];
      return [];
    };

    expect(getCollapsedTypeSuffix(folderNode, getChildren)).toBe("/ .md");
  });
});

// =============================================================================
// collapseRedundantAncestors
// =============================================================================

describe("collapseRedundantAncestors", () => {
  it("returns empty array for empty input", () => {
    expect(collapseRedundantAncestors([])).toEqual([]);
  });

  it("returns single node unchanged", () => {
    const node = createNode("abc", { type: "file", title: "Project" });
    const result = collapseRedundantAncestors([node]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("abc");
  });

  it("collapses folder and file with same name", () => {
    const folderNode = createNode("folder1", {
      type: "folder",
      title: "Project",
    });
    const fileNode = createNode("file1", { type: "file", title: "Project" });

    const result = collapseRedundantAncestors([folderNode, fileNode]);
    expect(result).toHaveLength(1);
    // Should keep the last (deepest) node
    expect(result[0]?.id).toBe("file1");
  });

  it("collapses folder, file, and section with same name", () => {
    const folderNode = createNode("folder1", {
      type: "folder",
      title: "Project",
    });
    const fileNode = createNode("file1", { type: "file", title: "Project" });
    const sectionNode = createNode("section1", {
      type: "section",
      title: "# Project",
    });

    const result = collapseRedundantAncestors([
      folderNode,
      fileNode,
      sectionNode,
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("section1");
  });

  it("preserves nodes with different names", () => {
    const folderNode = createNode("folder1", {
      type: "folder",
      title: "Projects",
    });
    const fileNode = createNode("file1", { type: "file", title: "My Project" });
    const sectionNode = createNode("section1", {
      type: "section",
      title: "# Details",
    });

    const result = collapseRedundantAncestors([
      folderNode,
      fileNode,
      sectionNode,
    ]);
    expect(result).toHaveLength(3);
    expect(result[0]?.id).toBe("folder1");
    expect(result[1]?.id).toBe("file1");
    expect(result[2]?.id).toBe("section1");
  });

  it("handles partial collapsing", () => {
    const folderNode = createNode("folder1", {
      type: "folder",
      title: "Project",
    });
    const fileNode = createNode("file1", { type: "file", title: "Project" });
    const sectionNode = createNode("section1", {
      type: "section",
      title: "# Details",
    });

    const result = collapseRedundantAncestors([
      folderNode,
      fileNode,
      sectionNode,
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("file1");
    expect(result[1]?.id).toBe("section1");
  });
});

// =============================================================================
// collapseAncestorsWithTypes
// =============================================================================

describe("collapseAncestorsWithTypes", () => {
  it("returns empty array for empty input", () => {
    expect(collapseAncestorsWithTypes([])).toEqual([]);
  });

  it("returns node with empty typeSuffix for single node", () => {
    const node = createNode("abc", { type: "file", title: "Project" });
    const result = collapseAncestorsWithTypes([node]);
    expect(result).toHaveLength(1);
    expect(result[0]?.node.id).toBe("abc");
    expect(result[0]?.typeSuffix).toBe("");
  });

  it("includes type suffix for collapsed nodes", () => {
    const folderNode = createNode("folder1", {
      type: "folder",
      title: "Project",
    });
    const fileNode = createNode("file1", { type: "file", title: "Project" });

    const result = collapseAncestorsWithTypes([folderNode, fileNode]);
    expect(result).toHaveLength(1);
    expect(result[0]?.node.id).toBe("file1");
    expect(result[0]?.typeSuffix).toBe("/ .md");
  });

  it("includes full type suffix for three collapsed nodes", () => {
    const folderNode = createNode("folder1", {
      type: "folder",
      title: "Project",
    });
    const fileNode = createNode("file1", { type: "file", title: "Project" });
    const sectionNode = createNode("section1", {
      type: "section",
      title: "# Project",
    });

    const result = collapseAncestorsWithTypes([
      folderNode,
      fileNode,
      sectionNode,
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.node.id).toBe("section1");
    expect(result[0]?.typeSuffix).toBe("/ .md #");
  });

  it("handles multiple collapsed groups", () => {
    const folder1 = createNode("folder1", { type: "folder", title: "Alpha" });
    const file1 = createNode("file1", { type: "file", title: "Alpha" });
    const folder2 = createNode("folder2", { type: "folder", title: "Beta" });
    const file2 = createNode("file2", { type: "file", title: "Beta" });

    const result = collapseAncestorsWithTypes([folder1, file1, folder2, file2]);
    expect(result).toHaveLength(2);
    expect(result[0]?.node.id).toBe("file1");
    expect(result[0]?.typeSuffix).toBe("/ .md");
    expect(result[1]?.node.id).toBe("file2");
    expect(result[1]?.typeSuffix).toBe("/ .md");
  });
});

// =============================================================================
// getParentContext
// =============================================================================

describe("getParentContext", () => {
  it("returns null without getNode function", () => {
    const node = createNode("task1", { parent_id: "parent1" });
    expect(getParentContext(node)).toBeNull();
  });

  it("returns null for node without parent", () => {
    const node = createNode("root1", { parent_id: null });
    const getNode = () => null;
    expect(getParentContext(node, null, getNode)).toBeNull();
  });

  it("returns file parent display name", () => {
    const taskNode = createNode("task1", { parent_id: "file1" });
    const fileNode = createNode("file1", {
      type: "file",
      title: "Project Tasks",
      parent_id: null,
    });

    const getNode = (id: string) => (id === "file1" ? fileNode : null);
    expect(getParentContext(taskNode, null, getNode)).toBe("Project Tasks");
  });

  it("skips board columns and finds file parent", () => {
    const taskNode = createNode("task1", { parent_id: "column1" });
    const columnNode = createNode("column1", {
      type: "section",
      title: "In Progress",
      parent_id: "file1",
      rules: { add: "@next.md/## Inbox" }, // Has rules = board column
    });
    const fileNode = createNode("file1", {
      type: "file",
      title: "Board",
      parent_id: null,
    });

    const getNode = (id: string) => {
      if (id === "column1") return columnNode;
      if (id === "file1") return fileNode;
      return null;
    };

    expect(getParentContext(taskNode, null, getNode)).toBe("Board");
  });

  it("returns meaningful section without rules", () => {
    const taskNode = createNode("task1", { parent_id: "section1" });
    const sectionNode = createNode("section1", {
      type: "section",
      title: "Important Tasks",
      parent_id: null,
      // No rules - not a board column
    });

    const getNode = (id: string) => (id === "section1" ? sectionNode : null);
    expect(getParentContext(taskNode, null, getNode)).toBe("Important Tasks");
  });

  it("skips specified skipParentId", () => {
    const taskNode = createNode("task1", { parent_id: "column1" });
    const columnNode = createNode("column1", {
      type: "section",
      title: "In Progress",
      parent_id: "file1",
    });
    const fileNode = createNode("file1", {
      type: "file",
      title: "Board",
      parent_id: null,
    });

    const getNode = (id: string) => {
      if (id === "column1") return columnNode;
      if (id === "file1") return fileNode;
      return null;
    };

    expect(getParentContext(taskNode, "column1", getNode)).toBe("Board");
  });

  it("follows link_to for transclusion nodes", () => {
    const linkedNode = createNode("linked1", {
      link_to: "original1",
      parent_id: "board-column",
    });
    const originalNode = createNode("original1", {
      parent_id: "original-file",
    });
    const originalFile = createNode("original-file", {
      type: "file",
      title: "Original File",
      parent_id: null,
    });
    const boardColumn = createNode("board-column", {
      type: "section",
      title: "Board Column",
      rules: { add: "somewhere" },
    });

    const getNode = (id: string) => {
      if (id === "original1") return originalNode;
      if (id === "original-file") return originalFile;
      if (id === "board-column") return boardColumn;
      return null;
    };

    // Should follow link_to and return original file's context
    expect(getParentContext(linkedNode, null, getNode)).toBe("Original File");
  });

  it("returns null when walking up finds nothing", () => {
    const taskNode = createNode("task1", { parent_id: "section1" });
    const sectionNode = createNode("section1", {
      type: "section",
      title: "Column",
      parent_id: "section2",
      rules: { sync: "somewhere" }, // Has rules - board column
    });
    const sectionNode2 = createNode("section2", {
      type: "section",
      title: "Another Column",
      parent_id: null,
      rules: { add: "elsewhere" }, // Also has rules
    });

    const getNode = (id: string) => {
      if (id === "section1") return sectionNode;
      if (id === "section2") return sectionNode2;
      return null;
    };

    expect(getParentContext(taskNode, null, getNode)).toBeNull();
  });
});
