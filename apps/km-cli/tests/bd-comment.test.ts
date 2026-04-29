/**
 * Unit tests for `km bd comment add / list`.
 *
 * Tests focus on the pure body-manipulation primitives
 * (`appendCommentToBody`, `parseComments`, `formatCommentLine`).
 * Repo-level integration is intentionally avoided here; the CLI action
 * layer is a thin wrapper that reads/writes the file via these
 * primitives, so covering them covers the round-trip.
 */

import { describe, expect, test } from "vitest"
import {
  appendCommentToBody,
  COMMENTS_HEADING,
  encodeCommentText,
  formatCommentLine,
  parseComments,
} from "../src/commands/bd-comment.ts"

describe("bd-comment body primitives", () => {
  test("appends to a body with no `## Comments` section — creates header + item", () => {
    const before = "# Some Bead\n\nDescription text.\n"
    const line = "- @bjorn (2026-04-29T00:00:00Z): first comment"
    const after = appendCommentToBody(before, line)

    expect(after).toContain(COMMENTS_HEADING)
    expect(after).toContain(line)
    // Header occurs exactly once.
    expect(after.split(COMMENTS_HEADING).length - 1).toBe(1)
    // Description is preserved.
    expect(after).toContain("Description text.")
  })

  test("appends to a body with an existing section — adds item, no duplicate header", () => {
    const before = ["# Bead", "", "Body.", "", COMMENTS_HEADING, "", "- @alice (2026-04-29T00:00:00Z): hello", ""].join(
      "\n",
    )
    const line = "- @bjorn (2026-04-29T01:00:00Z): second"
    const after = appendCommentToBody(before, line)

    // Header appears exactly once.
    expect(after.split(COMMENTS_HEADING).length - 1).toBe(1)
    // Both comments present, in order.
    const aliceIdx = after.indexOf("hello")
    const bjornIdx = after.indexOf("second")
    expect(aliceIdx).toBeGreaterThan(0)
    expect(bjornIdx).toBeGreaterThan(aliceIdx)
  })

  test("parseComments returns [] when section is absent", () => {
    expect(parseComments("# Bead\n\nNo section here.\n")).toEqual([])
  })

  test("parseComments returns all items in order", () => {
    const body = [
      "# Bead",
      "",
      COMMENTS_HEADING,
      "",
      "- @a (t1): first",
      "- @b (t2): second",
      "- @c (t3): third",
      "",
    ].join("\n")
    const comments = parseComments(body)
    expect(comments).toEqual(["@a (t1): first", "@b (t2): second", "@c (t3): third"])
  })

  test("parseComments stops at the next heading", () => {
    const body = [COMMENTS_HEADING, "", "- @a (t1): kept", "", "## Other Section", "", "- not a comment"].join("\n")
    expect(parseComments(body)).toEqual(["@a (t1): kept"])
  })

  test("roundtrip: add 3 comments, list returns all 3 in order", () => {
    let body = "# Bead\n\nBody.\n"
    const lines = [
      formatCommentLine("a", "2026-01-01T00:00:00Z", "first"),
      formatCommentLine("b", "2026-01-02T00:00:00Z", "second"),
      formatCommentLine("c", "2026-01-03T00:00:00Z", "third"),
    ]
    for (const line of lines) {
      body = appendCommentToBody(body, line)
    }
    const parsed = parseComments(body)
    expect(parsed).toEqual([
      "@a (2026-01-01T00:00:00Z): first",
      "@b (2026-01-02T00:00:00Z): second",
      "@c (2026-01-03T00:00:00Z): third",
    ])
    // Header appears exactly once.
    expect(body.split(COMMENTS_HEADING).length - 1).toBe(1)
  })

  test("encodeCommentText flattens inner newlines to ` ↵ `", () => {
    expect(encodeCommentText("line one\nline two")).toBe("line one ↵ line two")
    expect(encodeCommentText("line one\r\nline two")).toBe("line one ↵ line two")
  })

  test("formatCommentLine produces the canonical shape", () => {
    expect(formatCommentLine("bjorn", "2026-04-29T00:00:00Z", "hi there")).toBe(
      "- @bjorn (2026-04-29T00:00:00Z): hi there",
    )
  })
})
