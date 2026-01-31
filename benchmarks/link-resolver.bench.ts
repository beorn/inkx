/**
 * Link Resolver Benchmarks
 *
 * Measures performance of link resolution operations:
 * - createLinkResolver: building the name→id lookup map from DB
 * - resolveTarget: finding nodes by name (in-memory map lookup)
 *
 * These benchmarks help detect regressions in:
 * - Initial resolver build time (affected by query: WHERE name IS NOT NULL)
 * - Lookup performance (affected by map size with folders/sections)
 *
 * Run: bun run bench
 */

import { bench, describe, beforeAll, afterAll } from "vitest"
import { Database } from "bun:sqlite"
import { SCHEMA, createLinkResolver } from "@km/storage"
import { ulid } from "ulid"

// ============================================================================
// Test Data Generators
// ============================================================================

interface TestDb {
  db: Database
  fileNames: string[]
  folderNames: string[]
  sectionNames: string[]
  cleanup: () => void
}

/**
 * Create a database with files, folders, and sections
 */
function createTestDb(
  fileCount: number,
  folderCount: number,
  sectionsPerFile: number,
): TestDb {
  const db = new Database(":memory:")
  db.run(SCHEMA)

  const fileNames: string[] = []
  const folderNames: string[] = []
  const sectionNames: string[] = []
  const now = Date.now()

  // Create folders
  for (let i = 0; i < folderCount; i++) {
    const name = `folder-${i.toString().padStart(4, "0")}`
    folderNames.push(name)
    db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, fs_path, name, content, data, created_at, updated_at)
       VALUES (?, 'folder', NULL, ?, ?, ?, ?, '{}', ?, ?)`,
      [ulid(), i, `/test/${name}`, name, name, now, now],
    )
  }

  // Create files with sections
  for (let i = 0; i < fileCount; i++) {
    const fileName = `file-${i.toString().padStart(4, "0")}`
    fileNames.push(fileName)
    const fileId = ulid()

    db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, fs_path, name, content, data, created_at, updated_at)
       VALUES (?, 'file', NULL, ?, ?, ?, ?, '{}', ?, ?)`,
      [fileId, i, `/test/${fileName}.md`, fileName, `# ${fileName}`, now, now],
    )

    // Create sections for this file
    for (let j = 0; j < sectionsPerFile; j++) {
      const sectionName = `section-${i}-${j}`
      sectionNames.push(sectionName)
      db.run(
        `INSERT INTO nodes (id, type, parent_id, parent_idx, name, title, content, data, created_at, updated_at)
         VALUES (?, 'section', ?, ?, ?, ?, ?, '{"depth":2}', ?, ?)`,
        [
          ulid(),
          fileId,
          j,
          sectionName,
          `Section ${j}`,
          `## Section ${j}`,
          now,
          now,
        ],
      )
    }
  }

  return {
    db,
    fileNames,
    folderNames,
    sectionNames,
    cleanup: () => db.close(),
  }
}

// ============================================================================
// Benchmarks
// ============================================================================

describe("Link Resolver - createLinkResolver", () => {
  let small: TestDb
  let medium: TestDb
  let large: TestDb

  beforeAll(() => {
    small = createTestDb(50, 10, 3) // ~200 named nodes
    medium = createTestDb(200, 30, 5) // ~1200 named nodes
    large = createTestDb(500, 50, 5) // ~3050 named nodes
  })

  afterAll(() => {
    small.cleanup()
    medium.cleanup()
    large.cleanup()
  })

  bench("200 nodes - build resolver", () => {
    createLinkResolver(small.db)
  })

  bench("1200 nodes - build resolver", () => {
    createLinkResolver(medium.db)
  })

  bench("3000 nodes - build resolver", () => {
    createLinkResolver(large.db)
  })
})

describe("Link Resolver - resolveTarget", () => {
  let db: TestDb
  let resolver: ReturnType<typeof createLinkResolver>

  beforeAll(() => {
    db = createTestDb(500, 50, 5)
    resolver = createLinkResolver(db.db)
  })

  afterAll(() => {
    db.cleanup()
  })

  bench("resolve file by name", () => {
    resolver.resolveTarget("file-0250")
  })

  bench("resolve folder by name", () => {
    resolver.resolveTarget("folder-0025")
  })

  bench("resolve section by name", () => {
    resolver.resolveTarget("section-250-2")
  })

  bench("resolve nonexistent", () => {
    resolver.resolveTarget("nonexistent-target")
  })

  bench("10 mixed lookups", () => {
    resolver.resolveTarget("file-0100")
    resolver.resolveTarget("folder-0010")
    resolver.resolveTarget("section-100-1")
    resolver.resolveTarget("file-0200")
    resolver.resolveTarget("folder-0020")
    resolver.resolveTarget("section-200-2")
    resolver.resolveTarget("file-0300")
    resolver.resolveTarget("folder-0030")
    resolver.resolveTarget("section-300-3")
    resolver.resolveTarget("nonexistent")
  })
})

describe("Link Resolver - resolver.addFile", () => {
  let db: TestDb
  let resolver: ReturnType<typeof createLinkResolver>

  beforeAll(() => {
    db = createTestDb(500, 50, 5)
    resolver = createLinkResolver(db.db)
  })

  afterAll(() => {
    db.cleanup()
  })

  bench("add 100 new files to resolver", () => {
    for (let i = 0; i < 100; i++) {
      resolver.addFile(`new-file-${i}`, `newfile${i}`)
    }
  })
})
