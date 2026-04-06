/**
 * PaneSignals — Per-pane reactive state backed by alien-signals.
 *
 * Each pane gets its own signal bag. The `viewLens` computed derives the
 * TreeLens from (repo, rootId, foldDepths, hiddenNodeIds) — single build, auto-cached.
 *
 * This replaces:
 * - useAppStore selectors for nav state (rootId, foldDepths, collapsedNodes)
 * - Layout cache in buildOpCtx (computed() handles caching)
 * - Selection adapter auto-refresh (computed walkOrder is always fresh)
 *
 * React components subscribe via useSignal():
 * ```tsx
 * const pane = usePaneSignals()
 * const rootId = useSignal(pane.rootId)
 * const lens = useSignal(pane.visibleLens)
 * const cursor = useSignal(pane.sel.node.cursor)
 * ```
 */

import { signal, computed } from "alien-signals"
import type { SelectionStore } from "@silvery/selection"
import type { ViewLensRepo, TreeLens, ViewTreeProjection } from "@km/board"
import { createViewLens, createVisibleLens, createViewTree } from "@km/board"
import type { SelectionTreeSource } from "./selection-adapter.ts"
import type { MoveState, ViewMode } from "../board/board-types.ts"
import { computeHiddenNodeIds } from "../hidden.ts"

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

  // Hidden state — nodes excluded from the view lens
  readonly hiddenNodeIds: Signal<Set<string>>

  // Filter state — task status filter (set of statuses to SHOW; empty = show all)
  readonly taskStatusFilter: Signal<ReadonlySet<string>>

  // Tree Lenses — zero-object navigation interfaces
  /** View lens: structural visibility (fold + hidden + body + symlink + roles) */
  readonly viewLens: Computed<TreeLens>
  /** Visible lens: view lens + collapse + filter (what the user sees) */
  readonly visibleLens: Computed<TreeLens>

  // ViewTree — per-node projection with navigation
  /** The projected ViewTree. Synced from visibleLens. Used by useNode(id). */
  readonly viewTree: ViewTreeProjection
}

// =============================================================================
// Factory
// =============================================================================

export interface CreatePaneSignalsOptions {
  id: string
  sel: SelectionStore
  selTreeSource: SelectionTreeSource
  /** The repo — used by the computed view lens and hidden node computation. */
  repo: ViewLensRepo & { path: string }
  /** alien-signals signal tracking repo version — bumped by bridge on repo.subscribe(). */
  repoVersion: Signal<number>
  rootId: string | null
  rootPath: string | null
  foldDepths: Map<string, number>
  collapsedNodes: Set<string>
  viewMode: ViewMode
  moveState: MoveState
  /** Initial hidden node IDs (from .km/hidden file). Excluded from the view lens. */
  hiddenNodeIds?: Set<string>
  /** Initial task status filter (set of statuses to SHOW; empty = show all). */
  taskStatusFilter?: ReadonlySet<string>
}

/**
 * Create a PaneSignals bag for a board pane.
 *
 * The `viewLens` computed chains: repoVersion → rootId → foldDepths → createViewLens.
 * Any input change invalidates the computed; next read rebuilds the lens.
 * The lens is lazy and caches per-node children on demand.
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
  const hiddenNodeIds = signal(opts.hiddenNodeIds ?? new Set<string>())
  const taskStatusFilter = signal<ReadonlySet<string>>(opts.taskStatusFilter ?? new Set<string>())

  // Tree Lens computeds — zero-object navigation over the same KNodes
  const viewLensComputed = computed((): TreeLens => {
    opts.repoVersion()
    const _rootId = rootId()
    const _foldDepths = foldDepths()
    const _hiddenOverride = hiddenNodeIds()
    const _hidden = _hiddenOverride.size > 0 ? _hiddenOverride : computeHiddenNodeIds(opts.repo as any, _rootId)
    return createViewLens(opts.repo, {
      rootId: _rootId,
      foldDepths: _foldDepths,
      hiddenNodeIds: _hidden.size > 0 ? _hidden : undefined,
    })
  })

  const visibleLensComputed = computed((): TreeLens => {
    const vl = viewLensComputed()
    const _collapsed = collapsedNodes()
    const _taskStatusFilter = taskStatusFilter()
    return createVisibleLens(vl, {
      collapsedNodes: _collapsed.size > 0 ? _collapsed : undefined,
      taskStatusFilter: _taskStatusFilter.size > 0 ? _taskStatusFilter : undefined,
    })
  })

  // ViewTree: per-node projection synced from visibleLens.
  // The ViewTree is a persistent object — only its internal signals update.
  const viewTreeInstance = createViewTree()
  // Initial sync
  const initialLens = visibleLensComputed()
  viewTreeInstance.sync(initialLens)

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
    hiddenNodeIds,
    taskStatusFilter,
    viewLens: viewLensComputed,
    visibleLens: visibleLensComputed,
    viewTree: viewTreeInstance,
  }
}
