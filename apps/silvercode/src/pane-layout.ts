/**
 * Pane layout — flex-basis ratios per pane, persisted per-vault.
 *
 * v1: 1D row of panes (left-to-right). Each pane has a `weight` (positive
 * number); pane width = `weight / total * available`. Two panes both at
 * weight=1 → 50/50. Drag-resize updates weights in place; new spawns
 * append weight=1.
 *
 * Persistence: `<cwd>/.silvercode/panes.json`. Per-cwd because two
 * different vaults shouldn't share grid state. Best-effort I/O — failure
 * to read or write logs to debug but never throws.
 *
 * Defer to v2: 2D layout (binary-split tree), pane reordering, named
 * profiles. v1 is a single row of equally-sized cards by default and the
 * data model is intentionally a flat array so the persistence file stays
 * trivial to inspect / hand-edit.
 */

import createDebug from "debug"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

const dPanes = createDebug("silvercode:panes")

export type PaneLayout = {
  /** Per-pane weight; index aligns with the pane order. Always positive. */
  readonly weights: ReadonlyArray<number>
}

export type PersistedPanes = {
  /** Schema version for forward-compat. v1 starts at 1. */
  version: 1
  weights: number[]
}

/** Default pane weight for a freshly-spawned pane (no persisted state). */
export const DEFAULT_WEIGHT = 1

/** Minimum weight — keeps a pane from disappearing on overshoot during drag. */
export const MIN_WEIGHT = 0.1

/** Resolve `<cwd>/.silvercode/panes.json` for layout persistence. */
export function panesFilePath(cwd: string): string {
  return join(cwd, ".silvercode", "panes.json")
}

/** Read persisted weights for a cwd. Returns empty array on miss / parse error. */
export function loadPanes(cwd: string): number[] {
  const path = panesFilePath(cwd)
  if (!existsSync(path)) return []
  try {
    const raw = readFileSync(path, "utf8")
    const data = JSON.parse(raw) as PersistedPanes
    if (data?.version !== 1 || !Array.isArray(data.weights)) {
      dPanes("loadPanes %s — schema mismatch, ignoring", path)
      return []
    }
    const cleaned = data.weights.map((w) => (typeof w === "number" && w > 0 ? w : DEFAULT_WEIGHT))
    dPanes("loadPanes %s — %d weights", path, cleaned.length)
    return cleaned
  } catch (err) {
    dPanes("loadPanes %s — read/parse failed: %o", path, err)
    return []
  }
}

/** Persist weights for a cwd. Best-effort — never throws. */
export function savePanes(cwd: string, weights: ReadonlyArray<number>): void {
  const path = panesFilePath(cwd)
  try {
    mkdirSync(dirname(path), { recursive: true })
    const payload: PersistedPanes = { version: 1, weights: weights.slice() }
    writeFileSync(path, JSON.stringify(payload, null, 2))
    dPanes("savePanes %s — %d weights", path, weights.length)
  } catch (err) {
    dPanes("savePanes %s — write failed: %o", path, err)
  }
}

/**
 * Resize the boundary between pane `i` and pane `i+1` by `deltaRatio`,
 * a value in [-1, 1] expressing the fraction of the COMBINED pair weight
 * to move from right → left (positive grows pane i, shrinks pane i+1).
 *
 * Conserves total weight: only the two adjacent panes change.
 */
export function resizeBoundary(weights: ReadonlyArray<number>, i: number, deltaRatio: number): number[] {
  const next = weights.slice()
  if (i < 0 || i >= next.length - 1) return next
  const left = next[i] ?? DEFAULT_WEIGHT
  const right = next[i + 1] ?? DEFAULT_WEIGHT
  const combined = left + right
  const newLeft = Math.max(MIN_WEIGHT, Math.min(combined - MIN_WEIGHT, left + deltaRatio * combined))
  const newRight = combined - newLeft
  next[i] = newLeft
  next[i + 1] = newRight
  return next
}

/**
 * Reconcile a stored weight array with the current pane count. Truncates
 * extras, appends `DEFAULT_WEIGHT` for new panes. Pure — caller decides
 * whether to persist.
 */
export function reconcileWeights(stored: ReadonlyArray<number>, paneCount: number): number[] {
  if (paneCount <= 0) return []
  const out: number[] = []
  for (let i = 0; i < paneCount; i++) {
    out.push(stored[i] ?? DEFAULT_WEIGHT)
  }
  return out
}
