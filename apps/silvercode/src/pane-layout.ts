/**
 * Pane layout — binary-split tree of session panes, persisted per-vault.
 *
 * v2: 2D layout. Each LayoutNode is either a leaf (one session) or a
 * split (row | column) of two children with a `weight` describing the
 * first child's flex-basis ratio (the second child gets `1 - weight`).
 * Arbitrary nesting → vsplit a pane that's itself a hsplit, etc.
 *
 *   row split:        column split:
 *   ┌───┬───┐         ┌───────┐
 *   │ A │ B │         │   A   │
 *   └───┴───┘         ├───────┤
 *                     │   B   │
 *                     └───────┘
 *
 * v1 stored a flat `weights[]` array (1D row, left-to-right). On read,
 * a v1 file auto-upgrades to a single-row split tree so users with an
 * existing `.km/panes.json` keep their layout.
 *
 * Persistence: `<cwd>/.km/panes.json`. Per-cwd because two
 * different vaults shouldn't share grid state. Best-effort I/O — failure
 * to read or write logs to debug but never throws.
 */

import createDebug from "debug"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

const dPanes = createDebug("silvercode:panes")

/** Direction of a split: `row` = side-by-side, `column` = stacked. */
export type SplitDirection = "row" | "column"

/**
 * A leaf in the layout tree. Holds the session id at this slot. The
 * caller maps `sessionId → SessionHandle` when rendering.
 */
export type LayoutLeaf = {
  readonly kind: "leaf"
  readonly sessionId: string
}

/**
 * An internal node. Two children laid out along `direction`. `weight`
 * is the first child's flex-basis ratio in [MIN_WEIGHT, 1 - MIN_WEIGHT];
 * the second child gets `1 - weight`. Total layout weight is implicit
 * (always 1 per split) — no normalization needed across the tree.
 */
export type LayoutSplit = {
  readonly kind: "split"
  readonly direction: SplitDirection
  readonly children: readonly [LayoutNode, LayoutNode]
  readonly weight: number
}

export type LayoutNode = LayoutLeaf | LayoutSplit

/** v2 persisted shape — single tree root. */
export type PersistedPanesV2 = {
  version: 2
  tree: SerializedNode
}

/** v1 persisted shape — flat weights. Read-only; we never write v1. */
export type PersistedPanesV1 = {
  version: 1
  weights: number[]
}

/** Wire format mirrors LayoutNode but mutable for JSON. */
type SerializedNode =
  | { kind: "leaf"; sessionId: string }
  | { kind: "split"; direction: SplitDirection; children: [SerializedNode, SerializedNode]; weight: number }

/** Default weight for a freshly-created split (50/50). */
export const DEFAULT_WEIGHT = 0.5

/** Minimum weight — keeps a pane from disappearing on overshoot during drag. */
export const MIN_WEIGHT = 0.05

/** Resolve `<cwd>/.km/panes.json` for layout persistence. */
export function panesFilePath(cwd: string): string {
  return join(cwd, ".km", "panes.json")
}

/** Build a single-leaf tree from one session id. */
export function leafTree(sessionId: string): LayoutNode {
  return { kind: "leaf", sessionId }
}

/**
 * Read persisted layout for a cwd. Returns null on miss / parse error so
 * the caller can build a fresh tree from the live session list.
 *
 * v1 → v2 migration: an array-shaped `weights` file becomes a degenerate
 * row-split tree. The caller still has to map weights[i] → session ids
 * (we don't store ids in v1) — see `assignSessionsToTree`.
 */
export function loadPanes(cwd: string): LayoutNode | null {
  const path = panesFilePath(cwd)
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, "utf8")
    const data = JSON.parse(raw) as PersistedPanesV1 | PersistedPanesV2
    if (data?.version === 2) {
      const tree = deserializeNode(data.tree)
      if (!tree) {
        dPanes("loadPanes %s — v2 tree invalid, ignoring", path)
        return null
      }
      dPanes("loadPanes %s — v2 tree", path)
      return tree
    }
    if (data?.version === 1 && Array.isArray(data.weights)) {
      // Migrate: row of placeholder leaves keyed `__pane_0`, `__pane_1`, …
      // The caller (PaneGrid) maps these placeholders → real session ids
      // via `assignSessionsToTree(tree, sessions)` on first render.
      const tree = buildRowFromWeights(data.weights)
      dPanes("loadPanes %s — migrated v1 (%d weights)", path, data.weights.length)
      return tree
    }
    dPanes("loadPanes %s — schema mismatch, ignoring", path)
    return null
  } catch (err) {
    dPanes("loadPanes %s — read/parse failed: %o", path, err)
    return null
  }
}

/** Persist a layout for a cwd. Best-effort — never throws. */
export function savePanes(cwd: string, tree: LayoutNode): void {
  const path = panesFilePath(cwd)
  try {
    mkdirSync(dirname(path), { recursive: true })
    const payload: PersistedPanesV2 = { version: 2, tree: serializeNode(tree) }
    writeFileSync(path, JSON.stringify(payload, null, 2))
    dPanes("savePanes %s — v2 tree", path)
  } catch (err) {
    dPanes("savePanes %s — write failed: %o", path, err)
  }
}

/**
 * Walk the tree in left-to-right reading order and return all leaf
 * session ids. Used for focus cycling (`Ctrl+N`) and for reconciling a
 * loaded tree against the live session list.
 */
export function leafIds(tree: LayoutNode): string[] {
  const out: string[] = []
  walk(tree, (n) => {
    if (n.kind === "leaf") out.push(n.sessionId)
  })
  return out
}

/** Number of leaves in the tree. */
export function leafCount(tree: LayoutNode): number {
  let count = 0
  walk(tree, (n) => {
    if (n.kind === "leaf") count++
  })
  return count
}

/**
 * Replace the leaf with `sessionId` by a split that adds a new leaf for
 * `newSessionId` along `direction`. The original session ends up as the
 * first child (left for row, top for column); the new session is the
 * second child. Weight = DEFAULT_WEIGHT (50/50).
 *
 * Returns the same tree if the leaf is not found (defensive).
 */
export function splitLeaf(
  tree: LayoutNode,
  sessionId: string,
  newSessionId: string,
  direction: SplitDirection,
): LayoutNode {
  if (tree.kind === "leaf") {
    if (tree.sessionId !== sessionId) return tree
    return {
      kind: "split",
      direction,
      children: [
        { kind: "leaf", sessionId: tree.sessionId },
        { kind: "leaf", sessionId: newSessionId },
      ],
      weight: DEFAULT_WEIGHT,
    }
  }
  // Recurse into both children (depth-first; first match wins). Returns
  // the same `tree` reference if neither subtree contained the target.
  const a = splitLeaf(tree.children[0], sessionId, newSessionId, direction)
  if (a !== tree.children[0]) {
    return { kind: "split", direction: tree.direction, children: [a, tree.children[1]], weight: tree.weight }
  }
  const b = splitLeaf(tree.children[1], sessionId, newSessionId, direction)
  if (b !== tree.children[1]) {
    return { kind: "split", direction: tree.direction, children: [tree.children[0], b], weight: tree.weight }
  }
  return tree
}

/**
 * Remove the leaf with `sessionId`. The sibling collapses up into the
 * parent's slot. If the leaf is the only one in the tree, returns null
 * (caller decides what to render then — silvercode never gets there
 * because a single pane is the minimum).
 */
export function removeLeaf(tree: LayoutNode, sessionId: string): LayoutNode | null {
  if (tree.kind === "leaf") {
    return tree.sessionId === sessionId ? null : tree
  }
  const [a, b] = tree.children
  // If one of our direct children is the matching leaf, collapse the
  // sibling up — drops this split level entirely.
  if (a.kind === "leaf" && a.sessionId === sessionId) return b
  if (b.kind === "leaf" && b.sessionId === sessionId) return a
  // Recurse — children may be splits themselves.
  const newA = removeLeaf(a, sessionId)
  const newB = removeLeaf(b, sessionId)
  if (newA && newB) {
    if (newA === a && newB === b) return tree
    return { kind: "split", direction: tree.direction, children: [newA, newB], weight: tree.weight }
  }
  if (newA) return newA
  if (newB) return newB
  return null
}

/**
 * Update the weight of the split node identified by its path from the
 * root. Path elements are 0 (left/top) or 1 (right/bottom); an empty
 * path targets the root. Pure — caller decides whether to persist.
 *
 * Out-of-range deltas are clamped to [MIN_WEIGHT, 1 - MIN_WEIGHT] so a
 * pane never disappears during drag overshoot.
 */
export function setSplitWeight(tree: LayoutNode, path: readonly number[], weight: number): LayoutNode {
  const clamped = Math.max(MIN_WEIGHT, Math.min(1 - MIN_WEIGHT, weight))
  return updateAtPath(tree, path, (node) => {
    if (node.kind !== "split") return node
    return { kind: "split", direction: node.direction, children: node.children, weight: clamped }
  })
}

/**
 * Swap the leaves with `idA` and `idB`. Pure tree walk — replaces every
 * occurrence of one id with the other and vice-versa. Tree shape is
 * unchanged; only leaf ids are renamed. Idempotent if `idA === idB`.
 *
 * Used as the visual "drop in center" operation during pane drag-move:
 * the dragged leaf's id and the target leaf's id swap places, so
 * the two panes effectively trade screen positions while keeping the
 * surrounding split structure intact.
 */
export function swapLeaves(tree: LayoutNode, idA: string, idB: string): LayoutNode {
  if (idA === idB) return tree
  return mapTree(tree, (node) => {
    if (node.kind !== "leaf") return node
    if (node.sessionId === idA) return { kind: "leaf", sessionId: idB }
    if (node.sessionId === idB) return { kind: "leaf", sessionId: idA }
    return node
  })
}

/** Edge of a target pane that a drop lands on, controlling the split direction + child ordering. */
export type DropEdge = "top" | "bottom" | "left" | "right"

/**
 * Move the leaf with `sourceId` to a position adjacent to the leaf with
 * `targetId` along `edge`. Two-step: (1) remove sourceId (collapses
 * its parent split as `removeLeaf` does); (2) split targetId along the
 * direction implied by `edge`, with sourceId placed on the indicated
 * side.
 *
 *   "left"  → row-split, source first  → [source | target]
 *   "right" → row-split, target first  → [target | source]
 *   "top"   → col-split, source first  → [source / target]
 *   "bottom"→ col-split, target first  → [target / source]
 *
 * No-op (returns the same tree) if `sourceId === targetId`, if either
 * leaf is missing, or if removal of the source would leave nothing for
 * the target (single-leaf tree). Pure — caller decides whether to persist.
 */
export function moveLeafTo(tree: LayoutNode, sourceId: string, targetId: string, edge: DropEdge): LayoutNode {
  if (sourceId === targetId) return tree
  const ids = new Set(leafIds(tree))
  if (!ids.has(sourceId) || !ids.has(targetId)) return tree
  const removed = removeLeaf(tree, sourceId)
  if (!removed) return tree
  // After removal the target is guaranteed to still exist (we checked
  // both ids were present and they differ; removeLeaf only removes
  // sourceId).
  const direction: SplitDirection = edge === "left" || edge === "right" ? "row" : "column"
  // splitLeaf places the original session as the first child, the new
  // session as the second. So:
  //   - "right"/"bottom": source goes second → just call splitLeaf as-is
  //   - "left"/"top":     source goes first  → call splitLeaf, then swap children
  const next = splitLeaf(removed, targetId, sourceId, direction)
  if (edge === "right" || edge === "bottom") return next
  // Swap children of the freshly-created split so source ends up first.
  return swapSplitChildrenContaining(next, targetId, sourceId)
}

/**
 * Find the leaf "structurally adjacent" to `id` in the given direction.
 * Walks up the tree until we find a split aligned with the direction
 * (row for left/right, column for up/down) and where stepping into the
 * other branch goes the correct way; from there, descends into the
 * branch's edge nearest the source leaf so the returned id is the
 * visually-closest neighbor in 2D space.
 *
 * Returns null if there is no neighbor on that side (already at edge).
 *
 * Used by the keyboard fallback `Ctrl+W H/J/K/L` to pick a swap target.
 */
export function findNeighbor(tree: LayoutNode, id: string, direction: "left" | "right" | "up" | "down"): string | null {
  const path = pathToLeaf(tree, id)
  if (!path) return null
  const wantSplit: SplitDirection = direction === "left" || direction === "right" ? "row" : "column"
  // Walk up: we need an ancestor whose split direction matches and
  // whose child index points the wrong way (so we can pivot to the
  // sibling subtree on the requested side).
  for (let i = path.length - 1; i >= 0; i--) {
    const ancestor = nodeAtPath(tree, path.slice(0, i))
    if (ancestor?.kind !== "split") continue
    if (ancestor.direction !== wantSplit) continue
    const childIdx = path[i]
    if (childIdx === undefined) continue
    // direction "right"/"down": we came from index 0, neighbor is in index 1.
    // direction "left"/"up":    we came from index 1, neighbor is in index 0.
    const wantFrom = direction === "right" || direction === "down" ? 0 : 1
    if (childIdx !== wantFrom) continue
    const siblingIdx = wantFrom === 0 ? 1 : 0
    const sibling = ancestor.children[siblingIdx]
    // Within the sibling subtree, descend toward the edge nearest the
    // source leaf. For "right" we want the sibling's left edge → keep
    // taking children[0] when we hit a row-split (column-splits don't
    // matter for L/R). Symmetric for the other directions.
    return descendToNearestEdge(sibling, direction)
  }
  return null
}

// Internal: helper for moveLeafTo's child-swap step.
function swapSplitChildrenContaining(node: LayoutNode, targetId: string, sourceId: string): LayoutNode {
  if (node.kind !== "split") return node
  const a = node.children[0]
  const b = node.children[1]
  // The split we just created has targetId in one leaf and sourceId in
  // the other (immediate children). Swap them.
  const aHasTarget = a.kind === "leaf" && a.sessionId === targetId && b.kind === "leaf" && b.sessionId === sourceId
  const bHasTarget = b.kind === "leaf" && b.sessionId === targetId && a.kind === "leaf" && a.sessionId === sourceId
  if (aHasTarget || bHasTarget) {
    return { kind: "split", direction: node.direction, children: [b, a], weight: node.weight }
  }
  // Recurse — the freshly-created split is somewhere deeper.
  const newA = swapSplitChildrenContaining(a, targetId, sourceId)
  if (newA !== a) return { kind: "split", direction: node.direction, children: [newA, b], weight: node.weight }
  const newB = swapSplitChildrenContaining(b, targetId, sourceId)
  if (newB !== b) return { kind: "split", direction: node.direction, children: [a, newB], weight: node.weight }
  return node
}

// Internal: descend the subtree to the leaf nearest the requested edge.
function descendToNearestEdge(node: LayoutNode, direction: "left" | "right" | "up" | "down"): string {
  if (node.kind === "leaf") return node.sessionId
  // For "right" we approach from the left → pick children[0] when the
  // split direction matches (row). For other split directions, fall
  // through arbitrarily — pick children[0].
  if (node.direction === "row") {
    const idx = direction === "right" ? 0 : direction === "left" ? 1 : 0
    return descendToNearestEdge(node.children[idx], direction)
  }
  // column split
  const idx = direction === "down" ? 0 : direction === "up" ? 1 : 0
  return descendToNearestEdge(node.children[idx], direction)
}

// Internal: find the path from root to the leaf with `id`, or null.
function pathToLeaf(node: LayoutNode, id: string, prefix: number[] = []): number[] | null {
  if (node.kind === "leaf") return node.sessionId === id ? prefix : null
  const left = pathToLeaf(node.children[0], id, [...prefix, 0])
  if (left) return left
  return pathToLeaf(node.children[1], id, [...prefix, 1])
}

// Internal: walk a path back to its node (mirrors PaneGrid's helper).
function nodeAtPath(node: LayoutNode, path: readonly number[]): LayoutNode | null {
  let cur: LayoutNode = node
  for (const idx of path) {
    if (cur.kind !== "split") return null
    const child = cur.children[idx === 0 ? 0 : 1]
    if (!child) return null
    cur = child
  }
  return cur
}

/**
 * Reconcile a loaded tree against the live session list. Adds new
 * sessions as row-splits on the rightmost leaf; drops leaves whose
 * sessions no longer exist.
 *
 * v1 migration: the loaded tree's leaves carry placeholder ids
 * (`__pane_0`, `__pane_1`, …). We rename them to the session ids in
 * order. If the live count differs, extras append / orphans drop.
 */
export function reconcileTree(loaded: LayoutNode | null, sessionIds: readonly string[]): LayoutNode {
  // No persisted tree → degenerate row of all current sessions.
  if (!loaded) return buildRowFromSessions(sessionIds)
  const placeholderIds = leafIds(loaded).filter((id) => id.startsWith("__pane_"))
  let tree = loaded
  // v1 migration: rename placeholder leaves in reading order.
  if (placeholderIds.length > 0) {
    const remap = new Map<string, string>()
    for (let i = 0; i < placeholderIds.length && i < sessionIds.length; i++) {
      const ph = placeholderIds[i]
      const sid = sessionIds[i]
      if (ph !== undefined && sid !== undefined) remap.set(ph, sid)
    }
    tree = mapTree(tree, (node) => {
      if (node.kind !== "leaf") return node
      const renamed = remap.get(node.sessionId)
      if (!renamed) return node
      return { kind: "leaf", sessionId: renamed }
    })
    // Drop any leaves whose placeholder didn't get a session.
    for (const ph of placeholderIds) {
      if (!remap.has(ph)) {
        const next = removeLeaf(tree, ph)
        tree = next ?? leafTree(sessionIds[0] ?? ph)
      }
    }
  }
  // Drop leaves for sessions that no longer exist.
  const live = new Set(sessionIds)
  for (const id of leafIds(tree)) {
    if (!live.has(id)) {
      const next = removeLeaf(tree, id)
      if (!next) return buildRowFromSessions(sessionIds)
      tree = next
    }
  }
  // Append leaves for new sessions (row-split on the rightmost leaf).
  const present = new Set(leafIds(tree))
  for (const id of sessionIds) {
    if (present.has(id)) continue
    const rightmost = rightmostLeafId(tree)
    tree = splitLeaf(tree, rightmost, id, "row")
  }
  return tree
}

// ---------- internals ----------

function walk(node: LayoutNode, visit: (n: LayoutNode) => void): void {
  visit(node)
  if (node.kind === "split") {
    walk(node.children[0], visit)
    walk(node.children[1], visit)
  }
}

function mapTree(node: LayoutNode, fn: (n: LayoutNode) => LayoutNode): LayoutNode {
  const replaced = fn(node)
  if (replaced.kind !== "split") return replaced
  const a = mapTree(replaced.children[0], fn)
  const b = mapTree(replaced.children[1], fn)
  if (a === replaced.children[0] && b === replaced.children[1]) return replaced
  return { kind: "split", direction: replaced.direction, children: [a, b], weight: replaced.weight }
}

function updateAtPath(node: LayoutNode, path: readonly number[], fn: (n: LayoutNode) => LayoutNode): LayoutNode {
  if (path.length === 0) return fn(node)
  if (node.kind !== "split") return node
  const [head, ...rest] = path
  const idx = head === 0 ? 0 : 1
  const child = node.children[idx]
  const updated = updateAtPath(child, rest, fn)
  if (updated === child) return node
  const newChildren: [LayoutNode, LayoutNode] = idx === 0 ? [updated, node.children[1]] : [node.children[0], updated]
  return { kind: "split", direction: node.direction, children: newChildren, weight: node.weight }
}

function rightmostLeafId(node: LayoutNode): string {
  if (node.kind === "leaf") return node.sessionId
  // For a row split, "rightmost" is the second child; for a column
  // split, both are vertically stacked at the same horizontal position
  // — pick the second so new sessions land at the bottom-right of the
  // overall tree.
  return rightmostLeafId(node.children[1])
}

function buildRowFromSessions(sessionIds: readonly string[]): LayoutNode {
  const first = sessionIds[0]
  if (first === undefined) return leafTree("__pane_empty")
  let tree: LayoutNode = leafTree(first)
  for (let i = 1; i < sessionIds.length; i++) {
    const id = sessionIds[i]
    if (id === undefined) continue
    tree = splitLeaf(tree, rightmostLeafId(tree), id, "row")
    // Equal-weight the new row by recomputing the rightmost split's
    // weight to 1/(i+1) so all panes stay equal-width on first load.
    tree = setSplitWeight(tree, rightmostSplitPath(tree), 1 / (i + 1))
  }
  return tree
}

function buildRowFromWeights(weights: ReadonlyArray<number>): LayoutNode {
  // v1 migration: build a row tree with placeholder ids; reconcileTree
  // renames them to real session ids in reading order. Weights become
  // pairwise split ratios (left = w[0] / (w[0]+w[1]+…+w[i+1])).
  if (weights.length === 0) return leafTree("__pane_0")
  const ids = weights.map((_, i) => `__pane_${i}`)
  const firstId = ids[0]
  if (firstId === undefined) return leafTree("__pane_0")
  let tree: LayoutNode = leafTree(firstId)
  let cumLeft = weights[0] ?? 1
  for (let i = 1; i < weights.length; i++) {
    const right = weights[i] ?? 1
    const id = ids[i]
    if (id === undefined) continue
    const total = cumLeft + right
    tree = splitLeaf(tree, rightmostLeafId(tree), id, "row")
    tree = setSplitWeight(tree, rightmostSplitPath(tree), cumLeft / total)
    cumLeft = total
  }
  return tree
}

function rightmostSplitPath(node: LayoutNode): number[] {
  // Path to the deepest right-spine split. For a row-only tree built by
  // `buildRowFromSessions`, this is `[1, 1, 1, …]` until we hit a leaf
  // or single-leaf branch. We stop at the LAST split before a leaf.
  const path: number[] = []
  let cur = node
  while (cur.kind === "split") {
    if (cur.children[1].kind === "leaf") return path
    path.push(1)
    cur = cur.children[1]
  }
  return path
}

function serializeNode(node: LayoutNode): SerializedNode {
  if (node.kind === "leaf") return { kind: "leaf", sessionId: node.sessionId }
  return {
    kind: "split",
    direction: node.direction,
    children: [serializeNode(node.children[0]), serializeNode(node.children[1])],
    weight: node.weight,
  }
}

function deserializeNode(node: SerializedNode | null | undefined): LayoutNode | null {
  if (!node || typeof node !== "object") return null
  if (node.kind === "leaf") {
    if (typeof node.sessionId !== "string") return null
    return { kind: "leaf", sessionId: node.sessionId }
  }
  if (node.kind === "split") {
    if (node.direction !== "row" && node.direction !== "column") return null
    if (!Array.isArray(node.children) || node.children.length !== 2) return null
    const a = deserializeNode(node.children[0])
    const b = deserializeNode(node.children[1])
    if (!a || !b) return null
    const weight = typeof node.weight === "number" && node.weight > 0 && node.weight < 1 ? node.weight : DEFAULT_WEIGHT
    return { kind: "split", direction: node.direction, children: [a, b], weight }
  }
  return null
}
