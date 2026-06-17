import type { TerminalBuffer } from "./buffer"
import {
  type CursorRect,
  computeContentRect,
  findActiveCursorRectWithProvenance,
} from "@silvery/ag/layout-signals"
import { findActiveCursorNode } from "./caret-style"
import { ANSI } from "./output"
import type {
  OutputCompositorCaret,
  OutputCursorBounds,
  OutputCursorTarget,
} from "./cursor-diagnostics"
import { isStrictEnabled } from "./strict-mode"
import { IncrementalRenderMismatchError } from "./errors"
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

/** SILVERY_STRICT slug for the managed-caret overlay-residue check. */
export const CARET_OVERLAY_STRICT_SLUG = "cursor"
export const CARET_OVERLAY_STRICT_MIN_TIER = 2

/** Just the cell coordinates — all the overlay-clear logic needs. */
type CaretCell = { x: number; y: number } | null

function sameCaretCell(a: CaretCell, b: CaretCell): boolean {
  if (a === null || b === null) return a === b
  return a.x === b.x && a.y === b.y
}

/**
 * Clear a prior frame's composited-caret overlay from a STATIC row.
 *
 * `composeManagedCaret`'s two paths are asymmetric about dirty rows: the PAINT
 * path calls `markAllRowsDirty()` (so a freshly-painted caret is always
 * diffed), but the NO-CARET early-return hands back the source buffer untouched.
 * When a caret that was painted at cell C in frame N is suppressed or moves to a
 * different cell in frame N+1, and C's ROW is otherwise static (clean in the
 * incremental buffer — the reconciler only marks rows whose content changed),
 * `diffBuffers` skips that row (`if (!next.isRowDirty(y)) continue`). The frame-N
 * `inverse` cell is then never compared against the cleared frame-N+1 buffer, so
 * the reverse-video block strands on screen with NO `?25h`/CUP — the
 * @km/code/v0.2/19702 cursor-above-composer signature.
 *
 * Fix: mark EXACTLY the prior caret's row dirty in the presentation buffer the
 * caller will diff+store, so `diffBuffers` re-scans it and emits the cleared
 * cell. We never call `markAllRowsDirty` (that would re-diff every static
 * transcript row each frame — the incremental-perf regression the dirty-row gate
 * exists to prevent). We touch one row, only when the caret actually left it.
 *
 * Buffer ownership: when the current frame composited NO caret (or composited
 * one on a DIFFERENT buffer), `presentationBuffer` may be the caller's untouched
 * source buffer (the documented `composeManagedCaret` no-clone contract). To
 * honour "the source buffer stays untouched", we clone before marking in that
 * case and return the clone. When the PAINT path already cloned, we mutate that
 * clone in place (it is already the caller's diff baseline).
 */
function clearPriorCaretOverlay(
  presentationBuffer: TerminalBuffer,
  sourceBuffer: TerminalBuffer,
  currentCaret: CaretCell,
  prevCaret: CaretCell,
): TerminalBuffer {
  // Nothing to clear: no prior caret, or the caret stayed on the same cell
  // (the PAINT path's markAllRowsDirty already covers an in-place repaint).
  if (prevCaret === null) return presentationBuffer
  if (sameCaretCell(prevCaret, currentCaret)) return presentationBuffer
  if (prevCaret.y < 0 || prevCaret.y >= presentationBuffer.height) return presentationBuffer

  // If the prior caret's row is already dirty (e.g. the PAINT path marked all
  // rows, or the app re-rendered that row), the diff will clear it for free.
  if (presentationBuffer.isRowDirty(prevCaret.y)) return presentationBuffer

  // The row is static (clean) — diffBuffers would skip it and strand the prior
  // inverse cell. Make the row dirty so the diff re-scans and clears it.
  const buf = presentationBuffer === sourceBuffer ? presentationBuffer.clone() : presentationBuffer
  buf.markRowDirty(prevCaret.y)
  return buf
}

/**
 * STRICT (tier 2, slug `cursor`) — managed-caret overlay-residue invariant.
 *
 * After a frame whose composited caret left cell C (suppressed or moved), C's
 * row in the presentation buffer the caller diffs MUST be dirty — otherwise
 * `diffBuffers` skips it and the prior `inverse` overlay strands (the
 * @km/code/v0.2/19702 signature). This is the overlay-layer analogue of
 * `strict-residue.ts` (which runs BELOW the caret overlay, in the render phase,
 * and so cannot see this). Fires only under `SILVERY_STRICT=cursor` / tier ≥ 2.
 */
function verifyNoCaretOverlayResidue(
  presentationBuffer: TerminalBuffer,
  currentCaret: CaretCell,
  prevCaret: CaretCell,
): void {
  if (!isStrictEnabled(CARET_OVERLAY_STRICT_SLUG, CARET_OVERLAY_STRICT_MIN_TIER)) return
  if (prevCaret === null) return
  if (sameCaretCell(prevCaret, currentCaret)) return
  if (prevCaret.y < 0 || prevCaret.y >= presentationBuffer.height) return
  if (presentationBuffer.isRowDirty(prevCaret.y)) return

  throw new IncrementalRenderMismatchError(
    `STRICT caret-overlay residue: prior composited caret at (${prevCaret.x},${prevCaret.y}) ` +
      `left the row, but row ${prevCaret.y} is CLEAN in the presentation buffer.\n` +
      `  diffBuffers skips clean rows, so the prior frame's reverse-video (inverse)\n` +
      `  overlay cell at (${prevCaret.x},${prevCaret.y}) will NOT be cleared — it strands\n` +
      `  on screen with no ?25h/CUP. This is the @km/code/v0.2/19702\n` +
      `  cursor-above-composer mechanism.\n` +
      `  current caret: ${currentCaret ? `(${currentCaret.x},${currentCaret.y})` : "none (suppressed)"}\n` +
      `  Fix: clearPriorCaretOverlay must mark the prior caret's row dirty.\n` +
      `  Slug: SILVERY_STRICT=${CARET_OVERLAY_STRICT_SLUG} (tier ${CARET_OVERLAY_STRICT_MIN_TIER}+).`,
  )
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
 * @param opts.prevCaret - the `compositorCaret` THIS function returned for the
 *   PREVIOUS frame (the caller stores it across frames). When the caret leaves a
 *   cell whose row is otherwise static, the prior cell's row is made dirty in the
 *   returned `presentationBuffer` so `diffBuffers` clears the stale `inverse`
 *   overlay (the @km/code/v0.2/19702 fix — see `clearPriorCaretOverlay`). All
 *   three render entry points pass this; omitting it disables the overlay-clear
 *   (correct only for single-frame callers with no prev buffer).
 * @returns everything every call site needs: the presentation buffer to diff +
 *   store, the cursor-control suffix, and the full diagnostic payload. The
 *   caller stores `compositorCaret` and passes it back as `prevCaret` next frame.
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
  opts?: { legacyCursor?: CursorRect | null; prevCaret?: OutputCompositorCaret | null },
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

  // ONE tree walk resolves the active cursor rect AND its provenance. The
  // suppression decision below reads that provenance — it does NOT re-derive
  // focus from a second, divergent walk. (The earlier focus-gate used
  // `findActiveCursorNode`, which matches only `props.cursorOffset` and is blind
  // to `cursorActive` islands + the clip stack, so it suppressed island
  // host-carets — an inner no-parallel-derivation bug, @km/silvery/19426.)
  const active = findActiveCursorRectWithProvenance(root)
  const treeCursor = active?.rect ?? null

  // Cursor resolution priority (mirrors the scheduler's resolveActiveCursor):
  //   1. Layout-output cursor declared in the tree (Box cursorOffset OR island).
  //   2. Legacy/store cursor (useCursor() / Ink-compat) — only when the tree
  //      declares none.
  const legacyCursor = treeCursor ? null : (opts?.legacyCursor ?? null)
  const cursor = treeCursor ?? legacyCursor

  // Park bounds still come from the node walk — `cursorOwnerBounds` needs the
  // editable's content rect. This is a DIAGNOSTIC/PARK input only; it never
  // gates the visible caret (that decision is provenance-driven below), so its
  // island-blindness is harmless here.
  const activeNode = findActiveCursorNode(root)
  const bounds = cursorOwnerBounds(activeNode, cursor)

  // The @km/code/v0.2/19702 fix, now provenance-aware: composite the VISIBLE
  // caret for everything EXCEPT a non-focused declarative fallback. Suppressing
  // that one source removes the stranded inverse block several rows above the
  // prompt (an active-turn composer / passive transcript editable still
  // reporting `cursorOffset.visible`). Focused-declarative carets, `cursorActive`
  // island host-carets (@km/silvery/19426), and explicit legacy/imperative
  // cursors (useCursor / Ink-compat — no focus node) all still composite. The
  // hardware cursor is parked at the editable's bounds below regardless, so a
  // dropped/overridden hide lands on a benign cell, never a dynamic
  // transcript/chrome row.
  const suppressDeclarativeFallback = active?.provenance === "declarative-fallback"
  const compositeCursor =
    legacyCursor !== null ? legacyCursor : suppressDeclarativeFallback ? null : treeCursor
  const managed = composeManagedCaret(sourceBuffer, compositeCursor)

  // Clear a prior frame's composited-caret overlay from a static row. When the
  // caret left cell C (suppressed or moved) and C's row is clean in this
  // incremental buffer, diffBuffers would skip it and strand the frame-N inverse
  // cell — the @km/code/v0.2/19702 mechanism. Mark exactly C's row dirty (never
  // all rows — that's the incremental-perf regression the dirty-row gate
  // prevents). ONE place; all three render entry points thread `prevCaret`.
  const prevCaret = opts?.prevCaret ?? null
  const presentationBuffer = clearPriorCaretOverlay(
    managed.buffer,
    sourceBuffer,
    managed.compositorCaret,
    prevCaret,
  )
  // STRICT (tier 2, slug `cursor`): the overlay-residue invariant. Verify on the
  // FINAL presentation buffer — after the clear — so a green check proves the
  // stale overlay will actually be diffed away.
  verifyNoCaretOverlayResidue(presentationBuffer, managed.compositorCaret, prevCaret)

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
    presentationBuffer,
    cursorSuffix: managedCursor.suffix,
    compositorCaret: managed.compositorCaret,
    cursorTarget,
    expectedTerminal,
    promptBounds: bounds.promptBounds,
    composerBounds: bounds.composerBounds,
  }
}
