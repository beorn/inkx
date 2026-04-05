export type IconStyle = "nerdfont" | "workflowy" | "regular"
export type BorderMode = "normal" | "black"

/** A sync activity event for the sync pane log */
export interface SyncEvent {
  timestamp: number
  type: "sync-start" | "sync-complete" | "state-change" | "error" | "write-complete" | "write-error"
  message: string
}

/**
 * UI State Types and Factory
 *
 * Defines the UIState interface and createInitialUIState factory.
 * State updates are done via setUI() on the signal store.
 */

import type { ViewMode } from "../types.ts"
import type { WatcherStatus } from "@km/storage"
import type { PerPaneUIFields } from "../board/board-types.ts"

// =============================================================================
// UI State Type
// =============================================================================

/** Editing mode — derived from UIState, not stored separately */
export type EditMode = "node" | "text" | "dialog"

export interface UIState {
  // View configuration (global — shared across panes)
  iconStyle: IconStyle
  borderMode: BorderMode

  // Overlays/dialogs (global — single modal at a time)
  showHelp: boolean
  helpScrollOffset: number
  activePicker: { type: "project" | "tag" | "assignee" } | null
  showNewItemDialog: boolean
  showSearchDialog: boolean
  searchDialogInitialInput: string // Buffer for keypresses during dialog open transition
  /** Search scope: "all" = entire repo, "selected" = cursor node & descendants */
  searchScope: "all" | "selected"
  /** Node IDs that define the search scope when searchScope is "selected" */
  searchScopeNodeIds: string[]
  showConsole: boolean
  showSyncPane: boolean

  // File drop state (global)
  droppedFiles: string[]
  showDropNotification: boolean

  // Navigation history (global — to be unified with pane navHistory in future)
  navHistory: Array<{
    rootId: string | null
    colIndex: number
    cardIndex: number
    cursor: string | null
    foldDepths?: Map<string, number>
  }>
  navHistoryIndex: number

  // Recent projects for picker (global)
  recentProjectIds: string[]

  // Terminal state (global)
  terminalFocused: boolean
  dimensions: { columns: number; rows: number }

  // Loading state (global — repo-level)
  isLoading: boolean
  loadingStartTime: number | null
  /** True while background deferred-file parsing is in progress (discoverOnly mode). */
  backgroundParsing: boolean

  // Watcher status (global)
  watcherStatus: WatcherStatus | null

  // Sync activity log (global)
  syncEvents: SyncEvent[]

  // Date/recurrence prompt dialog (global modal)
  datePrompt: {
    field: "due_at" | "start_at" | "rrule"
    nodeIds: string[]
    currentValue: string
  } | null

  // Delete confirmation dialog (global modal)
  deleteConfirm: {
    nodeIds: string[] // Node IDs to delete (single or batch)
    title: string
    childCount: number
    backlinkCount: number
    hasMetadata?: boolean
  } | null

  // Clipboard state (global)
  clipboard: {
    nodeIds: string[] // Source node IDs (for resolving content at paste time)
    mode: "copy" | "cut"
  } | null

  // Bell state (global feedback)
  bellState: string | null

  // Status message (global feedback)
  status: {
    level: "info" | "success" | "warning" | "error"
    message: string
  } | null

  // Pending chord prefix (global input state)
  pendingChord: string | null
  /** True after the chord timeout fires (standalone executed) — hints go dim */
  chordTimedOut: boolean

  // Omnibox / command palette state (global)
  showOmnibox: boolean

  // Favorites dialog state (global)
  showFavoritesDialog: boolean
  favoritesSelectedKey: string | null
}

/**
 * Pane UI = global UIState + per-pane fields merged.
 * Action handlers receive this via ctx.ui so they can read both global and per-pane fields.
 * React selectors should read per-pane fields from the pane directly, not from UIState.
 */
export type PaneUI = UIState & PerPaneUIFields

// =============================================================================
// PaneUI Namespace — discoverable mode helpers
// =============================================================================

/**
 * Namespace for PaneUI mode queries.
 * Type `PaneUI.` to discover all helpers: editMode, isInDialog, isTextInputFocused, isBusy.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace PaneUI {
  /**
   * Get the current editing mode from UI state.
   * - "text": inline editing a node (sel.text() is set)
   * - "dialog": a dialog is open (search, new item, date prompt, etc.)
   * - "node": default navigation mode
   *
   * @param isTextEditing - whether text editing is active (from sel.text() !== null)
   */
  export function editMode(ui: PaneUI, isTextEditing?: boolean): EditMode {
    if (isTextEditing) return "text"
    if (isInDialog(ui)) return "dialog"
    return "node"
  }

  /** True when any dialog/modal overlay is active (search, picker, date prompt, etc.) */
  export function isInDialog(ui: PaneUI): boolean {
    return !!(
      ui.showSearchDialog ||
      ui.showNewItemDialog ||
      ui.activePicker ||
      ui.showFilterDialog ||
      ui.datePrompt ||
      ui.deleteConfirm ||
      ui.localSearch ||
      ui.showOmnibox ||
      ui.searchReplace ||
      ui.showFavoritesDialog
    )
  }

  /**
   * True when a text input has focus — either inline editing or a dialog input field.
   * Used by the keybinding system to suppress navigation keys during text entry.
   *
   * @param isTextEditing - whether text editing is active (from sel.text() !== null)
   */
  export function isTextInputFocused(ui: PaneUI, isTextEditing?: boolean): boolean {
    return !!isTextEditing || isDialogInput(ui)
  }

  /**
   * True when any dialog input field (not inline edit) has focus.
   * Subset of isInDialog — excludes deleteConfirm and localSearch in browse mode.
   */
  export function isDialogInput(ui: PaneUI): boolean {
    return !!(
      ui.showNewItemDialog ||
      ui.activePicker ||
      ui.showSearchDialog ||
      ui.datePrompt ||
      ui.showOmnibox ||
      ui.localSearch?.isInputActive ||
      ui.searchReplace
    )
  }

  /** True when the app is loading or syncing (watcher starting, background parsing, etc.) */
  export function isBusy(ui: PaneUI): boolean {
    return ui.isLoading || ui.backgroundParsing || !ui.watcherStatus || ui.watcherStatus.state === "starting"
  }
}

/** State for the search & replace dialog */
export interface SearchReplaceState {
  /** Current search query */
  searchQuery: string
  /** Current replace query */
  replaceQuery: string
  /** Whether to use regex matching */
  useRegex: boolean
  /** 0-based index of the currently focused match */
  matchIndex: number
  /** Total number of matches found */
  matchCount: number
  /** Node IDs that contain matches, in visual order */
  matchNodeIds: string[]
  /** Which input field has focus */
  focusedField: "search" | "replace"
}

/** State for the inline local find/search bar */
export interface LocalSearchState {
  /** Current search query */
  query: string
  /** True when the text input is active (typing phase) */
  isInputActive: boolean
  /** 0-based index of the currently focused match */
  matchIndex: number
  /** Total number of matches found */
  matchCount: number
  /** Node IDs that contain matches, in visual order */
  matchNodeIds: string[]
}

/** Structured filter state for property-based filtering */
export interface FilterProperties {
  taskStatus: Set<string> // "todo" | "wip" | "blocked" | "done" | "dropped"
  priority: Set<string> // "1" | "2" | "3" | "4"
  dueDate: Set<string> // "overdue" | "today" | "this-week" | "no-date"
  assignedTo: Set<string>
  nodeType: Set<string> // "h" | "p" | "code" | "quote" | "hr" | "embed" | "table"
}

export function createEmptyFilterProperties(): FilterProperties {
  return {
    taskStatus: new Set(),
    priority: new Set(),
    dueDate: new Set(),
    assignedTo: new Set(),
    nodeType: new Set(),
  }
}

/** Check if any property filters are active */
export function hasActivePropertyFilters(props: FilterProperties): boolean {
  return (
    props.taskStatus.size > 0 ||
    props.priority.size > 0 ||
    props.dueDate.size > 0 ||
    props.assignedTo.size > 0 ||
    props.nodeType.size > 0
  )
}

/** View settings dialog row definitions */
export type ViewDialogRow =
  | {
      kind: "filter"
      category: keyof FilterProperties
      label: string
      values: Array<{ value: string; label: string }>
      section?: string
    }
  | {
      kind: "radio"
      key: "viewMode" | "iconStyle"
      label: string
      values: Array<{ value: string; label: string }>
      section?: string
    }

export const VIEW_DIALOG_ROWS: ViewDialogRow[] = [
  // Filters (checkbox — multi select, most used)
  {
    kind: "filter",
    category: "taskStatus",
    label: "Status",
    values: [
      { value: "todo", label: "todo" },
      { value: "wip", label: "wip" },
      { value: "blocked", label: "blocked" },
      { value: "done", label: "done" },
      { value: "dropped", label: "dropped" },
    ],
  },
  {
    kind: "filter",
    category: "priority",
    label: "Priority",
    values: [
      { value: "1", label: "P1" },
      { value: "2", label: "P2" },
      { value: "3", label: "P3" },
      { value: "4", label: "P4" },
    ],
  },
  {
    kind: "filter",
    category: "dueDate",
    label: "Due",
    values: [
      { value: "overdue", label: "overdue" },
      { value: "today", label: "today" },
      { value: "this-week", label: "week" },
      { value: "no-date", label: "none" },
    ],
  },
  // View settings (radio — single select)
  {
    kind: "radio",
    key: "viewMode",
    label: "View",
    values: [
      { value: "cards", label: "cards" },
      { value: "columns", label: "columns" },
      { value: "tabs", label: "tabs" },
    ],
  },
  {
    kind: "radio",
    key: "iconStyle",
    label: "Icons",
    values: [
      { value: "nerdfont", label: "nerd" },
      { value: "workflowy", label: "circles" },
      { value: "regular", label: "regular" },
    ],
  },
]

/** @deprecated Use VIEW_DIALOG_ROWS instead */
export const FILTER_ROWS = VIEW_DIALOG_ROWS.filter(
  (r): r is Extract<ViewDialogRow, { kind: "filter" }> => r.kind === "filter",
)

// =============================================================================
// Initial State Factory
// =============================================================================

export function createInitialUIState(
  dimensions: { columns: number; rows: number },
  iconStyle: IconStyle = "nerdfont",
): UIState {
  return {
    iconStyle,
    borderMode: "normal" as BorderMode,

    showHelp: false,
    helpScrollOffset: 0,
    activePicker: null,
    showNewItemDialog: false,
    showSearchDialog: false,
    searchDialogInitialInput: "",
    searchScope: "all",
    searchScopeNodeIds: [],
    showConsole: false,
    showSyncPane: false,

    droppedFiles: [],
    showDropNotification: false,

    navHistory: [],
    navHistoryIndex: 0,

    recentProjectIds: [],

    terminalFocused: true,
    dimensions,

    isLoading: false,
    loadingStartTime: null,
    backgroundParsing: false,

    watcherStatus: null,
    syncEvents: [],

    datePrompt: null,

    clipboard: null,

    deleteConfirm: null,

    bellState: null,
    status: null,
    pendingChord: null,
    chordTimedOut: false,

    showOmnibox: false,

    showFavoritesDialog: false,
    favoritesSelectedKey: null,
  }
}

/**
 * Create a PaneUI (UIState + per-pane defaults) for tests and components that need the full merged view.
 * In production, usePaneUI() merges global UIState with the focused pane's per-pane fields.
 * This factory provides a standalone PaneUI with sensible defaults for all per-pane fields.
 */
export function createInitialPaneUI(
  initialViewMode: ViewMode = "cards",
  collapsedColumns: number[] = [],
  dimensions: { columns: number; rows: number } = { columns: 80, rows: 24 },
  iconStyle: IconStyle = "nerdfont",
): PaneUI {
  return {
    ...createInitialUIState(dimensions, iconStyle),
    viewMode: initialViewMode,
    maxContentLines: 3,
    collapsedColumns: new Set(collapsedColumns),
    columnScrollAnchor: null,
    localSearch: null,
    searchReplace: null,
    showFilterDialog: false,
    filterText: "",
    filterProperties: createEmptyFilterProperties(),
    filterCursorRow: 0,
    filterCursorVal: 0,
    showHidden: false,
    hiddenVersion: 0,
    mouseSelection: null,
    isMouseDragging: false,
  }
}
