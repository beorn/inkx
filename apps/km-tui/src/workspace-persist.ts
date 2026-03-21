/**
 * Workspace Persistence — Save/Restore Pane Layouts
 *
 * Serializes workspace state (layout tree, pane configs) to JSON files in
 * `<vault>/.km/workspaces/`. On exit, auto-saves as "default". On launch,
 * restores from "default" if present.
 *
 * Persisted: layout tree, pane viewType/rootNodePath/viewMode/filterProperties, focusedPaneId.
 * NOT persisted: cursor position, fold state, scroll offsets, CursorStore,
 * selection, nav history — these are session-specific.
 *
 * Key design: rootNodePath stores the node's fs_path (relative file path within
 * the vault), not the vault root path. On restore, this is resolved back to a
 * node ID via repo.resolveNode(). Ephemeral node IDs are never persisted.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import type { LayoutNode, PaneState, WorkspaceState, ViewMode } from "./board-types.ts"
import { isBoardPane } from "./board-types.ts"
import type { FilterProperties } from "./ui-reducer.ts"
import { createEmptyFilterProperties } from "./ui-reducer.ts"
import type { Repo } from "./repo-context.tsx"

// =============================================================================
// Persisted Types
// =============================================================================

export interface PersistedWorkspace {
  version: 1
  name: string
  savedAt: string // ISO date
  layout: PersistedLayoutNode
  panes: PersistedPane[]
  focusedPaneId: string
}

/**
 * JSON-safe representation of FilterProperties (Sets → arrays).
 * Only non-empty categories are included to keep the JSON compact.
 */
export interface PersistedFilterProperties {
  taskStatus?: string[]
  priority?: string[]
  dueDate?: string[]
  assignedTo?: string[]
  nodeType?: string[]
}

export interface PersistedPane {
  id: string
  viewType: "board" | "detail" | "empty"
  /** Node's fs_path (relative file path within the vault), resolved to rootId on restore */
  rootNodePath: string | null
  viewMode: ViewMode
  /** Optional property-based filters (hide done, tag filters, etc.) */
  filterProperties?: PersistedFilterProperties
}

export type PersistedLayoutNode =
  | { type: "leaf"; paneId: string }
  | { type: "split"; direction: "h" | "v"; ratio: number; left: PersistedLayoutNode; right: PersistedLayoutNode }

// =============================================================================
// Serialization
// =============================================================================

/**
 * Serialize a live LayoutNode to a persisted LayoutNode.
 * The types are structurally identical, but this ensures we only persist
 * the expected fields (no accidental extras).
 */
function serializeLayout(node: LayoutNode): PersistedLayoutNode {
  if (node.type === "leaf") {
    return { type: "leaf", paneId: node.paneId }
  }
  return {
    type: "split",
    direction: node.direction,
    ratio: node.ratio,
    left: serializeLayout(node.left),
    right: serializeLayout(node.right),
  }
}

/**
 * Serialize FilterProperties (Sets → arrays), omitting empty categories.
 * Returns undefined if all categories are empty (nothing to persist).
 */
function serializeFilterProperties(fp: FilterProperties): PersistedFilterProperties | undefined {
  const result: PersistedFilterProperties = {}
  let hasAny = false

  if (fp.taskStatus.size > 0) {
    result.taskStatus = [...fp.taskStatus]
    hasAny = true
  }
  if (fp.priority.size > 0) {
    result.priority = [...fp.priority]
    hasAny = true
  }
  if (fp.dueDate.size > 0) {
    result.dueDate = [...fp.dueDate]
    hasAny = true
  }
  if (fp.assignedTo.size > 0) {
    result.assignedTo = [...fp.assignedTo]
    hasAny = true
  }
  if (fp.nodeType.size > 0) {
    result.nodeType = [...fp.nodeType]
    hasAny = true
  }

  return hasAny ? result : undefined
}

/**
 * Deserialize persisted filter properties (arrays → Sets).
 * Returns a full FilterProperties with empty Sets for omitted categories.
 */
export function deserializeFilterProperties(raw: PersistedFilterProperties | undefined): FilterProperties {
  if (!raw) return createEmptyFilterProperties()
  return {
    taskStatus: new Set(raw.taskStatus ?? []),
    priority: new Set(raw.priority ?? []),
    dueDate: new Set(raw.dueDate ?? []),
    assignedTo: new Set(raw.assignedTo ?? []),
    nodeType: new Set(raw.nodeType ?? []),
  }
}

/**
 * Serialize a live PaneState to a persisted pane.
 * Uses the repo to look up the node's fs_path from its rootId.
 * Falls back to null if the node no longer exists or has no fs_path.
 */
function serializePane(pane: PaneState, repo: Repo): PersistedPane {
  let rootNodePath: string | null = null
  let viewMode: ViewMode = "cards"
  let filterProperties: PersistedFilterProperties | undefined

  if (isBoardPane(pane)) {
    if (pane.rootId) {
      const node = repo.getNode(pane.rootId)
      rootNodePath = node?.fs_path ?? null
    }
    viewMode = pane.viewMode
    filterProperties = serializeFilterProperties(pane.filterProperties)
  }

  const result: PersistedPane = {
    id: pane.id,
    viewType: pane.viewType,
    rootNodePath,
    viewMode,
  }
  if (filterProperties) result.filterProperties = filterProperties
  return result
}

/**
 * Serialize the current workspace state to a persistable format.
 * @param repo - Repo needed to resolve rootId → fs_path for persistence
 */
export function serializeWorkspace(workspace: WorkspaceState, name: string, repo: Repo): PersistedWorkspace {
  const panes: PersistedPane[] = []
  for (const pane of workspace.panes.values()) {
    panes.push(serializePane(pane, repo))
  }

  return {
    version: 1,
    name,
    savedAt: new Date().toISOString(),
    layout: serializeLayout(workspace.layout),
    panes,
    focusedPaneId: workspace.focusedPaneId,
  }
}

// =============================================================================
// Deserialization
// =============================================================================

/** Valid view modes for validation. */
const VALID_VIEW_MODES = new Set<string>(["cards", "list", "columns", "tabs"])

/** Valid pane view types for validation. */
const VALID_VIEW_TYPES = new Set<string>(["board", "detail", "empty"])

/**
 * Validate and parse a persisted layout node.
 * Returns null if the structure is invalid.
 */
function parseLayout(raw: unknown): PersistedLayoutNode | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>

  if (obj.type === "leaf") {
    if (typeof obj.paneId !== "string") return null
    return { type: "leaf", paneId: obj.paneId }
  }

  if (obj.type === "split") {
    if (obj.direction !== "h" && obj.direction !== "v") return null
    if (typeof obj.ratio !== "number" || obj.ratio < 0.05 || obj.ratio > 0.95) return null
    const left = parseLayout(obj.left)
    const right = parseLayout(obj.right)
    if (!left || !right) return null
    return { type: "split", direction: obj.direction, ratio: obj.ratio, left, right }
  }

  return null
}

/**
 * Validate and parse a persisted pane.
 * Returns null if the structure is invalid.
 */
/**
 * Validate and parse optional persisted filter properties.
 * Lenient: unknown categories are ignored, invalid arrays are skipped.
 * Returns undefined if input is not an object or is empty.
 */
function parseFilterProperties(raw: unknown): PersistedFilterProperties | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const obj = raw as Record<string, unknown>

  const result: PersistedFilterProperties = {}
  let hasAny = false

  for (const key of ["taskStatus", "priority", "dueDate", "assignedTo", "nodeType"] as const) {
    const val = obj[key]
    if (Array.isArray(val) && val.every((v) => typeof v === "string") && val.length > 0) {
      result[key] = val as string[]
      hasAny = true
    }
  }

  return hasAny ? result : undefined
}

function parsePane(raw: unknown): PersistedPane | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>

  if (typeof obj.id !== "string") return null
  if (!VALID_VIEW_TYPES.has(obj.viewType as string)) return null
  if (obj.rootNodePath !== null && typeof obj.rootNodePath !== "string") return null
  if (!VALID_VIEW_MODES.has(obj.viewMode as string)) return null

  const result: PersistedPane = {
    id: obj.id as string,
    viewType: obj.viewType as "board" | "detail" | "empty",
    rootNodePath: (obj.rootNodePath as string | null) ?? null,
    viewMode: obj.viewMode as ViewMode,
  }

  const filterProperties = parseFilterProperties(obj.filterProperties)
  if (filterProperties) result.filterProperties = filterProperties

  return result
}

/**
 * Collect all pane IDs referenced in a layout tree.
 */
function collectLayoutPaneIds(node: PersistedLayoutNode): Set<string> {
  if (node.type === "leaf") return new Set([node.paneId])
  const left = collectLayoutPaneIds(node.left)
  const right = collectLayoutPaneIds(node.right)
  for (const id of right) left.add(id)
  return left
}

/**
 * Parse and validate a persisted workspace from raw JSON.
 * Returns null if the data is invalid or incompatible.
 */
export function parsePersistedWorkspace(raw: unknown): PersistedWorkspace | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>

  // Version check
  if (obj.version !== 1) return null
  if (typeof obj.name !== "string") return null
  if (typeof obj.savedAt !== "string") return null
  if (typeof obj.focusedPaneId !== "string") return null

  // Parse layout
  const layout = parseLayout(obj.layout)
  if (!layout) return null

  // Parse panes
  if (!Array.isArray(obj.panes)) return null
  const panes: PersistedPane[] = []
  for (const rawPane of obj.panes) {
    const pane = parsePane(rawPane)
    if (!pane) return null
    panes.push(pane)
  }

  // Validate: every pane referenced in layout must exist in the panes array
  const layoutPaneIds = collectLayoutPaneIds(layout)
  const paneIds = new Set(panes.map((p) => p.id))
  for (const id of layoutPaneIds) {
    if (!paneIds.has(id)) return null
  }

  // Validate: focusedPaneId must reference a pane in the layout
  if (!layoutPaneIds.has(obj.focusedPaneId as string)) return null

  return {
    version: 1,
    name: obj.name as string,
    savedAt: obj.savedAt as string,
    layout,
    panes,
    focusedPaneId: obj.focusedPaneId as string,
  }
}

// =============================================================================
// File I/O
// =============================================================================

/**
 * Get the directory path for workspace files.
 */
function workspacesDir(vaultPath: string): string {
  return join(vaultPath, ".km", "workspaces")
}

/**
 * Get the full file path for a named workspace.
 */
function workspaceFilePath(vaultPath: string, name: string): string {
  // Sanitize name: allow only alphanumeric, dash, underscore
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "_")
  return join(workspacesDir(vaultPath), `${safeName}.json`)
}

/**
 * Save the current workspace state to disk.
 * @param repo - Repo needed to resolve rootId → fs_path for persistence
 */
export function saveWorkspace(workspace: WorkspaceState, name: string, vaultPath: string, repo: Repo): void {
  const data = serializeWorkspace(workspace, name, repo)
  const dir = workspacesDir(vaultPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const filePath = workspaceFilePath(vaultPath, name)
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8")
}

/**
 * Load a named workspace from disk.
 * Returns null if the file doesn't exist or is invalid.
 */
export function loadWorkspace(name: string, vaultPath: string): PersistedWorkspace | null {
  const filePath = workspaceFilePath(vaultPath, name)
  if (!existsSync(filePath)) return null

  try {
    const content = readFileSync(filePath, "utf-8")
    const raw = JSON.parse(content) as unknown
    return parsePersistedWorkspace(raw)
  } catch {
    return null
  }
}

/**
 * List all saved workspace names.
 * Returns sorted names without the .json extension.
 */
export function listWorkspaces(vaultPath: string): string[] {
  const dir = workspacesDir(vaultPath)
  if (!existsSync(dir)) return []

  try {
    const files = readdirSync(dir)
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5))
      .sort()
  } catch {
    return []
  }
}

/**
 * Delete a named workspace from disk.
 * Returns true if the file was deleted, false if it didn't exist.
 */
export function deleteWorkspace(name: string, vaultPath: string): boolean {
  const filePath = workspaceFilePath(vaultPath, name)
  if (!existsSync(filePath)) return false

  try {
    unlinkSync(filePath)
    return true
  } catch {
    return false
  }
}
