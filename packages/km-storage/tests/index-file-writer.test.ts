/**
 * Unit tests for index file content generation and filename computation.
 */

import { describe, test, expect } from "vitest"
import { generateIndexFileContent, indexFileName } from "../src/index-file-writer.ts"

describe("generateIndexFileContent", () => {
  test("metadata mode: title only", () => {
    const result = generateIndexFileContent("My Folder", "", [], "metadata")
    expect(result).toBe("# My Folder\n")
  })

  test("metadata mode: title + body", () => {
    const result = generateIndexFileContent("My Folder", "Some description text.", [], "metadata")
    expect(result).toBe("# My Folder\n\nSome description text.\n")
  })

  test("metadata mode: ignores children", () => {
    const result = generateIndexFileContent("Folder", "Body.", [{ name: "child-a" }, { name: "child-b" }], "metadata")
    expect(result).toBe("# Folder\n\nBody.\n")
    expect(result).not.toContain("![[")
  })

  test("full mode: title + children slots", () => {
    const result = generateIndexFileContent(
      "My Folder",
      "",
      [{ name: "child-a" }, { name: "child-b" }, { name: "child-c" }],
      "full",
    )
    expect(result).toBe("# My Folder\n\n![[./child-a]]\n![[./child-b]]\n![[./child-c]]\n")
  })

  test("full mode: title + body + children slots", () => {
    const result = generateIndexFileContent(
      "Project",
      "This is the project root.",
      [{ name: "docs" }, { name: "src" }],
      "full",
    )
    expect(result).toBe("# Project\n\nThis is the project root.\n\n![[./docs]]\n![[./src]]\n")
  })

  test("full mode: no children produces no slots", () => {
    const result = generateIndexFileContent("Empty", "", [], "full")
    expect(result).toBe("# Empty\n")
  })

  test("throws on empty title", () => {
    expect(() => generateIndexFileContent("", "", [], "metadata")).toThrow(
      "generateIndexFileContent: title must not be empty",
    )
  })

  test("body with leading/trailing whitespace is trimmed", () => {
    const result = generateIndexFileContent("Title", "  text with spaces  ", [], "metadata")
    expect(result).toBe("# Title\n\ntext with spaces\n")
  })

  test("children with special characters in names", () => {
    const result = generateIndexFileContent(
      "Parent",
      "",
      [{ name: "file with spaces" }, { name: "file-with-dashes" }, { name: "2026-01-01 journal" }],
      "full",
    )
    expect(result).toContain("![[./file with spaces]]")
    expect(result).toContain("![[./file-with-dashes]]")
    expect(result).toContain("![[./2026-01-01 journal]]")
  })
})

describe("indexFileName", () => {
  test("same-name: appends .md to folder name", () => {
    expect(indexFileName("my-folder", "same-name")).toBe("my-folder.md")
  })

  test("index: always returns index.md", () => {
    expect(indexFileName("anything", "index")).toBe("index.md")
  })

  test("dot-md: always returns .md", () => {
    expect(indexFileName("anything", "dot-md")).toBe(".md")
  })

  test("same-name with spaces", () => {
    expect(indexFileName("my folder", "same-name")).toBe("my folder.md")
  })
})
