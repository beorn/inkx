/**
 * Profile km view startup phases against real vault.
 * Run: cd /Users/beorn/Code/pim/km ; bun apps/km-tui/tests/profile-startup.ts
 */
import { createRepo } from "@km/storage"
import { deriveColumnsFromRepo, buildNodeIndex } from "../src/hooks/use-columns.ts"
import { createBoardState } from "../src/board/board-types.ts"
import { createBoardApp } from "../src/board/board-app.ts"
import { createGridNavigator } from "@km/board"
import { createInitialUIState } from "../src/state/ui-reducer.ts"
import { createToastQueue } from "@km/core"
import { getActiveBoardPane, type CreateBoardAppStoreParams } from "../src/state/board-app-store.ts"
import { dispatchSelection, nodeSelect } from "../src/state/selection.ts"
import React from "react"
import { createTerm } from "@silvery/ag-react"
import { RepoProvider } from "../src/repo-context.tsx"
import { BoardApp } from "../src/views/index.ts"
import { InputLayerProvider } from "@silvery/ag-react"

const repoPath = process.env.VAULT ?? "/Users/beorn/Code/pim/km/imports/asana"

const out = (msg: string) => process.stderr.write(msg + "\n")

function timer(label: string) {
  const start = performance.now()
  return {
    end() {
      const ms = (performance.now() - start).toFixed(1)
      out(`  ${label}: ${ms}ms`)
      return parseFloat(ms)
    },
  }
}

async function profile() {
  out("=== km view startup profile ===\n")

  // Phase 1: Load repo (with full file loading)
  const t1 = timer("Load repo")
  const gen = createRepo(repoPath, { loadFiles: true, discoverOnly: false })
  let next = gen.next()
  while (!next.done) next = gen.next()
  const repo = next.value
  t1.end()

  // Find root
  const rootNode = repo.resolveNode("stabell")
  const rootId = rootNode?.id
  if (!rootId) {
    console.error("Could not find 'stabell' node")
    process.exit(1)
  }

  const totalNodes = repo.database.prepare("SELECT COUNT(*) as cnt FROM nodes").get() as { cnt: number }
  out(`  Total nodes: ${totalNodes.cnt}`)
  out(`  Root: ${rootNode?.title || rootNode?.name} (${rootId})`)

  // Phase 2: createBoardState (board-types.ts)
  // (Legacy buildBoardState removed — live code uses the tree-lens pipeline.)
  const t2 = timer("createBoardState")
  const boardState = createBoardState(rootId, null, new Set<string>())
  t2.end()

  // Phase 3: deriveColumnsFromRepo (initial sync — what useState initializer calls)
  const foldDepths = new Map<string, number>([[rootId, 1]])
  const t3 = timer("deriveColumnsFromRepo (sync initial)")
  const columns = deriveColumnsFromRepo(repo, rootId, foldDepths)
  t3.end()
  out(`  Columns: ${columns.length}, total cards: ${columns.reduce((s, c) => s + c.cardNodes.length, 0)}`)
  for (const col of columns) {
    const name = col.node.title || col.node.name || "(body)"
    out(`    ${name.slice(0, 40)}: ${col.cardNodes.length} cards`)
  }

  // Phase 5: buildNodeIndex
  const t5 = timer("buildNodeIndex (lazy)")
  const nodeIndex = buildNodeIndex(columns)
  t5.end()
  out(`  Entries: ${nodeIndex.size}`)

  // Phase 6: React render (measure just createElement tree)
  out("\n--- React render measurement ---")
  const t6 = timer("createBoardApp (store init)")
  const initialCursorNodeId = columns[0]?.cardNodes[0]?.id ?? null
  using toastQueue = createToastQueue()
  const storeParams: CreateBoardAppStoreParams = {
    repo,
    toastQueue,
    navigator: createGridNavigator(),
    initialBoardState: boardState,
    initialUIState: createInitialUIState({ columns: 200, rows: 70 }),
    initialViewMode: "cards",
    dimensions: { columns: 200, rows: 70 },
    savedWorkspace: null,
  }
  const boardApp = createBoardApp(storeParams)
  t6.end()

  // Phase 7: Actually mount and measure first render
  // Write board output to /dev/null so it doesn't pollute profile output
  const { createWriteStream } = await import("fs")
  const devNull = createWriteStream("/dev/null")

  // Enable silvery instrumentation
  ;(globalThis as any).SILVERY_INSTRUMENT = true

  const t7 = timer("boardApp.run() — React mount + first render + layout + output")
  const handle = await boardApp.run(
    React.createElement(RepoProvider, {
      repo,
      children: React.createElement(InputLayerProvider, { children: React.createElement(BoardApp, { toastQueue }) }),
    }),
    { cols: 200, rows: 70, stdout: devNull as unknown as NodeJS.WriteStream },
  )
  t7.end()

  // Read silvery timing data
  const pipeline = (globalThis as any).__silvery_last_pipeline
  const timing = (globalThis as any).__silvery_last_timing
  const contentDetail = (globalThis as any).__silvery_content_detail
  const contentAll = (globalThis as any).__silvery_content_all

  if (pipeline) {
    out("\n--- silvery pipeline breakdown ---")
    for (const [key, val] of Object.entries(pipeline)) {
      out(`  ${key}: ${typeof val === "number" ? (val as number).toFixed(1) + "ms" : val}`)
    }
  } else {
    out("\n  (no pipeline timing data — __silvery_last_pipeline not set)")
  }

  if (timing) {
    out("\n--- silvery renderer timing ---")
    for (const [key, val] of Object.entries(timing)) {
      out(`  ${key}: ${typeof val === "number" ? (val as number).toFixed(1) + "ms" : val}`)
    }
  }

  if (contentDetail) {
    out("\n--- silvery content detail ---")
    for (const [key, val] of Object.entries(contentDetail)) {
      out(`  ${key}: ${typeof val === "number" ? (val as number).toFixed(1) + (key.startsWith("_") ? "" : "ms") : val}`)
    }
  }

  if (contentAll) {
    out(`\n--- silvery all render passes: ${(contentAll as any[]).length} ---`)
    for (let i = 0; i < Math.min((contentAll as any[]).length, 5); i++) {
      const pass = (contentAll as any[])[i]
      out(`  Pass ${i}: ${JSON.stringify(pass)}`)
    }
  }

  // Phase 7b: Measure navigation re-render (virtual scrolling perf)
  out("\n--- Navigation re-render timing (200x70) ---")

  async function measureNav(label: string, action: () => void) {
    // Clear pipeline timing
    ;(globalThis as any).__silvery_last_pipeline = null
    const start = performance.now()
    action()
    // Wait for React to process and re-render (React batches within microtask)
    await new Promise<void>((r) => setTimeout(r, 16))
    const ms = (performance.now() - start).toFixed(1)
    const lastPipeline = (globalThis as any).__silvery_last_pipeline
    const pipelineTotal = lastPipeline?.total?.toFixed(1) ?? "no render"
    const layoutMs = lastPipeline?.layout?.toFixed(1) ?? "-"
    const contentMs = lastPipeline?.content?.toFixed(1) ?? "-"
    out(`  ${label}: ${ms}ms total (pipeline: ${pipelineTotal}ms, layout: ${layoutMs}ms, content: ${contentMs}ms)`)
    return parseFloat(ms)
  }

  const store = handle.store
  const getState = () => store.getState()

  /** Update the active board pane's cursor via sel store */
  function setPaneCursor(cursor: string) {
    const s = store.getState()
    const pane = getActiveBoardPane(s)!
    dispatchSelection({ sel: pane.sel }, nodeSelect(cursor))
  }

  /** Update the active board pane's foldDepths via store.setState */
  function setPaneFoldDepths(foldDepths: Map<string, number>) {
    const s = store.getState()
    const pane = getActiveBoardPane(s)!
    store.setState((prev) => ({
      workspace: {
        ...prev.workspace,
        panes: new Map(prev.workspace.panes).set(pane.id, { ...pane, foldDepths }),
      },
    }))
  }

  // j/k navigation (cursor move within column)
  const colNodes = getState().repo.getChildren(rootId)
  const firstCol = colNodes[0]
  const firstColCards = firstCol ? getState().repo.getChildren(firstCol.id) : []

  const navTimes: number[] = []
  for (let i = 0; i < Math.min(5, firstColCards.length); i++) {
    const targetCard = firstColCards[i]
    if (!targetCard) break
    navTimes.push(
      await measureNav(`j (down #${i + 1})`, () => {
        setPaneCursor(targetCard.id)
      }),
    )
  }

  // l navigation (move to next column)
  if (colNodes.length > 1) {
    const secondCol = colNodes[1]!
    const secondColCards = getState().repo.getChildren(secondCol.id)
    if (secondColCards.length > 0) {
      navTimes.push(
        await measureNav("l (right column)", () => {
          setPaneCursor(secondColCards[0]!.id)
        }),
      )
    }
  }

  // h navigation (move back to first column)
  if (firstColCards.length > 0) {
    navTimes.push(
      await measureNav("h (left column)", () => {
        setPaneCursor(firstColCards[0]!.id)
      }),
    )
  }

  const avgNav = navTimes.reduce((s, t) => s + t, 0) / navTimes.length
  out(`  Average: ${avgNav.toFixed(1)}ms`)

  // Measure fold/unfold on a card with many children
  const bigCol = [...columns].sort((a, b) => b.cardNodes.length - a.cardNodes.length)[0]!
  const unfoldTarget = bigCol.cardNodes[0]
  if (unfoldTarget) {
    out(`\n--- Fold/unfold timing (${(unfoldTarget.title || unfoldTarget.name || "card").slice(0, 30)}) ---`)
    const currentFolds = new Map(getActiveBoardPane(getState())!.foldDepths)
    // Unfold depth 1 → 2
    currentFolds.set(unfoldTarget.id, 2)
    await measureNav("Unfold (depth 1→2)", () => {
      setPaneFoldDepths(currentFolds)
    })
    // Unfold depth 2 → 3
    const deeperFolds = new Map(currentFolds)
    deeperFolds.set(unfoldTarget.id, 3)
    await measureNav("Unfold (depth 2→3)", () => {
      setPaneFoldDepths(deeperFolds)
    })
    // Fold back to depth 1
    const foldBack = new Map(getActiveBoardPane(getState())!.foldDepths)
    foldBack.delete(unfoldTarget.id)
    await measureNav("Fold (depth 3→1)", () => {
      setPaneFoldDepths(foldBack)
    })
  }

  // Unmount
  handle.unmount()
  devNull.close()

  // Phase 8: Measure preloadSubtree (called in buildOpCtx on every keypress)
  out("\n--- preloadSubtree cost ---")
  // Clear cache to simulate cold start
  ;(repo as any)._childrenCache?.clear?.()
  const tp1 = timer("preloadSubtree(rootId, depth=2)")
  repo.preloadSubtree(rootId, 2)
  tp1.end()

  // Simulate what happens on zoom into a deep card
  const deepColumn = columns.sort((a: any, b: any) => b.cardNodes.length - a.cardNodes.length)[0]!
  const deepCard = deepColumn.cardNodes[0]
  if (deepCard) {
    // Clear cache to simulate zoom
    ;(repo as any)._childrenCache?.clear?.()
    const tp2 = timer(`preloadSubtree(${(deepCard.title || deepCard.name || "card").slice(0, 20)}, depth=4)`)
    repo.preloadSubtree(deepCard.id, 4)
    tp2.end()

    // Now measure with warm cache (what happens on 2nd action)
    const tp3 = timer("preloadSubtree(rootId, depth=2) [warm]")
    repo.preloadSubtree(rootId, 2)
    tp3.end()
  }

  // Phase 9: Measure zoom (what happens when user presses Enter on a deep card)
  out("\n--- Zoom simulation ---")
  // Pick the largest column and zoom into its first card
  const biggestCol = [...columns].sort((a, b) => b.cardNodes.length - a.cardNodes.length)[0]!
  const zoomTarget = biggestCol.cardNodes[0]
  if (zoomTarget) {
    out(`  Zooming into: ${(zoomTarget.title || zoomTarget.name || "").slice(0, 40)} (${zoomTarget.id.slice(0, 12)})`)

    // Measure getChildren for the zoom target
    const tz1 = timer("getChildren(zoomTarget)")
    const zoomChildren = repo.getChildren(zoomTarget.id)
    tz1.end()
    out(`  Children: ${zoomChildren.length}`)

    // Measure deriveColumnsFromRepo for zoom target
    const zoomFolds = new Map<string, number>([[zoomTarget.id, 1]])
    const tz2 = timer("deriveColumnsFromRepo(zoomTarget)")
    const zoomCols = deriveColumnsFromRepo(repo, zoomTarget.id, zoomFolds)
    tz2.end()
    out(`  Zoom columns: ${zoomCols.length}, total cards: ${zoomCols.reduce((s, c) => s + c.cardNodes.length, 0)}`)

    // Measure getChildCounts for zoom children
    if (zoomChildren.length > 0) {
      const tz3 = timer("getChildCounts(zoom children)")
      repo.getChildCounts(zoomChildren.map((c: { id: string }) => c.id))
      tz3.end()
    }

    // Do a deeper zoom — pick first child that has children
    const childWithKids = zoomChildren.find((c: { id: string }) => {
      const gc = repo.getChildren(c.id)
      return gc.length > 10
    })
    if (childWithKids) {
      out(`  Deep zoom: ${(childWithKids.title || childWithKids.name || "").slice(0, 40)}`)
      const tz4 = timer("deriveColumnsFromRepo(deep)")
      const deepFolds = new Map<string, number>([[childWithKids.id, 1]])
      const deepCols = deriveColumnsFromRepo(repo, childWithKids.id, deepFolds)
      tz4.end()
      out(`  Deep columns: ${deepCols.length}, cards: ${deepCols.reduce((s, c) => s + c.cardNodes.length, 0)}`)
    }
  }

  // Summary
  out("\n=== Timeline ===")
  out("After steps.run() completes, runBoard() does:")
  out("  1. withSync setup (skip in profile)")
  out("  2. createBoardApp() — store + state init")
  out("  3. boardApp.run() — React mount → first render")
  out("     This includes: useState initializer (deriveColumnsFromRepo),")
  out("     buildNodeIndex, React component tree, silvery layout + content + output")

  repo[Symbol.dispose]()
}

profile().catch(console.error)
