/**
 * Tree Utilities Tests
 *
 * Tests for shared tree/node display utilities including:
 * - Node display names
 * - Name normalization and similarity
 * - Type indicators
 * - Collapsed type suffix (unified folder/file/section)
 * - Ancestor collapsing
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const TEST_DIR = join(import.meta.dir, ".test-tree");

import { resetDb, closeDb, getNode, getChildren, applyEvent } from "@km/store";

import { emitNodeCreated, setKmDir, setDatabase } from "@km/core";

import type { NodeType } from "@km/core";
import { ulid } from "ulid";

import {
  getNodeDisplayName,
  getTypeIndicator,
  normalizeName,
  namesAreSimilar,
  getCollapsedTypeSuffix,
  collapseRedundantAncestors,
} from "../src/tree.ts";

// Test helpers
function createTestNode(
  type: NodeType,
  content?: string,
  parentId?: string | null,
  extra?: Record<string, unknown>,
): string {
  const id = ulid();
  emitNodeCreated("test-user", {
    id,
    type,
    parent_id: parentId ?? null,
    content,
    ...extra,
  });
  return id;
}

describe("getNodeDisplayName", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    setDatabase({ applyEvent });
    resetDb();
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("returns content for nodes with content", () => {
    const id = createTestNode("task", "Test Task");
    const node = getNode(id)!;
    expect(getNodeDisplayName(node)).toBe("Test Task");
  });

  test("returns data.name if present", () => {
    const id = createTestNode("folder", undefined, null, {
      data: { name: "My Folder" },
    });
    const node = getNode(id)!;
    expect(getNodeDisplayName(node)).toBe("My Folder");
  });

  test("truncates long content", () => {
    const longContent = "A".repeat(100);
    const id = createTestNode("task", longContent);
    const node = getNode(id)!;
    const name = getNodeDisplayName(node);
    expect(name.length).toBeLessThanOrEqual(50);
  });

  test("uses first line of multi-line content", () => {
    const id = createTestNode("section", "First Line\nSecond Line\nThird Line");
    const node = getNode(id)!;
    expect(getNodeDisplayName(node)).toBe("First Line");
  });

  test("returns id prefix for nodes without content or name", () => {
    const id = createTestNode("paragraph", undefined, null);
    const node = getNode(id)!;
    expect(getNodeDisplayName(node)).toBe(id.slice(0, 8));
  });

  test("strips rules from section display name", () => {
    // Section with add= and sync= rules should display only the title
    const id = createTestNode(
      "section",
      "Done sync=status:done collapse=true",
      null,
    );
    const node = getNode(id)!;
    expect(getNodeDisplayName(node)).toBe("Done");
    expect(node.title).toBe("Done");
    expect(node.rules?.sync).toBe("status:done");
    expect(node.rules?.collapse).toBe(true);
  });

  test("uses H1 heading for file nodes", () => {
    // Create a file with a section child (H1 heading)
    const fileId = createTestNode("file", undefined, null, {
      fs_path: "/path/to/@next.md",
    });
    createTestNode("section", "Next Actions", fileId);

    const file = getNode(fileId)!;
    expect(getNodeDisplayName(file)).toBe("Next Actions");
  });

  test("strips column rules from H1 heading", () => {
    // Create a file with a section that has inline column rules
    const fileId = createTestNode("file", undefined, null, {
      fs_path: "/path/to/@next.md",
    });
    createTestNode("section", 'Today add="due:past status:open"', fileId);

    const file = getNode(fileId)!;
    expect(getNodeDisplayName(file)).toBe("Today");
  });

  test("falls back to filename without .md for files with no H1", () => {
    // Create a file with no section children
    const fileId = createTestNode("file", undefined, null, {
      fs_path: "/path/to/@inbox.md",
    });

    const file = getNode(fileId)!;
    expect(getNodeDisplayName(file)).toBe("@inbox");
  });

  test("frontmatter title takes priority over H1", () => {
    // Create a file with both frontmatter title and H1
    const fileId = createTestNode("file", undefined, null, {
      fs_path: "/path/to/board.md",
      data: { name: "My Custom Title" },
    });
    createTestNode("section", "H1 Heading", fileId);

    const file = getNode(fileId)!;
    expect(getNodeDisplayName(file)).toBe("My Custom Title");
  });
});

describe("getTypeIndicator", () => {
  test("returns / for folders", () => {
    expect(getTypeIndicator("folder")).toBe("/");
  });

  test("returns .md for files", () => {
    expect(getTypeIndicator("file")).toBe(".md");
  });

  test("returns # for sections", () => {
    expect(getTypeIndicator("section")).toBe("#");
  });

  test("returns empty string for other types", () => {
    expect(getTypeIndicator("task")).toBe("");
    expect(getTypeIndicator("paragraph")).toBe("");
    expect(getTypeIndicator("board")).toBe("");
  });
});

describe("normalizeName", () => {
  test("lowercases names", () => {
    expect(normalizeName("PROJECT")).toBe("project");
    expect(normalizeName("My Project")).toBe("my project");
  });

  test("removes # prefixes from sections", () => {
    expect(normalizeName("# Heading")).toBe("heading");
    expect(normalizeName("## Sub Heading")).toBe("sub heading");
    expect(normalizeName("### Deep")).toBe("deep");
  });

  test("removes .md extension", () => {
    expect(normalizeName("project.md")).toBe("project");
    expect(normalizeName("README.MD")).toBe("readme");
  });

  test("treats underscores as spaces", () => {
    expect(normalizeName("my_project")).toBe("my project");
    expect(normalizeName("2025_Taxes")).toBe("2025 taxes");
  });

  test("treats hyphens as spaces", () => {
    expect(normalizeName("my-project")).toBe("my project");
  });

  test("removes special characters", () => {
    expect(normalizeName("Project (2024)")).toBe("project 2024");
    expect(normalizeName("Test: Example")).toBe("test example");
  });

  test("collapses whitespace", () => {
    expect(normalizeName("My   Project")).toBe("my project");
    expect(normalizeName("  Trimmed  ")).toBe("trimmed");
  });
});

describe("namesAreSimilar", () => {
  test("matches identical names", () => {
    expect(namesAreSimilar("Project", "Project")).toBe(true);
  });

  test("matches case-insensitively", () => {
    expect(namesAreSimilar("Project", "project")).toBe(true);
    expect(namesAreSimilar("PROJECT", "Project")).toBe(true);
  });

  test("matches folder and file with same base name", () => {
    expect(namesAreSimilar("projects", "projects.md")).toBe(true);
    expect(namesAreSimilar("Projects", "projects.md")).toBe(true);
  });

  test("matches file and section heading", () => {
    expect(namesAreSimilar("projects.md", "# Projects")).toBe(true);
    expect(namesAreSimilar("Projects.md", "## Projects")).toBe(true);
  });

  test("matches underscore and space variants", () => {
    expect(namesAreSimilar("2025_Taxes", "2025 Taxes")).toBe(true);
    expect(namesAreSimilar("my_project", "My Project")).toBe(true);
  });

  test("does not match different names", () => {
    expect(namesAreSimilar("Projects", "Archive")).toBe(false);
    expect(namesAreSimilar("2025_Taxes", "2024_Taxes")).toBe(false);
  });
});

describe("getCollapsedTypeSuffix", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    setDatabase({ applyEvent });
    resetDb();
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("returns empty for node with no matching children", () => {
    const folderId = createTestNode("folder", undefined, null, {
      data: { name: "Projects" },
    });
    createTestNode("file", undefined, folderId, { data: { name: "Other" } });

    const folder = getNode(folderId)!;
    expect(getCollapsedTypeSuffix(folder)).toBe("");
  });

  test("returns / .md for folder with same-name file", () => {
    const folderId = createTestNode("folder", undefined, null, {
      data: { name: "Projects" },
    });
    createTestNode("file", undefined, folderId, { data: { name: "Projects" } });

    const folder = getNode(folderId)!;
    expect(getCollapsedTypeSuffix(folder)).toBe("/ .md");
  });

  test("returns / .md # for folder -> file -> section chain", () => {
    const folderId = createTestNode("folder", undefined, null, {
      data: { name: "Projects" },
    });
    const fileId = createTestNode("file", undefined, folderId, {
      data: { name: "Projects" },
    });
    createTestNode("section", "# Projects", fileId);

    const folder = getNode(folderId)!;
    expect(getCollapsedTypeSuffix(folder)).toBe("/ .md #");
  });

  test("handles underscore/space variants in name matching", () => {
    const folderId = createTestNode("folder", undefined, null, {
      data: { name: "2025_Taxes" },
    });
    const fileId = createTestNode("file", undefined, folderId, {
      data: { name: "2025 Taxes" },
    });
    createTestNode("section", "# 2025 Taxes", fileId);

    const folder = getNode(folderId)!;
    expect(getCollapsedTypeSuffix(folder)).toBe("/ .md #");
  });

  test("returns .md # for file with same-name section", () => {
    const fileId = createTestNode("file", undefined, null, {
      data: { name: "README" },
    });
    createTestNode("section", "# README", fileId);

    const file = getNode(fileId)!;
    expect(getCollapsedTypeSuffix(file)).toBe(".md #");
  });

  test("only follows matching names, not all children", () => {
    const folderId = createTestNode("folder", undefined, null, {
      data: { name: "Projects" },
    });
    createTestNode("file", undefined, folderId, {
      data: { name: "Other File" },
    });
    createTestNode("file", undefined, folderId, { data: { name: "Another" } });

    const folder = getNode(folderId)!;
    expect(getCollapsedTypeSuffix(folder)).toBe("");
  });
});

describe("collapseRedundantAncestors", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    setKmDir(TEST_DIR);
    setDatabase({ applyEvent });
    resetDb();
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("returns empty array for empty input", () => {
    expect(collapseRedundantAncestors([])).toEqual([]);
  });

  test("returns single node unchanged", () => {
    const id = createTestNode("folder", undefined, null, {
      data: { name: "Projects" },
    });
    const node = getNode(id)!;
    const result = collapseRedundantAncestors([node]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(id);
  });

  test("collapses folder -> file with same name", () => {
    const folderId = createTestNode("folder", undefined, null, {
      data: { name: "Projects" },
    });
    const fileId = createTestNode("file", undefined, folderId, {
      data: { name: "Projects" },
    });

    const folder = getNode(folderId)!;
    const file = getNode(fileId)!;

    const result = collapseRedundantAncestors([folder, file]);
    // Should keep only one since they have the same name
    expect(result).toHaveLength(1);
  });

  test("collapses folder -> file -> section with same name", () => {
    const folderId = createTestNode("folder", undefined, null, {
      data: { name: "Projects" },
    });
    const fileId = createTestNode("file", undefined, folderId, {
      data: { name: "Projects" },
    });
    const sectionId = createTestNode("section", "# Projects", fileId);

    const folder = getNode(folderId)!;
    const file = getNode(fileId)!;
    const section = getNode(sectionId)!;

    const result = collapseRedundantAncestors([folder, file, section]);
    expect(result).toHaveLength(1);
  });

  test("keeps nodes with different names", () => {
    const folderId = createTestNode("folder", undefined, null, {
      data: { name: "Projects" },
    });
    const fileId = createTestNode("file", undefined, folderId, {
      data: { name: "Projects" },
    });
    const sectionId = createTestNode("section", "# Introduction", fileId);

    const folder = getNode(folderId)!;
    const file = getNode(fileId)!;
    const section = getNode(sectionId)!;

    const result = collapseRedundantAncestors([folder, file, section]);
    // folder and file collapse, section is different
    expect(result).toHaveLength(2);
    expect(result[1].id).toBe(sectionId);
  });

  test("handles underscore/space variants", () => {
    const folderId = createTestNode("folder", undefined, null, {
      data: { name: "2025_Taxes" },
    });
    const fileId = createTestNode("file", undefined, folderId, {
      data: { name: "2025 Taxes" },
    });
    const sectionId = createTestNode("section", "# 2025 Taxes", fileId);

    const folder = getNode(folderId)!;
    const file = getNode(fileId)!;
    const section = getNode(sectionId)!;

    const result = collapseRedundantAncestors([folder, file, section]);
    expect(result).toHaveLength(1);
  });

  test("preserves non-adjacent different items", () => {
    const folder1 = createTestNode("folder", undefined, null, {
      data: { name: "Archive" },
    });
    const folder2 = createTestNode("folder", undefined, folder1, {
      data: { name: "2024" },
    });
    const folder3 = createTestNode("folder", undefined, folder2, {
      data: { name: "Projects" },
    });

    const n1 = getNode(folder1)!;
    const n2 = getNode(folder2)!;
    const n3 = getNode(folder3)!;

    const result = collapseRedundantAncestors([n1, n2, n3]);
    expect(result).toHaveLength(3);
  });
});
