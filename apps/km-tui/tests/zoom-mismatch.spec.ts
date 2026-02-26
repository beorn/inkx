/**
 * Regression test: km-inkx.zoom-mismatch
 *
 * Bug: Multi-line paragraph content (with newlines) in a card body row
 * bleeds text from later lines onto subsequent body rows.
 *
 * Real case: A paragraph node with content like:
 *   "https://bitbucket.org/...\nSee also [[#^1135923304464396]]\nhttps://..."
 * causes "4464396" to appear on the next card row ("Clone all of xpilot").
 *
 * The paragraph body row has height=1 and wrap="truncate", so only line 1
 * should display. But text from line 2 bleeds into the next body row.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("zoom-mismatch: multi-line paragraph text bleed", () => {
  test("multi-line paragraph does not bleed text into next body row", () => {
    // Reproduce the exact structure from imports/asana/stabell:
    // A heading card with:
    //   1. A paragraph child with multi-line content (URLs + wikilink)
    //   2. Task children with clean content
    const { board } = testEnv(
      () =>
        item.root(
          "board",
          item(
            "column",
            item(
              "Happylatte - convert hg to git",
              // Multi-line paragraph: 3 lines separated by \n
              // Line 1: bare URL
              // Line 2: "See also [[#^1135923304464396]]" (unresolved wikilink)
              // Line 3: more URLs
              item.paragraph(
                "https://bitbucket.org/blog/sunsetting-mercurial-support-in-bitbucket\nSee also [[#^1135923304464396]]\nhttps://bitbucket.org/blog/sunsetting-mercurial-support https://github.com/frej/fast-export",
              ),
              item.task("Clone all of xpilot"),
              item.task("Clone all of happylatte"),
            ),
          ),
        ),
      { columns: 80, rows: 20 },
    )

    // The card should show:
    // - "Happylatte - convert hg to git" as card title
    // - "bitbucket.org/blog/sunsetting-me..." (truncated URL from paragraph line 1)
    // - "✓ Clone all of xpilot" (clean task text)
    // - "✓ Clone all of happylatte" (clean task text)
    //
    // Bug: "Clone all of xpilot" row shows "Clone all of xpilot4464396"
    // where "4464396" comes from the wikilink in paragraph line 2

    const text = board.screenshot()
    expect(text).toContain("Clone all of xpilot")

    // The critical assertion: no digits from the block ref should appear
    // on the "Clone all of xpilot" line
    const lines = text.split("\n")
    const xpilotLine = lines.find((l) => l.includes("Clone all of xpilot"))
    expect(xpilotLine).toBeDefined()
    expect(xpilotLine).not.toContain("4464396")
    expect(xpilotLine).not.toContain("1135923")

    // Also verify "Clone all of happylatte" is clean
    const happylatteLine = lines.find((l) => l.includes("Clone all of happylatte"))
    expect(happylatteLine).toBeDefined()
    expect(happylatteLine).not.toContain("4464396")
  })
})
