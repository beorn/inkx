/**
 * PaneSignals — Per-pane reactive state backed by alien-signals.
 *
 * Each pane gets its own signal bag. The `view` computed derives the
 * ViewSnapshot from (repo, rootId, foldDepths) — single build, auto-cached.
 *
 * This replaces:
 * - useAppStore selectors for nav state (rootId, foldDepths, collapsedNodes)
 * - Layout cache in buildOpCtx (computed() handles caching)
 * - Selection adapter auto-refresh (computed walkOrder is always fresh)
 * - 14 separate buildViewTree call sites → 1 computed
 *
 * React components subscribe via useSignal():
 * ```tsx
 * const pane = usePaneSignals()
 * const rootId = useSignal(pane.rootId)
 * const view = useSignal(pane.view)
 * const cursor = useSignal(pane.sel.node.cursor)
 * ```
 */

import { signal, computed } from "alien-signals"
import type { SelectionStore } from "@silvery/selection"
import type { ViewSnapshot, ViewTreeRepo, ViewNodeColumnCache } from "@km/board"
import { createViewSnapshot } from "@km/board"
import type { SelectionTreeSource } from "./selection-adapter.ts"
import type { MoveState, ViewMode } from "../board/board-types.ts"

/** Writable alien-signal — call with no args to read, with arg to write. */
type Signal<T> = ReturnType<typeof signal<T>>

/** Read-only computed signal. */
type Computed<T> = ReturnType<typeof computed<T>>

// =============================================================================
// PaneSignals
// =============================================================================

export interface PaneSignals {
  readonly id: string

  // Selection (already alien-signals internally)
  readonly sel: SelectionStore
  readonly selTreeSource: SelectionTreeSource

  // Navigation state (writable signals)
  readonly rootId: Signal<string | null>
  readonly rootPath: Signal<string | null>
  readonly foldDepths: Signal<Map<string, number>>
  readonly collapsedNodes: Signal<Set<string>>

  // View config
  readonly viewMode: Signal<ViewMode>

  // Move state
  readonly moveState: Signal<MoveState>
  readonly curswantX: Signal<number | null>
  readonly curswantY: Signal<number | null>

  // Derived: computed ViewSnapshot — auto-invalidates when rootId/foldDepths/repo change
  readonly view: Computed<ViewSnapshot>
}

// =============================================================================
// Factory
// =============================================================================

export interface CreatePaneSignalsOptions {
  id: string
  sel: SelectionStore
  selTreeSource: SelectionTreeSource
  repo: ViewTreeRepo & { getSnapshot(): number }
  rootId: string | null
  rootPath: string | null
  foldDepths: Map<string, number>
  collapsedNodes: Set<string>
  viewMode: ViewMode
  moveState: MoveState
}

/**
 * Create a PaneSignals bag for a board pane.
 *
 * The `view` computed chains: repo.getSnapshot() → rootId → foldDepths → createViewSnapshot.
 * Any input change invalidates the computed; next read rebuilds the ViewSnapshot.
 * The ViewNodeColumnCache enables incremental column-level rebuilds.
 */
export function createPaneSignals(opts: CreatePaneSignalsOptions): PaneSignals {
  const rootId = signal(opts.rootId)
  const rootPath = signal(opts.rootPath)
  const foldDepths = signal(opts.foldDepths)
  const collapsedNodes = signal(opts.collapsedNodes)
  const viewMode = signal(opts.viewMode)
  const moveState = signal(opts.moveState)
  const curswantX = signal<number | null>(null)
  const curswantY = signal<number | null>(null)

  // Per-column ViewNode cache — reused across rebuilds for incremental updates
  const viewNodeCache: ViewNodeColumnCache = new Map()

  // Computed ViewSnapshot — the core derivation
  const view = computed((): ViewSnapshot => {
    // Track dependencies: repo version + rootId + foldDepths
    const _version = opts.repo.getSnapshot()
    const _rootId = rootId()
    const _foldDepths = foldDepths()
    void _version // ensure dependency tracking

    return createViewSnapshot(opts.repo, _rootId, _foldDepths, viewNodeCache)
  })

  return {
    id: opts.id,
    sel: opts.sel,
    selTreeSource: opts.selTreeSource,
    rootId,
    rootPath,
    foldDepths,
    collapsedNodes,
    viewMode,
    moveState,
    curswantX,
    curswantY,
    view,
  }
}
