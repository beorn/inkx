/**
 * Collapse-Parse Matcher Tests
 *
 * Unit tests for the glob matcher that decides whether a path should be
 * stored as an opaque stub during discovery.
 */

import { describe, test, expect } from "vitest"
import {
  createCollapseParseMatcher,
  createNullCollapseParseMatcher,
} from "../src/markdown/collapse-parse.ts"

describe("createCollapseParseMatcher", () => {
  test("empty patterns → matches nothing", () => {
    const m = createCollapseParseMatcher([])
    expect(m.matches("raw/chats/anything.md")).toBe(false)
    expect(m.matches("archive/Asana/pers-prod.md")).toBe(false)
    expect(m.size).toBe(0)
  })

  test("single ** pattern matches nested paths", () => {
    const m = createCollapseParseMatcher(["raw/chats/**"])
    expect(m.matches("raw/chats/foo.md")).toBe(true)
    expect(m.matches("raw/chats/2026-04-01T1200-topic.md")).toBe(true)
    expect(m.matches("raw/chats/nested/deep/file.md")).toBe(true)
    expect(m.size).toBe(1)
  })

  test("does not match unrelated paths", () => {
    const m = createCollapseParseMatcher(["raw/chats/**"])
    expect(m.matches("notes/foo.md")).toBe(false)
    expect(m.matches("journals/2026/2026-04-01.md")).toBe(false)
    expect(m.matches("projects/api/readme.md")).toBe(false)
  })

  test("multiple patterns combine (OR semantics)", () => {
    const m = createCollapseParseMatcher(["raw/chats/**", "archive/**"])
    expect(m.matches("raw/chats/foo.md")).toBe(true)
    expect(m.matches("archive/Asana/pers-prod.md")).toBe(true)
    expect(m.matches("archive/other/file.md")).toBe(true)
    expect(m.matches("notes/foo.md")).toBe(false)
    expect(m.size).toBe(2)
  })

  test("trims whitespace and skips empty/comment lines", () => {
    const m = createCollapseParseMatcher(["", "  ", "# a comment", "  raw/chats/**  "])
    expect(m.matches("raw/chats/foo.md")).toBe(true)
    expect(m.size).toBe(1)
  })

  test("normalizes Windows-style separators", () => {
    const m = createCollapseParseMatcher(["raw/chats/**"])
    expect(m.matches("raw\\chats\\foo.md")).toBe(true)
  })

  test("pattern with **\\/ anywhere matches transcripts folder anywhere", () => {
    const m = createCollapseParseMatcher(["**/transcripts/**"])
    expect(m.matches("projects/foo/transcripts/session-1.md")).toBe(true)
    expect(m.matches("transcripts/session-1.md")).toBe(true)
    expect(m.matches("other/foo.md")).toBe(false)
  })

  test("createNullCollapseParseMatcher is the disabled default", () => {
    const m = createNullCollapseParseMatcher()
    expect(m.matches("raw/chats/anything.md")).toBe(false)
    expect(m.matches("archive/x.md")).toBe(false)
    expect(m.size).toBe(0)
  })
})
