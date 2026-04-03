/**
 * Commit Taxonomy — types for the reactive store layer.
 *
 * Operation: user intent — what the editor receives
 *   (Already exists in packages/km-tree/src/operations.ts as Operation type)
 *
 * Event: canonical state mutation — what the store commits
 *   (Already exists in packages/km-core as Event type)
 *
 * This file adds: CommitMeta, CommitResult, RepoDelta, ResourceState, ChangeEnvelope.
 */

import type { Event } from "@km/core"

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

export type CommitSource = "local" | "undo" | "redo" | "fs-import" | "remote"

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
  events: readonly Event[]
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
// computeDelta — derive RepoDelta from an Event
// =============================================================================

/** Compute which nodes and parents were affected by an event. */
export function computeDelta(event: Event): RepoDelta {
  const nodeIds: string[] = []
  const parentIds: string[] = []
  const deletedNodeIds: string[] = []

  switch (event.type) {
    case "node_created": {
      const createdId = (event.data?.id as string) ?? event.target
      if (createdId) nodeIds.push(createdId)
      if (event.data?.parent_id) parentIds.push(event.data.parent_id as string)
      break
    }
    case "node_updated":
      if (event.target) nodeIds.push(event.target)
      break
    case "node_moved":
      if (event.target) nodeIds.push(event.target)
      if (event.data?.parent_id) parentIds.push(event.data.parent_id as string)
      if (event.data?.old_parent_id) parentIds.push(event.data.old_parent_id as string)
      break
    case "node_deleted":
      if (event.target) deletedNodeIds.push(event.target)
      if (event.data?.parent_id) parentIds.push(event.data.parent_id as string)
      break
    case "task_claimed":
    case "task_released":
    case "task_completed":
      if (event.target) nodeIds.push(event.target)
      break
  }

  return { nodeIds, parentIds, deletedNodeIds }
}

// =============================================================================
// ChangeEnvelope — replicated committed change (for sync between stores)
// =============================================================================

export interface ChangeEnvelope<C = Event> {
  commitId: string
  source: CommitSource
  actorId?: string
  basis?: string
  changes: readonly C[]
}
