/**
 * displayId — canonical Issue → display string helper
 *
 * Single reader of the `shortId ?? id` chain (km-beads.retire-short-id-l4).
 * Every CLI formatter, JSON emitter, and log line goes through here so the
 * display rule lives in one place.
 */

import { describe, test, expect } from "vitest"
import { displayId } from "../src/queries.ts"
import type { Issue } from "../src/types.ts"

const baseIssue: Omit<Issue, "id" | "shortId"> = {
  title: "Test",
  status: "todo",
  priority: "P2",
  createdAt: 0,
  updatedAt: 0,
}

describe("displayId", () => {
  test("returns shortId when present (canonical path-form)", () => {
    const issue: Issue = { ...baseIssue, id: "01ABC", shortId: "@km/scope/slug" }
    expect(displayId(issue)).toBe("@km/scope/slug")
  })

  test("returns shortId when present (legacy bd-form)", () => {
    const issue: Issue = { ...baseIssue, id: "01ABC", shortId: "km-abc1" }
    expect(displayId(issue)).toBe("km-abc1")
  })

  test("falls back to issue.id when shortId is undefined (non-bead)", () => {
    const issue: Issue = { ...baseIssue, id: "01HXYZ12345678", shortId: undefined }
    expect(displayId(issue)).toBe("01HXYZ12345678")
  })

  test("does not coerce empty-string shortId — keeps falsy fallback", () => {
    // Empty string is falsy, so `??` keeps it but `||` would not.
    // Documenting current semantics: only undefined triggers fallback.
    const issue: Issue = { ...baseIssue, id: "01ABC", shortId: "" }
    expect(displayId(issue)).toBe("")
  })
})
