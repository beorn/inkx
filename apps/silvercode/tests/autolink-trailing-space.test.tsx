/**
 * Autolinked file path must NOT eat the trailing space when followed by
 * a regular word in the user-message echo line.
 *
 * Bead: km-silvercode.autolink-trailing-space-eaten.
 *
 * Symptom: typed `echo paths: vendor/silvery and /main.ts and https://example.com`
 * → user echo rendered with `/main.ts` and the next word visually adjacent
 * (no visible space). The assistant-response line below the same content
 * rendered with the proper space — so the bug was specific to the user-
 * message path (LinkifiedText with role="user").
 *
 * Fix: gap text between detections is rendered as `<Text>{gap}</Text>`
 * (a styled silvery-text node), not `<React.Fragment>{gap}</React.Fragment>`
 * (a raw-text-string sibling). With every piece a styled span, silvery's
 * cell-level positioning treats the boundary between the link and the
 * surrounding gap as "two styled spans next to each other" — word-wrap
 * operates on the unified text content with whitespace preserved verbatim.
 *
 * This test pins the cell-level invariant: the character at the position
 * immediately after an underlined autolink MUST be the trailing space, NOT
 * the next word's first character. If the bug recurs (link slice eats the
 * boundary char), the assertion at col[link_end] === " " will fail.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Prose, Text } from "silvery"
import { LinkifiedText } from "../src/components/LinkifiedText.tsx"

/**
 * Render the user-message row in isolation — same layout as ChatBlockList's
 * inline `UserRow` component: `>` glyph + Prose + LinkifiedText with role="user".
 */
function UserRow({ text }: { text: string }): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      flexShrink={1}
      minWidth={0}
      backgroundColor="$bg-surface-subtle"
      paddingX={1}
      paddingY={0}
    >
      <Box flexDirection="row" gap={1} flexShrink={1} minWidth={0}>
        <Text bold color="$accent">
          {">"}
        </Text>
        <Prose flexGrow={1} flexShrink={1} minWidth={0}>
          <LinkifiedText text={text} role="user" />
        </Prose>
      </Box>
    </Box>
  )
}

describe("user message row — trailing space preserved after autolink", () => {
  test("space character is present at the boundary between /main.ts and 'and'", () => {
    const text = "echo paths: vendor/silvery and /main.ts and https://example.com"
    const render = createRenderer({ cols: 100, rows: 5 })
    const app = render(<UserRow text={text} />)

    // Plain text: the space is preserved end-to-end.
    expect(app.text).toContain("/main.ts and")
    expect(app.text).not.toContain("/main.tsand")

    // Cell-level: find the row containing /main.ts and inspect the cell
    // immediately after the link. The previous bug had the link's slice
    // include the trailing space (or had the space cell merged with the
    // link's underline/style attributes), making the boundary visually
    // ambiguous.
    let linkRow = -1
    let linkCol = -1
    for (let r = 0; r < app.height; r++) {
      const line = app.lines[r] ?? ""
      const idx = line.indexOf("/main.ts")
      if (idx >= 0) {
        linkRow = r
        linkCol = idx
        break
      }
    }
    expect(linkRow).toBeGreaterThanOrEqual(0)

    // The link occupies columns [linkCol .. linkCol+8). The cell at
    // linkCol+8 is the space, linkCol+9 is "a" of "and".
    const linkEndCol = linkCol + "/main.ts".length
    const spaceCell = app.cell(linkEndCol, linkRow)
    expect(spaceCell.char).toBe(" ")
    // The space cell MUST NOT carry the link's underline — that's how
    // the "trailing space eaten" symptom manifested visually (the
    // underline kept going past the link, making the eye perceive the
    // space as part of the link instead of a separator).
    expect(spaceCell.underline).toBe(false)

    // Sanity: the next char is "a" (start of "and").
    const nextCell = app.cell(linkEndCol + 1, linkRow)
    expect(nextCell.char).toBe("a")
  })

  test("multiple autolinks on one line preserve all interior whitespace", () => {
    // Three detections separated by spaces. The middle gap (` and `) is
    // the most interesting — a Fragment-string gap sandwiched between
    // two styled link Text nodes was the historical breakage shape.
    const text = "see /a.ts and /b.ts and /c.ts now"
    const render = createRenderer({ cols: 120, rows: 5 })
    const app = render(<UserRow text={text} />)

    // Every gap word is intact — no link absorbs an adjacent space.
    expect(app.text).toContain("/a.ts and ")
    expect(app.text).toContain("/b.ts and ")
    expect(app.text).toContain("/c.ts now")
    expect(app.text).not.toContain("tsand")
    expect(app.text).not.toContain("tsnow")
  })
})
