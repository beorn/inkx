/**
 * EchoGuard — unit tests for watcher echo suppression (§7.4).
 */

import { describe, test, expect, afterEach } from "vitest"
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"

import { createEchoGuard } from "../../src/watch/echo-guard.ts"
import { hashContent } from "../../src/fs/cas.ts"

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  }
})

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "km-echo-guard-"))
  tempDirs.push(dir)
  return dir
}

describe("EchoGuard — fast path", () => {
  test("consume with matching (mtime, size) returns 'echo'", () => {
    const guard = createEchoGuard()
    guard.expect("/tmp/a.md", 1_700_000_000_000, 100, "content")

    expect(guard.consume("/tmp/a.md", 1_700_000_000_000, 100)).toBe("echo")
  })

  test("echo consumption is one-shot", () => {
    const guard = createEchoGuard()
    guard.expect("/tmp/a.md", 1000, 50, "content")

    expect(guard.consume("/tmp/a.md", 1000, 50)).toBe("echo")
    // Second consume — expectation consumed.
    expect(guard.consume("/tmp/a.md", 1000, 50)).toBe("external")
  })

  test("consume without prior expect returns 'external'", () => {
    const guard = createEchoGuard()
    expect(guard.consume("/tmp/unknown.md", 1000, 50)).toBe("external")
  })

  test("cross-path isolation — different paths don't alias", () => {
    const guard = createEchoGuard()
    guard.expect("/tmp/a.md", 1000, 50, "a")
    guard.expect("/tmp/b.md", 2000, 60, "b")

    expect(guard.consume("/tmp/b.md", 2000, 60)).toBe("echo")
    expect(guard.has("/tmp/a.md")).toBe(true)
    expect(guard.consume("/tmp/a.md", 1000, 50)).toBe("echo")
  })
})

describe("EchoGuard — slow path (hash fallback)", () => {
  test("mtime/size mismatch falls back to hash; hash match returns 'echo'", () => {
    const dir = makeTempDir()
    const path = join(dir, "slow.md")
    const content = "# hello\n"
    writeFileSync(path, content, "utf-8")
    const stat = statSync(path)

    const guard = createEchoGuard()
    // Register an expectation with DIFFERENT mtime/size but the true hash.
    guard.expect(path, stat.mtimeMs + 999, stat.size + 42, content)

    const verdict = guard.consume(path, stat.mtimeMs, stat.size)
    expect(verdict).toBe("echo")
  })

  test("mtime/size mismatch with hash mismatch returns 'external'", () => {
    const dir = makeTempDir()
    const path = join(dir, "external.md")
    writeFileSync(path, "# on disk\n", "utf-8")
    const stat = statSync(path)

    const guard = createEchoGuard()
    // We expected a completely different content hash.
    guard.expect(path, stat.mtimeMs + 1, stat.size + 1, "something-else")

    expect(guard.consume(path, stat.mtimeMs, stat.size)).toBe("external")
    // Expectation retained for a later matching event (it could still fire).
    expect(guard.has(path)).toBe(true)
  })
})

describe("EchoGuard — expiration", () => {
  test("expired entries are not matched", () => {
    let t = 1_000
    const guard = createEchoGuard({ expiryMs: 100, now: () => t })

    guard.expect("/tmp/a.md", 1_000, 10, "content")
    expect(guard.has("/tmp/a.md")).toBe(true)

    t += 50
    expect(guard.has("/tmp/a.md")).toBe(true)

    t += 200 // now past expiry
    expect(guard.has("/tmp/a.md")).toBe(false)
    expect(guard.consume("/tmp/a.md", 1_000, 10)).toBe("external")
  })

  test("size shrinks after expiration", () => {
    let t = 0
    const guard = createEchoGuard({ expiryMs: 100, now: () => t })
    guard.expect("/tmp/a", 1, 1, "a")
    guard.expect("/tmp/b", 2, 2, "b")
    expect(guard.size).toBe(2)

    t += 500
    expect(guard.size).toBe(0)
  })
})

describe("EchoGuard — lifecycle helpers", () => {
  test("forget() drops a specific entry", () => {
    const guard = createEchoGuard()
    guard.expect("/tmp/a", 1, 1, "a")
    guard.expect("/tmp/b", 2, 2, "b")

    guard.forget("/tmp/a")
    expect(guard.has("/tmp/a")).toBe(false)
    expect(guard.has("/tmp/b")).toBe(true)
  })

  test("clear() drops everything", () => {
    const guard = createEchoGuard()
    guard.expect("/tmp/a", 1, 1, "a")
    guard.expect("/tmp/b", 2, 2, "b")

    guard.clear()
    expect(guard.size).toBe(0)
  })

  test("expect() with isHash=true uses hash directly", () => {
    const guard = createEchoGuard()
    const hash = hashContent("canonical-content")
    guard.expect("/tmp/a.md", 1, 1, hash, true)

    // Fast path still works — (mtime, size) matches.
    expect(guard.consume("/tmp/a.md", 1, 1)).toBe("echo")
  })
})
