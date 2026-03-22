/**
 * Path utilities micro-benchmark
 *
 * Compares path.join/basename/relative vs manual string operations
 * to determine if a fastPath utility is worthwhile.
 *
 * Run: bun vitest bench benchmarks/path-utils.bench.ts
 */

import { bench, describe } from "vitest"
import { join, basename, relative, sep } from "path"
import { join as nodeJoin, basename as nodeBasename, relative as nodeRelative, sep as nodeSep } from "node:path"

// Realistic test data
const dirPath = "/Users/beorn/Code/pim/km/imports/asana/stabell/early-orbit"
const entryName = "project-alpha.md"
const repoRoot = "/Users/beorn/Code/pim/km/imports/asana"
const absolutePath = "/Users/beorn/Code/pim/km/imports/asana/stabell/early-orbit/project-alpha.md"
const fsPath = "stabell/early-orbit/project-alpha.md"

// ============================================================================
// join(dirPath, name) vs string concat
// ============================================================================

describe("join: dirPath + filename", () => {
  bench('path.join (via "path")', () => {
    join(dirPath, entryName)
  })

  bench('path.join (via "node:path")', () => {
    nodeJoin(dirPath, entryName)
  })

  bench("dir + sep + name", () => {
    void (dirPath + sep + entryName)
  })

  bench('dir + "/" + name', () => {
    void (dirPath + "/" + entryName)
  })
})

// ============================================================================
// basename extraction
// ============================================================================

describe("basename extraction", () => {
  bench('basename (via "path")', () => {
    basename(absolutePath)
  })

  bench('basename (via "node:path")', () => {
    nodeBasename(absolutePath)
  })

  bench("lastIndexOf(sep) + slice", () => {
    const i = absolutePath.lastIndexOf(sep)
    void (i >= 0 ? absolutePath.slice(i + 1) : absolutePath)
  })
})

// ============================================================================
// relative path: path.relative vs startsWith + slice
// ============================================================================

describe("relative path extraction", () => {
  bench('relative (via "path")', () => {
    relative(repoRoot, absolutePath)
  })

  bench('relative (via "node:path")', () => {
    nodeRelative(repoRoot, absolutePath)
  })

  bench("startsWith + slice (with sep)", () => {
    const prefix = repoRoot + sep
    void (absolutePath.startsWith(prefix) ? absolutePath.slice(prefix.length) : relative(repoRoot, absolutePath))
  })

  bench("startsWith + slice (precomputed prefix)", () => {
    void (absolutePath.startsWith(_cachedPrefix) ? absolutePath.slice(_cachedPrefix.length) : relative(repoRoot, absolutePath))
  })
})

const _cachedPrefix = repoRoot + sep

// ============================================================================
// basename + strip .md (link-resolver hot path)
// ============================================================================

describe("basename + strip .md extension", () => {
  bench("path.basename + replace regex", () => {
    basename(fsPath).replace(/\.md$/i, "")
  })

  bench("split(sep).pop() + replace regex", () => {
    fsPath.split(sep).pop()?.replace(/\.md$/i, "")
  })

  bench("lastIndexOf(sep) + endsWith check", () => {
    const i = fsPath.lastIndexOf(sep)
    let name = i >= 0 ? fsPath.slice(i + 1) : fsPath
    if (name.endsWith(".md") || name.endsWith(".MD")) name = name.slice(0, -3)
    void name
  })
})

// ============================================================================
// isHiddenFile patterns
// ============================================================================

const hiddenPath = "/Users/beorn/Code/pim/km/.git/config"
const normalPath = "/Users/beorn/Code/pim/km/imports/asana/stabell/project.md"

describe("isHiddenFile check", () => {
  bench("basename + startsWith (normal file)", () => {
    const name = basename(normalPath)
    void (name.startsWith(".") && name !== "." && name !== ".." && name !== ".md")
  })

  bench("basename + startsWith (hidden file)", () => {
    const name = basename(hiddenPath)
    void (name.startsWith(".") && name !== "." && name !== ".." && name !== ".md")
  })

  bench("lastIndexOf + charCodeAt (normal file)", () => {
    const idx = normalPath.lastIndexOf(sep)
    const start = idx >= 0 ? idx + 1 : 0
    if (normalPath.charCodeAt(start) !== 46) {
      void false
    } else {
      const name = normalPath.slice(start)
      void (name !== "." && name !== ".." && name !== ".md")
    }
  })

  bench("lastIndexOf + charCodeAt (hidden file)", () => {
    const idx = hiddenPath.lastIndexOf(sep)
    const start = idx >= 0 ? idx + 1 : 0
    if (hiddenPath.charCodeAt(start) !== 46) {
      void false
    } else {
      const name = hiddenPath.slice(start)
      void (name !== "." && name !== ".." && name !== ".md")
    }
  })
})
