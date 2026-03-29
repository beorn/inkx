/**
 * Board Types — VIEW MODEL (not data model)
 *
 * These types describe how nodes are presented in the TUI, not how they're stored.
 * The data model is KNode (from @km/core) — a single tree of nodes.
 *
 * ColumnView wraps a column KNode with its pre-fetched CardView cards.
 * CardView extends KNode with pre-resolved embed data, body classification, etc.
 */

import type { KNode } from "@km/core"
import type { SectionRules } from "@km/markdown"
import type { Repo } from "./repo-context.tsx"

/**
 * Initial board data returned by buildBoardState/initBoardState.
 * Contains the minimum data needed to initialize the TUI.
 */
export interface InitialBoardData {
  rootId: string | null
  rootPath: string | null
  columns: ColumnView[]
  collapsedColumns: Set<number>
  collapsedNodeIds: Set<string>
}

/**
 * VIEW MODEL: A card is a KNode enriched with pre-resolved display data.
 * Extends KNode via structural typing — all 50+ consumers that read card.id,
 * card.content, etc. work unchanged.
 */
export interface CardView extends KNode {
  /** Discriminator — distinguishes CardView from plain KNode at runtime */
  readonly __cardView: true
  /** Pre-resolved embed target (undefined = not an embed) */
  resolvedNode?: KNode
  /** True if this is a body block (before first outline item in parent) */
  isBody: boolean
  /** True if embed_source points to a missing node */
  isBrokenEmbed: boolean
  /** True if this card has body children (for ··· indicator) */
  hasBodyChildren: boolean
}

/** Runtime type guard for CardView (checks discriminator, not property sniffing) */
export function isCardView(node: KNode): node is CardView {
  return "__cardView" in node
}

/**
 * VIEW MODEL: A column is a parent KNode whose children render as CardView[].
 */
export interface ColumnView {
  node: KNode
  cardNodes: CardView[]
  wipLimit?: number
  rules?: SectionRules
  /** True for virtual body column (displays leading non-section content) */
  isVirtual?: boolean
  /** Total card count before filtering (undefined = no filter active) */
  totalCardCount?: number
  /** Count of descendant nodes hidden by filters within cards (e.g., done children) */
  hiddenDescendantCount?: number
}

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
