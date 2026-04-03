/**
 * Helpers for converting between nested ItemData and flat DB columns.
 *
 * The DB stores item fields as flat columns (list_marker, task_marker,
 * task_status) while the domain model uses nested ItemData ({ list, task }).
 * These helpers eliminate the ~7 duplicate inline conversion sites.
 */
import type { ItemData, TaskMarker, TaskStatus } from "@km/core"

// =============================================================================
// Flat DB column shape
// =============================================================================

/** Flat DB columns for the item/task portion of a node row. */
export interface ItemColumns {
  item: 0 | 1
  list_marker: string | null
  task_marker: string | null
  task_status: string | null
}

// =============================================================================
// Decompose: ItemData → flat DB columns
// =============================================================================

/**
 * Convert a nested ItemData to flat DB columns for INSERT.
 *
 * @example
 *   decomposeItem({ list: "-", task: { marker: "[ ]", status: "todo" } })
 *   // → { item: 1, list_marker: "-", task_marker: "[ ]", task_status: "todo" }
 *
 *   decomposeItem(undefined)
 *   // → { item: 0, list_marker: null, task_marker: null, task_status: null }
 */
export function decomposeItem(itemData: ItemData | null | undefined): ItemColumns {
  if (itemData == null) {
    return { item: 0, list_marker: null, task_marker: null, task_status: null }
  }
  return {
    item: 1,
    list_marker: itemData.list ?? null,
    task_marker: itemData.task?.marker ?? null,
    task_status: itemData.task?.status ?? null,
  }
}

// =============================================================================
// Compose: flat DB columns → ItemData
// =============================================================================

/**
 * Compose flat DB columns back into a nested ItemData.
 *
 * @example
 *   composeItem(1, "-", "[ ]", "todo")
 *   // → { list: "-", task: { marker: "[ ]", status: "todo" } }
 *
 *   composeItem(0, null, null, null)
 *   // → undefined
 */
export function composeItem(
  item: unknown,
  listMarker: string | null | undefined,
  taskMarker: string | null | undefined,
  taskStatus: string | null | undefined,
): ItemData | undefined {
  if (!item) return undefined
  const result: ItemData = {}
  if (listMarker) result.list = listMarker
  if (taskMarker) result.task = { marker: taskMarker as TaskMarker, status: (taskStatus ?? "todo") as TaskStatus }
  return result
}

// =============================================================================
// Legacy event decompose: handles both nested item object and flat fields
// =============================================================================

/**
 * Extract flat DB columns from an event's data record.
 * Handles both nested item format (new) and flat fields (legacy events).
 *
 * @example
 *   // New format: { item: { list: "-", task: { marker: "[ ]", status: "todo" } } }
 *   decomposeEventItem(data)
 *   // → { listMarker: "-", taskMarker: "[ ]", taskStatus: "todo" }
 *
 *   // Legacy format: { list_marker: "-", task_marker: "[ ]", task_status: "todo" }
 *   decomposeEventItem(data)
 *   // → { listMarker: "-", taskMarker: "[ ]", taskStatus: "todo" }
 */
export function decomposeEventItem(data: Record<string, unknown>): {
  listMarker: string | null
  taskMarker: string | null
  taskStatus: string | null
} {
  const item = data.item as Record<string, unknown> | undefined
  const task = item?.task as { marker?: string; status?: string } | undefined
  return {
    listMarker: (data.list_marker as string) ?? (item?.list as string) ?? null,
    taskMarker: (data.task_marker as string) ?? task?.marker ?? null,
    taskStatus: (data.task_status as string) ?? task?.status ?? null,
  }
}
