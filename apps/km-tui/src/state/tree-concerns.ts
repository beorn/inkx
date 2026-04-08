/**
 * Tree Concerns — unified hierarchical state propagation.
 *
 * One mechanism for all per-node state that propagates through a tree.
 * Concerns declare a source set + direction; the engine walks the tree,
 * computes per-node values, diffs against previous, and writes only changes.
 *
 * Four propagation types:
 *   self  — source nodes only (cursor, selected, editing, hovered)
 *   down  — source → all descendants (muting, collapse, sigil inheritance)
 *   up    — source → all ancestors (breadcrumb, hasError, hasUnread)
 *   global — not tree-structural (handled outside this system)
 *
 * "Down" concerns accept an optional merge function for CSS-like inheritance
 * (child overrides parent). Without merge, it's a broadcast (all descendants
 * get the same value).
 *
 * @example Selection/cursor concerns (first consumer):
 * ```ts
 * const concerns: TreeConcern<boolean>[] = [
 *   { name: 'cursor',            source: () => new Set([cursorId]), direction: 'self' },
 *   { name: 'cursorDescendant',  source: () => new Set([cursorId]), direction: 'up' },
 *   { name: 'selected',          source: () => selectionSet,        direction: 'self' },
 *   { name: 'selectedAncestor',  source: () => selectionSet,        direction: 'down' },
 * ]
 * ```
 */

import { signal } from "alien-signals"

type Signal<T> = ReturnType<typeof signal<T>>

// =============================================================================
// Types
// =============================================================================

/** Access to the tree structure. Minimal interface — no dependency on Repo. */
export interface TreeAccess {
  parent(nodeId: string): string | null
  children(nodeId: string): readonly string[]
}

/** A concern that propagates state through the tree. */
export interface TreeConcern<T = boolean> {
  /** Signal name — used as key in per-node state map. */
  name: string
  /** Which nodes are the source of this concern. Called on each sync. */
  source: () => ReadonlySet<string>
  /** Propagation direction. */
  direction: "self" | "down" | "up"
  /** Value to set on affected nodes. Default: true (for boolean concerns). */
  value?: T
  /** For "down" concerns: merge parent value with node's own state.
   *  If omitted, broadcasts parent value unchanged (no override). */
  merge?: (parentValue: T, nodeId: string) => T
}

// =============================================================================
// Engine
// =============================================================================

/** Tracks per-node signals and syncs them from declared concerns. */
export class TreeConcernEngine {
  /** Per-node signal maps: nodeId → concernName → Signal<any> */
  private nodes = new Map<string, Map<string, Signal<any>>>()
  /** Previous writes for diffing: concernName → Set<nodeId> */
  private prev = new Map<string, Set<string>>()

  /** Get or create a signal for a node+concern pair. */
  private getSignal<T>(nodeId: string, name: string, defaultValue: T): Signal<T> {
    let nodeSignals = this.nodes.get(nodeId)
    if (!nodeSignals) {
      nodeSignals = new Map()
      this.nodes.set(nodeId, nodeSignals)
    }
    let s = nodeSignals.get(name)
    if (!s) {
      s = signal(defaultValue)
      nodeSignals.set(name, s)
    }
    return s
  }

  /** Read a concern signal for a node. Returns the signal itself (for useSignal). */
  signal<T = boolean>(nodeId: string, name: string): Signal<T> {
    return this.getSignal(nodeId, name, false as any)
  }

  /** Read the current value of a concern for a node. */
  peek<T = boolean>(nodeId: string, name: string): T {
    return this.getSignal(nodeId, name, false as any)() as T
  }

  /**
   * Sync all concerns against the current tree state.
   * Computes affected nodes per concern, diffs against previous, writes changes.
   */
  sync(concerns: readonly TreeConcern[], tree: TreeAccess): void {
    for (const concern of concerns) {
      const sources = concern.source()
      const affected = new Set<string>()
      const value = concern.value ?? true

      // Compute affected node set
      switch (concern.direction) {
        case "self":
          for (const id of sources) affected.add(id)
          break

        case "down":
          for (const id of sources) {
            // Source node is NOT affected by its own down-propagation
            // (it should use a separate "self" concern if needed)
            this.walkDown(id, tree, affected)
          }
          break

        case "up":
          for (const id of sources) {
            // Walk ancestors — source node is NOT affected
            let p = tree.parent(id)
            while (p) {
              affected.add(p)
              p = tree.parent(p)
            }
          }
          break
      }

      // Diff against previous: turn off nodes no longer affected, turn on new ones
      const prevSet = this.prev.get(concern.name) ?? new Set()

      for (const id of prevSet) {
        if (!affected.has(id)) {
          this.getSignal(id, concern.name, false as any)(false as any)
        }
      }
      for (const id of affected) {
        if (!prevSet.has(id)) {
          this.getSignal(id, concern.name, false as any)(value as any)
        }
      }

      this.prev.set(concern.name, affected)
    }
  }

  /** Walk all descendants of nodeId, adding to the target set. */
  private walkDown(nodeId: string, tree: TreeAccess, target: Set<string>): void {
    const children = tree.children(nodeId)
    for (const childId of children) {
      target.add(childId)
      this.walkDown(childId, tree, target)
    }
  }

  /** Clean up signals for nodes no longer in the tree. */
  cleanup(nodeIds: ReadonlySet<string>): void {
    for (const id of nodeIds) {
      this.nodes.delete(id)
    }
    // Also remove from prev sets
    for (const [, prevSet] of this.prev) {
      for (const id of nodeIds) {
        prevSet.delete(id)
      }
    }
  }
}
