/**
 * Phase tests — preview-as-selection (km-tui.omnibox-preview-pane).
 *
 * Two surfaces:
 *   1. Pure derivation `previewForRow(row, ctx)` → PreviewContent
 *      (tested without React)
 *   2. UnifiedOmnibox render — when preview prop is on, a pane with
 *      the current row's detail renders below the result list.
 */
import React from "react"
import { describe, expect, it } from "vitest"
import { createRenderer } from "@silvery/test"
import { previewForRow, type PreviewContext, type PreviewContent } from "../src/state/omnibox-preview.ts"
import { UnifiedOmnibox } from "../src/views/UnifiedOmnibox.tsx"
import { createOmniboxPane, type OmniboxInvocationSpec } from "../src/state/omnibox.ts"
import type { OmniboxRowData } from "../src/views/OmniboxRow.tsx"

function spec(buffer: string): OmniboxInvocationSpec {
  return {
    initialBuffer: buffer,
    initialDefaultCommand: "default",
    initialArgumentId: null,
    anchorPaneId: "pane-1",
    subjectSelection: { cursorId: "anchor", selectedIds: ["anchor"] },
    candidateProvider: () => [],
  }
}

function row(overrides: Partial<OmniboxRowData> & Pick<OmniboxRowData, "id" | "kind" | "title" | "icon">): OmniboxRowData {
  return { ...overrides }
}

// ---------------------------------------------------------------------------
// previewForRow — pure derivation
// ---------------------------------------------------------------------------

describe("previewForRow — null handling", () => {
  it("returns null for null row (no selection)", () => {
    expect(previewForRow(null, {})).toBeNull()
  })
})

describe("previewForRow — command rows", () => {
  it("renders command title + description + keybinding hint", () => {
    const cmd = row({ id: "goto", kind: "command", title: "Go to node", icon: ":", context: "Jump anywhere", hint: "g g" })
    const preview = previewForRow(cmd, {})
    expect(preview).not.toBeNull()
    expect(preview!.kind).toBe("command")
    expect(preview!.title).toBe("Go to node")
    expect(preview!.lines).toContain("Jump anywhere")
    expect(preview!.hint).toBe("g g")
  })

  it("falls back gracefully when description is missing", () => {
    const cmd = row({ id: "goto", kind: "command", title: "Goto", icon: ":" })
    const preview = previewForRow(cmd, {})
    expect(preview).not.toBeNull()
    expect(preview!.lines).toEqual([])
  })

  it("includes 'what Enter will do' summary for command rows", () => {
    const cmd = row({ id: "create_at", kind: "command", title: "Create here", icon: ":" })
    const preview = previewForRow(cmd, { effectiveCommand: "create_at" })
    expect(preview!.summary).toMatch(/Enter/i)
    expect(preview!.summary).toContain("create_at")
  })
})

describe("previewForRow — node rows", () => {
  it("renders node title + breadcrumb + 'open with default command' summary", () => {
    const node = row({ id: "task-42", kind: "node", title: "Buy milk", icon: "•", context: "Inbox > Today" })
    const preview = previewForRow(node, { effectiveCommand: "goto" })
    expect(preview).not.toBeNull()
    expect(preview!.kind).toBe("node")
    expect(preview!.title).toBe("Buy milk")
    expect(preview!.lines).toContain("Inbox > Today")
    expect(preview!.summary).toMatch(/Enter/i)
    expect(preview!.summary).toContain("goto")
  })

  it("renders default-command summary when caller doesn't specify effectiveCommand", () => {
    const node = row({ id: "task-42", kind: "node", title: "Buy milk", icon: "•" })
    const preview = previewForRow(node, {})
    expect(preview!.summary).toMatch(/Enter/i)
  })
})

describe("previewForRow — disabled rows", () => {
  it("flags disabled in the preview content", () => {
    const cmd = row({ id: "goto", kind: "command", title: "Goto", icon: ":", disabled: true })
    const preview = previewForRow(cmd, {})
    expect(preview!.disabled).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// UnifiedOmnibox render — preview prop
// ---------------------------------------------------------------------------

const sampleRow: OmniboxRowData = {
  id: "goto",
  kind: "command",
  title: "Go to node",
  icon: ":",
  context: "Jump to any node",
  hint: "g g",
}

describe("UnifiedOmnibox — preview pane prop", () => {
  it("does NOT render the preview pane when prop is omitted (default off)", () => {
    const render = createRenderer({ cols: 100, rows: 30 })
    const app = render(
      <UnifiedOmnibox
        pane={createOmniboxPane(spec(":g"))}
        results={[sampleRow]}
        selectedIndex={0}
        onBufferChange={() => {}}
        onConfirm={() => {}}
        layout="center"
      />,
    )
    expect(app.locator("[data-testid='omnibox-preview']").count()).toBe(0)
  })

  it("renders the preview pane when preview={true}, with the selected row's detail", () => {
    const render = createRenderer({ cols: 100, rows: 30 })
    const app = render(
      <UnifiedOmnibox
        pane={createOmniboxPane(spec(":g"))}
        results={[sampleRow]}
        selectedIndex={0}
        onBufferChange={() => {}}
        onConfirm={() => {}}
        layout="center"
        preview={true}
      />,
    )
    expect(app.locator("[data-testid='omnibox-preview']").count()).toBe(1)
    expect(app.text).toContain("Go to node")
    expect(app.text).toContain("Jump to any node")
  })

  it("preview pane updates when selectedIndex moves to a different row", () => {
    const second: OmniboxRowData = {
      id: "move",
      kind: "command",
      title: "Move node",
      icon: ":",
      context: "Reparent the cursor card",
    }
    const render = createRenderer({ cols: 100, rows: 30 })
    const app = render(
      <UnifiedOmnibox
        pane={createOmniboxPane(spec(":m"))}
        results={[sampleRow, second]}
        selectedIndex={1}
        onBufferChange={() => {}}
        onConfirm={() => {}}
        layout="center"
        preview={true}
      />,
    )
    expect(app.text).toContain("Move node")
    expect(app.text).toContain("Reparent the cursor card")
  })

  it("preview pane does NOT render when results are empty (no row to preview)", () => {
    const render = createRenderer({ cols: 100, rows: 30 })
    const app = render(
      <UnifiedOmnibox
        pane={createOmniboxPane(spec(":zzz"))}
        results={[]}
        selectedIndex={0}
        onBufferChange={() => {}}
        onConfirm={() => {}}
        layout="center"
        preview={true}
      />,
    )
    expect(app.locator("[data-testid='omnibox-preview']").count()).toBe(0)
  })

  it("bottom-left layout never renders the preview pane (acceptance d)", () => {
    const render = createRenderer({ cols: 100, rows: 30 })
    const app = render(
      <UnifiedOmnibox
        pane={createOmniboxPane(spec("/foo"))}
        results={[sampleRow]}
        selectedIndex={0}
        onBufferChange={() => {}}
        onConfirm={() => {}}
        layout="bottom-left"
        preview={true} /* explicitly on, but bottom-left ignores it */
      />,
    )
    expect(app.locator("[data-testid='omnibox-preview']").count()).toBe(0)
  })
})
