/**
 * Board Types — VIEW MODEL (not data model)
 *
 * These types describe how nodes are presented in the TUI, not how they're stored.
 * The data model is KNode (from @km/core) — a single tree of nodes.
 *
 * The canonical view model is the tree lens (`@km/board`). React view components
 * self-resolve their data via `useNode(id)` + `useSignal(ps.visibleLens)`.
 * The live pipeline: Repo → ViewLens → VisibleLens → ViewTreeProjection → useNode(id).
 */

import type { Repo } from "./repo-context.tsx"

/**
 * View mode for the TUI
 * - cards: Kanban-style cards in columns (default)
 * - list: Full-width hierarchical list view (all columns stacked)
 * - columns: Tree/outline view within each column
 * - tabs: Tab-based view (one column at a time with tab bar)
 */
export type ViewMode = "cards" | "list" | "columns" | "tabs" | "detail"

export interface RenderOptions {
  width: number
  height: number
  useColor: boolean
}

/**
 * Options for running the TUI
 */
// =============================================================================
// Global diagnostic hooks
// =============================================================================

/**
 * Typed globalThis extensions for cross-boundary diagnostics.
 *
 * silvery sets: __silvery_last_pipeline, __silvery_render_count
 * km diagnostics (lastKey, terminalFocused) are in ./diagnostics.ts
 */
declare global {
  // eslint-disable-next-line no-var -- must be `var` for `declare global`
  var __silvery_last_pipeline:
    | { measure: number; layout: number; content: number; output: number; total: number }
    | undefined
  // eslint-disable-next-line no-var
  var __silvery_render_count: number | undefined
}

// =============================================================================
// TUI Options
// =============================================================================

export interface TuiOptions {
  /**
   * Run in interactive mode (default: true).
   * When false, renders static output and exits.
   */
  interactive?: boolean
  initialViewMode?: ViewMode
  /**
   * Enable file watching for live sync (default: true).
   * Set to false to disable watching - faster startup on large repos.
   * Can also be set via config (tui.watch).
   */
  watch?: boolean
  /**
   * Use worker thread for file watching (default: true).
   * Worker-based watching doesn't block the main thread during initialization.
   * Can also be set via config (tui.watchWorker).
   */
  watchWorker?: boolean
  /**
   * Loading spinner to stop when TUI is ready to render.
   * Passed from CLI to keep spinner running through board initialization.
   */
  spinner?: { stop(): void }
  /**
   * Repo domain object for storage operations.
   * When provided, TUI uses this instead of global getStore().
   */
  repo?: Repo
  /**
   * Called after alternate screen is active and patchConsole is set up.
   * CLI uses this to flush buffered debug output to Console component.
   */
  onReady?: () => void
  /**
   * Pre-created PatchedConsole instance.
   * When provided, runBoard uses this instead of creating its own.
   * Set up early (before loadRepo) to capture startup warnings.
   */
  patchedConsole?: import("@silvery/ag-react").PatchedConsole
  /**
   * Performance.now() timestamp of CLI invocation.
   * Used to log total startup time from CLI to first render.
   */
  startTime?: number
}
