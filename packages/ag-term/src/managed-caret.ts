import type { TerminalBuffer } from "./buffer"
import { type CursorRect, computeContentRect } from "@silvery/ag/layout-signals"
import { ANSI } from "./output"
import type { AgNode, Rect } from "@silvery/ag/types"

export interface CompositedCaret {
  x: number
  y: number
  visible: boolean
  style: "block" | "underline"
}

export interface ManagedCaretFrame {
  buffer: TerminalBuffer
  compositorCaret: CompositedCaret | null
}

export interface CursorOwnerBounds {
  promptBounds: Rect | null
  composerBounds: Rect | null
}

function caretStyle(cursor: CursorRect): "block" | "underline" {
  return cursor.shape === "underline" ? "underline" : "block"
}

/**
 * Paint a semantic caret into a presentation buffer for managed terminal frames.
 *
 * The source buffer stays untouched. Runtime diff state stores the presentation
 * buffer so moving/hiding the caret clears the previous frame's overlay like any
 * other cell update.
 */
export function composeManagedCaret(
  buffer: TerminalBuffer,
  cursor: CursorRect | null,
): ManagedCaretFrame {
  if (!cursor?.visible || !buffer.inBounds(cursor.x, cursor.y)) {
    return { buffer, compositorCaret: null }
  }

  const next = buffer.clone()
  // Cloning intentionally drops dirty-row metadata. Mark all rows so the diff
  // compares this presentation buffer against the previous presentation buffer
  // and cannot skip unrelated app content that changed in the same frame.
  next.markAllRowsDirty()
  const style = caretStyle(cursor)
  next.mergeAttrsInRect(
    cursor.x,
    cursor.y,
    1,
    1,
    style === "underline" ? { underline: true } : { inverse: true },
  )
  return {
    buffer: next,
    compositorCaret: {
      x: cursor.x,
      y: cursor.y,
      visible: true,
      style,
    },
  }
}

export function cursorOwnerBounds(
  activeNode: AgNode | null,
  cursor: CursorRect | null,
): CursorOwnerBounds {
  return {
    // Silvery core does not know an app's prompt string. The semantic cursor
    // cell is the targetable prompt/caret locus available at this layer.
    promptBounds: cursor ? { x: cursor.x, y: cursor.y, width: 1, height: 1 } : null,
    composerBounds: activeNode ? computeContentRect(activeNode) : null,
  }
}

export interface ManagedCursorControls {
  /** ANSI suffix: park the hardware cursor at a safe cell, then hide it. */
  suffix: string
  /** Where the hardware cursor was parked (0-indexed), or null when no park. */
  parkTarget: { x: number; y: number } | null
}

/**
 * Compute the trailing cursor-control bytes for a managed fullscreen frame.
 *
 * The visible caret is painted into the presentation buffer by
 * `composeManagedCaret`, so the hardware cursor's only job is to stay OUT of
 * the way: every managed frame moves it to a deterministic safe cell and hides
 * it. Parking-before-hide is load-bearing because a multiplexer/terminal can
 * drop or override `?25l` (cmux re-shows the focused pane's cursor; an
 * unfocused pane renders a hollow cursor). If we hide WITHOUT moving, the
 * hardware cursor stays wherever the diff's last content write landed — the
 * bottom-most painted row — and a dropped hide leaves a visible cursor
 * stranded in transcript/activity/chrome content (the recurring
 * @km/code/v0.2/19702 signature, e.g. a block on the `Codex Done …` status
 * row). Parking pins that worst case to a benign, predictable cell instead.
 *
 * Park priority:
 *   1. The active caret cell — when a caret exists, the hardware cursor and the
 *      composited caret coincide, so a dropped hide just overlaps the caret.
 *   2. The composer/editable content origin — when an editable owns the frame
 *      but its caret is hidden (selection active, disabled), park where a cursor
 *      conceptually belongs.
 *   3. Home (0,0) — last resort. Never a dynamic transcript/chrome row.
 */
export function managedCursorSuffix(
  cursor: CursorRect | null,
  bounds: CursorOwnerBounds,
): ManagedCursorControls {
  const park =
    cursor !== null
      ? { x: cursor.x, y: cursor.y }
      : bounds.composerBounds
        ? { x: bounds.composerBounds.x, y: bounds.composerBounds.y }
        : { x: 0, y: 0 }
  return {
    suffix: ANSI.moveCursor(park.x, park.y) + ANSI.CURSOR_HIDE,
    parkTarget: park,
  }
}
