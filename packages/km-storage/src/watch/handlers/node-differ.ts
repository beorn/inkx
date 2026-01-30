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
 * Diff existing nodes against new nodes
 *
 * Returns changes and a map from new IDs to existing IDs (for link remapping).
 */
export function diffNodes(existing: KNode[], newNodes: KNode[]): DiffResult {
  const existingByKey = indexByStructuralKey(existing)
  const idMap = matchFileNodes(existing, newNodes)

  const changes = [
    ...processNewNodes(newNodes, existingByKey, idMap),
    ...processFileNodeUpdates(existing, newNodes, existingByKey),
    ...collectDeletedNodes(existingByKey),
  ]

  return { changes, idMap }
}

// --- Helper functions ---

/** Match nodes by structural position (parent_id + parent_idx + type) */
function makeStructuralKey(node: KNode): string {
  return `${node.parent_id ?? "root"}:${node.parent_idx ?? 0}:${node.type}`
}

/** Build index of existing nodes by structural key */
function indexByStructuralKey(nodes: KNode[]): Map<string, KNode> {
  const map = new Map<string, KNode>()
  for (const node of nodes) {
    map.set(makeStructuralKey(node), node)
  }
  return map
}

/** Match file nodes and return ID mapping */
function matchFileNodes(
  existing: KNode[],
  newNodes: KNode[],
): Map<string, string> {
  const idMap = new Map<string, string>()
  const existingFile = existing.find((n) => n.type === "file")
  const newFile = newNodes.find((n) => n.type === "file")
  if (existingFile && newFile) {
    idMap.set(newFile.id, existingFile.id)
  }
  return idMap
}

/** Remap parent_id using the ID map */
function remapParentId(
  parentId: string | null,
  idMap: Map<string, string>,
): string | null {
  if (!parentId) return null
  return idMap.get(parentId) ?? parentId
}

/** Build structural key with remapped parent ID */
function makeRemappedKey(node: KNode, idMap: Map<string, string>): string {
  const remappedParentId = remapParentId(node.parent_id, idMap)
  return `${remappedParentId ?? "root"}:${node.parent_idx ?? 0}:${node.type}`
}

/** Create a new node with remapped parent_id */
function createNodeWithRemappedParent(
  node: KNode,
  idMap: Map<string, string>,
): KNode {
  const mappedParentId = node.parent_id ? idMap.get(node.parent_id) : undefined
  if (!mappedParentId) return node
  return { ...node, parent_id: mappedParentId }
}

/** Detect changes between two nodes (for non-file nodes) */
function detectNodeChanges(
  newNode: KNode,
  existingNode: KNode,
): Record<string, unknown> {
  const changes: Record<string, unknown> = {}

  if (newNode.content !== existingNode.content) {
    changes.content = newNode.content
  }
  if (newNode.task_status !== existingNode.task_status) {
    changes.task_status = newNode.task_status
  }
  if (newNode.task_mark !== existingNode.task_mark) {
    changes.task_mark = newNode.task_mark
  }
  if (newNode.md_pos !== existingNode.md_pos) changes.md_pos = newNode.md_pos

  if (
    JSON.stringify(newNode.data ?? {}) !==
    JSON.stringify(existingNode.data ?? {})
  ) {
    changes.data = newNode.data
  }

  return changes
}

/** Detect changes between two file nodes */
function detectFileChanges(
  newFile: KNode,
  existingFile: KNode,
): Record<string, unknown> {
  const changes: Record<string, unknown> = {}

  if (newFile.content !== existingFile.content) {
    changes.content = newFile.content
  }
  if (newFile.title !== existingFile.title) changes.title = newFile.title

  if (
    JSON.stringify(newFile.data ?? {}) !==
    JSON.stringify(existingFile.data ?? {})
  ) {
    changes.data = newFile.data
  }

  return changes
}

/** Process non-file nodes: match, create, or update */
function processNewNodes(
  newNodes: KNode[],
  existingByKey: Map<string, KNode>,
  idMap: Map<string, string>,
): NodeChange[] {
  const changes: NodeChange[] = []

  for (const node of newNodes) {
    if (node.type === "file") continue

    const key = makeRemappedKey(node, idMap)
    const existingNode = existingByKey.get(key)

    if (!existingNode) {
      changes.push({
        type: "created",
        node: createNodeWithRemappedParent(node, idMap),
      })
      continue
    }

    idMap.set(node.id, existingNode.id)
    const nodeChanges = detectNodeChanges(node, existingNode)

    if (Object.keys(nodeChanges).length > 0) {
      changes.push({
        type: "updated",
        nodeId: existingNode.id,
        changes: nodeChanges,
      })
    }

    existingByKey.delete(key)
  }

  return changes
}

/** Process file node updates */
function processFileNodeUpdates(
  existing: KNode[],
  newNodes: KNode[],
  existingByKey: Map<string, KNode>,
): NodeChange[] {
  const existingFile = existing.find((n) => n.type === "file")
  const newFile = newNodes.find((n) => n.type === "file")

  if (!existingFile || !newFile) return []

  existingByKey.delete(makeStructuralKey(existingFile))

  const fileChanges = detectFileChanges(newFile, existingFile)
  if (Object.keys(fileChanges).length === 0) return []

  return [{ type: "updated", nodeId: existingFile.id, changes: fileChanges }]
}

/** Collect deleted nodes (remaining in existingByKey, excluding files) */
function collectDeletedNodes(existingByKey: Map<string, KNode>): NodeChange[] {
  const changes: NodeChange[] = []
  for (const node of existingByKey.values()) {
    if (node.type !== "file") {
      changes.push({ type: "deleted", nodeId: node.id })
    }
  }
  return changes
}
