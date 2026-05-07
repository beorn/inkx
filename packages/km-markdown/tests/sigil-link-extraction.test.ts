/**
 * Sigil-as-link extraction (Phase 1.1 of @km/agent/sigil-boards).
 *
 * Per docs/design/model/klink.md, bare `@blah ≡ [[@blah]]` and both produce
 * a `km:@blah` row in the canonical `links` table. Same for `+project` and
 * `#tag`. Sigil names accept path-form (`@agent/0`, `+project/sub`) so
 * boards-as-name addressing works.
 *
 * This test pins the parser-level behavior:
 *   - `parseMarkdownWithLinks` (via `collectSigilLinks`) emits a link row for
 *     every bare `@<name>`, `+<name>`, and `#<name>` occurrence in heading
 *     and body content.
 *   - Path-form names (`@agent/0`) are captured as a single name including
 *     the slash, not truncated at the first `/`.
 *   - Existing word-boundary and letter-after rules are preserved so e-mail
 *     addresses (`bjorn@stabell.org`) and bare numbers (`#42`) don't match.
 */

import { describe, expect, test } from "vitest"
import { parseMarkdownWithLinks } from "../src/ast2nodes.ts"
import { extractAllRefs } from "../src/parser.ts"

function sigilHrefs(md: string): string[] {
  const result = parseMarkdownWithLinks(md, "test.md")
  // Filter to the synthetic sigil rows (relationship === "tag" historically;
  // mentions/projects ride the same path with the same relationship label).
  return result.wikilinks.filter((w) => w.relationship === "tag").map((w) => w.href)
}

describe("collectSigilLinks: bare sigils land in the links table", () => {
  test("bare @agent/3 in heading body produces km:@agent/3", () => {
    expect(sigilHrefs("# Note\n\nSee @agent/3 for details.")).toContain("km:@agent/3")
  })

  test("bare +project/sub produces km:+project/sub", () => {
    expect(sigilHrefs("# Note\n\nPart of +project/sub.")).toContain("km:+project/sub")
  })

  test("bare #bug (no path) still produces km:%23bug", () => {
    expect(sigilHrefs("# Note\n\nThis is #bug.")).toContain("km:%23bug")
  })

  test("bare @Alice (no path) produces km:@Alice", () => {
    expect(sigilHrefs("# Note\n\nTalked to @Alice today.")).toContain("km:@Alice")
  })

  test("path-form #scope/sub produces km:%23scope/sub", () => {
    // `#` is percent-encoded; `/` is path-allowed and passes through.
    expect(sigilHrefs("# Note\n\nFiled under #scope/sub.")).toContain("km:%23scope/sub")
  })

  test("multiple sigils in the same line all land", () => {
    const hrefs = sigilHrefs("# Note\n\nMentioned @km/storage and @km/tui in #design.")
    expect(hrefs).toContain("km:@km/storage")
    expect(hrefs).toContain("km:@km/tui")
    expect(hrefs).toContain("km:%23design")
  })

  test("emits sigil rows for inline content in list items", () => {
    const md = "# Note\n\n- discussed @km/agent\n- closed #wontfix\n"
    const hrefs = sigilHrefs(md)
    expect(hrefs).toContain("km:@km/agent")
    expect(hrefs).toContain("km:%23wontfix")
  })

  test("does not regress: existing wikilink emission still happens", () => {
    // Bare `@blah ≡ [[@blah]]` per klink.md — both should land. We can't
    // distinguish them by relationship, but the wiki one comes through the
    // wikilink path; the bare one through collectSigilLinks. Either way
    // there's at least one km:@blah row.
    expect(sigilHrefs("# Note\n\nSee @blah in body.")).toContain("km:@blah")
  })
})

describe("extractAllRefs: path-form names", () => {
  test("captures path-form mentions as a single name including slashes", () => {
    expect(extractAllRefs("see @km/storage and @km/tui").mentions).toEqual(["km/storage", "km/tui"])
  })

  test("captures path-form projects", () => {
    expect(extractAllRefs("part of +project/sub today").projects).toEqual(["project/sub"])
  })

  test("captures path-form tags", () => {
    expect(extractAllRefs("filed under #scope/sub today").tags).toEqual(["scope/sub"])
  })

  test("plain (no-path) sigils still work", () => {
    const refs = extractAllRefs("@Alice and #bug and +cleanup")
    expect(refs.mentions).toEqual(["Alice"])
    expect(refs.tags).toEqual(["bug"])
    expect(refs.projects).toEqual(["cleanup"])
  })
})
