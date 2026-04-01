/**
 * Node differ - compares existing nodes against new nodes
 *
 * Used by update handlers to determine what changed in a file.
 */

import { KNode } from "@km/core"

/**
 * A change detected during node diffing
 */
export interface NodeChange {
  type: "created" | "updated" | "deleted"
  nodeId?: string
  node?: KNode
  changes?: Record<string, unknown>
}

/**
 * Result of diffing nodes
 */
export interface DiffResult {
  changes: NodeChange[]
  /** Map from new node IDs to existing node IDs */
  idMap: Map<string, string>
}

/**
 * Compute ordinal positions for nodes within their parent group.
 * Groups siblings by parent_id, sorts by parent_idx, assigns ordinal 0, 1, 2...
 * This normalizes fractional parent_idx (from TUI midpoint reordering) and
 * sequential integers (from parser) to the same ordinal space.
 */
function computeOrdinals(nodes: KNode[]): Map<string, number> {
  const byParent = new Map<string, KNode[]>()
  for (const node of nodes) {
    if (KNode.isOutline(node) && (node.fstype === "file" || node.fstype === "mdfile")) continue
    const parentId = node.parent_id ?? "root"
    let group = byParent.get(parentId)
    if (!group) {
      group = []
      byParent.set(parentId, group)
    }
    group.push(node)
  }

  const ordinals = new Map<string, number>()
  for (const [, siblings] of byParent) {
    siblings.sort((a, b) => (a.parent_idx ?? 0) - (b.parent_idx ?? 0))
    for (let i = 0; i < siblings.length; i++) {
      const sibling = siblings[i]
      if (sibling) ordinals.set(sibling.id, i)
    }
  }
  return ordinals
}

/**
 * Match nodes by structural position (parent_id + ordinal + type).
 * Uses ordinal position among siblings instead of raw parent_idx,
 * which normalizes fractional and integer indices.
 */
function makeStructuralKey(parentId: string | null, ordinal: number, type: string): string {
  // Legacy: normalize "embed" → "p" for matching old databases that still have type="embed" nodes.
  // In current model, embed_source is orthogonal to type — nodes stay as their parsed type.
  const normalizedType = type === "embed" ? "p" : type
  return `${parentId ?? "root"}:${ordinal}:${normalizedType}`
}

/**
 * Diff existing nodes against new nodes
 *
 * Returns changes and a map from new IDs to existing IDs (for link remapping).
 */
// oxlint-disable-next-line complexity/complexity -- Field comparison refactored with arrays — residual complexity
export function diffNodes(existing: KNode[], newNodes: KNode[]): DiffResult {
  const changes: NodeChange[] = []

  // Index existing by structural key (parent + ordinal + type)
  const existingOrdinals = computeOrdinals(existing)
  const existingByKey = new Map<string, KNode>()
  for (const node of existing) {
    if (KNode.isOutline(node) && (node.fstype === "file" || node.fstype === "mdfile")) continue
    const ordinal = existingOrdinals.get(node.id) ?? 0
    const key = makeStructuralKey(node.parent_id, ordinal, node.type)
    existingByKey.set(key, node)
  }

  // Map from new node IDs to existing node IDs (for parent_id remapping)
  const idMap = new Map<string, string>()

  // First pass: match file nodes by type (always root)
  const existingFile = existing.find((n) => KNode.isOutline(n) && (n.fstype === "file" || n.fstype === "mdfile"))
  const newFile = newNodes.find((n) => KNode.isOutline(n) && (n.fstype === "file" || n.fstype === "mdfile"))
  if (existingFile && newFile) {
    idMap.set(newFile.id, existingFile.id)
  }

  // Process non-file nodes with remapped parent IDs
  const newOrdinals = computeOrdinals(newNodes)
  for (const node of newNodes) {
    if (KNode.isOutline(node) && (node.fstype === "file" || node.fstype === "mdfile")) continue

    // Remap parent_id for key lookup
    const remappedParentId = node.parent_id ? (idMap.get(node.parent_id) ?? node.parent_id) : null
    const ordinal = newOrdinals.get(node.id) ?? 0
    const key = makeStructuralKey(remappedParentId, ordinal, node.type)

    const existingNode = existingByKey.get(key)

    if (!existingNode) {
      // New node - need to remap its parent_id to existing parent
      const nodeToCreate = { ...node }
      if (nodeToCreate.parent_id && idMap.has(nodeToCreate.parent_id)) {
        const mappedId = idMap.get(nodeToCreate.parent_id)
        if (mappedId) {
          nodeToCreate.parent_id = mappedId
        }
      }
      changes.push({
        type: "created",
        node: nodeToCreate,
      })
    } else {
      // Map new ID to existing ID for child nodes
      idMap.set(node.id, existingNode.id)

      // Check for changes
      const nodeChanges = diffNodeFields(existingNode, node, CHILD_DIFF_FIELDS)

      // Preserve embed_source from existing node — parser can't resolve
      // ![[...]] to embed_source, so re-parsing would clear programmatic embeddings
      if (existingNode.embed_source && !node.embed_source) {
        delete nodeChanges.embed_source
      }

      if (Object.keys(nodeChanges).length > 0) {
        changes.push({
          type: "updated",
          nodeId: existingNode.id,
          changes: nodeChanges,
        })
      }

      existingByKey.delete(key)
    }
  }

  // Handle file node updates
  if (existingFile && newFile) {
    const nodeChanges = diffNodeFields(existingFile, newFile, FILE_DIFF_FIELDS)
    if (Object.keys(nodeChanges).length > 0) {
      changes.push({
        type: "updated",
        nodeId: existingFile.id,
        changes: nodeChanges,
      })
    }
    // File nodes are not in existingByKey (skipped during indexing)
  }

  // Remaining existing nodes were deleted
  for (const [, node] of existingByKey) {
    // Don't delete file nodes
    if (KNode.isOutline(node) && (node.fstype === "file" || node.fstype === "mdfile")) continue
    changes.push({
      type: "deleted",
      nodeId: node.id,
    })
  }

  return { changes, idMap }
}

/** Fields to compare for child nodes */
const CHILD_DIFF_FIELDS = [
  "content",
  "task_status",
  "task_marker",
  "md_pos",
  "due_at",
  "start_at",
  "priority",
  "embed_source",
  "name",
  "title",
] as const

/** Fields to compare for file nodes */
const FILE_DIFF_FIELDS = ["content", "title"] as const

/**
 * Compare specific fields between two nodes and return a changes record.
 * Always compares `data` via JSON to handle nested objects.
 */
function diffNodeFields(existing: KNode, newNode: KNode, fields: readonly string[]): Record<string, unknown> {
  const changes: Record<string, unknown> = {}
  for (const field of fields) {
    const existingVal = (existing as unknown as Record<string, unknown>)[field]
    const newVal = (newNode as unknown as Record<string, unknown>)[field]
    if (newVal !== existingVal) {
      // Never overwrite non-empty text fields with empty values during reconciliation.
      // This prevents the watcher from clobbering content/name set by inline edit
      // when it reads a stale file written before the save was applied to DB.
      if ((field === "name" || field === "content") && !newVal && existingVal) continue
      changes[field] = newVal
    }
  }
  // Always compare data via JSON (handles nested objects)
  const newData = JSON.stringify(newNode.data ?? {})
  const existingData = JSON.stringify(existing.data ?? {})
  if (newData !== existingData) {
    changes.data = newNode.data
  }
  return changes
}
