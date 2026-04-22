/**
 * Sync/Reconciliation Benchmarks
 *
 * Measures performance of filesystem sync operations including:
 * - reconcileDirectory (filesystem scan + diff generation)
 * - applyReconcileOps (applying changes to database)
 * - Full sync cycles
 *
 * Uses real filesystem in /tmp for accurate I/O measurement.
 *
 * Run: bun run bench
 */

import { bench, describe, beforeAll, afterAll } from "vitest"
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import { createEmitter, SCHEMA } from "@km/storage"
import { reconcileDirectory } from "@km/fs-mount"
import { applyReconcileOps, scanDirectory } from "@km/fs-mount"
import { Database } from "bun:sqlite"

// ============================================================================
// Test Data Generators
// ============================================================================

interface TestSetup {
  repoDir: string
  db: Database
  emitter: ReturnType<typeof createEmitter>
  cleanup: () => void
}

/**
 * Create a repo with flat markdown files
 */
function createFlatFilesRepo(fileCount: number): TestSetup {
  const testId = ulid()
  const repoDir = join("/tmp", `kmtest-sync-${testId}`)
  const kmDir = join(repoDir, ".km")

  mkdirSync(kmDir, { recursive: true })

  // Create markdown files
  for (let i = 0; i < fileCount; i++) {
    const content = `# File ${i + 1}

This is test file number ${i + 1}.

- [ ] Task ${i}.1 with some content #tag${i % 10}
- [ ] Task ${i}.2 with more content @person${i % 5}
- [x] Task ${i}.3 completed
`
    writeFileSync(
      join(repoDir, `file-${i.toString().padStart(4, "0")}.md`),
      content,
    )
  }

  // Create in-memory database
  const db = new Database(":memory:")
  db.run(SCHEMA)

  const emitter = createEmitter({
    kmDir,
    skipPersist: true,
  })

  return {
    repoDir,
    db,
    emitter,
    cleanup: () => {
      db.close()
      emitter.close()
      if (existsSync(repoDir)) {
        rmSync(repoDir, { recursive: true })
      }
    },
  }
}

/**
 * Create a repo with nested directory structure
 */
function createNestedRepo(depth: number, filesPerDir: number): TestSetup {
  const testId = ulid()
  const repoDir = join("/tmp", `kmtest-sync-nested-${testId}`)
  const kmDir = join(repoDir, ".km")

  mkdirSync(kmDir, { recursive: true })

  function createDirContent(parentPath: string, currentDepth: number): void {
    if (currentDepth >= depth) return

    for (let i = 0; i < filesPerDir; i++) {
      const content = `# Task at depth ${currentDepth}

- [ ] Task ${currentDepth}.${i} #depth${currentDepth}
`
      writeFileSync(
        join(parentPath, `task-${i.toString().padStart(2, "0")}.md`),
        content,
      )
    }

    // Create subdirectories
    for (let i = 0; i < 3; i++) {
      const subDir = join(parentPath, `subdir-${i}`)
      mkdirSync(subDir, { recursive: true })
      createDirContent(subDir, currentDepth + 1)
    }
  }

  createDirContent(repoDir, 0)

  const db = new Database(":memory:")
  db.run(SCHEMA)

  const emitter = createEmitter({
    kmDir,
    skipPersist: true,
  })

  return {
    repoDir,
    db,
    emitter,
    cleanup: () => {
      db.close()
      emitter.close()
      if (existsSync(repoDir)) {
        rmSync(repoDir, { recursive: true })
      }
    },
  }
}

/**
 * Pre-populate database to test incremental sync
 */
function populateDbFromFs(setup: TestSetup): void {
  // Do initial reconcile and apply to populate db
  const ops = reconcileDirectory(setup.db, setup.repoDir, setup.repoDir)
  if (ops.length > 0) {
    applyReconcileOps(setup.db, ops, setup.repoDir, setup.emitter)
  }
}

// ============================================================================
// Benchmarks
// ============================================================================

describe("Sync Benchmarks - Directory Scanning", () => {
  let small: TestSetup
  let medium: TestSetup
  let large: TestSetup

  beforeAll(() => {
    small = createFlatFilesRepo(50) // 50 files
    medium = createFlatFilesRepo(200) // 200 files
    large = createFlatFilesRepo(500) // 500 files
  })

  afterAll(() => {
    small.cleanup()
    medium.cleanup()
    large.cleanup()
  })

  describe("scanDirectory (filesystem read)", () => {
    bench("50 files", () => {
      scanDirectory(small.repoDir)
    })

    bench("200 files", () => {
      scanDirectory(medium.repoDir)
    })

    bench("500 files", () => {
      scanDirectory(large.repoDir)
    })
  })
})

describe("Sync Benchmarks - Reconciliation", () => {
  let small: TestSetup
  let medium: TestSetup

  beforeAll(() => {
    small = createFlatFilesRepo(100)
    medium = createFlatFilesRepo(300)
  })

  afterAll(() => {
    small.cleanup()
    medium.cleanup()
  })

  describe("reconcileDirectory - initial (empty db)", () => {
    bench("100 files - initial sync", () => {
      reconcileDirectory(small.db, small.repoDir, small.repoDir)
    })

    bench("300 files - initial sync", () => {
      reconcileDirectory(medium.db, medium.repoDir, medium.repoDir)
    })
  })

  describe("reconcileDirectory - incremental (populated db)", () => {
    let populatedSmall: TestSetup
    let populatedMedium: TestSetup

    beforeAll(() => {
      populatedSmall = createFlatFilesRepo(100)
      populatedMedium = createFlatFilesRepo(300)
      populateDbFromFs(populatedSmall)
      populateDbFromFs(populatedMedium)
    })

    afterAll(() => {
      populatedSmall.cleanup()
      populatedMedium.cleanup()
    })

    bench("100 files - no changes", () => {
      reconcileDirectory(
        populatedSmall.db,
        populatedSmall.repoDir,
        populatedSmall.repoDir,
      )
    })

    bench("300 files - no changes", () => {
      reconcileDirectory(
        populatedMedium.db,
        populatedMedium.repoDir,
        populatedMedium.repoDir,
      )
    })
  })
})

describe("Sync Benchmarks - Apply Operations", () => {
  describe("applyReconcileOps - creates", () => {
    bench("50 new files", () => {
      const setup = createFlatFilesRepo(50)
      const ops = reconcileDirectory(setup.db, setup.repoDir, setup.repoDir)
      applyReconcileOps(setup.db, ops, setup.repoDir, setup.emitter)
      setup.cleanup()
    })

    bench("100 new files", () => {
      const setup = createFlatFilesRepo(100)
      const ops = reconcileDirectory(setup.db, setup.repoDir, setup.repoDir)
      applyReconcileOps(setup.db, ops, setup.repoDir, setup.emitter)
      setup.cleanup()
    })
  })
})

describe("Sync Benchmarks - Nested Structure", () => {
  let shallow: TestSetup // depth=2, 3 files/dir
  let medium: TestSetup // depth=3, 3 files/dir

  beforeAll(() => {
    shallow = createNestedRepo(2, 3) // ~39 files
    medium = createNestedRepo(3, 3) // ~117 files
  })

  afterAll(() => {
    shallow.cleanup()
    medium.cleanup()
  })

  describe("scanDirectory - nested", () => {
    bench("depth=2 (39 files)", () => {
      scanDirectory(shallow.repoDir)
    })

    bench("depth=3 (117 files)", () => {
      scanDirectory(medium.repoDir)
    })
  })

  describe("reconcileDirectory - nested", () => {
    bench("depth=2 - initial sync", () => {
      reconcileDirectory(shallow.db, shallow.repoDir, shallow.repoDir)
    })

    bench("depth=3 - initial sync", () => {
      reconcileDirectory(medium.db, medium.repoDir, medium.repoDir)
    })
  })
})

describe("Sync Benchmarks - Full Cycle", () => {
  bench("full sync cycle - 50 files", () => {
    const setup = createFlatFilesRepo(50)

    // Reconcile
    const ops = reconcileDirectory(setup.db, setup.repoDir, setup.repoDir)

    // Apply
    if (ops.length > 0) {
      applyReconcileOps(setup.db, ops, setup.repoDir, setup.emitter)
    }

    // Second reconcile (should find no changes)
    reconcileDirectory(setup.db, setup.repoDir, setup.repoDir)

    setup.cleanup()
  })

  bench("full sync cycle - 100 files", () => {
    const setup = createFlatFilesRepo(100)

    // Reconcile
    const ops = reconcileDirectory(setup.db, setup.repoDir, setup.repoDir)

    // Apply
    if (ops.length > 0) {
      applyReconcileOps(setup.db, ops, setup.repoDir, setup.emitter)
    }

    // Second reconcile (should find no changes)
    reconcileDirectory(setup.db, setup.repoDir, setup.repoDir)

    setup.cleanup()
  })
})
