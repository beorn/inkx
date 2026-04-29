/**
 * Integration test for bare-scope cursor snap-to-root behavior.
 *
 * Reproduces the user-visible scenario from bead @km/tui/bare-scope-snap-to-root:
 *
 *   1. Open `km view beads` (resolves to `@km/beads`, a directory) — cursor
 *      should land on the first child of `@km/beads` (a bead file), NOT on
 *      a sub-block of the first bead.
 *   2. Re-opening with the saved workspace must NOT restore a deep cursor.
 *   3. Path-with-explicit-target opens still resume in their natural cursor
 *      position (governed by the existing depth-2 default; this test pins
 *      that behavior so the bare-scope fix can't accidentally regress it).
 */

import { describe, it, expect } from "vitest"
import { createFakeRepo } from "@km/storage"
import { createBoardState } from "../src/board/board-types.ts"
import { createInitialUIState } from "../src/state/ui-reducer.ts"
import { createGridNavigator } from "@km/board"
import { createToastQueue } from "@km/core"
import { item } from "./helpers/board-test.ts"
import { createBoardAppStoreState, type CreateBoardAppStoreParams } from "../src/state/board-app-store.ts"
import { createSignalStore } from "../src/state/signal-store.ts"
import type { PersistedWorkspace } from "../src/workspace-persist.ts"
import type { BoardAppStore } from "../src/state/board-app-store.ts"

function buildStoreParams(opts: {
  rootId: string
  bareScopeArrival?: boolean
  initialCursor?: string | null
  savedWorkspace?: PersistedWorkspace | null
  fixture: ReturnType<typeof item>
}): CreateBoardAppStoreParams {
  const repo = createFakeRepo({ nodes: opts.fixture })
  return {
    repo,
    toastQueue: createToastQueue(),
    navigator: createGridNavigator(),
    initialBoardState: createBoardState(opts.rootId, null, new Set()),
    initialCursor: opts.initialCursor ?? null,
    initialUIState: createInitialUIState({ columns: 80, rows: 24 }),
    initialViewMode: "cards",
    dimensions: { columns: 80, rows: 24 },
    savedWorkspace: opts.savedWorkspace ?? undefined,
    bareScopeArrival: opts.bareScopeArrival,
  }
}

/** Mirrors the @km/beads vault shape: a directory of bead files, each with sub-blocks. */
function beadsScopeFixture() {
  return item(
    "@km/beads",
    item("km-beads.detailed-test-spec", item("N478XNBJ"), item("N9YYAAB")),
    item("km-beads.cutover", item("AAA"), item("BBB")),
  )
}

describe("bare-scope cursor snap-to-root", () => {
  it("fresh open of `km view beads` snaps cursor to first bead file (not a sub-block)", () => {
    const params = buildStoreParams({
      rootId: "@km/beads",
      bareScopeArrival: true,
      // tui.tsx pre-computes initialCursor via computeInitialCursor(... bareScopeArrival)
      initialCursor: "km-beads.detailed-test-spec",
      fixture: beadsScopeFixture(),
    })
    const store = createSignalStore<BoardAppStore>(createBoardAppStoreState(params))
    const state = store.getState()
    const focusedPane = state.workspace.panes.get(state.workspace.focusedPaneId)
    expect(focusedPane?.viewType).toBe("board")
    if (focusedPane?.viewType !== "board") throw new Error("expected board pane")
    expect(focusedPane.sel.node.cursor()).toBe("km-beads.detailed-test-spec")
  })

  it("re-opening `km view beads` with saved workspace bypasses deep cursor restore", () => {
    // Saved workspace persists rootNodePath (the @km/beads scope) but not the cursor.
    // Without bareScopeArrival, restoreWorkspaceFromPersisted would compute
    // cursor=N478XNBJ (first card = sub-block of first bead — too deep).
    const savedWorkspace: PersistedWorkspace = {
      version: 1,
      name: "default",
      savedAt: new Date().toISOString(),
      layout: { type: "leaf", paneId: "main" },
      panes: [
        {
          id: "main",
          viewType: "board",
          rootNodePath: "@km/beads",
          viewMode: "cards",
        },
      ],
      focusedPaneId: "main",
    }
    const params = buildStoreParams({
      rootId: "@km/beads",
      bareScopeArrival: true,
      savedWorkspace,
      fixture: beadsScopeFixture(),
    })
    const store = createSignalStore<BoardAppStore>(createBoardAppStoreState(params))
    const state = store.getState()
    const focusedPane = state.workspace.panes.get(state.workspace.focusedPaneId)
    if (focusedPane?.viewType !== "board") throw new Error("expected board pane")
    // Snapped to the bead file (depth-1 child of @km/beads), NOT into N478XNBJ
    expect(focusedPane.sel.node.cursor()).toBe("km-beads.detailed-test-spec")
  })

  it("non-bare-scope open keeps depth-2 (first card) cursor — kanban regression guard", () => {
    // `km view @km/beads/some-bead` resolves to a file, not a directory,
    // so bareScopeArrival is false. Existing behavior: restored cursor is
    // the first card under the first column (depth-2).
    const savedWorkspace: PersistedWorkspace = {
      version: 1,
      name: "default",
      savedAt: new Date().toISOString(),
      layout: { type: "leaf", paneId: "main" },
      panes: [
        {
          id: "main",
          viewType: "board",
          rootNodePath: "@km/beads/km-beads.detailed-test-spec",
          viewMode: "cards",
        },
      ],
      focusedPaneId: "main",
    }
    const fixture = beadsScopeFixture()
    // Add fs_path on the bead file so resolveNode finds it via path matching.
    const beadNode = fixture.find((n) => n.id === "km-beads.detailed-test-spec")
    if (beadNode) beadNode.fs_path = "@km/beads/km-beads.detailed-test-spec"
    const params = buildStoreParams({
      rootId: "km-beads.detailed-test-spec",
      bareScopeArrival: false,
      savedWorkspace,
      fixture,
    })
    const store = createSignalStore<BoardAppStore>(createBoardAppStoreState(params))
    const state = store.getState()
    const focusedPane = state.workspace.panes.get(state.workspace.focusedPaneId)
    if (focusedPane?.viewType !== "board") throw new Error("expected board pane")
    // Without bareScopeArrival, computeInitialCursorFromRepo descends to
    // the first card. The bead has only sub-blocks (no nested columns),
    // so columns[0]=N478XNBJ; cards under N478XNBJ are empty; falls back to
    // firstCol.id=N478XNBJ. That's the existing depth-2 behavior preserved.
    expect(focusedPane.sel.node.cursor()).toBe("N478XNBJ")
  })
})
