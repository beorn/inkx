/**
 * `file:` handler tests — drives the handler directly with constructed URIs.
 * The end-to-end behaviour through `resolvePreview` is already covered by
 * `previews.test.ts`; this suite locks the handler's contract independently.
 *
 * Bead: km-silvercode.autolinks-uri-pivot
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { fileHandler } from "../../../src/autolinks/handlers/file.ts"
import { parseResolvesTo } from "../../../src/autolinks/uri.ts"

describe("fileHandler", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "silvercode-file-handler-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("readme mode: reads README.md from a directory", () => {
    writeFileSync(join(dir, "README.md"), "# Title\n\nHello world.\n")
    const uri = parseResolvesTo(dir)
    const outcome = fileHandler.resolve(uri, { cacheKey: "k", preview: "readme" })
    expect(outcome.result.kind).toBe("ok")
    if (outcome.result.kind !== "ok") return
    expect(outcome.result.format).toBe("markdown")
    expect(outcome.result.body).toContain("Hello world")
    expect(outcome.watchPath).toBe(join(dir, "README.md"))
  })

  test("readme mode: error when README is missing", () => {
    const uri = parseResolvesTo(dir)
    const outcome = fileHandler.resolve(uri, { cacheKey: "k", preview: "readme" })
    expect(outcome.result.kind).toBe("error")
    expect(outcome.watchPath).toBeUndefined()
  })

  test("readme mode: defaults when ctx.preview is omitted", () => {
    writeFileSync(join(dir, "README.md"), "# Default mode\n")
    const uri = parseResolvesTo(dir)
    const outcome = fileHandler.resolve(uri, { cacheKey: "k" })
    expect(outcome.result.kind).toBe("ok")
    if (outcome.result.kind !== "ok") return
    expect(outcome.result.body).toContain("Default mode")
  })

  test("first-paragraph mode: returns the first non-blank paragraph", () => {
    const path = join(dir, "doc.md")
    writeFileSync(path, "# Heading\n\nFirst real para.\nSecond line.\n\nIgnored.\n")
    const uri = parseResolvesTo(path)
    const outcome = fileHandler.resolve(uri, { cacheKey: "k", preview: "first-paragraph" })
    expect(outcome.result.kind).toBe("ok")
    if (outcome.result.kind !== "ok") return
    expect(outcome.result.body).toContain("First real para")
    expect(outcome.result.body).not.toContain("Ignored")
    expect(outcome.watchPath).toBe(path)
  })

  test("first-paragraph mode: skips front-matter", () => {
    const path = join(dir, "fm.md")
    writeFileSync(path, "---\ntitle: Test\n---\n\nThe paragraph.\n")
    const uri = parseResolvesTo(path)
    const outcome = fileHandler.resolve(uri, { cacheKey: "k", preview: "first-paragraph" })
    expect(outcome.result.kind).toBe("ok")
    if (outcome.result.kind !== "ok") return
    expect(outcome.result.body).toBe("The paragraph.")
  })

  test("readme mode: handles nested README candidates (README.md, readme.md)", () => {
    const sub = join(dir, "lower")
    mkdirSync(sub)
    writeFileSync(join(sub, "readme.md"), "# Lower-case readme\n")
    const uri = parseResolvesTo(sub)
    const outcome = fileHandler.resolve(uri, { cacheKey: "k", preview: "readme" })
    expect(outcome.result.kind).toBe("ok")
    if (outcome.result.kind !== "ok") return
    expect(outcome.result.body).toContain("Lower-case readme")
  })

  test("watchPath is unset on error", () => {
    const uri = parseResolvesTo("/this/path/should/never/exist/zzz")
    const outcome = fileHandler.resolve(uri, { cacheKey: "k", preview: "first-paragraph" })
    expect(outcome.result.kind).toBe("error")
    expect(outcome.watchPath).toBeUndefined()
  })
})
