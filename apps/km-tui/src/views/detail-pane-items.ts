/**
 * Detail Pane Items — metadata key computation for detail pane rendering.
 */

import { KNode, extractTaskDates } from "@km/core"
import { capitalize } from "./detail-pane-helpers.ts"
import { parseDepsRefs } from "./tree-node-helpers.tsx"

/** Prefix for metadata cursor IDs */
export const DETAIL_META_PREFIX = "__meta__"

/** Data keys handled explicitly by MetadataTable or shown elsewhere (breadcrumb, footer). */
export const KNOWN_DATA_KEYS = new Set([
  // Parser-generated
  "tags",
  "mentions",
  "projects",
  "projectMemberships",
  "short_id",
  "props",
  "propsRaw",
  // `anchor` is the inline-parser key used for bare ^id (post-v6 fold,
  // storage-architecture §2.3). Historically called "block_id".
  "anchor",
  "metadata",
  "name",
  "title",
  "rrule",
  "fstype",
  "rules",
  "tag",
  "item_count",
  "is_repo_root",
  "embeddingTarget",
  // Internal aggregation (parser)
  "_h1Title",
  "_allMentions",
  "_allTags",
  "_allProjects",
  // Import provenance (shown in footer instead)
  "imported_from",
  "imported_at",
  "asana_project_id",
  // Containment tree (shown via breadcrumb)
  "workspace",
  "team",
  // Timestamps (mapped to native fields)
  "created_at",
  "modified_at",
  // Dependencies (rendered in MetadataTable)
  "deps",
  "blocks",
])

/**
 * Compute metadata keys present on a node.
 * Returns the list of navigable metadata row keys in display order.
 * Must match MetadataTable's row generation exactly.
 */
export function computeMetadataKeys(node: KNode): string[] {
  const keys: string[] = []
  const nodeIsTask = KNode.isTask(node)

  // Status — always shown for tasks (with "none" fallback)
  if (node.item?.task?.status || nodeIsTask) keys.push("Status")
  if (node.priority || nodeIsTask) keys.push("Priority")

  const { due, start } = extractTaskDates(node)
  if (due?.date || nodeIsTask) keys.push("Due")
  if (start?.date || nodeIsTask) keys.push("Start")

  if (node.rrule || nodeIsTask) keys.push("Recurrence")

  const data = node.data as Record<string, unknown> | undefined
  const metadata = (data?.metadata ?? {}) as Record<string, unknown>
  if (metadata.created) keys.push("Created")
  if (metadata.completed) keys.push("Completed")

  if (node.assigned_to || nodeIsTask) keys.push("Assigned")

  // Projects
  const projectMemberships = data?.projectMemberships as Array<{ project: string }> | undefined
  if (projectMemberships && projectMemberships.length > 0) keys.push("Projects")

  // Tags/Mentions from content refs or data
  const dataRefs = data as { mentions?: string[]; tags?: string[] } | undefined
  if (dataRefs?.tags && dataRefs.tags.length > 0) keys.push("Tags")
  if (dataRefs?.mentions && dataRefs.mentions.length > 0) keys.push("Mentions")

  // Dependencies
  if (data) {
    if (parseDepsRefs(data, "deps").length > 0) keys.push("Depends on")
    if (parseDepsRefs(data, "blocks").length > 0) keys.push("Blocks")
  }

  // Extra data.metadata entries (excluding created/completed already shown)
  const usedKeys = new Set(keys)
  if (data?.metadata && typeof data.metadata === "object") {
    for (const k of Object.keys(data.metadata as Record<string, unknown>)) {
      if (k === "created" || k === "completed") continue
      const key = capitalize(k)
      if (!usedKeys.has(key)) {
        usedKeys.add(key)
        keys.push(key)
      }
    }
  }

  // data.propsRaw entries
  if (data?.propsRaw && typeof data.propsRaw === "object") {
    for (const k of Object.keys(data.propsRaw as Record<string, unknown>)) {
      const key = capitalize(k)
      if (!usedKeys.has(key)) {
        usedKeys.add(key)
        keys.push(key)
      }
    }
  }

  // Extra data fields not in KNOWN_DATA_KEYS
  if (data) {
    for (const k of Object.keys(data)) {
      if (KNOWN_DATA_KEYS.has(k)) continue
      const key = capitalize(k)
      if (!usedKeys.has(key)) {
        usedKeys.add(key)
        keys.push(key)
      }
    }
  }

  return keys
}
