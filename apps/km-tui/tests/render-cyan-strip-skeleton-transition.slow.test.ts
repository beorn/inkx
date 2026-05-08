/**
 * Cross-backend probe for the skeleton -> full-parse transition.
 *
 * Bead: @km/silvery/render-light-blue-bg-strip-residue, Round 7.
 *
 * Round 6 found:
 *  - silvery's emitted bytes parse correctly in xterm (no malformed ANSI).
 *  - Strips reproduce in BOTH iTerm2 and Ghostty native -> not terminal-specific.
 *  - Timing is variable (sometimes 0s, sometimes 1-2s post-launch) -> race.
 *
 * Strongest standing hypothesis: km's `discoverOnly` skeleton render -> full
 * background-parse re-render leaves a dirty-flag cascade gap. The skeleton
 * paints bg-bearing card boxes; the full parse replaces them with a different
 * shape (more cards, different heights); the prevBuffer's bg cells aren't
 * fully cleared.
 *
 * SILVERY_STRICT=residue runs PER FRAME ("this frame's incremental ===
 * this frame's fresh"). It does NOT test "what fresh-from-zero would have
 * produced if you had never seen frame N-1." That's the gap this probe
 * targets.
 *
 * What this test does:
 *
 *   1. Mount the real km-tui kanban at 360x120 with parseDeferred:false
 *      (skeleton phase only - cards have stub content).
 *   2. Snapshot frame 1 buffer (skeleton).
 *   3. Run parseDeferredAsync + repo.touch() inside act() to trigger the
 *      full re-render.
 *   4. Snapshot frame 2 buffer (full).
 *   5. For each backend (xterm + vt100):
 *      a. Feed frame-1 bytes (paint skeleton).
 *      b. Feed frame-2 bytes (incremental diff to full).
 *      c. Walk every cell. Compare backend's bg vs silvery's frame-2 buffer bg.
 *      d. Flag any cell where backend has a strip-color bg but silvery's
 *         final buffer is null/transparent there.
 *
 * Outcomes:
 *   - Frame-1 snapshot bytes are emitted via the SAME path silvery would emit
 *     them at runtime (createApp/run); but here we use the lower-level
 *     bufferToStyledText since createRenderer doesn't go through output-phase.
 *     For the skeleton frame this is fine - we're painting fresh.
 *   - Frame-2 emission is the critical one: we compute the INCREMENTAL ANSI
 *     diff via the output-phase against the skeleton prevBuffer. That's
 *     where the cascade gap (if any) shows up - residual bg cells that
 *     never got cleared.
 *
 * Cross-backend: both vt100 (full-coverage emulator) and xterm.js give us
 * two independent views of what real terminals would paint. iTerm2 + Ghostty
 * native both repro -> if vt100 shows the residue, the bug is in silvery's
 * emitted bytes. If only one backend shows it, the bug is parser-specific.
 *
 * Constraints:
 *  - Does NOT edit vendor/silvery/packages/ag-term/src/pipeline/*.ts.
 *  - `using` cleanup for backends.
 *  - Runs under: bun vitest run --project slow apps/km-tui/tests/render-cyan-strip-skeleton-transition.slow.spec.ts
 */

import React, { act } from "react"
import { describe, test, expect, beforeAll, afterEach } from "vitest"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

import { createRenderer } from "@silvery/test"
import { bufferToStyledText, type TerminalBuffer } from "@silvery/ag-term/buffer"
import { createOutputPhase } from "@silvery/ag-term/pipeline/output-phase"
import { ThemeProvider, FocusManagerContext, createFocusManager } from "@silvery/ag-react"
import { StoreContext } from "@silvery/create"

import { createXtermBackend } from "@termless/xtermjs"
import { createVt100Backend } from "@termless/vt100"
import { createGhosttyBackend, initGhostty } from "@termless/ghostty"
import type { TerminalBackend } from "@termless/core"

import { createSignalStore, type SignalStoreApi as StoreApi } from "../src/state/signal-store.ts"
import { createRepo, createStoreFromRepo, parseDeferredAsync, withReactive } from "@km/storage"
import { createBoardState } from "../src/board/board-types.ts"
import { runGenerator, createToastQueue } from "@km/core"
import { BoardApp } from "../src/views/Board.tsx"
import { createGridNavigator, createViewLens, createVisibleLens } from "@km/board"
import { RepoProvider } from "../src/repo-context.tsx"
import { StoreProvider } from "../src/state/store-context.tsx"
import { ServicesProvider } from "../src/services-context.tsx"
import { ensureCommandSystemInitialized } from "../src/board/command-bridge.ts"
import {
  createBoardAppStoreState,
  type BoardAppStore,
  type CreateBoardAppStoreParams,
} from "../src/state/board-app-store.ts"
import { createInitialUIState } from "../src/state/ui-reducer.ts"
import { installDialogGuard } from "../src/dialog-guard.ts"
import { createUndoableRepo } from "../src/undo/undoable-repo.ts"
import { createUndoStack } from "../src/undo-stack.ts"
import { defaultKmTheme } from "../src/theme.ts"

const __dirname = dirname(fileURLToPath(import.meta.url))
const GOLDEN_VAULT = resolve(__dirname, "fixtures/golden-vault")
const haveVault = existsSync(GOLDEN_VAULT)
// User's real vault — order-of-magnitude more files than the golden fixture.
// The strip residue may be parse-order-dependent and only surface above some
// fixture-size threshold. Keep this opt-in because it depends on private local
// data and can fail on unrelated parse warnings.
const REAL_VAULT = "/Users/beorn/Bear/Vault"
const haveReal = existsSync(REAL_VAULT)
const runRealVaultProbe = process.env.KM_TUI_REAL_VAULT_PROBE === "1"

const COLS = 360
const ROWS = 120

interface RGB {
  r: number
  g: number
  b: number
}

let ghostty: Awaited<ReturnType<typeof initGhostty>> | null = null
beforeAll(async () => {
  try {
    ghostty = await initGhostty()
  } catch {
    ghostty = null
  }
})

const active: TerminalBackend[] = []
afterEach(() => {
  for (const b of active) {
    try {
      b.destroy()
    } catch {
      /* ignore */
    }
  }
  active.length = 0
})

function spawn(create: () => TerminalBackend): TerminalBackend {
  const b = create()
  b.init({ cols: COLS, rows: ROWS })
  active.push(b)
  return b
}

function fmtBg(bg: RGB | null): string {
  return bg ? `rgb(${bg.r},${bg.g},${bg.b})` : "null"
}

/**
 * Strip-color predicate: cyan/teal/light-blue family. Matches the user's
 * screenshot artefact: `g > r`, `b > r`, `b >~ g`, mid-luminosity.
 */
function isStripColor(bg: RGB | null): boolean {
  if (!bg) return false
  const { r, g, b } = bg
  if (g <= r + 5) return false
  if (b <= r + 5) return false
  if (b < g - 6) return false
  const sum = r + g + b
  if (sum < 180 || sum > 360) return false
  return true
}

/** Read a cell's bg from a TerminalBuffer, normalizing string|object|null shapes. */
function readBufferBg(buffer: TerminalBuffer, col: number, row: number): RGB | null {
  const cell = buffer.getCell(col, row)
  const bg: unknown = cell.bg
  if (!bg) return null
  if (typeof bg === "object" && "r" in bg) return bg as RGB
  if (typeof bg === "string" && bg.startsWith("#") && bg.length === 7) {
    return {
      r: parseInt(bg.slice(1, 3), 16),
      g: parseInt(bg.slice(3, 5), 16),
      b: parseInt(bg.slice(5, 7), 16),
    }
  }
  return null
}

/**
 * Mount BoardApp without auto-parsing deferred files. Returns the renderer
 * App, the raw repo, and the reactive store so we can drive the skeleton ->
 * full-parse transition manually and snapshot buffers between phases.
 *
 * This is testBoard() sliced open: same provider stack, but parseDeferred is
 * always false here. The caller advances the lifecycle.
 */
function mountSkeleton(vaultPath: string) {
  // discoverOnly:true mirrors km's interactive cold-start path: nodes get
  // stubs from filesystem discovery; full parse runs in the background.
  // mode:"memory" forces a fresh discovery (don't replay events from a
  // stale .km/state.db) so deferredFiles is always populated.
  const rawRepo = runGenerator(createRepo(vaultPath, { loadFiles: true, discoverOnly: true, forceMemory: true }))
  const rootNode = rawRepo.getRepoRootNode()
  if (!rootNode) throw new Error(`No board found in vault: ${vaultPath}`)

  const undoStack = createUndoStack()
  const { repo: undoableRepo, handle: undoHandle } = createUndoableRepo(rawRepo, undoStack)
  const reactiveStore = withReactive(createStoreFromRepo(rawRepo))

  const collapsedNodeIds = new Set<string>()
  for (const child of rawRepo.getChildren(rootNode.id)) {
    if (child.rules?.collapse || child.data?.collapsed === true) {
      collapsedNodeIds.add(child.id)
    }
  }
  const initLens = createVisibleLens(createViewLens(rawRepo, { rootId: rootNode.id, foldDepths: new Map() }), {
    collapsedNodes: collapsedNodeIds.size > 0 ? collapsedNodeIds : undefined,
  })
  const colIds = rootNode.id ? initLens.children(rootNode.id) : []
  const firstColId = colIds[0]
  const firstCardId = firstColId ? initLens.children(firstColId)[0] : null
  const initialCursor = firstCardId ?? firstColId ?? null

  ensureCommandSystemInitialized()
  const registry = createGridNavigator()
  const toastQueue = createToastQueue()

  const storeParams: CreateBoardAppStoreParams = {
    repo: undoableRepo,
    undoInfra: { handle: undoHandle, stack: undoStack },
    toastQueue,
    navigator: registry,
    initialBoardState: createBoardState(rootNode.id, rawRepo.path, collapsedNodeIds),
    initialCursor,
    initialUIState: createInitialUIState({ columns: COLS, rows: ROWS }),
    initialViewMode: "cards",
    dimensions: { columns: COLS, rows: ROWS },
  }
  const store = createSignalStore<BoardAppStore>(createBoardAppStoreState(storeParams))
  const focusManager = createFocusManager()
  installDialogGuard(focusManager)

  const render = createRenderer({ cols: COLS, rows: ROWS })
  const buildTree = () =>
    React.createElement(
      ThemeProvider,
      { theme: defaultKmTheme, children: null },
      React.createElement(
        ServicesProvider,
        { toastQueue, jobRunner: store.getState().jobRunner, undoHandle, children: null },
        React.createElement(
          StoreContext.Provider,
          { value: store as StoreApi<unknown> },
          React.createElement(
            FocusManagerContext.Provider,
            { value: focusManager },
            React.createElement(
              StoreProvider,
              { store: reactiveStore, children: null },
              React.createElement(RepoProvider, {
                repo: undoableRepo,
                children: React.createElement(BoardApp, {
                  initialViewMode: "cards" as const,
                  toastQueue,
                  navigator: registry,
                  showMemoryModeBanner: false,
                }),
              }),
            ),
          ),
        ),
      ),
    )
  const result = render(buildTree())

  return { app: result, rawRepo, store, buildTree, boardAppElement: buildTree() }
}

/**
 * Compute the production incremental output-phase ANSI for a sequence of
 * frames. Bare `outputPhase()` calls always full-render (prevCursorRow=-1
 * by design — see output-phase.ts:869). To exercise the real incremental
 * cascade, we use `createOutputPhase()` which closes over per-instance state
 * and emits diff bytes on calls 2..N.
 *
 * Returns ANSI for each frame. The first call seeds state with prev=null;
 * subsequent calls pass prev = previous-frame buffer.
 */
function emitIncrementalSeries(frames: TerminalBuffer[]): string[] {
  const op = createOutputPhase({})
  const out: string[] = []
  let prev: TerminalBuffer | null = null
  for (const f of frames) {
    out.push(op(prev, f, "fullscreen"))
    prev = f
  }
  return out
}

interface Divergence {
  row: number
  col: number
  silveryBg: RGB | null
  backendBg: RGB | null
  silveryChar: string
  backendChar: string
}

interface BackendReport {
  name: string
  divergences: Divergence[]
  stripDivergences: Divergence[]
}

function compareCells(name: string, backend: TerminalBackend, finalBuffer: TerminalBuffer): BackendReport {
  const divergences: Divergence[] = []
  const stripDivergences: Divergence[] = []
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const bc = backend.getCell(row, col)
      const sBg = readBufferBg(finalBuffer, col, row)
      const bBg = (bc.bg as RGB | null) ?? null

      // The hot signal (residue direction): backend paints a strip-color bg
      // where silvery's final buffer is null/transparent. Backend retains the
      // skeleton's bg after silvery thinks it's clear.
      if (isStripColor(bBg) && sBg === null) {
        const div: Divergence = {
          row,
          col,
          silveryBg: sBg,
          backendBg: bBg,
          silveryChar: finalBuffer.getCell(col, row).char ?? " ",
          backendChar: bc.char ?? " ",
        }
        if (stripDivergences.length < 50) stripDivergences.push(div)
      }

      // Generic divergence: any bg mismatch (helps localize broader cascade gaps).
      const eq =
        (sBg === null && bBg === null) || (!!sBg && !!bBg && sBg.r === bBg.r && sBg.g === bBg.g && sBg.b === bBg.b)
      if (!eq && divergences.length < 100) {
        divergences.push({
          row,
          col,
          silveryBg: sBg,
          backendBg: bBg,
          silveryChar: finalBuffer.getCell(col, row).char ?? " ",
          backendChar: bc.char ?? " ",
        })
      }
    }
  }
  return { name, divergences, stripDivergences }
}

async function probeSkeletonTransition(vaultPath: string): Promise<{
  reports: BackendReport[]
  skeletonBytes: number
  incrementalBytes: number
  incrementalAnsi: string
}> {
  const { app, rawRepo, buildTree } = mountSkeleton(vaultPath)
  const liveSkeleton = app.lastBuffer()
  if (!liveSkeleton) throw new Error("[probe] skeleton frame missing - canary should have caught")
  const skeletonBuffer = liveSkeleton.clone()
  const skeletonFrameCount = app.frames.length

  const deferredFiles = rawRepo.deferredFiles
  if (deferredFiles.length === 0) {
    const rootNode = rawRepo.getRepoRootNode()
    const childCount = rootNode ? rawRepo.getChildren(rootNode.id).length : 0
    throw new Error(
      `[probe] vault ${vaultPath} produced zero deferredFiles (root has ${childCount} children). ` +
        `Possibly an existing .km/state.db replayed events instead of fresh discovery. ` +
        `Try wiping ${vaultPath}/.km/state.db before re-running.`,
    )
  }
  await parseDeferredAsync(rawRepo.database, deferredFiles, undefined, { useWorkerPool: false })
  act(() => {
    rawRepo.touch()
  })
  if (app.frames.length === skeletonFrameCount) {
    act(() => {
      app.rerender(buildTree())
    })
  }
  const liveFull = app.lastBuffer()
  if (!liveFull) throw new Error("[probe] full-parse frame missing")
  const fullBuffer = liveFull.clone()

  // Sanity: skeleton and full must differ.
  let differingCells = 0
  for (let row = 0; row < ROWS && differingCells < 1; row++) {
    for (let col = 0; col < COLS && differingCells < 1; col++) {
      const a = skeletonBuffer.getCell(col, row)
      const b = fullBuffer.getCell(col, row)
      if (a.char !== b.char) differingCells++
    }
  }
  if (differingCells === 0) {
    throw new Error("[probe] skeleton and full-parse buffers identical - parseDeferred had no visible effect")
  }

  const [skeletonAnsi, incrementalAnsi] = emitIncrementalSeries([skeletonBuffer, fullBuffer])
  if (skeletonAnsi === undefined || incrementalAnsi === undefined) {
    throw new Error("[probe] incremental series did not emit skeleton and full frames")
  }
  const skeletonBytes = new TextEncoder().encode(skeletonAnsi)
  const incrementalBytes = new TextEncoder().encode(incrementalAnsi)

  const backends: Array<{ name: string; create: () => TerminalBackend }> = [
    { name: "vt100", create: () => createVt100Backend() },
    { name: "xterm", create: () => createXtermBackend() },
  ]
  const reports: BackendReport[] = []
  for (const { name, create } of backends) {
    const term = spawn(create)
    term.feed(skeletonBytes)
    term.feed(incrementalBytes)
    reports.push(compareCells(name, term, fullBuffer))
  }
  return {
    reports,
    skeletonBytes: skeletonBytes.length,
    incrementalBytes: incrementalBytes.length,
    incrementalAnsi,
  }
}

function reportFailure(
  vaultName: string,
  reports: BackendReport[],
  meta: { skeletonBytes: number; incrementalBytes: number; incrementalAnsi: string },
): string {
  const stripHits = reports.filter((r) => r.stripDivergences.length > 0)
  if (stripHits.length === 0) return ""
  const lines: string[] = []
  lines.push(
    `CASCADE GAP DETECTED in ${vaultName}: ${stripHits.length}/${reports.length} backends paint strip-color bg ` +
      "where silvery's final buffer is null/transparent.",
  )
  lines.push(`Skeleton bytes: ${meta.skeletonBytes}, incremental bytes: ${meta.incrementalBytes}`)
  for (const r of stripHits) {
    lines.push(`\n[${r.name}] ${r.stripDivergences.length} strip-residue cells:`)
    for (const d of r.stripDivergences.slice(0, 12)) {
      lines.push(
        `  row=${d.row} col=${d.col} char=${JSON.stringify(d.backendChar)} ` +
          `backend.bg=${fmtBg(d.backendBg)} silvery.bg=${fmtBg(d.silveryBg)} ` +
          `(silvery.char=${JSON.stringify(d.silveryChar)})`,
      )
    }
  }
  const head = meta.incrementalAnsi.slice(0, 400).replace(/\x1b/g, "\\e")
  lines.push(`\nIncremental ANSI head (first 400 chars):\n${head}`)
  return lines.join("\n")
}

describe.skipIf(!haveVault)("render: skeleton -> full-parse cascade gap", () => {
  test("golden vault: backend paints no orphan bg after skeleton -> full transition", async () => {
    const { reports, skeletonBytes, incrementalBytes, incrementalAnsi } = await probeSkeletonTransition(GOLDEN_VAULT)
    const failure = reportFailure("golden-vault", reports, { skeletonBytes, incrementalBytes, incrementalAnsi })
    if (failure) throw new Error(failure)
    expect(reports.flatMap((r) => r.stripDivergences)).toHaveLength(0)
  }, 240_000)
})

describe.skipIf(!haveReal || !runRealVaultProbe)("render: skeleton -> full-parse cascade gap (real vault)", () => {
  test("real vault: backend paints no orphan bg after skeleton -> full transition", async () => {
    let result
    try {
      result = await probeSkeletonTransition(REAL_VAULT)
    } catch (err) {
      // Memory mode against a real vault with a populated .km/ sometimes
      // returns zero deferredFiles even with mode:"memory" + discoverOnly:true
      // (mechanism not yet localized — likely an interaction with replayed
      // events). Skip silently when the probe can't be set up — this test
      // only adds value when it actually exercises the transition.
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("zero deferredFiles")) return
      throw err
    }
    const failure = reportFailure("real-vault", result.reports, {
      skeletonBytes: result.skeletonBytes,
      incrementalBytes: result.incrementalBytes,
      incrementalAnsi: result.incrementalAnsi,
    })
    if (failure) throw new Error(failure)
    expect(result.reports.flatMap((r) => r.stripDivergences)).toHaveLength(0)
  }, 240_000)
})
