/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
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
  // In current model, embed_of is orthogonal to type — nodes stay as their parsed type.
  const normalizedType = type === "embed" ? "p" : type
  return `${parentId ?? "root"}:${ordinal}:${normalizedType}`
}

/**
 * Simple content hash for matching nodes without a `.name`.
 * Uses content + type as identity within a parent group.
 */
function contentHash(node: KNode): string {
  return `${node.type}:${node.content ?? ""}`
}

/**
 * Diff existing nodes against new nodes
 *
 * Uses a three-phase matching strategy per storage-architecture §3.2:
 * 1. Match by `.name` (strongest anchor — stable across reordering; folds
 *    the pre-v6 block_id path plus the content-derived heading-slug path
 *    into a single lookup since anchor literals and slugs now both live
 *    in `.name`).
 * 2. Match by content hash within same parent+type (for nodes without a name)
 * 3. Match by structural key / ordinal (last resort)
 *
 * Returns changes and a map from new IDs to existing IDs (for link remapping).
 */
// oxlint-disable-next-line complexity/complexity -- Three-phase matching requires branching
export function diffNodes(existing: KNode[], newNodes: KNode[]): DiffResult {
  const changes: NodeChange[] = []

  // Map from new node IDs to existing node IDs (for parent_id remapping)
  const idMap = new Map<string, string>()

  // Track which existing nodes have been matched (by existing node id)
  const matchedExistingIds = new Set<string>()
  // Track which new nodes have been matched (by new node id)
  const matchedNewIds = new Set<string>()

  // Separate file nodes from child nodes
  const existingFile = existing.find((n) => KNode.isOutline(n) && (n.fstype === "file" || n.fstype === "mdfile"))
  const newFile = newNodes.find((n) => KNode.isOutline(n) && (n.fstype === "file" || n.fstype === "mdfile"))

  // File node matching (always first)
  if (existingFile && newFile) {
    idMap.set(newFile.id, existingFile.id)
    matchedExistingIds.add(existingFile.id)
    matchedNewIds.add(newFile.id)
  }

  // Filter to non-file child nodes
  const existingChildren = existing.filter(
    (n) => !(KNode.isOutline(n) && (n.fstype === "file" || n.fstype === "mdfile")),
  )
  const newChildren = newNodes.filter((n) => !(KNode.isOutline(n) && (n.fstype === "file" || n.fstype === "mdfile")))

  // --- Phase 1: Match by `.name` (strongest anchor) ---
  //
  // Keyed by (parent_id, type, name) to avoid cross-file or cross-type
  // false positives — two siblings named "Introduction" under different
  // parents are distinct identities.
  const existingByName = new Map<string, KNode>()
  for (const node of existingChildren) {
    if (!node.name) continue
    const key = `${node.parent_id ?? "root"}:${node.type}:${node.name}`
    existingByName.set(key, node)
  }

  for (const node of newChildren) {
    if (!node.name) continue
    const remappedParentId = node.parent_id ? (idMap.get(node.parent_id) ?? node.parent_id) : null
    const key = `${remappedParentId ?? "root"}:${node.type}:${node.name}`
    const match = existingByName.get(key)
    if (match) {
      idMap.set(node.id, match.id)
      matchedExistingIds.add(match.id)
      matchedNewIds.add(node.id)
      existingByName.delete(key)
    }
  }

  // --- Phase 2: Match by content hash within (parent, type) ---
  // Group unmatched existing nodes by (remapped parent_id, type) → ordered list
  const existingByParentType = new Map<string, KNode[]>()
  for (const node of existingChildren) {
    if (matchedExistingIds.has(node.id)) continue
    const parentKey = `${node.parent_id ?? "root"}:${node.type}`
    let group = existingByParentType.get(parentKey)
    if (!group) {
      group = []
      existingByParentType.set(parentKey, group)
    }
    group.push(node)
  }
  // Sort each group by parent_idx to maintain stable order
  for (const [, group] of existingByParentType) {
    group.sort((a, b) => (a.parent_idx ?? 0) - (b.parent_idx ?? 0))
  }

  // Build content-hash → indices map for each parent+type group
  // Using indices into the group array so we can match duplicates in order
  const existingHashIndices = new Map<string, Map<string, number[]>>()
  for (const [parentTypeKey, group] of existingByParentType) {
    const hashMap = new Map<string, number[]>()
    for (let i = 0; i < group.length; i++) {
      const node = group[i]!
      const hash = contentHash(node)
      // Skip empty content — it's a poor identity signal
      if (!node.content) continue
      let indices = hashMap.get(hash)
      if (!indices) {
        indices = []
        hashMap.set(hash, indices)
      }
      indices.push(i)
    }
    existingHashIndices.set(parentTypeKey, hashMap)
  }

  // Match new nodes by content hash (in order for duplicates)
  for (const node of newChildren) {
    if (matchedNewIds.has(node.id)) continue
    if (!node.content) continue // Skip empty content nodes

    const remappedParentId = node.parent_id ? (idMap.get(node.parent_id) ?? node.parent_id) : null
    const parentTypeKey = `${remappedParentId ?? "root"}:${node.type}`
    const hashMap = existingHashIndices.get(parentTypeKey)
    if (!hashMap) continue

    const hash = contentHash(node)
    const indices = hashMap.get(hash)
    if (!indices || indices.length === 0) continue

    const group = existingByParentType.get(parentTypeKey)!
    // Take the first available (preserves order for duplicates)
    const idx = indices.shift()!
    const match = group[idx]!

    idMap.set(node.id, match.id)
    matchedExistingIds.add(match.id)
    matchedNewIds.add(node.id)
  }

  // --- Phase 3: Match by structural key / ordinal (fallback) ---
  const existingOrdinals = computeOrdinals(existing)
  const existingByKey = new Map<string, KNode>()
  for (const node of existingChildren) {
    if (matchedExistingIds.has(node.id)) continue
    const ordinal = existingOrdinals.get(node.id) ?? 0
    const key = makeStructuralKey(node.parent_id, ordinal, node.type)
    existingByKey.set(key, node)
  }

  const newOrdinals = computeOrdinals(newNodes)
  for (const node of newChildren) {
    if (matchedNewIds.has(node.id)) continue

    const remappedParentId = node.parent_id ? (idMap.get(node.parent_id) ?? node.parent_id) : null
    const ordinal = newOrdinals.get(node.id) ?? 0
    const key = makeStructuralKey(remappedParentId, ordinal, node.type)

    const existingNode = existingByKey.get(key)
    if (existingNode) {
      idMap.set(node.id, existingNode.id)
      matchedExistingIds.add(existingNode.id)
      matchedNewIds.add(node.id)
      existingByKey.delete(key)
    }
  }

  // --- Emit changes ---
  // Process all new child nodes: matched → check for updates, unmatched → created
  for (const node of newChildren) {
    const existingId = idMap.get(node.id)
    if (existingId) {
      // Matched — check for field changes
      const existingNode = existing.find((n) => n.id === existingId)!
      const nodeChanges = diffNodeFields(existingNode, node, CHILD_DIFF_FIELDS)

      // Preserve embed_of from existing node — parser can't resolve
      // ![[...]] to embed_of, so re-parsing would clear programmatic embeddings
      if (existingNode.embed_of && !node.embed_of) {
        delete nodeChanges.embed_of
      }

      if (Object.keys(nodeChanges).length > 0) {
        changes.push({
          type: "updated",
          nodeId: existingId,
          changes: nodeChanges,
        })
      }
    } else {
      // Unmatched new node — created
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
  }

  // Unmatched existing nodes were deleted
  for (const node of existingChildren) {
    if (matchedExistingIds.has(node.id)) continue
    changes.push({
      type: "deleted",
      nodeId: node.id,
    })
  }

  return { changes, idMap }
}

/** Fields to compare for child nodes.
 *
 * `name` must be here — when a user edits an existing file to add ` ^id`
 * to a task, kmBlockIdTransform strips the marker into `.name` during parse
 * (storage-architecture §2.3), but without this field in the diff, the
 * update event never carries the new anchor to the DB. */
const CHILD_DIFF_FIELDS = ["content", "md_pos", "due_at", "start_at", "priority", "embed_of", "name", "title"] as const

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
      changes[field] = newVal
    }
  }
  // Compare item via JSON (nested object)
  const newItem = JSON.stringify(newNode.item ?? null)
  const existingItem = JSON.stringify(existing.item ?? null)
  if (newItem !== existingItem) {
    changes.item = newNode.item
  }
  // Always compare data via JSON (handles nested objects)
  const newData = JSON.stringify(newNode.data ?? {})
  const existingData = JSON.stringify(existing.data ?? {})
  if (newData !== existingData) {
    changes.data = newNode.data
  }
  return changes
}
