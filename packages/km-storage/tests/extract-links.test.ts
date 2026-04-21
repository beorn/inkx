/**
 * Link Extractor Unit Tests
 *
 * `extractLinks(content)` does a lightweight regex pass over a markdown file's
 * raw content to find link edges without fully parsing the file. Used for
 * collapsed-file edge preservation so the backlink graph remains intact even
 * for files that stay opaque stubs (see km-storage.collapsed-file-links).
 *
 * Covers every link shape we recognize plus adversarial inputs.
 */

import { describe, test, expect } from "vitest"
import { extractLinks } from "../src/markdown/extract-links.ts"

describe("extractLinks: wiki-links", () => {
  test("simple [[Note]]", () => {
    const links = extractLinks("See [[Alpha]] for details.")
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      target: "Alpha",
      text: "Alpha",
      type: "wiki",
      href: "km:Alpha",
    })
    expect(links[0]?.offset).toBeGreaterThanOrEqual(0)
  })

  test("[[Note|Display Text]] captures alias", () => {
    const links = extractLinks("Start [[Alpha|the alpha]] here.")
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      target: "Alpha",
      text: "the alpha",
      type: "wiki",
      href: "km:Alpha",
    })
  })

  test("[[Note#Section]] splits heading", () => {
    const links = extractLinks("[[Alpha#Plans]]")
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      target: "Alpha",
      heading: "Plans",
      type: "wiki",
      href: "km:Alpha#Plans",
    })
  })

  test("[[Note^blockid]] captures block ref", () => {
    const links = extractLinks("[[Alpha^abc123]]")
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      target: "Alpha",
      heading: "^abc123",
      type: "wiki",
      // `^` is NOT a reserved RFC 3986 char, so normalizeLinkHref passes it
      // through the fragment unchanged. Matches the canonical href format in
      // docs/design/model/klink.md and the parsed-link pipeline.
      href: "km:Alpha#^abc123",
    })
  })

  test("hierarchical [[Project/Alpha]]", () => {
    const links = extractLinks("[[Project/Alpha]]")
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      target: "Project/Alpha",
      type: "wiki",
      href: "km:Project/Alpha",
    })
  })

  test("embed ![[Note]]", () => {
    const links = extractLinks("![[Alpha]]")
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      target: "Alpha",
      type: "wiki",
      rel: "embed",
    })
  })

  test("multiple wiki-links in one block", () => {
    const links = extractLinks("See [[Alpha]] and [[Beta|beta note]] for context.")
    expect(links).toHaveLength(2)
    expect(links.map((l) => l.target)).toEqual(["Alpha", "Beta"])
  })

  test("self-ref [[#Section]] captures heading only", () => {
    const links = extractLinks("[[#Plans]]")
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      target: "",
      heading: "Plans",
      type: "wiki",
      href: "#Plans",
    })
  })
})

describe("extractLinks: markdown links", () => {
  test("[text](path)", () => {
    const links = extractLinks("See [the alpha](./alpha.md) for details.")
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      target: "./alpha.md",
      text: "the alpha",
      type: "md",
    })
  })

  test("[text](path#anchor)", () => {
    const links = extractLinks("[go here](./alpha.md#plans)")
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      target: "./alpha.md",
      heading: "plans",
      type: "md",
    })
  })

  test("[text](#anchor) self-ref", () => {
    const links = extractLinks("[skip](#conclusion)")
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      target: "",
      heading: "conclusion",
      type: "md",
      href: "#conclusion",
    })
  })

  test("external https:// URL passes through", () => {
    const links = extractLinks("[docs](https://example.com/page)")
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      target: "https://example.com/page",
      text: "docs",
      type: "md",
      href: "https://example.com/page",
    })
  })
})

describe("extractLinks: mentions (opt-in)", () => {
  test("@Alice not extracted by default", () => {
    const links = extractLinks("Talked to @Alice today.")
    expect(links).toHaveLength(0)
  })

  test("@Alice extracted when mentions:true", () => {
    const links = extractLinks("Talked to @Alice today.", { mentions: true })
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      target: "@Alice",
      type: "mention",
      href: "km:@Alice",
    })
  })

  test("email-like @ inside text is not a mention", () => {
    const links = extractLinks("email alice@example.com", { mentions: true })
    // No word-boundary before the `@`, so not a mention.
    expect(links).toHaveLength(0)
  })

  test("@42 is not a mention (non-letter follows)", () => {
    const links = extractLinks("dial @911", { mentions: true })
    expect(links).toHaveLength(0)
  })
})

describe("extractLinks: tags (opt-in)", () => {
  test("#urgent not extracted by default", () => {
    const links = extractLinks("This is #urgent.")
    expect(links).toHaveLength(0)
  })

  test("#urgent extracted when tags:true", () => {
    const links = extractLinks("This is #urgent.", { tags: true })
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({
      target: "#urgent",
      type: "tag",
      href: "km:%23urgent",
    })
  })

  test("#42 is not a tag (non-letter follows)", () => {
    const links = extractLinks("issue #42", { tags: true })
    expect(links).toHaveLength(0)
  })

  test("foo#bar is not a tag (no word boundary)", () => {
    const links = extractLinks("file foo#bar.md", { tags: true })
    expect(links).toHaveLength(0)
  })
})

describe("extractLinks: adversarial inputs", () => {
  test("empty string → no links", () => {
    expect(extractLinks("")).toEqual([])
  })

  test("no links → empty array", () => {
    expect(extractLinks("plain prose with no links")).toEqual([])
  })

  test("unclosed [[ is ignored", () => {
    expect(extractLinks("start of [[ with no close")).toEqual([])
  })

  test("unclosed ]] alone is ignored", () => {
    expect(extractLinks("just ]] floating")).toEqual([])
  })

  test("empty [[ ]] is ignored", () => {
    expect(extractLinks("nothing [[]] here")).toEqual([])
  })

  test("fenced code block content skipped", () => {
    const content = [
      "Before [[Alpha]]",
      "```",
      "See [[Beta]] and [code](./x.md) here — should be ignored",
      "```",
      "After [[Gamma]]",
    ].join("\n")
    const links = extractLinks(content)
    expect(links.map((l) => l.target)).toEqual(["Alpha", "Gamma"])
  })

  test("inline code span skipped", () => {
    const links = extractLinks("see `[[NotReal]]` but [[Alpha]] counts")
    expect(links.map((l) => l.target)).toEqual(["Alpha"])
  })

  test("escaped \\[ does not start a wiki link", () => {
    const links = extractLinks("literal \\[[NotLink]]")
    // First `\[` is escaped, so we only have `[NotLink]]` which is not a valid
    // wiki-link. The regex should not create a link here.
    expect(links.every((l) => l.target !== "NotLink")).toBe(true)
  })

  test("md link with nested brackets in text", () => {
    const links = extractLinks("[a [nested] text](./target.md)")
    // Regex should handle the outer brackets; nested ones should be permitted
    // in text or the link should be skipped. Either way, we don't want a crash.
    expect(() => extractLinks("[a [nested] text](./target.md)")).not.toThrow()
    // Best-effort: if we extract anything, it targets ./target.md.
    if (links.length > 0) {
      expect(links[0]?.target).toBe("./target.md")
    }
  })

  test("md link spanning a newline is not extracted (regex stays single-line)", () => {
    const links = extractLinks("[multi\nline](./x.md)")
    expect(links.map((l) => l.target)).not.toContain("./x.md")
  })

  test("offset reflects position in source", () => {
    const content = "prose [[First]] more [[Second]] done."
    const links = extractLinks(content)
    expect(links).toHaveLength(2)
    expect(links[0]?.offset).toBe(content.indexOf("[[First]]"))
    expect(links[1]?.offset).toBe(content.indexOf("[[Second]]"))
  })
})

describe("extractLinks: perf guardrail", () => {
  test("100KB file completes in <50ms", () => {
    // Build ~100KB of content with a realistic mix of prose + links.
    const chunk = [
      "Some prose line with [[Alpha]] and more words. ",
      "Also [display](./beta.md#section) and plain text. ",
      "A longer paragraph that wraps and contains [[Project/Alpha]]. ",
    ].join("\n")
    let content = ""
    while (content.length < 100_000) content += chunk
    const start = performance.now()
    const links = extractLinks(content)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(50)
    expect(links.length).toBeGreaterThan(0)
  })
})
