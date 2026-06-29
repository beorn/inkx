/**
 * Tree-scoped subtree fade — POST-CONTENT pass (mirrors the backdrop pass).
 *
 * The unfocused-pane dim (`data-subtree-fade`, set by km's `PaneRoot`) fades a
 * marked subtree's cells toward the theme scrim. It uses the SAME color model
 * as the backdrop pass (`buildRectPlan` → `fadeCell`), but with tree-scoped
 * geometry: only the marked subtree dims, and a root-level overlay/dialog that
 * visually crosses the pane keeps its own colors.
 *
 * ## Why this is a post-content pass (not a during-walk paint op)
 *
 * The fade is a NON-IDEMPOTENT buffer transform: fading an already-faded cell
 * darkens it again. The original implementation applied it INSIDE the content
 * walk (`render-phase.ts` → `sink.emitFadeRegion`), which made the incremental
 * carry-forward buffer capture POST-fade pixels in `ag.ts`. A faded pane's
 * blank / inherited-bg cells are not repainted by any content op, so the next
 * frame's clone kept their already-faded value and the fade re-applied —
 * compounding one extra dim per frame. `SILVERY_STRICT` caught this as an
 * incremental≠fresh MISMATCH at a blank cell of the dimmed pane (the
 * `@si/render/20517` signature; the same compounding also showed up across the
 * fresh render's multi-pass convergence).
 *
 * The backdrop pass already solved this: snapshot the PRE-fade buffer for the
 * carry-forward, then apply the fade as a post-content pass over tree-collected
 * geometry EVERY frame, independent of which nodes the incremental walk
 * rendered. This module gives subtree fade the same invariant. `ag.ts`
 * snapshots `carryForwardBuffer = buffer.clone()` (PRE-fade) before calling
 * `applySubtreeFade`, so the carried buffer is always pre-fade and the fade is
 * recomputed (single, deterministic) each frame.
 *
 * ## Overlay exclusion — keep a crossing dialog crisp
 *
 * A root-level overlay (a `position:absolute` dialog/popover that is NOT a
 * descendant of the faded pane) can paint OVER the pane. Those cells must stay
 * crisp — a help dialog crossing the pane divider keeps one fg across the
 * boundary. The during-walk version got this for free from paint order (the
 * overlay painted after the fade). The post-content pass restores it by
 * collecting the overlay's painted regions (bg-bearing boxes + text nodes
 * inside any foreign overlay subtree) as EXCLUDE rects that
 * `realizeSubtreeFadeToBuffer` subtracts from the faded region. Transparent
 * overlay area is NOT excluded, so the faded pane still shows (faded) through a
 * modal's transparent backdrop.
 *
 * @see ./backdrop — the sibling final-buffer-rectangle fade pass this mirrors.
 * @see ./backdrop/realize-buffer.ts `realizeSubtreeFadeToBuffer` — the
 *   include-minus-exclude cell realizer.
 */

import type { AgNode, Rect } from "@silvery/ag/types"
import type { TerminalBuffer } from "../buffer"
import { buildRectPlan, type BackdropOptions, realizeSubtreeFadeToBuffer } from "./backdrop"

/** Marker prop key — a Box dims its own subtree (km `PaneRoot` sets it). */
export const SUBTREE_FADE_ATTR = "data-subtree-fade"

/**
 * Default fade amount when the marker is a presence attribute. Matches the
 * backdrop pass's `DEFAULT_AMOUNT` (0.25) so a dimmed pane and a modal backdrop
 * recede by the same calibrated amount.
 */
const DEFAULT_AMOUNT = 0.25

/**
 * Coerce a `data-subtree-fade` marker value into a fade amount in (0, 1], or
 * `null` when the marker is absent / disabled. Mirrors the backdrop pass's
 * `parseFade`.
 */
export function computeSubtreeFadeAmount(props: Record<string, unknown>): number | null {
  const raw = props[SUBTREE_FADE_ATTR]
  if (raw === undefined || raw === null || raw === false) return null
  let amount: number
  if (raw === true || raw === "") {
    amount = DEFAULT_AMOUNT
  } else if (typeof raw === "number") {
    amount = raw
  } else if (typeof raw === "string") {
    amount = Number(raw)
  } else {
    return null
  }
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.min(1, amount)
}

/**
 * Syntactic gate: does the tree contain any `data-subtree-fade` marker with a
 * positive amount? `ag.ts` uses this to decide whether to snapshot the pre-fade
 * carry-forward buffer (mirrors `hasBackdropMarkers`). Walks the tree once.
 */
export function hasSubtreeFadeMarkers(root: AgNode): boolean {
  if (computeSubtreeFadeAmount(root.props as Record<string, unknown>) !== null) return true
  for (const child of root.children) {
    if (hasSubtreeFadeMarkers(child)) return true
  }
  return false
}

/** On-screen rect for a node, preferring the post-scroll screen rect. */
function nodeScreenRect(node: AgNode): Rect | null {
  const rect = node.screenRect ?? node.scrollRect ?? node.boxRect
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  return rect
}

function cloneRect(rect: Rect): Rect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

/** A node that lifts out of normal flow and can paint over a sibling pane. */
function isOverlayNode(props: Record<string, unknown>): boolean {
  return props.position === "absolute"
}

/** Does this node paint opaque content (a bg fill) the fade must not re-tint? */
function paintsBackground(props: Record<string, unknown>): boolean {
  const bg = props.backgroundColor
  if (bg !== undefined && bg !== null && bg !== false) return true
  const theme = props.theme as Record<string, unknown> | undefined
  if (theme && (theme["bg-surface-default"] !== undefined || theme.bg !== undefined)) return true
  return false
}

interface Collected {
  readonly includes: Rect[]
  readonly amounts: number[]
  readonly excludes: Rect[]
}

/**
 * Walk the tree collecting fade-include rects (the dimmed panes) and
 * foreign-overlay exclude rects (painted regions of overlays outside any faded
 * subtree). `insideFade` tracks whether we are within a marked subtree (its
 * descendants are part of the fade — including the pane's own absolute
 * composer — and are never treated as foreign overlays). `insideForeign`
 * tracks whether we are within a foreign overlay subtree (its painted nodes
 * become excludes).
 */
function collectSubtreeFade(
  node: AgNode,
  insideFade: boolean,
  insideForeign: boolean,
  out: Collected,
): void {
  const props = node.props as Record<string, unknown>
  const rect = nodeScreenRect(node)

  if (!insideFade) {
    const amount = computeSubtreeFadeAmount(props)
    if (amount !== null) {
      if (rect !== null) {
        out.includes.push(cloneRect(rect))
        out.amounts.push(amount)
      }
      insideFade = true
    } else if (!insideForeign && isOverlayNode(props) && !hasSubtreeFadeMarkers(node)) {
      // A root-level overlay outside every faded subtree. Its painted cells
      // (collected below) stay crisp where it crosses a dimmed pane.
      // Absolute positioner wrappers that CONTAIN a faded subtree are layout
      // hosts, not foreign overlays; excluding them would subtract their own
      // dimmed descendants from the fade plan.
      insideForeign = true
    }
  }

  if (insideForeign && rect !== null && (node.type === "silvery-text" || paintsBackground(props))) {
    out.excludes.push(cloneRect(rect))
  }

  for (const child of node.children) {
    collectSubtreeFade(child, insideFade, insideForeign, out)
  }
}

/**
 * Apply the tree-scoped subtree fade to the displayed buffer in place.
 *
 * Mirrors `applyBackdrop`: collect geometry from the tree, build a rect plan
 * with the shared color model, realize it onto the buffer. Returns `true` when
 * any cell was mutated. MUST run AFTER the carry-forward snapshot in `ag.ts`
 * (the snapshot must be pre-fade).
 */
export function applySubtreeFade(
  root: AgNode,
  buffer: TerminalBuffer,
  options?: BackdropOptions,
): boolean {
  if (options?.colorLevel === "mono") return false

  const out: Collected = { includes: [], amounts: [], excludes: [] }
  collectSubtreeFade(root, false, false, out)
  if (out.includes.length === 0) return false

  // Single amount per frame (first-wins) — mirrors the backdrop single-amount
  // invariant. In practice every dimmed pane uses the same amount.
  const amount = out.amounts[0]!
  const plan = buildRectPlan(out.includes, amount, options)
  if (!plan.active) return false

  return realizeSubtreeFadeToBuffer(plan, buffer, out.excludes)
}
