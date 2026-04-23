/**
 * Regression tests for km-q5hji Phase C — enforcement.
 *
 * Bug: chat-transcript tasks at `raw/chats/**` and doc-example task lines in
 * `ref/Tech/km-user-guide.md` surfaced in `/due` and similar aggregations
 * even when the vault had `inactive: ["raw/chats/**"]` configured.
 *
 * What these tests pin:
 *
 *  1. End-to-end read of `.km/config.yaml` → loader builds a
 *     CollapseParseMatcher that matches the configured globs. Tasks
 *     inside inactive files do NOT appear in `getAllTasks(db)`.
 *
 *  2. Block-id collision: when two nodes share the same `name` (anchor id),
 *     the ACTIVE (non-inactive) node wins on lookup. The inactive copy
 *     exists as an opaque stub and must never shadow the real node.
 *
 * Uses the real discovery / loader path — not test-only matcher injection —
 * because the original failure was config plumbing, not matcher logic.
 */

import { describe, expect, test } from "vitest"
import { Database } from "bun:sqlite"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { SCHEMA } from "../src/db/schema.ts"
import { loadRepo } from "../src/repo/loader.ts"
import { getAllTasks, resolveNode } from "../src/db/db.ts"
import { clearConfigCache } from "../src/config.ts"

function freshVault(): string {
  return mkdtempSync(join(tmpdir(), "km-inactive-tasks-"))
}

function runLoad(tmpDir: string, db: Database): void {
  // Must NOT pass an explicit collapseMatcher — we want the loader to read
  // `.km/config.yaml` and construct one itself (that's the code path the
  // original bug lived in). Force memory mode: these tests care about the
  // parse + aggregate pipeline, not changes.jsonl replay (which disk mode
  // would require).
  const gen = loadRepo(tmpDir, { db, mode: "memory" })
  let r = gen.next()
  while (!r.done) r = gen.next()
}

describe("inactive files do not leak tasks into aggregation queries", () => {
  test("tasks inside `inactive:` globs are not returned by getAllTasks", () => {
    const tmpDir = freshVault()

    // .km/config.yaml with inactive:
    mkdirSync(join(tmpDir, ".km"), { recursive: true })
    writeFileSync(
      join(tmpDir, ".km/config.yaml"),
      `inactive:
  - "raw/chats/**"
`,
      "utf-8",
    )

    // Vault content: one inactive chat file with a fake task, one active
    // project file with a real task.
    mkdirSync(join(tmpDir, "raw", "chats"), { recursive: true })
    mkdirSync(join(tmpDir, "project"), { recursive: true })
    writeFileSync(
      join(tmpDir, "raw", "chats", "echo.md"),
      `# Chat

- [ ] fake task from chat
`,
      "utf-8",
    )
    writeFileSync(
      join(tmpDir, "project", "real.md"),
      `# Real Project

- [ ] real task
`,
      "utf-8",
    )

    const db = new Database(":memory:")
    db.run(SCHEMA)

    clearConfigCache()
    runLoad(tmpDir, db)

    const tasks = getAllTasks(db)
    const taskContents = tasks.map((t) => t.content)

    expect(taskContents).toContain("real task")
    expect(taskContents).not.toContain("fake task from chat")
  })

  test("opaque stub for inactive file exists but has no task children", () => {
    const tmpDir = freshVault()

    mkdirSync(join(tmpDir, ".km"), { recursive: true })
    writeFileSync(
      join(tmpDir, ".km/config.yaml"),
      `inactive:
  - "raw/chats/**"
`,
      "utf-8",
    )

    mkdirSync(join(tmpDir, "raw", "chats"), { recursive: true })
    writeFileSync(
      join(tmpDir, "raw", "chats", "echo.md"),
      `# Chat

- [ ] fake task
- [ ] another fake task
`,
      "utf-8",
    )

    const db = new Database(":memory:")
    db.run(SCHEMA)

    clearConfigCache()
    runLoad(tmpDir, db)

    // The file node exists (searchable).
    const stub = resolveNode(db, "raw/chats/echo.md")
    expect(stub).toBeDefined()

    // But no children were parsed out (tasks included).
    const children = db.prepare("SELECT COUNT(*) AS n FROM nodes WHERE parent_id = ?").get(stub!.id) as {
      n: number
    }
    expect(children.n).toBe(0)

    // And getAllTasks returns empty.
    const tasks = getAllTasks(db)
    expect(tasks).toEqual([])
  })
})

describe("block-id collision: active wins over inactive", () => {
  test("anchor `^apr15-ca-ftb` resolves to the active file, not the inactive doc-example", () => {
    const tmpDir = freshVault()

    // Config: `ref/Tech/**` is inactive (doc/example content that happens
    // to contain task lines and anchors).
    mkdirSync(join(tmpDir, ".km"), { recursive: true })
    writeFileSync(
      join(tmpDir, ".km/config.yaml"),
      `inactive:
  - "ref/Tech/**"
`,
      "utf-8",
    )

    // Active: a real workstream task with a ^apr15-ca-ftb anchor.
    mkdirSync(join(tmpDir, "projects", "+taxes"), { recursive: true })
    writeFileSync(
      join(tmpDir, "projects", "+taxes", "workstreams.md"),
      `# Tax Workstreams

- [ ] CA FTB estimated payment ^apr15-ca-ftb
`,
      "utf-8",
    )

    // Inactive: doc example repeating the same anchor as pedagogical content.
    mkdirSync(join(tmpDir, "ref", "Tech"), { recursive: true })
    writeFileSync(
      join(tmpDir, "ref", "Tech", "km-user-guide.md"),
      `# km User Guide

Example task block:

- [ ] CA FTB example ^apr15-ca-ftb
`,
      "utf-8",
    )

    const db = new Database(":memory:")
    db.run(SCHEMA)

    clearConfigCache()
    runLoad(tmpDir, db)

    // Only the active anchor is materialized as a node — the inactive
    // doc-example is stubbed, so its child ^apr15-ca-ftb never existed.
    const resolved = resolveNode(db, "^apr15-ca-ftb")
    expect(resolved).toBeDefined()

    // Walk the parent chain up to the file node that owns fs_path and
    // check we landed in the active workstream, not under ref/Tech/.
    let cursor: { id: string; parent_id: string | null; fs_path: string | null } | null = {
      id: resolved!.id,
      parent_id: resolved!.parent_id ?? null,
      fs_path: resolved!.fs_path ?? null,
    }
    let fsPath: string | null = null
    while (cursor) {
      if (cursor.fs_path) {
        fsPath = cursor.fs_path
        break
      }
      if (!cursor.parent_id) break
      cursor = db.prepare("SELECT id, parent_id, fs_path FROM nodes WHERE id = ?").get(cursor.parent_id) as {
        id: string
        parent_id: string | null
        fs_path: string | null
      } | null
    }

    expect(fsPath ?? "").toMatch(/projects\/\+taxes\/workstreams\.md/)

    // Assert that the inactive copy's anchor is NOT what we resolved to:
    // the inactive file's tree should contain zero nodes named
    // "apr15-ca-ftb" (since the stub has no children).
    const inactiveFile = db.prepare("SELECT id FROM nodes WHERE fs_path LIKE '%ref/Tech/km-user-guide.md'").get() as
      | { id: string }
      | undefined
    expect(inactiveFile).toBeDefined()
    const collisions = db
      .prepare("SELECT COUNT(*) AS n FROM nodes WHERE parent_id = ? AND name = ?")
      .get(inactiveFile!.id, "apr15-ca-ftb") as { n: number }
    expect(collisions.n).toBe(0)
  })
})
