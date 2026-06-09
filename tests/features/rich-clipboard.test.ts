/**
 * Rich clipboard integration tests.
 *
 * Covers:
 * - SelectionFeature uses copyRich when clipboard supports it
 * - Falls back to plain copy() when copyRich is absent
 * - extractHtml wraps text in pre tags with inline styles
 * - Both MIME types present in OSC 5522 payload via createRichClipboard
 * - createAdvancedClipboard fallback to OSC 52 when unsupported
 */

import { describe, test, expect, vi } from "vitest"
import { createSelectionFeature } from "../../packages/ag-term/src/features/selection"
import type { ClipboardCapability } from "../../packages/ag-term/src/features/clipboard-capability"
import { createRichClipboard } from "../../packages/ag-term/src/features/clipboard-capability"
import { createAdvancedClipboard } from "../../packages/ag-term/src/ansi/advanced-clipboard"
import { extractHtml } from "../../packages/ag-term/src/extract-html"
import { createBuffer, type TerminalBuffer } from "../../packages/ag-term/src/buffer"

// ============================================================================
// Helpers
// ============================================================================

/** Create a buffer with plain text content for selection tests. */
function createTestBuffer(): TerminalBuffer {
  const buffer = createBuffer(40, 10)
  // Flag content cells selectable — copy is semantic by default, mirroring a
  // real render where text-origin cells carry SELECTABLE_FLAG.
  const text = "Hello World"
  for (let i = 0; i < text.length; i++) {
    buffer.setCell(i, 0, { char: text[i]!, selectable: true })
  }
  const text2 = "Second Line"
  for (let i = 0; i < text2.length; i++) {
    buffer.setCell(i, 1, { char: text2[i]!, selectable: true })
  }
  return buffer
}

/** Create a buffer with styled text (bold red "Hello", normal " World"). */
function createStyledBuffer(): TerminalBuffer {
  const buffer = createBuffer(40, 5)

  // "Hello" in bold red
  const hello = "Hello"
  for (let i = 0; i < hello.length; i++) {
    buffer.setCell(i, 0, {
      char: hello[i]!,
      fg: { r: 255, g: 0, b: 0 },
      attrs: { bold: true },
      selectable: true,
    })
  }

  // " World" in default styling
  const world = " World"
  for (let i = 0; i < world.length; i++) {
    buffer.setCell(hello.length + i, 0, { char: world[i]!, selectable: true })
  }

  return buffer
}

function createMockClipboard(): ClipboardCapability & { lastCopied: string | null } {
  return {
    lastCopied: null,
    copy(text: string): void {
      this.lastCopied = text
    },
  }
}

function createMockRichClipboard(): ClipboardCapability & {
  lastCopied: string | null
  lastHtml: string | null
} {
  return {
    lastCopied: null,
    lastHtml: null,
    copy(text: string): void {
      this.lastCopied = text
    },
    copyRich(text: string, html: string): void {
      this.lastCopied = text
      this.lastHtml = html
    },
  }
}

// ============================================================================
// SelectionFeature — rich clipboard integration
// ============================================================================

describe("SelectionFeature — rich clipboard", () => {
  test("uses copyRich when clipboard supports it", () => {
    const buffer = createTestBuffer()
    const clipboard = createMockRichClipboard()

    const feature = createSelectionFeature({
      buffer,
      clipboard,
      invalidate: () => {},
    })

    // Select "Hello" (cols 0-4, row 0)
    feature.handleMouseDown(0, 0, false)
    feature.handleMouseMove(4, 0)
    feature.handleMouseUp(4, 0)

    expect(clipboard.lastCopied).toBe("Hello")
    expect(clipboard.lastHtml).toBeTruthy()
    expect(clipboard.lastHtml).toContain("<pre")
    expect(clipboard.lastHtml).toContain("Hello")

    feature.dispose()
  })

  test("falls back to plain copy() when copyRich is absent", () => {
    const buffer = createTestBuffer()
    const clipboard = createMockClipboard()

    const feature = createSelectionFeature({
      buffer,
      clipboard,
      invalidate: () => {},
    })

    // Select "Hello"
    feature.handleMouseDown(0, 0, false)
    feature.handleMouseMove(4, 0)
    feature.handleMouseUp(4, 0)

    expect(clipboard.lastCopied).toBe("Hello")

    feature.dispose()
  })
})

// ============================================================================
// extractHtml
// ============================================================================

describe("extractHtml", () => {
  test("wraps text in pre tags", () => {
    const buffer = createTestBuffer()
    const range = {
      anchor: { col: 0, row: 0 },
      head: { col: 4, row: 0 },
    }

    const html = extractHtml(buffer, range)

    expect(html).toMatch(/^<pre.*>/)
    expect(html).toMatch(/<\/pre>$/)
    expect(html).toContain("Hello")
  })

  test("includes font-family:monospace in pre style", () => {
    const buffer = createTestBuffer()
    const range = {
      anchor: { col: 0, row: 0 },
      head: { col: 4, row: 0 },
    }

    const html = extractHtml(buffer, range)
    expect(html).toContain("font-family:monospace")
  })

  test("renders bold text with font-weight:bold", () => {
    const buffer = createStyledBuffer()
    const range = {
      anchor: { col: 0, row: 0 },
      head: { col: 4, row: 0 },
    }

    const html = extractHtml(buffer, range)
    expect(html).toContain("font-weight:bold")
  })

  test("renders colored text with inline color style", () => {
    const buffer = createStyledBuffer()
    const range = {
      anchor: { col: 0, row: 0 },
      head: { col: 4, row: 0 },
    }

    const html = extractHtml(buffer, range)
    expect(html).toContain("color:rgb(255,0,0)")
  })

  test("handles multi-line selection", () => {
    const buffer = createTestBuffer()
    const range = {
      anchor: { col: 0, row: 0 },
      head: { col: 5, row: 1 },
    }

    const html = extractHtml(buffer, range)
    expect(html).toContain("Hello World")
    expect(html).toContain("Second")
  })

  test("escapes HTML special characters", () => {
    const buffer = createBuffer(40, 5)
    const text = "<b>bold&amp</b>"
    // Flag selectable — rich copy is semantic by default (skips non-selectable
    // cells), mirroring a real render where text-origin cells carry the flag.
    for (let i = 0; i < text.length; i++) {
      buffer.setCell(i, 0, { char: text[i]!, selectable: true })
    }

    const range = {
      anchor: { col: 0, row: 0 },
      head: { col: text.length - 1, row: 0 },
    }

    const html = extractHtml(buffer, range)
    expect(html).toContain("&lt;b&gt;")
    expect(html).toContain("&amp;amp")
    expect(html).not.toContain("<b>bold")
  })

  test("skips non-selectable gutter cells by default (semantic rich copy)", () => {
    // Mirror a gutter/margin render: a 2-cell non-selectable left gutter
    // followed by selectable content. The plain-text path filters these via
    // respectSelectableFlag; extractHtml must do the same so rich paste
    // (Slack/email/docs) doesn't leak the padded screen rectangle.
    const buffer = createBuffer(40, 1)
    buffer.setCell(0, 0, { char: "X", selectable: false }) // gutter
    buffer.setCell(1, 0, { char: "Y", selectable: false }) // gutter
    const content = "Hello"
    for (let i = 0; i < content.length; i++) {
      buffer.setCell(2 + i, 0, { char: content[i]!, selectable: true })
    }

    const range = {
      anchor: { col: 0, row: 0 },
      head: { col: 2 + content.length - 1, row: 0 },
    }

    const html = extractHtml(buffer, range)
    // Gutter chars must NOT appear; selectable content must.
    expect(html).not.toContain("X")
    expect(html).not.toContain("Y")
    expect(html).toContain("Hello")
    expect(html).toMatch(/<pre[^>]*>Hello<\/pre>/)
  })

  test("respectSelectableFlag:false includes non-selectable cells (raw rectangle)", () => {
    // Raw screen-rectangle extraction (Shift+drag) opts out — the verbatim
    // escape hatch must still copy the gutter cells.
    const buffer = createBuffer(40, 1)
    buffer.setCell(0, 0, { char: "X", selectable: false }) // gutter
    const content = "Hi"
    for (let i = 0; i < content.length; i++) {
      buffer.setCell(1 + i, 0, { char: content[i]!, selectable: true })
    }

    const range = {
      anchor: { col: 0, row: 0 },
      head: { col: 1 + content.length - 1, row: 0 },
    }

    const html = extractHtml(buffer, range, { respectSelectableFlag: false })
    expect(html).toContain("XHi")
  })

  test("plain text cells produce no span styling", () => {
    const buffer = createTestBuffer()
    const range = {
      anchor: { col: 0, row: 0 },
      head: { col: 4, row: 0 },
    }

    const html = extractHtml(buffer, range)
    // Plain text should not be wrapped in styled spans
    // (it should be bare text inside <pre>)
    expect(html).toMatch(/<pre[^>]*>Hello<\/pre>/)
  })

  test("styled and unstyled spans are adjacent", () => {
    const buffer = createStyledBuffer()
    const range = {
      anchor: { col: 0, row: 0 },
      head: { col: 10, row: 0 },
    }

    const html = extractHtml(buffer, range)
    // Bold red "Hello" followed by plain " World"
    expect(html).toContain("</span>")
    expect(html).toContain("World")
  })
})

// ============================================================================
// createRichClipboard — wraps AdvancedClipboard as ClipboardCapability
// ============================================================================

describe("createRichClipboard", () => {
  test("copy() delegates to advancedClipboard.copyText()", () => {
    const written: string[] = []
    const advClipboard = createAdvancedClipboard({
      write: (data) => written.push(data),
      onData: () => () => {},
      supported: false, // OSC 52 fallback
    })

    const clipboard = createRichClipboard(advClipboard)
    clipboard.copy("Hello")

    // Should produce an OSC 52 sequence (since supported=false)
    expect(written.length).toBeGreaterThan(0)
    const output = written.join("")
    expect(output).toContain("\x1b]52;c;")
  })

  test("copyRich() sends both text/plain and text/html via OSC 5522", () => {
    const written: string[] = []
    const advClipboard = createAdvancedClipboard({
      write: (data) => written.push(data),
      onData: () => () => {},
      supported: true, // OSC 5522 mode
    })

    const clipboard = createRichClipboard(advClipboard)
    clipboard.copyRich!("Hello", "<pre>Hello</pre>")

    const output = written.join("")

    // Should contain OSC 5522 write header
    expect(output).toContain("\x1b]5522;")
    expect(output).toContain("type=write")

    // Should contain wdata chunks for both MIME types
    expect(output).toContain("type=wdata")

    // Verify text/plain and text/html MIME types are present (base64 encoded)
    const textPlainB64 = Buffer.from("text/plain").toString("base64")
    const textHtmlB64 = Buffer.from("text/html").toString("base64")
    expect(output).toContain(`mime=${textPlainB64}`)
    expect(output).toContain(`mime=${textHtmlB64}`)
  })

  test("copyRich() falls back to OSC 52 for text/plain when unsupported", () => {
    const written: string[] = []
    const advClipboard = createAdvancedClipboard({
      write: (data) => written.push(data),
      onData: () => () => {},
      supported: false,
    })

    const clipboard = createRichClipboard(advClipboard)
    clipboard.copyRich!("Hello", "<pre>Hello</pre>")

    const output = written.join("")

    // Should fall back to OSC 52 with only the plain text
    expect(output).toContain("\x1b]52;c;")

    // Decode the base64 payload
    const match = output.match(/\x1b\]52;c;([A-Za-z0-9+/=]+)\x07/)
    expect(match).toBeTruthy()
    const decoded = Buffer.from(match![1]!, "base64").toString("utf-8")
    expect(decoded).toBe("Hello")
  })
})
