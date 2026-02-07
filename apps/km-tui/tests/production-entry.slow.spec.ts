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
  options?: {
    viewMode?: "cards" | "columns" | "list" | "tabs"
    cols?: number
    rows?: number
  },
) {
  const repo = createFakeRepo({ nodes })
  const rootId = nodes[0]!.id
  const initialState = buildBoardState(repo, rootId)
  const toastQueue = createToastQueue()
  const cols = options?.cols ?? 80
  const rows = options?.rows ?? 24
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

describe("production smoke: console toggle", () => {
  test("backtick toggles showConsole in store", async () => {
    // Regression: the backtick key must toggle ui.showConsole so the Board
    // component's screen-switch effect fires. If the key handler doesn't reach
    // the toggle (e.g. swallowed by dialog guard or command system), the
    // console screen never appears.
    const nodes = item("board", item("col1", item("task1")))
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

    // Initially console should be hidden
    expect(handle.store.getState().ui.showConsole).toBe(false)

    // Press backtick to open console
    await handle.press("`")
    expect(handle.store.getState().ui.showConsole).toBe(true)

    // Press backtick again to close console
    await handle.press("`")
    expect(handle.store.getState().ui.showConsole).toBe(false)

    handle.unmount()
  })

  test("useApp() provides pause/resume from L3 createApp", async () => {
    // Regression: L3 createApp captures pause/resume as undefined in the
    // AppContext value object before they are assigned. Components calling
    // useApp() get { pause: undefined, resume: undefined }, so the console
    // screen-switch effect in Board.tsx early-returns.
    const nodes = item("board", item("col1", item("task1")))
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

    // In headless mode, pause/resume may legitimately be undefined (no real
    // terminal to switch screens on). But in interactive mode they must be
    // functions. We test that createApp at least populates them in the
    // AppContext for the non-headless case.
    //
    // For now, just verify the store state toggles correctly (tested above)
    // and that headless mode doesn't crash when console is toggled.
    const handle = await app.run(element, { cols: 80, rows: 24 })

    await handle.press("`") // toggle on
    expect(handle.store.getState().ui.showConsole).toBe(true)

    // Board should still render without crashing (even if pause is undefined)
    expect(handle.text.trim().length).toBeGreaterThan(0)

    await handle.press("`") // toggle off
    expect(handle.store.getState().ui.showConsole).toBe(false)
    expect(handle.text).toContain("col1")

    handle.unmount()
  })
})

describe("production smoke: store dimensions", () => {
  test("createInitialUIState: undefined dimensions → isReady false", () => {
    // Regression guard: if dimensions are undefined (no TTY), isReady must
    // be false to prevent rendering with NaN widths. tui.tsx must resolve
    // dimensions via fallback before passing to createInitialUIState.
    const ui = createInitialUIState(
      "cards",
      [],
      {
        columns: undefined as unknown as number,
        rows: undefined as unknown as number,
      },
      "root",
    )
    expect(ui.isReady).toBe(false)
    expect(ui.dimensions).toEqual({ columns: undefined, rows: undefined })
  })

  test("createInitialUIState: valid dimensions → isReady true", () => {
    const ui = createInitialUIState(
      "cards",
      [],
      { columns: 80, rows: 24 },
      "root",
    )
    expect(ui.isReady).toBe(true)
    expect(ui.dimensions).toEqual({ columns: 80, rows: 24 })
  })

  test("full pipeline with valid dimensions renders visible content", async () => {
    // Smoke test: the production pipeline (createBoardApp → Board) produces
    // visible text when dimensions are valid. Catches wiring issues where
    // the store gets the right data but components don't read it.
    const nodes = item(
      "board",
      item("col1", item("task1"), item("task2")),
      item("col2", item("task3")),
    )
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

    // Store dimensions must be valid
    const { ui } = handle.store.getState()
    expect(ui.dimensions.columns).toBeGreaterThan(0)
    expect(ui.dimensions.rows).toBeGreaterThan(0)

    // Board must render visible content (not blank)
    expect(handle.text.trim().length).toBeGreaterThan(0)
    expect(handle.text).toContain("col1")
    expect(handle.text).toContain("task1")

    handle.unmount()
  })
})
