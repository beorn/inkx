/**
 * Copy-mode yank → clipboard wiring (km-silvery 19761).
 *
 * Bug: CopyModeFeature's `yank` (keyboard `y` in visual copy-mode) updated the
 * selection state but never wrote the clipboard. The "copy" effect handler in
 * copy-mode.ts called `selection.clear()` with a comment claiming focus plumbing
 * handled the clipboard — but nothing did. So keyboard yank silently copied
 * nothing, while mouse drag-copy worked.
 *
 * Fix: SelectionFeature gains `copySelection()` (extract current range + write
 * the clipboard via the SAME path as mouse/drag copy). copy-mode's "copy" effect
 * calls it. Both the standalone feature (Test A) and the create-app bridge that
 * production copy-mode actually talks to (Test C) are covered — the bridge path
 * is the one the 2026-05-11 mount-verification lesson says must be tested, not
 * just the slice.
 *
 * Scope is copy-mode/clipboard wiring only — extraction semantics are 19756's.
 */

import { describe, it, expect } from "vitest"
import { createSelectionFeature, createSelectionBridge } from "@silvery/ag-term/features/selection"
import { createCopyModeFeature } from "@silvery/ag-term/features/copy-mode"
import { TerminalBuffer } from "@silvery/ag-term/buffer"
import { createTerminalSelectionState } from "@silvery/headless/selection"

// ============================================================================
// Helpers
// ============================================================================

function mockClipboard(): { lastCopied: string | null; copy(text: string): void } {
  return {
    lastCopied: null,
    copy(text: string): void {
      this.lastCopied = text
    },
  }
}

/** A buffer with "Hello World" as selectable content on row 0. */
function bufferWithText(): TerminalBuffer {
  const buffer = new TerminalBuffer(40, 10)
  const text = "Hello World"
  for (let i = 0; i < text.length; i++) {
    buffer.setCell(i, 0, { char: text[i]!, selectable: true })
  }
  return buffer
}

// ============================================================================
// Test A — feature-level integration (the reproduce)
// ============================================================================

describe("copy-mode yank writes the clipboard (19761)", () => {
  it("yank copies the visual selection to the clipboard — same text as mouse copy", () => {
    const buffer = bufferWithText()
    const clipboard = mockClipboard()
    const selection = createSelectionFeature({ buffer, clipboard, invalidate: () => {} })
    const copyMode = createCopyModeFeature({
      selection,
      invalidate: () => {},
      bufferWidth: 40,
      bufferHeight: 10,
    })

    // Enter copy mode at (0,0), start visual, move right to col 4 → select
    // "Hello" (cols 0..4), then yank.
    copyMode.enter(0, 0, 40, 10)
    copyMode.startVisual()
    copyMode.motion("l")
    copyMode.motion("l")
    copyMode.motion("l")
    copyMode.motion("l")
    copyMode.yank()

    // Before the fix: yank cleared the selection without writing → null.
    expect(clipboard.lastCopied).toBe("Hello")
    // yank still exits copy mode + clears the visual selection.
    expect(copyMode.state.active).toBe(false)
    expect(selection.state.range).toBeNull()
  })

  it("yank without a visual selection writes nothing and just exits", () => {
    const buffer = bufferWithText()
    const clipboard = mockClipboard()
    const selection = createSelectionFeature({ buffer, clipboard, invalidate: () => {} })
    const copyMode = createCopyModeFeature({
      selection,
      invalidate: () => {},
      bufferWidth: 40,
      bufferHeight: 10,
    })

    copyMode.enter(0, 0, 40, 10)
    copyMode.yank() // no startVisual

    expect(clipboard.lastCopied).toBeNull()
    expect(copyMode.state.active).toBe(false)
  })
})

// ============================================================================
// Test C — production bridge path (create-app's SelectionBridge)
// ============================================================================

describe("copy-mode yank routes through the SelectionBridge copy path (19761)", () => {
  it("yank invokes the bridge's copy callback — the path production copy-mode uses", () => {
    // Production copy-mode talks to create-app's SelectionBridge (via the
    // with-focus proxy), NOT a standalone feature. The bridge's `copy` callback
    // is what runs the real extract+OSC52. This pins that yank reaches it.
    let copyCalls = 0
    const bridge = createSelectionBridge({
      getState: () => createTerminalSelectionState(),
      subscribe: () => () => {},
      setRange: () => {},
      clear: () => {},
      copy: () => {
        copyCalls++
      },
    })
    const copyMode = createCopyModeFeature({
      selection: bridge,
      invalidate: () => {},
      bufferWidth: 40,
      bufferHeight: 10,
    })

    copyMode.enter(0, 0, 40, 10)
    copyMode.startVisual()
    copyMode.motion("l")
    copyMode.yank()

    // Before the fix: the "copy" effect cleared without invoking copy → 0.
    expect(copyCalls).toBe(1)
  })
})
