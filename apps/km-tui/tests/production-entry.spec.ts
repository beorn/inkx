/**
 * Smoke test for the production entry point (tui.tsx → createBoardApp → Board).
 *
 * Exercises the same code path as `bun km view` — createBoardApp() with Zustand
 * store + term:key handler + Board reading via useAppStore(). This catches
 * divergence between the test helpers (which manually set up StoreContext) and
 * the actual production wiring.
 */
import React from "react"
import { test, expect, describe } from "vitest"
import { createFakeRepo } from "@km/storage"
import { createBoardState } from "@km/board"
import { createToastQueue } from "@km/core"
import { InputLayerProvider } from "inkx"
import { item } from "./helpers/board-test.ts"
import { createBoardApp } from "../src/board-app.ts"
import { type CreateBoardAppStoreParams } from "../src/board-app-store.ts"
import { createInitialUIState } from "../src/ui-reducer.ts"
import { createLayoutRegistry } from "../src/card-positions.ts"
import { buildBoardState } from "../src/state.ts"
import { RepoProvider } from "../src/repo-context.tsx"
import { BoardApp } from "../src/views/index.ts"

/**
 * Build store params from a tree — same logic as tui.tsx's runBoard().
 */
function buildStoreParams(
  nodes: ReturnType<typeof item>,
  options?: { viewMode?: "cards" | "columns" | "list" | "tabs" },
) {
  const repo = createFakeRepo({ nodes })
  const rootId = nodes[0]!.id
  const initialState = buildBoardState(repo, rootId)
  const toastQueue = createToastQueue()
  const cols = 80
  const rows = 24
  const viewMode = options?.viewMode ?? "cards"

  let initialCursorNodeId: string | null = null
  if (initialState.columns.length > 0) {
    const firstCol = initialState.columns[0]
    if (firstCol && firstCol.cards.length > 0) {
      initialCursorNodeId = firstCol.cards[0]?.node.id ?? firstCol.node.id
    } else if (firstCol) {
      initialCursorNodeId = firstCol.node.id
    }
  }

  const initialLayout = {
    columns: initialState.columns,
    colIndex: 0,
    cardIndex: 0,
    subPath: [] as string[],
    isAtCardLevel:
      initialCursorNodeId !== null &&
      initialState.columns.length > 0 &&
      (initialState.columns[0]?.cards.length ?? 0) > 0,
    isInOutlineMode: false,
  }

  const selectedCol = initialState.columns[0]
  const selectedCard = selectedCol?.cards[0]
  const initialSelectedNode = selectedCard?.node ?? selectedCol?.node ?? null
  const initialSelectionLevel: "board" | "column" | "card" =
    initialCursorNodeId === null ? "board" : selectedCard ? "card" : "column"

  const storeParams: CreateBoardAppStoreParams = {
    repo,
    toastQueue,
    layoutRegistry: createLayoutRegistry(),
    initialBoardState: createBoardState(rootId, null, initialCursorNodeId),
    initialUIState: createInitialUIState(
      viewMode,
      [...(initialState.collapsedColumns ?? [])],
      { columns: cols, rows },
      rootId,
    ),
    initialLayout,
    initialTUIBoardState: initialState,
    initialSelectedNode,
    initialSelectionLevel,
    dimensions: { columns: cols, rows },
  }

  return { storeParams, repo, initialState }
}

describe("production entry point (createBoardApp)", () => {
  test("createBoardApp().run() renders BoardApp without crashing", async () => {
    const nodes = item(
      "board",
      item("col1", item("task1"), item("task2")),
      item("col2", item("task3")),
    )
    const { storeParams, repo, initialState } = buildStoreParams(nodes)
    const app = createBoardApp(storeParams)

    // Build the same element tree as production tui.tsx
    const element = React.createElement(
      RepoProvider,
      { repo },
      React.createElement(
        InputLayerProvider,
        null,
        React.createElement(BoardApp, {
          initialState,
          initialViewMode: "cards",
          toastQueue: storeParams.toastQueue,
        }),
      ),
    )

    // Run headless (cols+rows without stdout → no terminal output)
    const handle = await app.run(element, { cols: 80, rows: 24 })

    // Should have a working store with correct root
    expect(handle.store.getState().boardState.rootId).toBe("board")

    // Should render text (BoardApp renders Board which renders columns)
    expect(handle.text).toContain("col1")

    // Clean up
    handle.unmount()
  })

  test("createBoardApp().run() handles keyboard input via store", async () => {
    const nodes = item("board", item("col1", item("task1"), item("task2")))
    const { storeParams, repo, initialState } = buildStoreParams(nodes)
    const app = createBoardApp(storeParams)

    const element = React.createElement(
      RepoProvider,
      { repo },
      React.createElement(
        InputLayerProvider,
        null,
        React.createElement(BoardApp, {
          initialState,
          initialViewMode: "cards",
          toastQueue: storeParams.toastQueue,
        }),
      ),
    )

    const handle = await app.run(element, { cols: 80, rows: 24 })

    // Initial cursor should be on first card
    const state = handle.store.getState()
    expect(state.boardState.cursorNodeId).toBe("task1")

    // Press 'j' (cursor down) via the production key handler
    await handle.press("j")

    // Cursor should have moved
    const newState = handle.store.getState()
    expect(newState.boardState.cursorNodeId).toBe("task2")

    handle.unmount()
  })
})
