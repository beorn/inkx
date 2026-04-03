/**
 * Tests for preloadDepth — lazy directory loading.
 *
 * When preloadDepth is set to a finite number, directory discovery stops
 * at that depth. Directories beyond the limit are recorded as "unexplored"
 * with an approximate child count. They can be loaded on demand via
 * expandDirectory() or expandAll().
 */
import { test, expect, describe } from "vitest"
import { mkdtempSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { runGenerator } from "@km/core"
import { createRepo } from "../src/repo/repo.ts"
import type { Repo } from "../src/repo/repo.ts"

// ============================================================================
// Test Helpers
// ============================================================================

/** Create a temp directory with a nested folder structure for testing */
function createTestTree(): string {
  const root = mkdtempSync(join(tmpdir(), "km-preload-"))

  // Root level
  writeFileSync(join(root, "root-file.md"), "# Root File\n\nContent at root.")

  // Level 1: docs/
  mkdirSync(join(root, "docs"))
  writeFileSync(join(root, "docs", "guide.md"), "# Guide\n\nGuide content.")
  writeFileSync(join(root, "docs", "readme.md"), "# Readme\n\nReadme content.")

  // Level 1: projects/
  mkdirSync(join(root, "projects"))
  writeFileSync(join(root, "projects", "project-a.md"), "# Project A\n\nProject A content.")

  // Level 2: docs/api/
  mkdirSync(join(root, "docs", "api"))
  writeFileSync(join(root, "docs", "api", "endpoints.md"), "# Endpoints\n\nAPI endpoints.")
  writeFileSync(join(root, "docs", "api", "auth.md"), "# Auth\n\nAuthentication.")

  // Level 2: projects/alpha/
  mkdirSync(join(root, "projects", "alpha"))
  writeFileSync(join(root, "projects", "alpha", "notes.md"), "# Alpha Notes\n\nAlpha notes.")

  // Level 3: docs/api/v2/
  mkdirSync(join(root, "docs", "api", "v2"))
  writeFileSync(join(root, "docs", "api", "v2", "changes.md"), "# V2 Changes\n\nV2 changes.")

  return root
}

/** Run createRepo generator to completion */
function makeRepo(rootPath: string, preloadDepth?: number): Repo {
  return runGenerator(
    createRepo(rootPath, {
      loadFiles: true,
      forceMemory: true,
      preloadDepth,
    }),
  )
}

// ============================================================================
// Tests
// ============================================================================

describe("preloadDepth", () => {
  test("Infinity loads everything (default behavior)", () => {
    const root = createTestTree()
    using repo = makeRepo(root)

    // All files should be loaded
    expect(repo.unexploredDirs).toEqual([])
    expect(repo.stats.nodeCount).toBeGreaterThan(5)

    // Deep file should be accessible
    const node = repo.resolveNode("changes")
    expect(node).not.toBeNull()
  })

  test("explicit Infinity also loads everything", () => {
    const root = createTestTree()
    using repo = makeRepo(root, Infinity)

    expect(repo.unexploredDirs).toEqual([])
    expect(repo.stats.nodeCount).toBeGreaterThan(5)
  })

  test("depth 0 loads only root files, not subdirectories' contents", () => {
    const root = createTestTree()
    using repo = makeRepo(root, 0)

    // Root-level file should exist
    const rootFile = repo.resolveNode("root-file")
    expect(rootFile).not.toBeNull()

    // Subdirectory folder nodes should exist (they're created before depth check)
    const docsFolder = repo.resolveNode("docs")
    expect(docsFolder).not.toBeNull()
    expect(docsFolder!.fstype).toBe("folder")

    // But files inside subdirectories should NOT be loaded
    const guide = repo.resolveNode("guide")
    expect(guide).toBeNull()

    // Two subdirectories should be unexplored: docs and projects
    expect(repo.unexploredDirs.length).toBe(2)
    const unexploredPaths = repo.unexploredDirs.map((d) => d.path).sort()
    expect(unexploredPaths).toEqual(["docs", "projects"])
  })

  test("depth 1 loads root + one level of subdirectories", () => {
    const root = createTestTree()
    using repo = makeRepo(root, 1)

    // Root-level file should exist
    const rootFile = repo.resolveNode("root-file")
    expect(rootFile).not.toBeNull()

    // Files in level-1 directories should be loaded
    const guide = repo.resolveNode("guide")
    expect(guide).not.toBeNull()

    const projectA = repo.resolveNode("project-a")
    expect(projectA).not.toBeNull()

    // Level-2 directory contents should NOT be loaded
    const endpoints = repo.resolveNode("endpoints")
    expect(endpoints).toBeNull()

    // Level-2 directories should be unexplored
    expect(repo.unexploredDirs.length).toBe(2)
    const unexploredPaths = repo.unexploredDirs.map((d) => d.path).sort()
    expect(unexploredPaths).toEqual(["docs/api", "projects/alpha"])
  })

  test("unexplored dirs have approximate child counts", () => {
    const root = createTestTree()
    using repo = makeRepo(root, 0)

    // docs/ has: guide.md, readme.md, api/ = 3 children
    const docsDir = repo.unexploredDirs.find((d) => d.path === "docs")
    expect(docsDir).toBeDefined()
    expect(docsDir!.childCount).toBe(3)

    // projects/ has: project-a.md, alpha/ = 2 children
    const projectsDir = repo.unexploredDirs.find((d) => d.path === "projects")
    expect(projectsDir).toBeDefined()
    expect(projectsDir!.childCount).toBe(2)
  })

  test("expandDirectory loads a previously unexplored dir", async () => {
    const root = createTestTree()
    const repo = makeRepo(root, 0)
    try {
      // Before expansion: guide should not exist
      expect(repo.resolveNode("guide")).toBeNull()
      expect(repo.unexploredDirs.length).toBe(2)

      // Expand the docs directory
      const result = await repo.expandDirectory("docs")
      expect(result.nodeCount).toBeGreaterThan(0)

      // After expansion: files in docs/ should be accessible
      const guide = repo.resolveNode("guide")
      expect(guide).not.toBeNull()

      const readme = repo.resolveNode("readme")
      expect(readme).not.toBeNull()

      // docs is no longer unexplored
      expect(repo.unexploredDirs.find((d) => d.path === "docs")).toBeUndefined()

      // But docs/api/ should now be unexplored (depth 0 means each expansion
      // only goes one level deep — but with preloadDepth=0, the expanded dir's
      // subdirs will also be at depth >= preloadDepth)
      const apiDir = repo.unexploredDirs.find((d) => d.path === "docs/api")
      expect(apiDir).toBeDefined()
    } finally {
      repo.close()
    }
  })

  test("expandAll progressively loads all unexplored dirs", async () => {
    const root = createTestTree()
    const repo = makeRepo(root, 0)
    try {
      const initialUnexplored = repo.unexploredDirs.length
      expect(initialUnexplored).toBe(2)

      // Collect all progress events
      const progress = []
      for await (const p of repo.expandAll()) {
        progress.push(p)
      }

      // Should have expanded directories (may be more than 2 if nested dirs are discovered)
      expect(progress.length).toBeGreaterThanOrEqual(2)

      // After expandAll, everything should be loaded
      expect(repo.unexploredDirs.length).toBe(0)

      // Deep file should now be accessible
      const changes = repo.resolveNode("changes")
      expect(changes).not.toBeNull()
    } finally {
      repo.close()
    }
  })

  test("links resolve after expanding target directory", async () => {
    const root = mkdtempSync(join(tmpdir(), "km-preload-links-"))

    // Root file has a wikilink to a file in a subdirectory
    writeFileSync(join(root, "index.md"), "# Index\n\nSee [[deep-doc]] for details.")

    mkdirSync(join(root, "nested"))
    writeFileSync(join(root, "nested", "deep-doc.md"), "# Deep Doc\n\nDeep content.")

    // Load with depth 0 — nested/ is unexplored
    const repo = makeRepo(root, 0)
    try {
      expect(repo.unexploredDirs.length).toBe(1)
      expect(repo.resolveNode("deep-doc")).toBeNull()

      // Expand nested/
      await repo.expandDirectory("nested")

      // Now the target should exist
      const deepDoc = repo.resolveNode("deep-doc")
      expect(deepDoc).not.toBeNull()
    } finally {
      repo.close()
    }
  })

  test("expandDirectory throws for unknown directory", async () => {
    const root = createTestTree()
    const repo = makeRepo(root, 1)
    try {
      await expect(repo.expandDirectory("nonexistent")).rejects.toThrow("not in unexplored list")
    } finally {
      repo.close()
    }
  })

  test("version bumps after expandDirectory", async () => {
    const root = createTestTree()
    const repo = makeRepo(root, 0)
    try {
      const versionBefore = repo.version
      await repo.expandDirectory("docs")
      expect(repo.version).toBeGreaterThan(versionBefore)
    } finally {
      repo.close()
    }
  })
})
