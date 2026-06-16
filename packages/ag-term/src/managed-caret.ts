import type { TerminalBuffer } from "./buffer"
import {
  type CursorRect,
  computeContentRect,
  findActiveCursorRect,
} from "@silvery/ag/layout-signals"
import { findActiveCursorNode } from "./caret-style"
import { ANSI } from "./output"
import type {
  OutputCompositorCaret,
  OutputCursorBounds,
  OutputCursorTarget,
} from "./cursor-diagnostics"
import type { AgNode, BoxProps, Rect } from "@silvery/ag/types"

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

/**
 * Is this the cursor of a FOCUSED editable?
 *
 * The composited (visible inverse) caret is an editing affordance — it belongs
 * to whatever the focus system says is focused. A non-focused cursor declarer
 * is one of two things, neither of which should paint a visible block into the
 * presentation buffer:
 *
 *   - an editable that LOST focus (e.g. silvery `TextInput` keeps
 *     `cursorOffset.visible = isActive`, and `isActive` defaults to `true`, so a
 *     mounted-but-unfocused composer/transcript input still declares a visible
 *     cursor while a turn runs); or
 *   - the Ink-compat / `useCursor()` fallback — which renders its OWN hardware
 *     cursor through `ink-render.ts`, NOT through `composeManagedCaret`.
 *
 * Mirrors `resolveCaretStyle`'s focus gate (caret-style.ts): a bar/I-beam shape
 * is emitted only for a focused owner; everything else defers. This keeps the
 * managed-frame visible caret and the DECSCUSR shape on the same focus rule.
 */
function isFocusedCursorOwner(node: AgNode | null): boolean {
  if (!node) return false
  const props = node.props as BoxProps | undefined
  return props?.focused === true || node.interactiveState?.focused === true
}

/**
 * The single source of truth for managed-frame cursor handling.
 *
 * Three render entry points (`scheduler.ts`, `runtime/create-runtime.ts`,
 * `runtime/create-app.tsx`) previously hand-duplicated the same four-step
 * derivation (find active cursor rect → find active node → owner bounds →
 * composite caret + park/hide suffix). The copies drifted: the
 * @km/code/v0.2/19702 fixes patched one copy at a time, so the live path always
 * lagged a fix. `computeManagedFrame` collapses all four steps into ONE
 * function — changing the policy is now a single edit, and a regression cannot
 * hide in an uncovered copy (`docs/lessons/no-parallel-derivation.md`).
 *
 * **Policy (the @km/code/v0.2/19702 fix):** paint the visible inverse caret into
 * the presentation buffer ONLY when a FOCUSED editable owns the active cursor.
 * During an active turn nothing is focused, so a non-focused fallback declarer
 * (the unfocused composer, or a transcript editable still reporting
 * `cursorOffset.visible`) gets NO composited caret — eliminating the stranded
 * reverse-video block several rows above the prompt. The hardware cursor is
 * still parked at the editable's bounds (then hidden), so a dropped/overridden
 * `?25l` cannot strand a hollow hardware cursor in transcript/chrome either.
 *
 * @param sourceBuffer - the freshly-rendered content buffer (left untouched).
 * @param root - the AgNode tree (the `buffer.nodes` / `this.root` the caller holds).
 * @param mode - only `"fullscreen"` paints a managed caret; `"inline"` positions
 *   the cursor inside the diff output and returns an empty managed frame.
 * @param opts.legacyCursor - the resolved legacy/store cursor
 *   (`useCursor()` / Ink-compat `setCursorPosition()`), used ONLY when no node
 *   in the tree declares a layout-output `cursorOffset`. This imperative cursor
 *   is an explicit "show a caret here" request with no focus node, so it is
 *   composited unconditionally (it is NOT focus-gated — that gate exists to
 *   suppress passive declarative fallbacks, not explicit imperative cursors).
 *   The scheduler passes this; `createRuntime`/`createApp` do not (they have no
 *   store-cursor path).
 * @returns everything every call site needs: the presentation buffer to diff +
 *   store, the cursor-control suffix, and the full diagnostic payload.
 */
export interface ManagedFrame {
  /**
   * The buffer the terminal actually shows this frame. Equals `sourceBuffer`
   * when no caret is composited (same reference — callers can `===`-compare to
   * detect the no-op case). Callers MUST store THIS as their diff baseline so
   * the next frame clears a moved/removed caret.
   */
  presentationBuffer: TerminalBuffer
  /** Trailing cursor-control bytes: park the hardware cursor, then hide it. */
  cursorSuffix: string
  /** The composited caret painted into `presentationBuffer`, or null. */
  compositorCaret: OutputCompositorCaret | null
  /** Semantic cursor target (where a hardware cursor WOULD go), or null. */
  cursorTarget: OutputCursorTarget | null
  /** What the terminal cursor should be after the frame (always hidden), or null. */
  expectedTerminal: OutputCursorTarget | null
  /** The prompt/caret single-cell locus, for diagnostics. */
  promptBounds: OutputCursorBounds | null
  /** The editable content rect that owns the frame, for diagnostics. */
  composerBounds: OutputCursorBounds | null
}

export function computeManagedFrame(
  sourceBuffer: TerminalBuffer,
  root: AgNode,
  mode: "fullscreen" | "inline",
  opts?: { legacyCursor?: CursorRect | null },
): ManagedFrame {
  // Inline mode never paints a managed caret — the diff output positions the
  // cursor itself (see output-phase.ts inlineCursorSuffix).
  if (mode !== "fullscreen") {
    return {
      presentationBuffer: sourceBuffer,
      cursorSuffix: "",
      compositorCaret: null,
      cursorTarget: null,
      expectedTerminal: null,
      promptBounds: null,
      composerBounds: null,
    }
  }

  const treeCursor = findActiveCursorRect(root)
  const activeNode = findActiveCursorNode(root)

  // Cursor resolution priority (mirrors the scheduler's resolveActiveCursor):
  //   1. Layout-output cursor declared by a Box `cursorOffset` in the tree.
  //   2. Legacy/store cursor (useCursor() / Ink-compat) — only when the tree
  //      declares none.
  const legacyCursor = treeCursor ? null : (opts?.legacyCursor ?? null)
  const cursor = treeCursor ?? legacyCursor
  const bounds = cursorOwnerBounds(activeNode, cursor)

  // The @km/code/v0.2/19702 fix: composite the VISIBLE caret only for a focused
  // editable. A non-focused declarative fallback (active-turn composer, passive
  // transcript editable) must NOT strand an inverse cell in the transcript. An
  // explicit legacy/store cursor is exempt — it is an imperative "show a caret
  // here" request with no focus node (Ink-compat / useCursor). The hardware
  // cursor is still parked at the editable's bounds below, so a dropped/
  // overridden hide lands on a benign cell, never a dynamic transcript/chrome
  // row.
  const compositeCursor =
    legacyCursor !== null ? legacyCursor : isFocusedCursorOwner(activeNode) ? treeCursor : null
  const managed = composeManagedCaret(sourceBuffer, compositeCursor)

  // Hardware-cursor park target: always the editable's locus (caret cell when a
  // caret exists, else composer origin, else home), independent of whether we
  // composited a visible caret. Parking is a SAFETY net for dropped `?25l`, so
  // it must run even when the caret is suppressed.
  const managedCursor = managedCursorSuffix(cursor, bounds)

  let cursorTarget: OutputCursorTarget | null = null
  let expectedTerminal: OutputCursorTarget | null = null
  if (cursor) {
    cursorTarget = { x: cursor.x, y: cursor.y, visible: cursor.visible, shape: cursor.shape }
    expectedTerminal = { ...cursorTarget, visible: false }
  } else if (managedCursor.parkTarget) {
    expectedTerminal = { ...managedCursor.parkTarget, visible: false }
  }

  return {
    presentationBuffer: managed.buffer,
    cursorSuffix: managedCursor.suffix,
    compositorCaret: managed.compositorCaret,
    cursorTarget,
    expectedTerminal,
    promptBounds: bounds.promptBounds,
    composerBounds: bounds.composerBounds,
  }
}
