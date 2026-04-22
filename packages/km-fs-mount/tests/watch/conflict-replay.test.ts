/**
 * Conflict → replay → success — integration test for the content-as-CAS
 * contract (hub/km/storage-architecture.md §7.1).
 *
 * Scenario: km intends to write V2 expecting disk at V1, but an external
 * editor has already moved disk to V1-external. The safe-write layer must
 * flag the first attempt as "conflict"; the replay (re-read disk, re-apply
 * intended change against current content, serialize, write) must succeed.
 */

import { describe, test, expect, afterEach } from "vitest"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { safeWriteFile } from "../../src/watch/safe-write.ts"
import { hashContent } from "../../src/fs/cas.ts"

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
})

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "km-conflict-replay-"))
  tempDirs.push(dir)
  return dir
}

describe("conflict-replay", () => {
  test("external edit detected, replay against disk succeeds", () => {
    const dir = makeTempDir()
    const path = join(dir, "notes.md")

    // V1 — the content km last observed.
    const v1 = "# Notes\n\n- [ ] Alpha\n"
    writeFileSync(path, v1, "utf-8")
    const observedHash = hashContent(v1)

    // Meanwhile, an external editor appends a task.
    const external = "# Notes\n\n- [ ] Alpha\n- [ ] External\n"
    writeFileSync(path, external, "utf-8")

    // km tries to add its own task based on V1. Intended content:
    const intended = "# Notes\n\n- [x] Alpha\n"

    // First attempt — guard rejects because disk ≠ observedHash.
    const first = safeWriteFile(path, intended, { expectedHash: observedHash })
    expect(first.outcome).toBe("conflict")
    expect(first.actualHashBefore).toBe(hashContent(external))
    // Disk preserved — the user's external edit is intact.
    expect(readFileSync(path, "utf-8")).toBe(external)

    // Replay: re-read disk, re-apply intended change to current content.
    // (In real km this is "re-parse disk AST, apply the in-memory mutation,
    // re-serialize." The contract here is that replay must read fresh bytes
    // and supply the NEW expected hash — safeWriteFile does the rest.)
    const diskNow = readFileSync(path, "utf-8")
    const diskNowHash = hashContent(diskNow)
    const replayed = diskNow.replace("- [ ] Alpha\n", "- [x] Alpha\n")

    const second = safeWriteFile(path, replayed, { expectedHash: diskNowHash })
    expect(second.outcome).toBe("wrote")
    expect(readFileSync(path, "utf-8")).toBe("# Notes\n\n- [x] Alpha\n- [ ] External\n")
  })

  test("conflict never silently overwrites external edits", () => {
    const dir = makeTempDir()
    const path = join(dir, "precious.md")

    writeFileSync(path, "user's precious edit\n", "utf-8")

    // km thinks disk is still empty.
    const result = safeWriteFile(path, "km wants to clobber\n", {
      expectedHash: hashContent("some stale thing km once saw\n"),
    })

    expect(result.outcome).toBe("conflict")
    expect(readFileSync(path, "utf-8")).toBe("user's precious edit\n")
  })

  test("replay after noop is idempotent", () => {
    const dir = makeTempDir()
    const path = join(dir, "idempotent.md")
    const v1 = "stable\n"
    writeFileSync(path, v1, "utf-8")
    const h = hashContent(v1)

    // First write — matches disk bytes → noop.
    const first = safeWriteFile(path, v1, { expectedHash: h })
    expect(first.outcome).toBe("noop")

    // Second write of the same content — still a noop.
    const second = safeWriteFile(path, v1, { expectedHash: h })
    expect(second.outcome).toBe("noop")

    expect(readFileSync(path, "utf-8")).toBe(v1)
  })
})
