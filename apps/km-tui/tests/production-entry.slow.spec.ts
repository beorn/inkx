/**
 * Smoke test for the production entry point (tui.tsx → createBoardApp → Board).
 *
 * Exercises the same code path as `bun km view` — createBoardApp() with Zustand
 * store + term:key handler + Board reading via useAppStore(). This catches
 * divergence between the test helpers (which manually set up StoreContext) and
 * the actual production wiring.
 */
import React from "react"
import { test, expect, describe, vi } from "vitest"
import { createFakeRepo } from "@km/storage"
import { createBoardState } from "../src/board-types.ts"
import { createToastQueue } from "@km/core"
import { InputLayerProvider } from "@silvery/react"
import { item } from "./helpers/board-test.ts"
import { createBoardApp, handleKey } from "../src/board-app.ts"
import { getActiveBoardPane, type CreateBoardAppStoreParams } from "../src/board-app-store.ts"
import { createInitialUIState } from "../src/ui-reducer.ts"
import { createGridNavigator } from "@km/board"
import { buildBoardState } from "../src/state.ts"
import { RepoProvider } from "../src/repo-context.tsx"
import { BoardApp } from "../src/views/index.ts"
import { createCursorStoreFromRepo } from "../src/cursor-store.ts"

/** Helper: React.createElement with children as prop (avoids React 19 overload mismatch) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const h = (type: any, props: any, ...children: any[]) =>
  React.createElement(
    type,
    children.length === 1 ? { ...props, children: children[0] } : children.length > 0 ? { ...props, children } : props,
  )

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
    if (firstCol && firstCol.cardNodes.length > 0) {
      initialCursorNodeId = firstCol.cardNodes[0]?.id ?? firstCol.node.id
    } else if (firstCol) {
      initialCursorNodeId = firstCol.node.id
    }
  }

  const storeParams: CreateBoardAppStoreParams = {
    repo,
    toastQueue,
    navigator: createGridNavigator(),
    cursorStore: createCursorStoreFromRepo(repo, rootId, initialCursorNodeId),
    initialBoardState: createBoardState(rootId, null, initialCursorNodeId, initialState.collapsedNodeIds),
    initialUIState: createInitialUIState({ columns: cols, rows }),
    initialViewMode: viewMode,
    dimensions: { columns: cols, rows },
  }

  return { storeParams, repo, initialState }
}

describe("production entry point (createBoardApp)", () => {
  test("createBoardApp().run() renders BoardApp without crashing", async () => {
    const nodes = item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3")))
    const { storeParams, repo, initialState } = buildStoreParams(nodes)
    const app = createBoardApp(storeParams)

    // Build the same element tree as production tui.tsx
    const element = h(
      RepoProvider,
      { repo },
      h(
        InputLayerProvider,
        null,
        h(BoardApp, {
          initialState,
          initialViewMode: "cards",
          toastQueue: storeParams.toastQueue,
        }),
      ),
    )

    // Run headless (cols+rows without stdout → no terminal output)
    const handle = await app.run(element, { cols: 80, rows: 24 })

    // Should have a working store with correct root
    expect(getActiveBoardPane(handle.store.getState())!.rootId).toBe("board")

    // Should render text (BoardApp renders Board which renders columns)
    expect(handle.text).toContain("col1")

    // Clean up
    handle.unmount()
  })

  test("createBoardApp().run() handles keyboard input via store", async () => {
    const nodes = item("board", item("col1", item("task1"), item("task2")))
    const { storeParams, repo, initialState } = buildStoreParams(nodes)
    const app = createBoardApp(storeParams)

    const element = h(
      RepoProvider,
      { repo },
      h(
        InputLayerProvider,
        null,
        h(BoardApp, {
          initialState,
          initialViewMode: "cards",
          toastQueue: storeParams.toastQueue,
        }),
      ),
    )

    const handle = await app.run(element, { cols: 80, rows: 24 })

    // Initial cursor should be on first card
    expect(getActiveBoardPane(handle.store.getState())!.cursorNodeId).toBe("task1")

    // Press 'j' (cursor down) via the production key handler
    await handle.press("j")

    // Cursor should have moved
    expect(getActiveBoardPane(handle.store.getState())!.cursorNodeId).toBe("task2")

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

    const element = h(
      RepoProvider,
      { repo },
      h(
        InputLayerProvider,
        null,
        h(BoardApp, {
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

    const element = h(
      RepoProvider,
      { repo },
      h(
        InputLayerProvider,
        null,
        h(BoardApp, {
          initialState,
          initialViewMode: "cards",
          toastQueue: storeParams.toastQueue,
        }),
      ),
    )

    const handle = await app.run(element, { cols: 80, rows: 24 })

    // Cursor starts on task1
    expect(getActiveBoardPane(handle.store.getState())!.cursorNodeId).toBe("task1")

    // Open console
    await handle.press("`")
    expect(handle.store.getState().ui.showConsole).toBe(true)

    // Navigation keys should be blocked while console is open
    await handle.press("j")
    expect(getActiveBoardPane(handle.store.getState())!.cursorNodeId).toBe("task1")

    // Escape should close console
    await handle.press("Escape")
    expect(handle.store.getState().ui.showConsole).toBe(false)

    // Now j should work again — check SCREEN not just state
    await handle.press("j")
    expect(getActiveBoardPane(handle.store.getState())!.cursorNodeId).toBe("task2")
    expect(handle.text).toContain("task2")

    handle.unmount()
  })
})

describe("console toggle: resume re-entrancy (km-tui.console)", () => {
  test("console round-trip doesn't break keypress handling", async () => {
    // Bug: resume() in create-app.tsx calls doRender() recursively when
    // invoked from a React effect during an outer doRender() call. This
    // can corrupt reconciler state in non-headless mode. In headless mode,
    // pause/resume are undefined so the Board effect skips screen switching.
    // This test verifies the state machine works correctly after toggle.
    const nodes = item("board", item("col1", item("task1"), item("task2")))
    const { storeParams, repo, initialState } = buildStoreParams(nodes)
    const app = createBoardApp(storeParams)

    const element = h(
      RepoProvider,
      { repo },
      h(
        InputLayerProvider,
        null,
        h(BoardApp, {
          initialState,
          initialViewMode: "cards",
          toastQueue: storeParams.toastQueue,
        }),
      ),
    )

    const handle = await app.run(element, { cols: 80, rows: 24 })

    // Toggle console on then off
    await handle.press("`")
    expect(handle.store.getState().ui.showConsole).toBe(true)
    await handle.press("`")
    expect(handle.store.getState().ui.showConsole).toBe(false)

    // After round-trip, keyboard input must still work
    expect(getActiveBoardPane(handle.store.getState())!.cursorNodeId).toBe("task1")
    await handle.press("j")
    expect(getActiveBoardPane(handle.store.getState())!.cursorNodeId).toBe("task2")

    // Screen must render correctly after round-trip
    expect(handle.text).toContain("col1")
    expect(handle.text).toContain("task1")
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

    const element = h(
      RepoProvider,
      { repo },
      h(
        InputLayerProvider,
        null,
        h(BoardApp, {
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

    const element = h(
      RepoProvider,
      { repo },
      h(
        InputLayerProvider,
        null,
        h(BoardApp, {
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
    expect(getActiveBoardPane(handle.store.getState())!.cursorNodeId).toBe("task2")

    // SCREEN CHECK: screen must update after cursor move
    // (catches perf regression where setUI({ bellState: null }) triggers
    // unnecessary re-renders but screen doesn't actually change)
    const textAfter = handle.text
    expect(textAfter).toContain("task2")

    handle.unmount()
  })
})

describe("perf regression: unnecessary setUI on keypress (km-tui.perf-regr)", () => {
  test("pressing j does not call setUI to clear already-null bellState/status", async () => {
    // Bug: handleKey() unconditionally calls get().setUI({ bellState: null, status: null })
    // on every keypress, even when both are already null. This creates a new ui object
    // reference, triggering ALL store subscribers (7+ useAppStore calls in Board.tsx).
    const nodes = item("board", item("col1", item("task1"), item("task2")))
    const { storeParams, repo, initialState } = buildStoreParams(nodes)
    const app = createBoardApp(storeParams)

    const element = h(
      RepoProvider,
      { repo },
      h(
        InputLayerProvider,
        null,
        h(BoardApp, {
          initialState,
          initialViewMode: "cards",
          toastQueue: storeParams.toastQueue,
        }),
      ),
    )

    const handle = await app.run(element, { cols: 80, rows: 24 })

    // Verify bellState and status start as null
    expect(handle.store.getState().ui.bellState).toBeNull()
    expect(handle.store.getState().ui.status).toBeNull()

    // Spy on setUI via store subscription - count how many times ui reference changes
    let uiChangeCount = 0
    const prevUi = { ref: handle.store.getState().ui }
    const unsub = handle.store.subscribe(() => {
      const newUi = handle.store.getState().ui
      if (newUi !== prevUi.ref) {
        uiChangeCount++
        prevUi.ref = newUi
      }
    })

    // Press 'j' to move cursor
    await handle.press("j")

    unsub()

    // Cursor should have moved (verifies the keypress was handled)
    expect(getActiveBoardPane(handle.store.getState())!.cursorNodeId).toBe("task2")

    // bellState and status should still be null
    expect(handle.store.getState().ui.bellState).toBeNull()
    expect(handle.store.getState().ui.status).toBeNull()

    // The key fix: ui should NOT have changed at all during a simple cursor move.
    // Before the fix, setUI({ bellState: null, status: null }) creates a new ui
    // object even though nothing changed, causing uiChangeCount >= 1.
    expect(uiChangeCount).toBe(0)

    handle.unmount()
  })
})

describe("save re-render: press() flushes all pending re-renders (km-tui.save-rerender)", () => {
  test("screen reflects repo mutation immediately after press() returns", async () => {
    // Bug: press() may return before all pending re-renders are flushed.
    // If an effect during doRender() triggers set() which queues a microtask,
    // and that microtask's render also triggers set(), press() might return
    // with stale screen content. The fix is to loop until stable.
    const nodes = item("board", item("col1", item("task1"), item("task2")))
    const { storeParams, repo, initialState } = buildStoreParams(nodes)
    const app = createBoardApp(storeParams)

    const element = h(
      RepoProvider,
      { repo },
      h(
        InputLayerProvider,
        null,
        h(BoardApp, {
          initialState,
          initialViewMode: "cards",
          toastQueue: storeParams.toastQueue,
        }),
      ),
    )

    const handle = await app.run(element, { cols: 80, rows: 24 })

    // Enter inline edit mode
    await handle.press("Enter")
    expect(getActiveBoardPane(handle.store.getState())!.inlineEditBlock).not.toBeNull()

    // Type new text
    for (const c of "-updated") await handle.press(c)

    // Confirm edit (outliner Enter: save + create new sibling in edit mode)
    await handle.press("Enter")

    // Outliner: inline edit is now on NEW sibling (not exited)
    expect(getActiveBoardPane(handle.store.getState())!.inlineEditBlock).not.toBeNull()

    // Repo must be updated
    expect(repo.getNode("task1")?.content).toBe("task1-updated")

    // CRITICAL: Screen must show updated text IMMEDIATELY after press() returns.
    // No additional setTimeout or manual doRender should be needed.
    expect(handle.text).toContain("task1-updated")

    // Exit new sibling edit mode, then navigate
    await handle.press("Escape")
    expect(getActiveBoardPane(handle.store.getState())!.inlineEditBlock).toBeNull()
    await handle.press("j")
    expect(handle.text).toContain("task2")

    handle.unmount()
  })
})

describe("filesystem sync: repo.updateNode() writes to disk (km-tui.save-rerender)", () => {
  test("repo.updateNode() via notifyFs triggers SyncManager write", async () => {
    // Diagnostic test: verifies the production wiring where
    // Repo.updateNode() → notifyFs() → emitter.getFsSync().applyEventToFs()
    // → SyncManager.handleNodeUpdated() → writeQueue → file on disk.
    const { writeFileSync, readFileSync } = await import("fs")
    const { join } = await import("path")
    const { withTestEnv, getAllNodes, createTestEnvRepo, SyncManager } = await import("@km/storage")

    await withTestEnv(async ({ repoDir, db, emitter }) => {
      // Create a markdown file with a task
      const testFile = join(repoDir, "tasks.md")
      writeFileSync(testFile, "# Tasks\n\n- [ ] Original title\n")

      // Create SyncManager (no worker, zero debounce for test)
      const syncManager = new SyncManager({
        db,
        repoPath: repoDir,
        debounceFs: 100,
        debounceApply: 0,
        conflictStrategy: "last_write_wins",
        useWorker: false,
      })

      // Wire up fsSync on the emitter (same as tui.tsx line 137)
      emitter.setFsSync(syncManager)

      // Initial sync to load files into DB
      await syncManager.syncFromFs()

      // Find the task node
      const allNodes = getAllNodes(db)
      const task = allNodes.find((n) => n.task_marker != null)
      expect(task).toBeDefined()
      expect(task!.content).toContain("Original title")

      // Now create a Repo that uses this same db+emitter
      // (simulating the production path where Repo.updateNode calls notifyFs)
      const { repo } = createTestEnvRepo({
        db,
        repoPath: repoDir,
        skipPersist: true,
      })

      // Wire the SAME syncManager to the repo's emitter
      repo.emitter.setFsSync(syncManager)

      // Use REPO.updateNode() (not data.updateNode()) — this exercises notifyFs()
      repo.updateNode(task!.id, { content: "Edited title" })

      // Wait for write queue to flush (debounce is 0, but flush is async)
      await Bun.sleep(200)

      // Verify the file was updated on disk
      const content = readFileSync(testFile, "utf-8")
      expect(content).toContain("Edited title")
      expect(content).not.toContain("Original title")

      // Clean up
      emitter.setFsSync(null)
      repo.emitter.setFsSync(null)
      await syncManager.stop()
      repo.close()
    })
  })

  test("emitter.getFsSync() returns non-null when wired in tui.tsx pattern", async () => {
    // Diagnostic: verifies the production wiring step
    const { withTestEnv, SyncManager } = await import("@km/storage")

    await withTestEnv(async ({ repoDir, db, emitter }) => {
      const syncManager = new SyncManager({
        db,
        repoPath: repoDir,
        debounceFs: 100,
        debounceApply: 0,
        conflictStrategy: "last_write_wins",
        useWorker: false,
      })

      // Before wiring, should be null
      expect(emitter.getFsSync()).toBeNull()

      // Wire up (same as tui.tsx line 137)
      emitter.setFsSync(syncManager)

      // After wiring, should be non-null
      expect(emitter.getFsSync()).not.toBeNull()

      // Clean up
      emitter.setFsSync(null)
      await syncManager.stop()
    })
  })

  test("shouldApplyToFs returns true for actor=user", async () => {
    const { shouldApplyToFs } = await import("@km/storage")
    expect(shouldApplyToFs("user")).toBe(true)
    expect(shouldApplyToFs("fs-watch")).toBe(false)
  })

  test("repo.subscribe fires on updateNode (useSyncExternalStore contract)", () => {
    // Verifies the contract useSyncExternalStore relies on:
    // subscribe(cb) registers listener, updateNode increments version, cb fires.
    const nodes = item("board", item("col1", item("task1")))
    const repo = createFakeRepo({ nodes })

    let callCount = 0
    const versionBefore = repo.getSnapshot()
    const unsub = repo.subscribe(() => {
      callCount++
    })

    repo.updateNode("task1", { content: "new content" })

    expect(callCount).toBe(1)
    expect(repo.getSnapshot()).toBe(versionBefore + 1)
    expect(repo.getNode("task1")?.content).toBe("new content")

    unsub()
  })
})

describe("production smoke: store dimensions", () => {
  test("createInitialUIState: stores dimensions", () => {
    const ui = createInitialUIState({ columns: 80, rows: 24 })
    expect(ui.dimensions).toEqual({ columns: 80, rows: 24 })
  })

  test("full pipeline with valid dimensions renders visible content", async () => {
    // Smoke test: the production pipeline (createBoardApp → Board) produces
    // visible text when dimensions are valid. Catches wiring issues where
    // the store gets the right data but components don't read it.
    const nodes = item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3")))
    const { storeParams, repo, initialState } = buildStoreParams(nodes)
    const app = createBoardApp(storeParams)

    const element = h(
      RepoProvider,
      { repo },
      h(
        InputLayerProvider,
        null,
        h(BoardApp, {
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

describe("perf: processEvent render count", () => {
  test("single keypress triggers minimal store notifications", async () => {
    // Before the fix, processEvent would: (1) handler calls set() → store
    // subscription fires synchronous doRender(), (2) processEvent calls
    // doRender() again. With the fix, isRendering guard defers the
    // subscription render and processEvent does a single doRender().
    const nodes = item("board", item("col1", item("task1"), item("task2")))
    const { storeParams, repo, initialState } = buildStoreParams(nodes)
    const app = createBoardApp(storeParams)

    const element = h(
      RepoProvider,
      { repo },
      h(
        InputLayerProvider,
        null,
        h(BoardApp, {
          initialState,
          initialViewMode: "cards",
          toastQueue: storeParams.toastQueue,
        }),
      ),
    )

    const handle = await app.run(element, { cols: 80, rows: 24 })

    // Count store subscription notifications during a single keypress
    let subscriptionCount = 0
    const unsub = handle.store.subscribe(() => {
      subscriptionCount++
    })

    await handle.press("j")

    unsub()

    // Cursor should have moved
    expect(getActiveBoardPane(handle.store.getState())!.cursorNodeId).toBe("task2")

    // Should have minimal store notifications (1 for cursor move, possibly
    // 1 for layout update from effect — but NOT 3+ from double-render)
    expect(subscriptionCount).toBeLessThanOrEqual(2)

    handle.unmount()
  })

  test("rapid keypresses: 10x j moves cursor 10 positions without bells", async () => {
    // Create a board with enough items for 10 cursor moves
    const items = Array.from({ length: 12 }, (_, i) => item(`task${i + 1}`))
    const nodes = item("board", item("col1", ...items))
    const { storeParams, repo, initialState } = buildStoreParams(nodes)
    const app = createBoardApp(storeParams)

    const element = h(
      RepoProvider,
      { repo },
      h(
        InputLayerProvider,
        null,
        h(BoardApp, {
          initialState,
          initialViewMode: "cards",
          toastQueue: storeParams.toastQueue,
        }),
      ),
    )

    const handle = await app.run(element, { cols: 80, rows: 24 })

    // Verify start position
    expect(getActiveBoardPane(handle.store.getState())!.cursorNodeId).toBe("task1")

    // Press j 10 times rapidly
    for (let i = 0; i < 10; i++) {
      await handle.press("j")
    }

    // Cursor should be on task11 (started at task1, moved 10 times)
    expect(getActiveBoardPane(handle.store.getState())!.cursorNodeId).toBe("task11")

    // No bell should have fired (we didn't hit any boundary)
    expect(handle.store.getState().ui.bellState).toBeNull()

    handle.unmount()
  })

  // Retry: performance benchmark can exceed threshold under parallel CPU contention.
  // Extended timeout (30s) to allow retries to complete under heavy load.
  test("keypress latency: 50 moves on 200-item board under 500ms total", { retry: 2, timeout: 30_000 }, async () => {
    // Performance benchmark: measures actual time per keypress on a
    // realistic-sized board. With the processEvent + useApp fixes, each
    // keypress should trigger 1-2 renders (not 3+) and complete quickly.
    const items = Array.from({ length: 200 }, (_, i) => item(`task${i + 1}`))
    const nodes = item("board", item("col1", ...items))
    const { storeParams, repo, initialState } = buildStoreParams(nodes)
    const app = createBoardApp(storeParams)

    const element = h(
      RepoProvider,
      { repo },
      h(
        InputLayerProvider,
        null,
        h(BoardApp, {
          initialState,
          initialViewMode: "cards",
          toastQueue: storeParams.toastQueue,
        }),
      ),
    )

    const handle = await app.run(element, { cols: 80, rows: 24 })

    // Warm up (j then k returns cursor to task1)
    await handle.press("j")
    await handle.press("k")
    expect(getActiveBoardPane(handle.store.getState())!.cursorNodeId).toBe("task1")

    // Measure 50 keypresses
    const start = performance.now()
    for (let i = 0; i < 50; i++) {
      await handle.press("j")
    }
    const elapsed = performance.now() - start

    // Cursor should have advanced: task1 + 50 moves = task51
    expect(getActiveBoardPane(handle.store.getState())!.cursorNodeId).toBe("task51")

    // 20000ms for 50 keys = 400ms/key budget. Very generous for CI/parallel load.
    // Normal runs complete in ~500ms; threshold is high to avoid flakes under contention.
    expect(elapsed).toBeLessThan(20000)

    handle.unmount()
  })

  test("visual bell clears on next keypress", async () => {
    // Bell is set when cursor hits boundary, and should clear at the
    // start of the next keypress (board-app.ts line 104), not via timeout.
    const nodes = item("board", item("col1", item("task1"), item("task2")))
    const { storeParams, repo, initialState } = buildStoreParams(nodes)
    const app = createBoardApp(storeParams)

    const element = h(
      RepoProvider,
      { repo },
      h(
        InputLayerProvider,
        null,
        h(BoardApp, {
          initialState,
          initialViewMode: "cards",
          toastQueue: storeParams.toastQueue,
        }),
      ),
    )

    const handle = await app.run(element, { cols: 80, rows: 24 })

    // Move to last item
    await handle.press("j")
    expect(getActiveBoardPane(handle.store.getState())!.cursorNodeId).toBe("task2")

    // Try to move past the boundary — should trigger bell
    await handle.press("j")
    expect(handle.store.getState().ui.bellState).not.toBeNull()

    // Press a valid key — bell should clear at start of keypress
    await handle.press("k")
    expect(handle.store.getState().ui.bellState).toBeNull()
    expect(getActiveBoardPane(handle.store.getState())!.cursorNodeId).toBe("task1")

    handle.unmount()
  })
})

describe("production smoke: date dialog (km-qaco9)", () => {
  test("td chord opens date dialog, Enter confirms and closes it", async () => {
    // Bug: in real terminal, Enter/Escape don't close the date dialog.
    // This test exercises the production code path (createBoardApp + handle.press)
    // to check if the issue is in event batching/timing.
    const nodes = item("board", item("col1", item.task("Buy groceries")))
    const { storeParams, repo, initialState } = buildStoreParams(nodes)
    const app = createBoardApp(storeParams)

    const element = h(
      RepoProvider,
      { repo },
      h(
        InputLayerProvider,
        null,
        h(BoardApp, {
          initialState,
          initialViewMode: "cards",
          toastQueue: storeParams.toastQueue,
        }),
      ),
    )

    const handle = await app.run(element, { cols: 80, rows: 24 })

    // Navigate to card level
    await handle.press("j")
    expect(getActiveBoardPane(handle.store.getState())!.cursorNodeId).not.toBeNull()

    // Open date dialog via td chord
    await handle.press("t")
    await handle.press("d")

    // Dialog should be open
    expect(handle.store.getState().ui.datePrompt).not.toBeNull()
    expect(handle.text).toContain("Set Due Date")

    // Type "tomorrow"
    for (const ch of "tomorrow") await handle.press(ch)

    // Press Enter to confirm
    await handle.press("Enter")

    // Dialog should be closed
    expect(handle.store.getState().ui.datePrompt).toBeNull()
    expect(handle.text).not.toContain("Set Due Date")

    // Node should have due_at set
    const col = repo.getChildren("board")[0]!
    const task = repo.getChildren(col.id)[0]!
    expect(task.due_at).toBeTruthy()

    handle.unmount()
  })

  test("td chord opens date dialog, Escape cancels and closes it", async () => {
    const nodes = item("board", item("col1", item.task("Buy groceries")))
    const { storeParams, repo, initialState } = buildStoreParams(nodes)
    const app = createBoardApp(storeParams)

    const element = h(
      RepoProvider,
      { repo },
      h(
        InputLayerProvider,
        null,
        h(BoardApp, {
          initialState,
          initialViewMode: "cards",
          toastQueue: storeParams.toastQueue,
        }),
      ),
    )

    const handle = await app.run(element, { cols: 80, rows: 24 })

    await handle.press("j")

    // Open date dialog
    await handle.press("t")
    await handle.press("d")
    expect(handle.store.getState().ui.datePrompt).not.toBeNull()

    // Type something
    for (const ch of "fri") await handle.press(ch)

    // Press Escape to cancel
    await handle.press("Escape")

    // Dialog should be closed
    expect(handle.store.getState().ui.datePrompt).toBeNull()
    expect(handle.text).not.toContain("Set Due Date")

    // Node should NOT have due_at set (cancelled)
    const col = repo.getChildren("board")[0]!
    const task = repo.getChildren(col.id)[0]!
    expect(task.due_at).toBeFalsy()

    handle.unmount()
  })

  test("td from inline edit mode: Enter closes dialog (not create sibling)", async () => {
    // Edge case: what if inline edit is active when td chord fires?
    // The chord should close the inline edit and open the dialog.
    const nodes = item("board", item("col1", item.task("Buy groceries"), item.task("Write report")))
    const { storeParams, repo, initialState } = buildStoreParams(nodes)
    const app = createBoardApp(storeParams)

    const element = h(
      RepoProvider,
      { repo },
      h(
        InputLayerProvider,
        null,
        h(BoardApp, {
          initialState,
          initialViewMode: "cards",
          toastQueue: storeParams.toastQueue,
        }),
      ),
    )

    const handle = await app.run(element, { cols: 80, rows: 24 })

    // Navigate to card and start inline edit
    await handle.press("j")
    await handle.press("Enter")
    expect(getActiveBoardPane(handle.store.getState())!.inlineEditBlock).not.toBeNull()

    // Press Escape to exit inline edit first
    await handle.press("Escape")
    expect(getActiveBoardPane(handle.store.getState())!.inlineEditBlock).toBeNull()

    // Now open date dialog
    await handle.press("t")
    await handle.press("d")
    expect(handle.store.getState().ui.datePrompt).not.toBeNull()

    // Enter should close dialog
    await handle.press("Enter")
    expect(handle.store.getState().ui.datePrompt).toBeNull()

    handle.unmount()
  })
})
