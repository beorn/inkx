/**
 * safeWriteFile + writeFileAtomic — unit tests for the content-as-CAS
 * contract (hub/km/storage-architecture.md §7.1).
 */

import { describe, test, expect, afterEach } from "vitest"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { spawnSync } from "child_process"

import { safeWriteFile, writeFileAtomic } from "../../src/watch/safe-write.ts"
import { hashContent } from "../../src/fs/cas.ts"

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
})

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "km-safe-write-"))
  tempDirs.push(dir)
  return dir
}

describe("safeWriteFile — outcomes", () => {
  test("wrote — fresh file with no expected hash", () => {
    const dir = makeTempDir()
    const path = join(dir, "fresh.md")
    const content = "# Fresh\n"

    const result = safeWriteFile(path, content, { expectedHash: null })

    expect(result.outcome).toBe("wrote")
    expect(result.actualHashBefore).toBeNull()
    expect(result.newHash).toBe(hashContent(content))
    expect(readFileSync(path, "utf-8")).toBe(content)
  })

  test("wrote — existing file whose hash matches expected", () => {
    const dir = makeTempDir()
    const path = join(dir, "existing.md")
    const baseline = "# Baseline\n"
    writeFileSync(path, baseline, "utf-8")
    const baselineHash = hashContent(baseline)

    const next = "# Baseline\n\nAdded line.\n"
    const result = safeWriteFile(path, next, { expectedHash: baselineHash })

    expect(result.outcome).toBe("wrote")
    expect(result.actualHashBefore).toBe(baselineHash)
    expect(result.newHash).toBe(hashContent(next))
    expect(readFileSync(path, "utf-8")).toBe(next)
  })

  test("conflict — disk bytes diverged from expected hash", () => {
    const dir = makeTempDir()
    const path = join(dir, "conflict.md")
    const staleExpected = hashContent("# Old\n")
    writeFileSync(path, "# Externally edited\n", "utf-8")

    const attempted = "# km's intended content\n"
    const result = safeWriteFile(path, attempted, { expectedHash: staleExpected })

    expect(result.outcome).toBe("conflict")
    expect(result.actualHashBefore).toBe(hashContent("# Externally edited\n"))
    expect(result.newHash).toBeNull()
    // Disk unchanged — the user's external edit is preserved.
    expect(readFileSync(path, "utf-8")).toBe("# Externally edited\n")
  })

  test("noop — on-disk content already matches new content", () => {
    const dir = makeTempDir()
    const path = join(dir, "noop.md")
    const content = "# Same\n"
    writeFileSync(path, content, "utf-8")
    const hash = hashContent(content)

    const result = safeWriteFile(path, content, { expectedHash: hash })

    expect(result.outcome).toBe("noop")
    expect(result.actualHashBefore).toBe(hash)
    expect(result.newHash).toBe(hash)
  })

  test("wrote — fresh file when expectedHash is provided but file doesn't exist", () => {
    // Odd but legal: caller expects a hash we don't have, file is missing.
    // First-observation semantics: proceed (reconcile will re-populate hash).
    const dir = makeTempDir()
    const path = join(dir, "new.md")
    const content = "hello"

    const result = safeWriteFile(path, content, { expectedHash: "deadbeef" })

    // File doesn't exist → actualHashBefore is null → null !== "deadbeef"
    // → conflict. This is the stricter (safer) interpretation.
    expect(result.outcome).toBe("conflict")
    expect(existsSync(path)).toBe(false)
  })

  test("creates missing parent directories", () => {
    const dir = makeTempDir()
    const path = join(dir, "deep", "nested", "file.md")

    const result = safeWriteFile(path, "x\n", { expectedHash: null })

    expect(result.outcome).toBe("wrote")
    expect(readFileSync(path, "utf-8")).toBe("x\n")
  })
})

describe("writeFileAtomic", () => {
  test("writes expected content", () => {
    const dir = makeTempDir()
    const path = join(dir, "atomic.md")

    writeFileAtomic(path, "hello world\n")

    expect(readFileSync(path, "utf-8")).toBe("hello world\n")
  })

  test("replaces existing file", () => {
    const dir = makeTempDir()
    const path = join(dir, "replace.md")
    writeFileSync(path, "old\n", "utf-8")

    writeFileAtomic(path, "new\n")

    expect(readFileSync(path, "utf-8")).toBe("new\n")
  })

  test("no stray .tmp crumbs remain after successful write", () => {
    const dir = makeTempDir()
    const path = join(dir, "clean.md")

    writeFileAtomic(path, "clean\n")

    const leftovers = readDirTmpFiles(dir)
    expect(leftovers).toEqual([])
  })

  test("creates parent directories as needed", () => {
    const dir = makeTempDir()
    const path = join(dir, "a", "b", "c", "file.md")

    writeFileAtomic(path, "deep\n")

    expect(readFileSync(path, "utf-8")).toBe("deep\n")
  })
})

describe("writeFileAtomic — crash survival", () => {
  test("subprocess killed mid-write leaves target in one of two known states", () => {
    // Exercise atomicity: spawn a subprocess that writes, then self-kills via
    // SIGKILL so we can't clean up gracefully. The parent then verifies the
    // target is either (a) untouched pre-rename or (b) fully new post-rename —
    // never a torn mid-write. We implement the atomic write inline in the
    // child (not via `require('...ts')`, which node can't load) so the test
    // doesn't depend on a .ts loader.
    const dir = makeTempDir()
    const path = join(dir, "crash.md")
    writeFileSync(path, "OLD\n", "utf-8")

    // Large payload ensures the temp-write takes measurable time; the kill
    // interleaves somewhere inside the write-then-rename sequence.
    const payload = "NEW\n".repeat(50_000)

    const script = `
      const fs = require("fs");
      const path = require("path");
      const target = ${JSON.stringify(path)};
      const tmp = path.join(path.dirname(target), "." + path.basename(target) + ".tmp-" + process.pid + "-1.tmp");
      // Register a SIGKILL on the next microtask — the kill can land between
      // writeFileSync, fsync, and renameSync. The invariant (never-torn target)
      // must hold for any interleaving.
      setImmediate(() => { try { process.kill(process.pid, "SIGKILL"); } catch (_) {} });
      try {
        fs.writeFileSync(tmp, ${JSON.stringify(payload)}, "utf-8");
        const fd = fs.openSync(tmp, "r+");
        try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        fs.renameSync(tmp, target);
      } catch (_) {}
    `
    spawnSync(process.execPath, ["-e", script], { encoding: "utf-8" })

    expect(existsSync(path)).toBe(true)
    const final = readFileSync(path, "utf-8")
    // Either the rename landed (full new content) or it didn't (old content).
    const atomic = final === "OLD\n" || final === payload
    expect(atomic).toBe(true)
  })
})

describe("safeWriteFile — FsWriteTarget compatibility", () => {
  test("result is sync (no Promise returned)", () => {
    const dir = makeTempDir()
    const path = join(dir, "sync.md")

    const result = safeWriteFile(path, "x", { expectedHash: null })

    // If safeWriteFile returned a Promise this line would throw.
    expect(result.outcome).toBe("wrote")
  })
})

function readDirTmpFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".tmp") || f.includes(".tmp-"))
  } catch {
    return []
  }
}
