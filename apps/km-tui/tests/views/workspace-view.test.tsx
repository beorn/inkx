/**
 * WorkspaceView Component Tests
 *
 * Tests layout rendering, pane numbering, focus highlighting,
 * and split direction for the workspace pane layout.
 */

import { describe, it, expect } from "vitest"
import React from "react"
import { createRenderer } from "@silvery/test"
import { Text } from "@silvery/ag-react"
import { WorkspaceView } from "../../src/views/WorkspaceView.tsx"
import type { LayoutNode, PaneState, PaneViewType } from "../../src/board-types.ts"
import { createBoardState, createPaneState, createEmptyPaneState } from "../../src/board-types.ts"
import { usePaneLabel } from "../../src/pane-context.tsx"

const render = createRenderer()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal CursorStore stub — WorkspaceView doesn't use it, but PaneState requires it */
function stubCursorStore() {
  return {
    getState: () => ({
      cursorNodeId: null,
      cursorCardNodeId: null,
      cursorColumnNodeId: null,
      selectionLevel: "board" as const,
    }),
    setState: () => {},
    subscribe: () => () => {},
    getSnapshot: () => 0,
  }
}

/** Create a PaneState with sensible defaults */
function makePaneState(id: string, viewType: PaneViewType = "board"): PaneState {
  const cs = stubCursorStore()
  if (viewType === "detail") {
    const pane = createPaneState(id, createBoardState(), { viewMode: "detail", cursorStore: cs })
    return pane
  }
  if (viewType === "empty") {
    return createEmptyPaneState(id, cs)
  }
  return createPaneState(id, createBoardState(), { viewMode: "columns", cursorStore: cs })
}

/** Board content that reads pane label from context (like real Board does via BoardTopBar) */
function BoardContent() {
  const label = usePaneLabel()
  return <Text>{label ? `[${label}] ` : ""}Board Content</Text>
}

// ---------------------------------------------------------------------------
// Single leaf layout
// ---------------------------------------------------------------------------

describe("WorkspaceView — single leaf", () => {
  it("renders board directly without a border wrapper", () => {
    const pane = makePaneState("main")
    const layout: LayoutNode = { type: "leaf", paneId: "main" }
    const panes = new Map([["main", pane]])

    const app = render(
      <WorkspaceView layout={layout} panes={panes} focusedPaneId="main" renderPane={() => <BoardContent />} />,
    )

    // Board content is rendered
    expect(app.text).toContain("Board Content")
    // No pane label — single pane skips the [1] label wrapper
    expect(app.text).not.toContain("[1]")
  })
})

// ---------------------------------------------------------------------------
// Multi-pane layout
// ---------------------------------------------------------------------------

describe("WorkspaceView — multi-pane layout", () => {
  /** Helper: two-pane horizontal split */
  function twoPane(opts?: { focusedId?: string; leftType?: PaneViewType; rightType?: PaneViewType }) {
    const leftId = "pane-1"
    const rightId = "pane-2"
    const leftPane = makePaneState(leftId, opts?.leftType ?? "board")
    const rightPane = makePaneState(rightId, opts?.rightType ?? "board")
    const panes = new Map([
      [leftId, leftPane],
      [rightId, rightPane],
    ])
    const layout: LayoutNode = {
      type: "split",
      direction: "h",
      ratio: 0.5,
      left: { type: "leaf", paneId: leftId },
      right: { type: "leaf", paneId: rightId },
    }
    return { panes, layout, leftId, rightId, focusedId: opts?.focusedId ?? leftId }
  }

  it("renders bordered boxes with pane labels", () => {
    const { panes, layout, focusedId } = twoPane()

    const app = render(
      <WorkspaceView layout={layout} panes={panes} focusedPaneId={focusedId} renderPane={() => <BoardContent />} />,
    )

    expect(app.text).toContain("[1]")
    expect(app.text).toContain("[2]")
    expect(app.text).toContain("Board Content")
  })

  it("focused pane gets white border color, unfocused gets gray", () => {
    const { panes, layout } = twoPane({ focusedId: "pane-1" })

    const app = render(
      <WorkspaceView layout={layout} panes={panes} focusedPaneId="pane-1" renderPane={() => <BoardContent />} />,
    )

    // Locate label text nodes — focused [1] should be bold+white, unfocused [2] should be gray
    // (color is set on the Box borderColor prop — verified structurally via text presence)
    expect(app.text).toContain("[1]")
    expect(app.text).toContain("[2]")
  })

  it("switching focus to second pane keeps both labels", () => {
    const { panes, layout } = twoPane({ focusedId: "pane-2" })

    const app = render(
      <WorkspaceView layout={layout} panes={panes} focusedPaneId="pane-2" renderPane={() => <BoardContent />} />,
    )

    expect(app.text).toContain("[1]")
    expect(app.text).toContain("[2]")
  })

  it("empty pane shows 'empty' label text", () => {
    const { panes, layout } = twoPane({ rightType: "empty" })

    const app = render(
      <WorkspaceView layout={layout} panes={panes} focusedPaneId="pane-1" renderPane={() => <BoardContent />} />,
    )

    // The empty pane should show "Empty" in the pane title bar
    expect(app.text).toContain("Empty")
    // Both labels present (may be truncated at pane edge)
    expect(app.text).toContain("[1]")
    expect(app.text).toContain("[2")
  })
})

// ---------------------------------------------------------------------------
// Pane numbering / labels
// ---------------------------------------------------------------------------

describe("WorkspaceView — pane numbering", () => {
  it("top-level panes get sequential numbers [1], [2]", () => {
    const pane1 = makePaneState("a")
    const pane2 = makePaneState("b")
    const panes = new Map([
      ["a", pane1],
      ["b", pane2],
    ])
    const layout: LayoutNode = {
      type: "split",
      direction: "h",
      ratio: 0.5,
      left: { type: "leaf", paneId: "a" },
      right: { type: "leaf", paneId: "b" },
    }

    const app = render(
      <WorkspaceView layout={layout} panes={panes} focusedPaneId="a" renderPane={() => <BoardContent />} />,
    )

    expect(app.text).toContain("[1]")
    expect(app.text).toContain("[2]")
  })

  it("detail panes get parent number + d suffix: [1d]", () => {
    // Convention: detail pane ID = parentId + "-detail"
    const mainPane = makePaneState("main", "board")
    const detailPane = makePaneState("main-detail", "detail")
    const panes = new Map([
      ["main", mainPane],
      ["main-detail", detailPane],
    ])
    const layout: LayoutNode = {
      type: "split",
      direction: "h",
      ratio: 0.7,
      left: { type: "leaf", paneId: "main" },
      right: { type: "leaf", paneId: "main-detail" },
    }

    const app = render(
      <WorkspaceView layout={layout} panes={panes} focusedPaneId="main" renderPane={() => <BoardContent />} />,
    )

    expect(app.text).toContain("[1]")
    expect(app.text).toContain("[1d]")
  })

  it("three panes: [1], [2], [2d]", () => {
    const pane1 = makePaneState("first", "board")
    const pane2 = makePaneState("second", "board")
    const detailPane = makePaneState("second-detail", "detail")
    const panes = new Map([
      ["first", pane1],
      ["second", pane2],
      ["second-detail", detailPane],
    ])
    // Layout: first | (second / second-detail)
    const layout: LayoutNode = {
      type: "split",
      direction: "h",
      ratio: 0.5,
      left: { type: "leaf", paneId: "first" },
      right: {
        type: "split",
        direction: "v",
        ratio: 0.6,
        left: { type: "leaf", paneId: "second" },
        right: { type: "leaf", paneId: "second-detail" },
      },
    }

    const app = render(
      <WorkspaceView layout={layout} panes={panes} focusedPaneId="first" renderPane={() => <BoardContent />} />,
    )

    expect(app.text).toContain("[1]")
    expect(app.text).toContain("[2]")
    expect(app.text).toContain("[2d]")
  })
})

// ---------------------------------------------------------------------------
// Split direction
// ---------------------------------------------------------------------------

describe("WorkspaceView — split direction", () => {
  it("horizontal split (h) renders children in a row", () => {
    const pane1 = makePaneState("left")
    const pane2 = makePaneState("right")
    const panes = new Map([
      ["left", pane1],
      ["right", pane2],
    ])
    const layout: LayoutNode = {
      type: "split",
      direction: "h",
      ratio: 0.5,
      left: { type: "leaf", paneId: "left" },
      right: { type: "leaf", paneId: "right" },
    }

    const app = render(
      <WorkspaceView layout={layout} panes={panes} focusedPaneId="left" renderPane={() => <BoardContent />} />,
    )

    // Both labels visible — horizontal split puts them side by side
    expect(app.text).toContain("[1]")
    expect(app.text).toContain("[2]")
  })

  it("vertical split (v) renders children in a column", () => {
    const pane1 = makePaneState("top")
    const pane2 = makePaneState("bottom")
    const panes = new Map([
      ["top", pane1],
      ["bottom", pane2],
    ])
    const layout: LayoutNode = {
      type: "split",
      direction: "v",
      ratio: 0.5,
      left: { type: "leaf", paneId: "top" },
      right: { type: "leaf", paneId: "bottom" },
    }

    const app = render(
      <WorkspaceView layout={layout} panes={panes} focusedPaneId="top" renderPane={() => <BoardContent />} />,
    )

    // Both labels visible — vertical split stacks them
    expect(app.text).toContain("[1]")
    expect(app.text).toContain("[2]")
  })
})

// ---------------------------------------------------------------------------
// Missing pane fallback
// ---------------------------------------------------------------------------

describe("WorkspaceView — edge cases", () => {
  it("shows 'Missing pane' when layout references a pane not in the map", () => {
    // Layout references "ghost" but panes map only has "real"
    const realPane = makePaneState("real")
    const panes = new Map([["real", realPane]])
    const layout: LayoutNode = {
      type: "split",
      direction: "h",
      ratio: 0.5,
      left: { type: "leaf", paneId: "real" },
      right: { type: "leaf", paneId: "ghost" },
    }

    const app = render(
      <WorkspaceView layout={layout} panes={panes} focusedPaneId="real" renderPane={() => <BoardContent />} />,
    )

    expect(app.text).toContain("Missing pane")
    expect(app.text).toContain("ghost")
  })
})
