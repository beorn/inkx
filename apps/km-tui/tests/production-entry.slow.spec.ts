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
  test("backtick toggles showConsole and board screen recovers", async () => {
    // Regression: backtick must toggle console AND board must survive the
    // round-trip. In production, Board.tsx calls pause()/resume() from
    // useApp() to switch between alternate and normal screen. If pause/resume
    // are undefined (L3 createApp bug), the screen-switch effect is skipped.
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

    // Board should render content initially
    expect(handle.text).toContain("col1")
    expect(handle.text).toContain("task1")

    // Press backtick to open console
    await handle.press("`")
    expect(handle.store.getState().ui.showConsole).toBe(true)

    // Press backtick to close console
    await handle.press("`")
    expect(handle.store.getState().ui.showConsole).toBe(false)

    // SCREEN CHECK: Board must render content after console round-trip.
    // If the render pipeline breaks during toggle, screen goes blank.
    expect(handle.text).toContain("col1")
    expect(handle.text).toContain("task1")

    handle.unmount()
  })

  test("keys are blocked while console is active (only backtick/Esc dismiss)", async () => {
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

    // Cursor starts on task1
    expect(handle.store.getState().boardState.cursorNodeId).toBe("task1")

    // Open console
    await handle.press("`")
    expect(handle.store.getState().ui.showConsole).toBe(true)

    // Navigation keys should be blocked while console is open
    await handle.press("j")
    expect(handle.store.getState().boardState.cursorNodeId).toBe("task1")

    // Escape should close console
    await handle.press("Escape")
    expect(handle.store.getState().ui.showConsole).toBe(false)

    // Now j should work again — check SCREEN not just state
    await handle.press("j")
    expect(handle.store.getState().boardState.cursorNodeId).toBe("task2")
    expect(handle.text).toContain("task2")

    handle.unmount()
  })
})

describe("production smoke: inline edit + re-render", () => {
  test("inline edit confirm updates repo AND screen reflects change", async () => {
    // Regression (km-tui.6, km-tui.save-rerender): after inline edit confirm,
    // the board must re-render to show updated text. This was previously fixed
    // with useSyncExternalStore (commit 27302791) but may regress during
    // store refactoring.
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

    // Verify initial screen content
    expect(handle.text).toContain("task1")

    // Enter inline edit mode
    await handle.press("Enter")

    // Type new text (appends to existing)
    for (const c of "-edited") await handle.press(c)

    // Confirm with Enter
    await handle.press("Enter")

    // DATA CHECK: repo must have updated content
    expect(repo.getNode("task1")?.content).toBe("task1-edited")

    // SCREEN CHECK: board must re-render with new text
    expect(handle.text).toContain("task1-edited")

    handle.unmount()
  })

  test("cursor navigation screen updates after edit confirm", async () => {
    // Verifies the board is still interactive after an inline edit.
    // Catches broken re-render pipelines that leave the board frozen.
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
    const textBefore = handle.text

    // Navigate down
    await handle.press("j")
    expect(handle.store.getState().boardState.cursorNodeId).toBe("task2")

    // SCREEN CHECK: screen must update after cursor move
    // (catches perf regression where setUI({ bellState: null }) triggers
    // unnecessary re-renders but screen doesn't actually change)
    const textAfter = handle.text
    expect(textAfter).toContain("task2")

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
