/**
 * Sigil-as-link extraction in extract-links.ts (Phase 1.1 of @km/agent/sigil-boards).
 *
 * The lightweight regex scanner used by collapsed-file edge preservation
 * must accept path-form sigil names (`@agent/3`, `#scope/sub`) — otherwise
 * the link target gets truncated at the first `/` and points to the wrong
 * node. See docs/design/model/klink.md for the canonical behavior.
 */

import { describe, test, expect } from "vitest"
import { extractLinks } from "../../src/markdown/extract-links.ts"

describe("extractLinks: path-form mentions", () => {
  test("@agent/3 captured as a single name", () => {
    const links = extractLinks("Talked to @agent/3 today.", { mentions: true })
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      target: "@agent/3",
      type: "mention",
      href: "km:@agent/3",
    })
  })

  test("@km/storage and @km/tui in same line", () => {
    const links = extractLinks("Mentioned @km/storage and @km/tui.", { mentions: true })
    expect(links).toHaveLength(2)
    expect(links[0]).toMatchObject({ target: "@km/storage", href: "km:@km/storage" })
    expect(links[1]).toMatchObject({ target: "@km/tui", href: "km:@km/tui" })
  })

  test("plain @Alice (no path) still works", () => {
    const links = extractLinks("Talked to @Alice today.", { mentions: true })
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ target: "@Alice", href: "km:@Alice" })
  })

  test("email-like @ (no word boundary) still rejected", () => {
    const links = extractLinks("email alice@example.com", { mentions: true })
    expect(links).toHaveLength(0)
  })

  test("@42 (digit after sigil) still rejected", () => {
    const links = extractLinks("dial @911", { mentions: true })
    expect(links).toHaveLength(0)
  })

  test("trailing slash and punctuation: @agent/3, parses cleanly", () => {
    const links = extractLinks("see @agent/3, and others", { mentions: true })
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ target: "@agent/3", href: "km:@agent/3" })
  })
})

describe("extractLinks: path-form tags", () => {
  test("#scope/sub captured as single name", () => {
    const links = extractLinks("Filed under #scope/sub today.", { tags: true })
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      target: "#scope/sub",
      type: "tag",
      href: "km:%23scope/sub",
    })
  })

  test("plain #urgent still works", () => {
    const links = extractLinks("This is #urgent.", { tags: true })
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ target: "#urgent", href: "km:%23urgent" })
  })

  test("#42 (digit after sigil) still rejected", () => {
    const links = extractLinks("issue #42", { tags: true })
    expect(links).toHaveLength(0)
  })

  test("foo#bar (no word boundary) still rejected", () => {
    const links = extractLinks("file foo#bar.md", { tags: true })
    expect(links).toHaveLength(0)
  })
})
