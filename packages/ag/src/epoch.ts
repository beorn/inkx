/**
 * Render Epoch + Bit-Packed Dirty Flags
 *
 * A monotonically increasing counter that replaces boolean dirty flags.
 * Instead of setting `node.contentDirty = true` and later clearing with
 * `node.contentDirty = false`, the reconciler stamps `node.dirtyEpoch` with the
 * owning tree's current epoch and sets the appropriate bit in `node.dirtyBits`.
 * The render phase checks `node.dirtyEpoch === owner.epoch && (bits & BIT) !== 0`.
 *
 * Clearing all flags is O(1): just `owner.epoch++`. The old O(N) tree walk
 * in clearDirtyFlags becomes unnecessary — stale epoch stamps automatically
 * read as "not dirty" once the epoch advances.
 *
 * INITIAL_EPOCH (-1) is the sentinel for "never dirty". New nodes use the
 * current epoch so they appear dirty on first render.
 *
 * ## The epoch is per render tree, never per process
 *
 * The counter lives on an {@link EpochOwner} that one render tree owns and no
 * other tree can reach. A process-global counter looks equivalent while a
 * single renderer runs, and is silently wrong the moment a second one exists:
 * dirty bits are only readable while the stamp still equals the CURRENT epoch,
 * and every `renderPhase()` ends by advancing it. React's commit and the
 * pipeline are separate steps — `updateContainerSync` + `flushSyncWork` stamp
 * the bits, `doRender()` consumes them afterwards — so a peer renderer that
 * completes a frame in that window resets the counter, the victim's changed
 * nodes read clean, the fast path skips them, and the previous frame's pixels
 * survive in the clone as stale residue. That is the bug behind
 * `@km/silvery/render-no-stale-residue-invariant`; the owner is what makes it
 * unrepresentable. Ownership is structural rather than a scoped
 * save/restore global, per the framework rule that shared mutable state gets an
 * owner (see the root CLAUDE.md `wasRaw` anti-pattern).
 *
 * ## Bit-Packed Dirty Flags (S-MEM)
 *
 * Seven dirty flags are packed into a single `dirtyBits` number field:
 *   bit 0: content      (text content or content-affecting props changed)
 *   bit 1: styleProps   (visual props changed: color, bg, border, etc.)
 *   bit 2: bg           (backgroundColor specifically changed)
 *   bit 3: children     (direct children added/removed/reordered)
 *   bit 4: subtree      (this node or any descendant has dirty content/layout)
 *   bit 5: absoluteChildMutated   (absolute child had structural changes)
 *   bit 6: descendantOverflow     (descendant overflow changed)
 *
 * Note: outlines do NOT get a dirty bit — they're handled by the separate
 * decoration phase (see pipeline/decoration-phase.ts) which redraws them
 * every frame using per-cell snapshots.
 *
 * Combined with `dirtyEpoch`, this reduces per-node memory from 56 bytes
 * (7 separate epoch fields × 8 bytes) to 16 bytes (2 fields × 8 bytes).
 */

/** Sentinel value: node has never been marked dirty for this flag. */
export const INITIAL_EPOCH = -1

// ============================================================================
// Dirty Bit Constants
// ============================================================================

/** Content changed (text content or content-affecting props). */
export const CONTENT_BIT = 1 << 0 // 0b0000001
/** Visual style props changed (color, bg, border, etc.). */
export const STYLE_PROPS_BIT = 1 << 1 // 0b0000010
/** backgroundColor specifically changed. */
export const BG_BIT = 1 << 2 // 0b0000100
/** Direct children added, removed, or reordered. */
export const CHILDREN_BIT = 1 << 3 // 0b0001000
/** This node or any descendant has dirty content/layout. */
export const SUBTREE_BIT = 1 << 4 // 0b0010000
/** Absolute-positioned child had structural changes. */
export const ABS_CHILD_BIT = 1 << 5 // 0b0100000
/** Descendant overflow changed. */
export const DESC_OVERFLOW_BIT = 1 << 6 // 0b1000000

/** All reconciler-owned bits (content + styleProps + bg + children + subtree). */
export const ALL_RECONCILER_BITS =
  CONTENT_BIT | STYLE_PROPS_BIT | BG_BIT | CHILDREN_BIT | SUBTREE_BIT

/** All bits combined. */
export const ALL_BITS =
  CONTENT_BIT |
  STYLE_PROPS_BIT |
  BG_BIT |
  CHILDREN_BIT |
  SUBTREE_BIT |
  ABS_CHILD_BIT |
  DESC_OVERFLOW_BIT

// ============================================================================
// Epoch Ownership
// ============================================================================

/**
 * The render epoch for ONE tree. Every node in a tree shares its owner, and no
 * two trees ever share one — that is the whole point (see the module header).
 *
 * Held by the reconciler `Container` and reachable from any node as
 * `node.epochOwner`, so the O(1) dirty predicates need no threaded context.
 */
export interface EpochOwner {
  /** Incremented once per completed render pass of the owning tree. */
  epoch: number
}

/** Create the epoch state for a new render tree. */
export function createEpochOwner(): EpochOwner {
  return { epoch: 0 }
}

/**
 * The subset of `AgNode` the epoch helpers touch. Declared structurally so the
 * helpers stay usable from the handful of places that build node literals
 * without importing the full `AgNode` type.
 */
export interface EpochNode {
  epochOwner: EpochOwner
  dirtyBits: number
  dirtyEpoch: number
}

// ============================================================================
// Epoch Access
// ============================================================================

/**
 * Current epoch of the tree `node` belongs to. Use this to stamp a field that
 * should read as "changed during the frame being built" — `dirtyEpoch` and
 * `layoutChangedThisFrame` are the two.
 */
export function getRenderEpoch(node: { epochOwner: EpochOwner }): number {
  return node.epochOwner.epoch
}

/**
 * Advance the owning tree's render epoch. Called once at the end of each render
 * pass. Every node stamped with the old epoch instantly becomes "not dirty" —
 * and nodes of OTHER trees are untouched, which is the invariant that keeps
 * concurrent renderers from erasing each other's pending work.
 */
export function advanceRenderEpoch(node: { epochOwner: EpochOwner }): void {
  node.epochOwner.epoch++
}

/**
 * Check an epoch stamp against the current epoch of `node`'s tree (i.e. "was
 * this stamped during the frame being built"). `INITIAL_EPOCH` never matches.
 */
export function isCurrentEpoch(node: { epochOwner: EpochOwner }, epoch: number): boolean {
  return epoch === node.epochOwner.epoch
}

// ============================================================================
// Bit-Packed Dirty Flag Helpers
// ============================================================================

/**
 * Check if a specific dirty bit is set for the current epoch.
 * Returns true if the node's stamp is current AND the bit is set.
 */
export function isDirty(node: EpochNode, bit: number): boolean {
  return node.dirtyEpoch === node.epochOwner.epoch && (node.dirtyBits & bit) !== 0
}

/**
 * Check if ANY dirty bit is set for the current epoch.
 */
export function isAnyDirty(node: EpochNode): boolean {
  return node.dirtyEpoch === node.epochOwner.epoch && node.dirtyBits !== 0
}

/**
 * Add dirty bits to a node and stamp it for the current epoch. When the node's
 * stamp is from an already-consumed epoch its old bits are dropped rather than
 * merged — they describe a frame that has already been rendered.
 */
export function markDirty(node: EpochNode, bits: number): void {
  const epoch = node.epochOwner.epoch
  node.dirtyBits = node.dirtyEpoch !== epoch ? bits : node.dirtyBits | bits
  node.dirtyEpoch = epoch
}

/**
 * Replace a node's dirty bits outright and stamp it for the current epoch.
 * Use when the caller means "exactly these bits", not "also these bits".
 */
export function setDirty(node: EpochNode, bits: number): void {
  node.dirtyBits = bits
  node.dirtyEpoch = node.epochOwner.epoch
}
