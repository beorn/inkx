/**
 * Tests for discoverOnly mode (km-view-stub bug)
 *
 * When loading with discoverOnly: true, markdown files are created as stubs
 * without parsing their content. This tests that when targeting a specific
 * file, its content is eagerly parsed.
 */
import { test, expect, describe } from "vitest"
import { Database } from "bun:sqlite"
import { mkdtempSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { SCHEMA } from "../src/db/schema.ts"
import { loadRepo, parseStubFile } from "../src/repo/loader.ts"
import { resolveNode, getChildren } from "../src/db/db.ts"

describe("discoverOnly mode", () => {
  test("stub file has no children until parsed", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-discover-"))

    // Create a markdown file with content
    writeFileSync(
      join(tmpDir, "test.md"),
      `# Test File

## Section One

Some content here.

## Section Two

More content.
`,
    )

    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Load with discoverOnly: true (stub mode)
    const gen = loadRepo(tmpDir, { db, discoverOnly: true })
    let result = gen.next()
    while (!result.done) {
      result = gen.next()
    }

    // Find the file node
    const fileNode = resolveNode(db, "test.md")
    expect(fileNode).toBeDefined()
    expect(fileNode?.type).toBe("h")

    // In stub mode, file has no children (content not parsed)
    const children = getChildren(db, fileNode!.id)
    expect(children.length).toBe(0) // BUG: This is the problem!
  })

  test("parseStubFile parses a single stub file", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-discover-"))
    const filePath = join(tmpDir, "test.md")

    // Create a markdown file with sections
    writeFileSync(
      filePath,
      `# Test File

## Section One

Content for section one.

## Section Two

Content for section two.
`,
    )

    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Load with discoverOnly: true
    const gen = loadRepo(tmpDir, { db, discoverOnly: true })
    let result = gen.next()
    while (!result.done) {
      result = gen.next()
    }

    // Find the file node (stub)
    const fileNode = resolveNode(db, "test.md")
    expect(fileNode).toBeDefined()
    expect(fileNode?.type).toBe("h")

    // Before parsing: no children
    const beforeChildren = getChildren(db, fileNode!.id)
    expect(beforeChildren.length).toBe(0)

    // Parse the stub file
    const success = parseStubFile(db, fileNode!.id, filePath)
    expect(success).toBe(true)

    // After parsing: should have children (sections)
    const afterChildren = getChildren(db, fileNode!.id)
    expect(afterChildren.length).toBeGreaterThan(0)

    // Verify we got the expected sections
    const sectionChildren = afterChildren.filter((c) => c.type === "h" && c.fstype === "mdsection")
    expect(sectionChildren.length).toBe(2)
  })

  test("directory view works in discoverOnly mode", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "km-discover-"))
    const docsDir = join(tmpDir, "docs")
    mkdirSync(docsDir)

    // Create multiple markdown files
    writeFileSync(join(docsDir, "readme.md"), "# Readme\n\nIntro content.")
    writeFileSync(join(docsDir, "guide.md"), "# Guide\n\nGuide content.")

    const db = new Database(":memory:")
    db.run(SCHEMA)

    // Load with discoverOnly: true
    const gen = loadRepo(tmpDir, { db, discoverOnly: true })
    let result = gen.next()
    while (!result.done) {
      result = gen.next()
    }

    // Find the docs folder node
    const docsNode = resolveNode(db, "docs")
    expect(docsNode).toBeDefined()
    expect(docsNode?.type).toBe("h")

    // Folder should have file children (stub nodes)
    const children = getChildren(db, docsNode!.id)
    expect(children.length).toBe(2) // Two .md files as stubs

    // Each child should be a file type
    for (const child of children) {
      expect(child.type).toBe("h")
    }
  })
})
