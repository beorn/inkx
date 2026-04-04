/**
 * Commit Taxonomy — types for the reactive store layer.
 *
 * TreeOp: user intent — what the editor receives
 *   (Already exists in packages/km-tree/src/ops/operations.ts as TreeOp type)
 *
 * Change: canonical state mutation — what the store commits
 *   (Already exists in packages/km-core as Change type)
 *
 * This file adds: CommitMeta, CommitResult, RepoDelta, ResourceState, ChangeEnvelope.
 */

import type { Change } from "@km/core"

// =============================================================================
// CommitMeta — provenance of a commit
// =============================================================================

export interface CommitMeta {
  commitId: string
  source: CommitSource
  actorId?: string
  /** Cursor/version for replication */
  basis?: string
}

export type CommitSource = "local" | "undo" | "redo" | "fs-import" | "remote" | "repo-direct"

// =============================================================================
// RepoDelta — invalidation signal: what changed (for UI subscriptions)
// =============================================================================

export interface RepoDelta {
  /** Nodes whose content changed */
  nodeIds: readonly string[]
  /** Parents whose child list changed */
  parentIds: readonly string[]
  /** Nodes that were deleted */
  deletedNodeIds: readonly string[]
}

// =============================================================================
// CommitResult — what apply/commit returns
// =============================================================================

export interface CommitResult {
  meta: CommitMeta
  changes: readonly Change[]
  delta: RepoDelta
}

// =============================================================================
// ResourceState — loading lifecycle for lazy-loaded nodes
// =============================================================================

export type ResourceState<T> =
  | { status: "unloaded" }
  | { status: "loading"; previous?: T }
  | { status: "loaded"; value: T }
  | { status: "deleted" }
  | { status: "error"; error: unknown; previous?: T }

/** Helper functions for creating and inspecting ResourceState values */
export const ResourceState = {
  unloaded: <T>(): ResourceState<T> => ({ status: "unloaded" }),
  loading: <T>(previous?: T): ResourceState<T> => ({ status: "loading", previous }),
  loaded: <T>(value: T): ResourceState<T> => ({ status: "loaded", value }),
  deleted: <T>(): ResourceState<T> => ({ status: "deleted" }),
  error: <T>(error: unknown, previous?: T): ResourceState<T> => ({ status: "error", error, previous }),
  isLoaded: <T>(s: ResourceState<T>): s is { status: "loaded"; value: T } => s.status === "loaded",
  value: <T>(s: ResourceState<T>): T | undefined => (s.status === "loaded" ? s.value : undefined),
} as const

// =============================================================================
// computeDelta — derive RepoDelta from a Change
// =============================================================================

/** Compute which nodes and parents were affected by a change. */
export function computeDelta(change: Change): RepoDelta {
  const nodeIds: string[] = []
  const parentIds: string[] = []
  const deletedNodeIds: string[] = []

  switch (change.type) {
    case "node_created": {
      const createdId = (change.data?.id as string) ?? change.target
      if (createdId) nodeIds.push(createdId)
      if (change.data?.parent_id) parentIds.push(change.data.parent_id as string)
      break
    }
    case "node_updated":
      if (change.target) nodeIds.push(change.target)
      break
    case "node_moved":
      if (change.target) nodeIds.push(change.target)
      if (change.data?.parent_id) parentIds.push(change.data.parent_id as string)
      if (change.data?.old_parent_id) parentIds.push(change.data.old_parent_id as string)
      break
    case "node_deleted":
      if (change.target) deletedNodeIds.push(change.target)
      if (change.data?.parent_id) parentIds.push(change.data.parent_id as string)
      break
    case "task_claimed":
    case "task_released":
    case "task_completed":
      if (change.target) nodeIds.push(change.target)
      break
  }

  return { nodeIds, parentIds, deletedNodeIds }
}

/**
 * Merge multiple per-change deltas into one aggregated RepoDelta.
 * Deduplicates IDs across the batch.
 */
export function mergeDeltas(changes: readonly Change[]): RepoDelta {
  const nodeIds = new Set<string>()
  const parentIds = new Set<string>()
  const deletedNodeIds = new Set<string>()

  for (const change of changes) {
    const d = computeDelta(change)
    for (const id of d.nodeIds) nodeIds.add(id)
    for (const id of d.parentIds) parentIds.add(id)
    for (const id of d.deletedNodeIds) deletedNodeIds.add(id)
  }

  return {
    nodeIds: [...nodeIds],
    parentIds: [...parentIds],
    deletedNodeIds: [...deletedNodeIds],
  }
}

// =============================================================================
// ChangeEnvelope — replicated committed change (for sync between stores)
// =============================================================================

export interface ChangeEnvelope<C = Change> {
  commitId: string
  source: CommitSource
  actorId?: string
  basis?: string
  changes: readonly C[]
}
