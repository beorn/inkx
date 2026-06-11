/**
 * Copy-selection semantic-extraction regression — copied text must match the
 * highlighted *semantic* selection, never the raw terminal-row rectangle.
 *
 * Bug (km-silvery 19756): dragging a selection across rows that carry a left
 * gutter / margin (paddingLeft), or across a soft-wrapped logical line, copies
 * the padding/gutter cells and the wrap-fill cells — text that is highlighted
 * as non-selectable layout blanks but leaks into the clipboard.
 *
 * Root cause: the highlight renderer composes cells with
 * `respectSelectableFlag = true` (see runtime/renderer.ts), but the OSC 52 copy
 * path called `extractText(buffer, range, { scope })` WITHOUT
 * `respectSelectableFlag` and WITHOUT `rowMetadata`. So the highlight is
 * semantic while the copy grabs the full rectangle. These tests pin the two
 * paths together: what is highlighted is what is copied.
 *
 * Harness mirrors selection-drag-vs-click.test.tsx — `term.mouse.*` +
 * `term.clipboard`, no hand-rolled SGR strings, no `as any` on the gestures.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createTermless } from "@silvery/test"
import "@termless/test/matchers"
import { run } from "../../packages/ag-term/src/runtime/run"
import { Box, Text } from "../../src/index.js"

const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms))

// A column with a 4-cell left gutter (paddingLeft). The gutter cells are
// structural layout blanks — non-selectable — on every row.
function GutteredColumn() {
  return (
    <Box flexDirection="column" paddingLeft={4}>
      <Text>FIRST</Text>
      <Text>SECOND</Text>
      <Text>THIRD</Text>
    </Box>
  )
}

// A single logical line that soft-wraps across visual rows. The fill cells
// past each wrapped row's last word are non-selectable layout blanks; the
// logical line must reconstruct as one line (soft-wrap join), not as several
// padded clipboard lines.
function WrappedParagraph() {
  return (
    <Box width={16} flexDirection="column">
      <Text>{"alpha beta gamma delta epsilon"}</Text>
    </Box>
  )
}

// A single unbreakable token longer than the box: word-wrap falls back to a
// forced mid-word char-break, consuming NO whitespace. Rejoin must add no space.
function HardWrappedToken() {
  return (
    <Box width={18} flexDirection="column">
      <Text>{"supercalifragilisticexpialidocious"}</Text>
    </Box>
  )
}

describe("copy-selection: semantic extraction (no margins/gutters/wrap padding)", () => {
  test("drag across a left-gutter column copies content, not the gutter cells", async () => {
    using term = createTermless({ cols: 24, rows: 8 })

    const handle = await run(<GutteredColumn />, term, {
      selection: true,
      mouse: true,
    } as { selection: true; mouse: true })
    await settle()
    term.clipboard.clear()

    // Drag from the "F" of FIRST (col 4, row 0 — past the 4-cell gutter) down
    // to the right end of THIRD's row. Interior rows (row 1) extend from col 0,
    // so the rectangle covers their gutter cells [0..3]. Those must NOT copy.
    await term.mouse.drag({ from: [4, 0], to: [20, 2] })
    await settle(200)

    const clipboard = term.clipboard.last
    expect(clipboard).not.toBeNull()

    // The bug: interior/last rows leak their 4 leading gutter spaces.
    expect(clipboard).not.toContain("    SECOND")
    expect(clipboard).not.toContain("    THIRD")
    // Semantic copy: exactly the three content lines, no padding.
    expect(clipboard).toBe("FIRST\nSECOND\nTHIRD")

    handle.unmount()
  })

  test("drag across a soft-wrapped line copies the joined logical line, no wrap padding", async () => {
    using term = createTermless({ cols: 24, rows: 8 })

    const handle = await run(<WrappedParagraph />, term, {
      selection: true,
      mouse: true,
    } as { selection: true; mouse: true })
    await settle()
    term.clipboard.clear()

    // Drag from the first cell of the paragraph down/right across every visual
    // row of the wrapped line. The wrap-fill cells past each row's last word
    // are non-selectable — they must not copy, and the visual rows must rejoin
    // into one logical line.
    await term.mouse.drag({ from: [0, 0], to: [15, 3], via: [[15, 1]] })
    await settle(200)

    const clipboard = term.clipboard.last
    expect(clipboard).not.toBeNull()

    // Soft-wrapped visual rows rejoin into ONE logical line: no mid-paragraph
    // newline, no wrap-fill padding, and the word-wrap breaking space (trimmed
    // from both rows by trim-mode rendering) reinserted exactly once.
    expect(clipboard).not.toMatch(/ {2,}/)
    expect(clipboard).toBe("alpha beta gamma delta epsilon")

    handle.unmount()
  })

  test("forced mid-word wrap rejoins with NO spurious space", async () => {
    using term = createTermless({ cols: 24, rows: 8 })

    const handle = await run(<HardWrappedToken />, term, {
      selection: true,
      mouse: true,
    } as { selection: true; mouse: true })
    await settle()
    term.clipboard.clear()

    // A single token longer than the box wraps mid-word (no whitespace consumed
    // at the break). Rejoining the visual rows must NOT invent a space — copying
    // a wrapped URL/hash/path must round-trip verbatim.
    await term.mouse.drag({ from: [0, 0], to: [17, 1] })
    await settle(200)

    const clipboard = term.clipboard.last
    expect(clipboard).not.toBeNull()
    expect(clipboard).not.toMatch(/ /)
    expect(clipboard).toBe("supercalifragilisticexpialidocious")

    handle.unmount()
  })

  test("Shift+drag opts out to the raw screen rectangle — gutters INCLUDED", async () => {
    // The documented escape hatch (docs/guide/text-selection.md): holding Shift
    // while dragging forces raw buffer-wide selection so users copy exactly what
    // they see on screen — the OPPOSITE of the semantic default. This pins the
    // opt-out so the default flip can't silently swallow the raw path.
    using term = createTermless({ cols: 24, rows: 8 })

    const handle = await run(<GutteredColumn />, term, {
      selection: true,
      mouse: true,
    } as { selection: true; mouse: true })
    await settle()
    term.clipboard.clear()

    // Drag from the very left (col 0 — into the 4-cell gutter) down to THIRD's
    // row, with Shift held on every event so the anchor forces buffer selection.
    await term.mouse.drag({ from: [0, 0], to: [20, 2], options: { shift: true } })
    await settle(200)

    const clipboard = term.clipboard.last
    expect(clipboard).not.toBeNull()
    // Raw rectangle: the gutter cells the semantic default drops are copied
    // verbatim here (4 leading spaces on each content row).
    expect(clipboard).toContain("    FIRST")
    expect(clipboard).toContain("    SECOND")
    expect(clipboard).toContain("    THIRD")

    handle.unmount()
  })
})
