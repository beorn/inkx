/**
 * Inline Formatting Preservation (km-markdown.inline-format-loss)
 *
 * Tests that parsing + serializing preserves inline formatting for unedited
 * nodes. Previously, the parser discarded wrapping nodes (strong, emphasis,
 * inlineCode, link, delete), storing only plain text in node.content — so
 * every re-serialization stripped bold, italic, code, links, and strikethrough
 * from the entire file.
 *
 * Fix: at parse time, capture the verbatim inline source slice from the mdast
 * position data and store it in `node.data._mdSource`. At serialize time, if
 * the node's content matches the parse-time baseline, emit the source verbatim.
 *
 * Edits lose formatting (acceptable for a first-pass fix). Unedited nodes
 * preserve formatting byte-for-byte.
 */

import { describe, test, expect } from "vitest"
import { parseMarkdownToNodes } from "../src/ast2nodes.ts"
import { nodesToMarkdown } from "../src/nodes2md.ts"
import { roundtrip } from "./helpers/test-utils.ts"

describe("Inline formatting preservation (unedited nodes)", () => {
  test("bold in paragraph roundtrips", () => {
    const md = "# Doc\n\nText with **bold** word.\n"
    expect(roundtrip(md)).toContain("**bold**")
  })

  test("italic in paragraph roundtrips", () => {
    const md = "# Doc\n\nText with *italic* word.\n"
    expect(roundtrip(md)).toContain("*italic*")
  })

  test("inline code in paragraph roundtrips", () => {
    const md = "# Doc\n\nText with `code` word.\n"
    expect(roundtrip(md)).toContain("`code`")
  })

  test("markdown link in paragraph preserves URL", () => {
    const md = "# Doc\n\nVisit [Example](https://example.com) today.\n"
    const out = roundtrip(md)
    expect(out).toContain("[Example](https://example.com)")
  })

  test("strikethrough in paragraph roundtrips", () => {
    const md = "# Doc\n\nText with ~~strike~~ word.\n"
    expect(roundtrip(md)).toContain("~~strike~~")
  })

  test("mixed inline formatting in single paragraph", () => {
    const md = "# Doc\n\nText with **bold**, *italic*, `code`, and ~~strike~~.\n"
    const out = roundtrip(md)
    expect(out).toContain("**bold**")
    expect(out).toContain("*italic*")
    expect(out).toContain("`code`")
    expect(out).toContain("~~strike~~")
  })

  test("bold in list item roundtrips", () => {
    const md = "# Doc\n\n- Item with **bold** text\n"
    expect(roundtrip(md)).toContain("**bold**")
  })

  test("link in task roundtrips with URL preserved", () => {
    const md = "# Doc\n\n- [ ] Task with [Example](https://example.com)\n"
    const out = roundtrip(md)
    expect(out).toContain("[Example](https://example.com)")
  })

  test("inline code in task roundtrips", () => {
    const md = "# Doc\n\n- [ ] Task with `code`\n"
    expect(roundtrip(md)).toContain("`code`")
  })

  test("bold in heading roundtrips", () => {
    const md = "# Doc\n\n## Heading with **emphasis**\n\nbody\n"
    expect(roundtrip(md)).toContain("**emphasis**")
  })

  test("inline code in heading roundtrips", () => {
    const md = "# Doc\n\n## Config `tsconfig.json`\n\nbody\n"
    expect(roundtrip(md)).toContain("`tsconfig.json`")
  })

  test("editing one node preserves formatting in sibling nodes", () => {
    const md = `# Doc

First paragraph with **bold** text.

Second paragraph with *italic* text.

Third paragraph with \`code\` and a [link](https://example.com).
`
    const nodes = parseMarkdownToNodes(md, "test.md")

    // Simulate editing the second paragraph only
    const second = nodes.find((n) => n.content === "Second paragraph with italic text.")
    expect(second).toBeDefined()
    if (second) second.content = "Second paragraph EDITED."

    const out = nodesToMarkdown(nodes)

    // Edited node: plain text (formatting lost on that node only)
    expect(out).toContain("Second paragraph EDITED.")
    expect(out).not.toContain("Second paragraph with *italic*")

    // Unedited siblings: formatting preserved
    expect(out).toContain("First paragraph with **bold** text.")
    expect(out).toContain("Third paragraph with `code` and a [link](https://example.com).")
  })

  test("editing a task preserves formatting in other tasks", () => {
    const md = `# Doc

- [ ] First with **bold**
- [ ] Second with *italic*
- [ ] Third with \`code\`
`
    const nodes = parseMarkdownToNodes(md, "test.md")

    // Edit the second task
    const second = nodes.find((n) => n.content === "Second with italic")
    expect(second).toBeDefined()
    if (second) second.content = "Second EDITED"

    const out = nodesToMarkdown(nodes)

    expect(out).toContain("Second EDITED")
    expect(out).toContain("First with **bold**")
    expect(out).toContain("Third with `code`")
  })

  test("full file roundtrip preserves all inline formatting", () => {
    const md = `# Sample Document

This paragraph has **bold** and *italic* and \`inline code\` formatting.

Here's a [markdown link](https://example.com) and some ~~strikethrough~~ text.

## Tasks

- [ ] Task with **bold** text and a [link](https://foo.com)
- [ ] Another task with \`code\` and *italic*
`
    const out = roundtrip(md)
    // Every inline marker should survive
    expect(out).toContain("**bold**")
    expect(out).toContain("*italic*")
    expect(out).toContain("`inline code`")
    expect(out).toContain("[markdown link](https://example.com)")
    expect(out).toContain("~~strikethrough~~")
    expect(out).toContain("[link](https://foo.com)")
    expect(out).toContain("`code`")
  })
})
