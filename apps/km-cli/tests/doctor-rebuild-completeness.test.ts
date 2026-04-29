/**
 * Doctor rebuild: count-and-warn for skipped/failed files.
 *
 * `km doctor rebuild` re-parses every markdown file in the vault. When a file
 * fails to parse OR is silently skipped, the rebuild used to claim success
 * while quietly missing N files. This test pins the count tracking that
 * `parseDeferredAsync` now exposes — `parsed`, `skipped`, and `failed[]` —
 * so the rebuild summary can no longer hide a partial completion.
 *
 * Tracking bead: km-beads-rebuild-completeness-plateau (P0).
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { withTestEnv, parseDeferredAsync } from "@km/storage"

interface StubFixture {
  id: string
  fsPath: string
  parentId?: string | null
  parentIdx?: number
  alreadyParsed?: boolean
}

function insertStub(db: import("bun:sqlite").Database, fix: StubFixture): void {
  const now = Date.now()
  db.prepare(
    `INSERT INTO nodes (
       id, type, fstype, parent_id, parent_idx, fs_path, name, title,
       data, parsed, created_at, updated_at
     ) VALUES (?, 'h', 'mdfile', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    fix.id,
    fix.parentId ?? null,
    fix.parentIdx ?? 0,
    fix.fsPath,
    fix.id,
    fix.id,
    JSON.stringify({ _stub: true }),
    fix.alreadyParsed ? 1 : 0,
    now,
    now,
  )
}

describe.sequential("doctor rebuild: count-and-warn for skipped/failed", () => {
  // The deferred parser logs failed-file paths via loggily at WARN. The infra
  // setup treats any console.warn during a test as a failure, so silence it
  // here — the assertions below already verify the failure surface.
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test("imports parseable files and reports them as imported", async () => {
    await withTestEnv(async ({ db }) => {
      const dir = mkdtempSync(join(tmpdir(), "kmtest-rebuild-"))
      try {
        const fA = join(dir, "a.md")
        const fB = join(dir, "b.md")
        writeFileSync(fA, "# A\n\n- [ ] task in A\n")
        writeFileSync(fB, "# B\n\n- [ ] task in B\n")

        insertStub(db, { id: "stub-a", fsPath: fA })
        insertStub(db, { id: "stub-b", fsPath: fB })

        // Force the sequential path so the test stays single-threaded and
        // deterministic. The pool path is exercised by integration tests.
        const result = await parseDeferredAsync(
          db,
          [
            { nodeId: "stub-a", fsPath: fA },
            { nodeId: "stub-b", fsPath: fB },
          ],
          undefined,
          { useWorkerPool: false },
        )

        expect(result.parsed).toBe(2)
        expect(result.skipped).toBe(0)
        expect(result.failed).toEqual([])
      } finally {
        rmSync(dir, { recursive: true })
      }
    })
  })

  test("reports failed files with paths + error messages on parse failure", async () => {
    await withTestEnv(async ({ db }) => {
      const dir = mkdtempSync(join(tmpdir(), "kmtest-rebuild-"))
      try {
        const fGood = join(dir, "good.md")
        writeFileSync(fGood, "# Good\n\n- [ ] task\n")

        // Missing file — readFileSync throws ENOENT during the parse step.
        const fMissing = join(dir, "missing.md")

        insertStub(db, { id: "stub-good", fsPath: fGood })
        insertStub(db, { id: "stub-missing", fsPath: fMissing })

        const result = await parseDeferredAsync(
          db,
          [
            { nodeId: "stub-good", fsPath: fGood },
            { nodeId: "stub-missing", fsPath: fMissing },
          ],
          undefined,
          { useWorkerPool: false },
        )

        expect(result.parsed).toBe(1)
        expect(result.skipped).toBe(0)
        expect(result.failed.length).toBe(1)
        expect(result.failed[0]!.fsPath).toBe(fMissing)
        // ENOENT message is shape-dependent on the platform; just assert
        // it isn't empty so consumers can render it.
        expect(result.failed[0]!.error.length).toBeGreaterThan(0)

        // The summary math (imported + skipped + failed === inputs) is the
        // contract a callers like `km doctor rebuild` rely on.
        expect(result.parsed + result.skipped + result.failed.length).toBe(2)
      } finally {
        rmSync(dir, { recursive: true })
      }
    })
  })

  test("counts already-parsed stubs as skipped (idempotent rebuild)", async () => {
    await withTestEnv(async ({ db }) => {
      const dir = mkdtempSync(join(tmpdir(), "kmtest-rebuild-"))
      try {
        const fA = join(dir, "a.md")
        const fB = join(dir, "b.md")
        writeFileSync(fA, "# A\n")
        writeFileSync(fB, "# B\n")

        insertStub(db, { id: "stub-a", fsPath: fA, alreadyParsed: true })
        insertStub(db, { id: "stub-b", fsPath: fB })

        const result = await parseDeferredAsync(
          db,
          [
            { nodeId: "stub-a", fsPath: fA },
            { nodeId: "stub-b", fsPath: fB },
          ],
          undefined,
          { useWorkerPool: false },
        )

        // stub-a already had parsed=1 → skipped; stub-b imported.
        expect(result.parsed).toBe(1)
        expect(result.skipped).toBe(1)
        expect(result.failed).toEqual([])
      } finally {
        rmSync(dir, { recursive: true })
      }
    })
  })

  test("zero deferred files → all-zero counts (no work, no warn)", async () => {
    await withTestEnv(async ({ db }) => {
      const result = await parseDeferredAsync(db, [], undefined, { useWorkerPool: false })
      expect(result).toEqual({ parsed: 0, skipped: 0, failed: [], pendingLinks: [] })
    })
  })

  test("worker-pool path also surfaces failed paths (≥4 files default)", async () => {
    await withTestEnv(async ({ db }) => {
      const dir = mkdtempSync(join(tmpdir(), "kmtest-rebuild-"))
      try {
        const files = [
          { id: "stub-1", path: join(dir, "f1.md") },
          { id: "stub-2", path: join(dir, "f2.md") },
          { id: "stub-3", path: join(dir, "f3.md") },
          { id: "stub-4", path: join(dir, "f4-missing.md") }, // never written
          { id: "stub-5", path: join(dir, "f5.md") },
        ]
        for (const f of files) {
          if (!f.path.includes("missing")) {
            writeFileSync(f.path, `# ${f.id}\n`)
          }
          insertStub(db, { id: f.id, fsPath: f.path })
        }

        const result = await parseDeferredAsync(
          db,
          files.map((f) => ({ nodeId: f.id, fsPath: f.path })),
          // useWorkerPool default = true for total >= 4
        )

        // Exactly one missing file → exactly one failure surfaced.
        expect(result.failed.length).toBe(1)
        expect(result.failed[0]!.fsPath).toContain("missing")
        // Sum still equals input count: parsed + skipped + failed = 5.
        expect(result.parsed + result.skipped + result.failed.length).toBe(5)
      } finally {
        rmSync(dir, { recursive: true })
      }
    })
  })
})
