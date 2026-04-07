/**
 * Sticky Folds Persistence
 *
 * Reads/writes `.km/sticky-folds.json` to persist per-node sticky fold state
 * across sessions. A sticky fold is a fold (or unfold) that survives
 * fold-all/unfold-all — the user has "pinned" the state for that node.
 *
 * Format: JSON object mapping nodeId → "folded" | "unfolded".
 *
 * State values:
 * - "folded": this node is pinned as folded; unfold-all leaves it folded
 * - "unfolded": this node is pinned as unfolded; fold-all leaves it unfolded
 * - (absent): node has no sticky state; fold-all/unfold-all affect it normally
 *
 * Migration: when `.km/sticky-folds.json` doesn't exist, existing
 * rules.collapse=true columns are migrated to "folded" on first access.
 * That migration lives in the board-app-store load path.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"

// =============================================================================
// Types
// =============================================================================

/** A single node's sticky fold state. Absent = not sticky. */
export type StickyState = "folded" | "unfolded"

/** Sticky fold map — nodeId → sticky state. */
export type StickyFolds = Map<string, StickyState>

// =============================================================================
// File I/O
// =============================================================================

function stickyFoldsPath(repoPath: string): string {
  return join(repoPath, ".km", "sticky-folds.json")
}

/**
 * Read the sticky folds map from `.km/sticky-folds.json`.
 * Returns empty map if file doesn't exist or is malformed.
 */
export function readStickyFolds(repoPath: string): StickyFolds {
  const filePath = stickyFoldsPath(repoPath)
  if (!existsSync(filePath)) return new Map()

  try {
    const content = readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(content) as Record<string, unknown>
    const result: StickyFolds = new Map()
    for (const [nodeId, state] of Object.entries(parsed)) {
      if (state === "folded" || state === "unfolded") {
        result.set(nodeId, state)
      }
    }
    return result
  } catch {
    return new Map()
  }
}

/**
 * Write the sticky folds map to `.km/sticky-folds.json`.
 * Creates the `.km/` directory if needed.
 */
export function writeStickyFolds(repoPath: string, folds: StickyFolds): void {
  const filePath = stickyFoldsPath(repoPath)
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const obj: Record<string, StickyState> = {}
  for (const [nodeId, state] of folds) {
    obj[nodeId] = state
  }
  writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, "utf-8")
}

// =============================================================================
// Debounced Writer
// =============================================================================

/**
 * Create a debounced writer for sticky folds.
 * Call `schedule(folds)` to request a write; repeated calls within the
 * debounce window coalesce. Call `flush()` to force an immediate write.
 */
export function createStickyFoldsWriter(
  repoPath: string,
  debounceMs = 300,
): {
  schedule: (folds: StickyFolds) => void
  flush: () => void
  dispose: () => void
} {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: StickyFolds | null = null

  function doWrite(): void {
    if (pending === null) return
    const folds = pending
    pending = null
    timer = null
    try {
      writeStickyFolds(repoPath, folds)
    } catch {
      // Ignore persistence errors — they don't affect runtime state
    }
  }

  return {
    schedule(folds: StickyFolds): void {
      pending = folds
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(doWrite, debounceMs)
    },
    flush(): void {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      doWrite()
    },
    dispose(): void {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    },
  }
}

// =============================================================================
// Helpers — pure map operations
// =============================================================================

/** Return a new map with nodeId set to state. Does NOT mutate input. */
export function setSticky(folds: StickyFolds, nodeId: string, state: StickyState): StickyFolds {
  const next = new Map(folds)
  next.set(nodeId, state)
  return next
}

/** Return a new map with nodeId removed. Does NOT mutate input. */
export function removeSticky(folds: StickyFolds, nodeId: string): StickyFolds {
  if (!folds.has(nodeId)) return folds
  const next = new Map(folds)
  next.delete(nodeId)
  return next
}

/** Check whether nodeId has any sticky state. */
export function isSticky(folds: StickyFolds, nodeId: string): boolean {
  return folds.has(nodeId)
}

/** Get the sticky state for nodeId (or undefined). */
export function getSticky(folds: StickyFolds, nodeId: string): StickyState | undefined {
  return folds.get(nodeId)
}
