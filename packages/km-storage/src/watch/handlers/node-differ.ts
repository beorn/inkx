/**
 * Node differ - compares existing nodes against new nodes
 *
 * Used by update handlers to determine what changed in a file.
 */

import type { KNode } from "@km/core"

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
 * Match nodes by structural position (parent_id + parent_idx + type).
 * This is more stable than md_pos which shifts when content changes.
 */
function makeStructuralKey(node: KNode): string {
  return `${node.parent_id ?? "root"}:${node.parent_idx ?? 0}:${node.type}`
}

/**
 * Diff existing nodes against new nodes
 *
 * Returns changes and a map from new IDs to existing IDs (for link remapping).
 */
// oxlint-disable-next-line complexity/max-cognitive -- Field comparison refactored with arrays — residual complexity
export function diffNodes(existing: KNode[], newNodes: KNode[]): DiffResult {
  const changes: NodeChange[] = []

  // Index existing by structural key (parent + index + type)
  const existingByKey = new Map<string, KNode>()
  for (const node of existing) {
    const key = makeStructuralKey(node)
    existingByKey.set(key, node)
  }

  // Map from new node IDs to existing node IDs (for parent_id remapping)
  const idMap = new Map<string, string>()

  // First pass: match file nodes by type (always root)
  const existingFile = existing.find((n) => n.type === "file")
  const newFile = newNodes.find((n) => n.type === "file")
  if (existingFile && newFile) {
    idMap.set(newFile.id, existingFile.id)
  }

  // Process non-file nodes with remapped parent IDs
  for (const node of newNodes) {
    if (node.type === "file") continue

    // Remap parent_id for key lookup
    const remappedParentId = node.parent_id
      ? (idMap.get(node.parent_id) ?? node.parent_id)
      : null
    const key = `${remappedParentId ?? "root"}:${node.parent_idx ?? 0}:${node.type}`

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
    // Remove file from remaining check
    const fileKey = makeStructuralKey(existingFile)
    existingByKey.delete(fileKey)
  }

  // Remaining existing nodes were deleted
  for (const [, node] of existingByKey) {
    // Don't delete file nodes
    if (node.type === "file") continue
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
  "task_mark",
  "md_pos",
] as const

/** Fields to compare for file nodes */
const FILE_DIFF_FIELDS = ["content", "title"] as const

/**
 * Compare specific fields between two nodes and return a changes record.
 * Always compares `data` via JSON to handle nested objects.
 */
function diffNodeFields(
  existing: KNode,
  newNode: KNode,
  fields: readonly string[],
): Record<string, unknown> {
  const changes: Record<string, unknown> = {}
  for (const field of fields) {
    const existingVal = (existing as Record<string, unknown>)[field]
    const newVal = (newNode as Record<string, unknown>)[field]
    if (newVal !== existingVal) {
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
