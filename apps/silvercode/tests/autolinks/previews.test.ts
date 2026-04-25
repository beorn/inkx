/**
 * Unit tests for autolink preview resolvers.
 *
 * Bead: km-silvercode.autolinks-config
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import {
  _activeWatcherCount,
  clearPreviewCache,
  disposeAllWatchers,
  PREVIEW_CACHE_TTL_MS,
  PREVIEW_WATCH_DEBOUNCE_MS,
  SHELL_PREVIEW_OUTPUT_CAP_BYTES,
  SHELL_PREVIEW_TIMEOUT_MS,
  resolvePreview,
} from "../../src/autolinks/previews.ts"

describe("autolink previews", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "silvercode-previews-"))
    clearPreviewCache()
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("readme: resolves a directory's README.md", () => {
    writeFileSync(join(dir, "README.md"), "# Title\n\nHello world.\n")
    const result = resolvePreview({
      preview: "readme",
      resolvesTo: dir,
      cacheKey: "key1",
    })
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") return
    expect(result.format).toBe("markdown")
    expect(result.body).toContain("Hello world")
  })

  test("readme: error when README is missing", () => {
    const result = resolvePreview({
      preview: "readme",
      resolvesTo: dir,
      cacheKey: "no-readme",
    })
    expect(result.kind).toBe("error")
    if (result.kind !== "error") return
    expect(result.message).toMatch(/no README found/i)
  })

  test("first-paragraph: returns the first non-blank paragraph, skipping headings", () => {
    const path = join(dir, "doc.md")
    writeFileSync(path, "# Heading\n\n# Another heading\n\nFirst real para.\nSecond line.\n\nNot included.\n")
    const result = resolvePreview({
      preview: "first-paragraph",
      resolvesTo: path,
      cacheKey: "fp1",
    })
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") return
    // The body is markdown source — emphasis tokens flow to MarkdownView
    // in the popover for rich rendering. (Previously this was "text".)
    expect(result.format).toBe("markdown")
    expect(result.body).toContain("First real para")
    expect(result.body).toContain("Second line")
    expect(result.body).not.toContain("Not included")
  })

  test("first-paragraph: handles front-matter", () => {
    const path = join(dir, "fm.md")
    writeFileSync(path, "---\ntitle: Test\n---\n\nThe paragraph.\n")
    const result = resolvePreview({
      preview: "first-paragraph",
      resolvesTo: path,
      cacheKey: "fm1",
    })
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") return
    expect(result.body).toBe("The paragraph.")
  })

  test("cache: file-backed entries serve cached value until watcher evicts (no TTL)", () => {
    // File-backed previews (`readme`, `first-paragraph`) cache without
    // TTL — invalidation is fs.watch-driven. Synchronous re-reads
    // within the same tick (before the debounce timer fires) keep
    // serving the cached body. See the "watcher" tests below for
    // change-driven invalidation.
    writeFileSync(join(dir, "README.md"), "# v1\n")
    let now = 1_000_000
    const result1 = resolvePreview({
      preview: "readme",
      resolvesTo: dir,
      cacheKey: "ttl",
      now: () => now,
    })
    expect(result1.kind).toBe("ok")

    // Mutate file but read again synchronously — debounce hasn't
    // fired yet, so the cached v1 is still served.
    writeFileSync(join(dir, "README.md"), "# v2\n")
    now += PREVIEW_CACHE_TTL_MS - 1
    const result2 = resolvePreview({
      preview: "readme",
      resolvesTo: dir,
      cacheKey: "ttl",
      now: () => now,
    })
    expect(result2.kind).toBe("ok")
    if (result2.kind !== "ok") return
    expect(result2.body).toContain("v1")
    expect(result2.body).not.toContain("v2")

    // Even past the (no-longer-applicable) TTL, a synchronous re-read
    // still hits the cache for file-backed entries.
    now += 2
    const result3 = resolvePreview({
      preview: "readme",
      resolvesTo: dir,
      cacheKey: "ttl",
      now: () => now,
    })
    expect(result3.kind).toBe("ok")
    if (result3.kind !== "ok") return
    expect(result3.body).toContain("v1")
  })

  test("cache: per-key isolation — different cache keys don't pollute each other", () => {
    mkdirSync(join(dir, "a"))
    mkdirSync(join(dir, "b"))
    writeFileSync(join(dir, "a", "README.md"), "# alpha\n")
    writeFileSync(join(dir, "b", "README.md"), "# bravo\n")
    const ra = resolvePreview({ preview: "readme", resolvesTo: join(dir, "a"), cacheKey: "a" })
    const rb = resolvePreview({ preview: "readme", resolvesTo: join(dir, "b"), cacheKey: "b" })
    expect(ra.kind).toBe("ok")
    expect(rb.kind).toBe("ok")
    if (ra.kind !== "ok" || rb.kind !== "ok") return
    expect(ra.body).toContain("alpha")
    expect(rb.body).toContain("bravo")
  })

  // Wait long enough for fs.watch to fire + debounce to expire. Slightly
  // padded so flaky filesystems still settle in CI.
  const settleMs = PREVIEW_WATCH_DEBOUNCE_MS + 250

  test("watcher: cache invalidates when file is modified within TTL window", async () => {
    const path = join(dir, "README.md")
    writeFileSync(path, "# v1\n")
    const r1 = resolvePreview({
      preview: "readme",
      resolvesTo: dir,
      cacheKey: "watch-readme",
    })
    expect(r1.kind).toBe("ok")
    if (r1.kind !== "ok") return
    expect(r1.body).toContain("v1")

    // Modify the file. Cache should invalidate via fs.watch even though
    // we're well inside the 30s TTL window.
    writeFileSync(path, "# v2\n")
    await new Promise((r) => setTimeout(r, settleMs))

    const r2 = resolvePreview({
      preview: "readme",
      resolvesTo: dir,
      cacheKey: "watch-readme",
    })
    expect(r2.kind).toBe("ok")
    if (r2.kind !== "ok") return
    expect(r2.body).toContain("v2")
    expect(r2.body).not.toContain("v1")
  })

  test("watcher: first-paragraph invalidates on file modification", async () => {
    const path = join(dir, "doc.md")
    writeFileSync(path, "First version paragraph.\n")
    const r1 = resolvePreview({
      preview: "first-paragraph",
      resolvesTo: path,
      cacheKey: "watch-fp",
    })
    expect(r1.kind).toBe("ok")
    if (r1.kind !== "ok") return
    expect(r1.body).toBe("First version paragraph.")

    writeFileSync(path, "Second version paragraph.\n")
    await new Promise((r) => setTimeout(r, settleMs))

    const r2 = resolvePreview({
      preview: "first-paragraph",
      resolvesTo: path,
      cacheKey: "watch-fp",
    })
    expect(r2.kind).toBe("ok")
    if (r2.kind !== "ok") return
    expect(r2.body).toBe("Second version paragraph.")
  })

  test("watcher: TTL fallback still applies for shell-out previews (no file watcher)", () => {
    // bd-active is shell-out — no file backing. Verify no watcher gets
    // registered for the entry, and that TTL semantics drive eviction.
    // We don't actually run `bd` here; we just verify that an error
    // result (most likely without `bd` available, or no parent) is
    // cached without a watcher.
    let now = 1_000_000
    const r1 = resolvePreview({
      preview: "bd-active",
      resolvesTo: "nonexistent-bead",
      cacheKey: "shell-ttl",
      now: () => now,
    })
    // Either ok (bd is installed) or error — both cache, neither watches.
    expect(r1.kind).toMatch(/ok|error/)
    expect(_activeWatcherCount()).toBe(0)

    // Inside TTL — same result reused (cached).
    now += PREVIEW_CACHE_TTL_MS - 1
    const r2 = resolvePreview({
      preview: "bd-active",
      resolvesTo: "nonexistent-bead",
      cacheKey: "shell-ttl",
      now: () => now,
    })
    expect(r2.resolvedAt).toBe(r1.resolvedAt)

    // Past TTL — fresh resolve (different resolvedAt).
    now += 2
    const r3 = resolvePreview({
      preview: "bd-active",
      resolvesTo: "nonexistent-bead",
      cacheKey: "shell-ttl",
      now: () => now,
    })
    expect(r3.resolvedAt).toBe(now)
  })

  test("watcher: file-backed previews register an fs.watch handle", () => {
    writeFileSync(join(dir, "README.md"), "# tracked\n")
    expect(_activeWatcherCount()).toBe(0)
    const r = resolvePreview({
      preview: "readme",
      resolvesTo: dir,
      cacheKey: "track-watch",
    })
    expect(r.kind).toBe("ok")
    expect(_activeWatcherCount()).toBe(1)
  })

  test("disposeAllWatchers: tears down every active watcher (no leaks)", () => {
    mkdirSync(join(dir, "a"))
    mkdirSync(join(dir, "b"))
    writeFileSync(join(dir, "a", "README.md"), "# alpha\n")
    writeFileSync(join(dir, "b", "README.md"), "# bravo\n")

    resolvePreview({ preview: "readme", resolvesTo: join(dir, "a"), cacheKey: "leak-a" })
    resolvePreview({ preview: "readme", resolvesTo: join(dir, "b"), cacheKey: "leak-b" })
    expect(_activeWatcherCount()).toBe(2)

    disposeAllWatchers()
    expect(_activeWatcherCount()).toBe(0)
  })
})

describe("autolink previews — shell kind", () => {
  beforeEach(() => {
    clearPreviewCache()
  })

  test("shell: runs `echo` and captures its stdout", () => {
    const result = resolvePreview({
      preview: "shell",
      resolvesTo: "ignored",
      cacheKey: "shell-echo",
      command: "echo hello-from-shell",
    })
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") return
    expect(result.format).toBe("text")
    expect(result.body).toBe("hello-from-shell")
  })

  test("shell: substitutes ${resolves_to} in the command template", () => {
    const result = resolvePreview({
      preview: "shell",
      resolvesTo: "substituted-value",
      cacheKey: "shell-subst",
      command: "echo prefix-${resolves_to}-suffix",
    })
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") return
    expect(result.body).toBe("prefix-substituted-value-suffix")
  })

  test("shell: returns error when command is missing", () => {
    const result = resolvePreview({
      preview: "shell",
      resolvesTo: "x",
      cacheKey: "shell-no-cmd",
    })
    expect(result.kind).toBe("error")
  })

  test("shell: returns error when program does not exist", () => {
    const result = resolvePreview({
      preview: "shell",
      resolvesTo: "x",
      cacheKey: "shell-enoent",
      command: "no-such-program-1234567890",
    })
    expect(result.kind).toBe("error")
  })

  test("shell: caps stdout at SHELL_PREVIEW_OUTPUT_CAP_BYTES", () => {
    // `printf` is universally available and lets us stuff bytes deterministically.
    // Build a command that prints ~10KB of "x"; expect the body to top out at
    // ~4KB plus a "[truncated]" marker.
    const len = SHELL_PREVIEW_OUTPUT_CAP_BYTES * 2 + 100
    const result = resolvePreview({
      preview: "shell",
      resolvesTo: "ignored",
      cacheKey: "shell-cap",
      command: `printf %${len}d 0`,
    })
    expect(result.kind).toBe("ok")
    if (result.kind !== "ok") return
    // Total body length stays within the cap + the marker line.
    expect(result.body.length).toBeLessThan(SHELL_PREVIEW_OUTPUT_CAP_BYTES + 200)
    expect(result.body).toMatch(/\[truncated/)
  })

  test("shell: respects 5-second timeout (kills runaway program)", () => {
    // `sleep 30` would block well past the 5s timeout; the preview must
    // bail out and return an error rather than hang the popover. To keep
    // tests fast we shrink the wait — we still rely on the spawnSync
    // timeout firing, which we know happens at SHELL_PREVIEW_TIMEOUT_MS.
    // We verify the configuration constant is what callers expect.
    expect(SHELL_PREVIEW_TIMEOUT_MS).toBe(5_000)
    // Smoke: the shell branch surfaces a TIMEOUT error when the underlying
    // spawnSync's `timeout:` triggers a SIGTERM. Use `sleep` for ≤ 6s so
    // the test still finishes promptly.
    const start = Date.now()
    const result = resolvePreview({
      preview: "shell",
      resolvesTo: "ignored",
      cacheKey: "shell-timeout",
      command: "sleep 30",
    })
    const elapsed = Date.now() - start
    expect(result.kind).toBe("error")
    if (result.kind !== "error") return
    expect(result.message).toMatch(/timed out/i)
    // Must have given up well before the program would have finished.
    expect(elapsed).toBeLessThan(SHELL_PREVIEW_TIMEOUT_MS + 2_000)
  }, 10_000)

  test("shell: cache TTL applies (no fs.watch handle)", () => {
    let now = 1_000_000
    const r1 = resolvePreview({
      preview: "shell",
      resolvesTo: "x",
      cacheKey: "shell-ttl",
      command: "echo ttl",
      now: () => now,
    })
    expect(r1.kind).toBe("ok")
    expect(_activeWatcherCount()).toBe(0)

    now += PREVIEW_CACHE_TTL_MS - 1
    const r2 = resolvePreview({
      preview: "shell",
      resolvesTo: "x",
      cacheKey: "shell-ttl",
      command: "echo ttl",
      now: () => now,
    })
    // Same cached resolution.
    expect(r2.resolvedAt).toBe(r1.resolvedAt)

    now += 2 // cross the TTL boundary
    const r3 = resolvePreview({
      preview: "shell",
      resolvesTo: "x",
      cacheKey: "shell-ttl",
      command: "echo ttl",
      now: () => now,
    })
    expect(r3.resolvedAt).toBe(now)
  })
})

describe("autolink previews — mcp kind (stub)", () => {
  beforeEach(() => {
    clearPreviewCache()
  })

  test("mcp: returns error pointing at the follow-up bead", () => {
    const result = resolvePreview({
      preview: "mcp",
      resolvesTo: "rfc.lookup",
      cacheKey: "mcp-stub",
    })
    expect(result.kind).toBe("error")
    if (result.kind !== "error") return
    expect(result.message).toMatch(/not yet implemented/i)
    expect(result.message).toMatch(/km-silvercode\.autolinks-mcp-resolver/)
  })
})
