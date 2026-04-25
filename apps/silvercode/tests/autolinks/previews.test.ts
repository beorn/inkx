/**
 * Unit tests for autolink preview resolvers.
 *
 * Bead: km-silvercode.autolinks-config
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { clearPreviewCache, PREVIEW_CACHE_TTL_MS, resolvePreview } from "../../src/autolinks/previews.ts"

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
    expect(result.format).toBe("text")
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

  test("cache: hits within TTL, refreshes after expiry", () => {
    writeFileSync(join(dir, "README.md"), "# v1\n")
    let now = 1_000_000
    const result1 = resolvePreview({
      preview: "readme",
      resolvesTo: dir,
      cacheKey: "ttl",
      now: () => now,
    })
    expect(result1.kind).toBe("ok")

    // Mutate file but stay inside TTL — cache should still serve v1.
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

    // Push past TTL — fresh read.
    now += 2
    const result3 = resolvePreview({
      preview: "readme",
      resolvesTo: dir,
      cacheKey: "ttl",
      now: () => now,
    })
    expect(result3.kind).toBe("ok")
    if (result3.kind !== "ok") return
    expect(result3.body).toContain("v2")
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
})
