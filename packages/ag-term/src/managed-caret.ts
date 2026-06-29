import type { TerminalBuffer } from "./buffer"
import {
  type CursorRect,
  computeContentRect,
  findActiveCursorRectWithProvenance,
  findActiveParkRect,
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

/**
 * Composited-caret shapes painted into the presentation buffer:
 *   - `"block"`     — filled inverse block. The focused caret (and the default).
 *   - `"underline"` — bottom rule only (a declared `cursorOffset.shape:
 *     "underline"`). Distinct from the focus state — an underline-shaped caret
 *     stays underline whenever a caret is shown at all.
 *
 * An UNFOCUSED window composites NO caret. The product contract
 * (@km/code/v0.2/19702, reframed 2026-06-18) is hide-the-cursor-COMPLETELY, not
 * the earlier 20082 hollow box — a freshly-spawned, unfocused agent pane must
 * show nothing. So there is no `"hollow"` shape: an unfocused pane returns a
 * null `compositorCaret`. The hardware cursor is parked-and-hidden regardless of
 * focus, so an unfocused pane shows nothing at all.
 */
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

/**
 * Resolve the composited caret SHAPE from the cursor's declared shape. Only ever
 * called when a caret is shown at all — i.e. the window is FOCUSED (an unfocused
 * window composites no caret; see `composeManagedCaret`).
 *
 * - A declared `shape: "underline"` wins — an underline-shaped caret is
 *   semantically distinct and stays underline.
 * - Otherwise the default filled `"block"`.
 */
function caretStyle(cursor: CursorRect): CompositedCaret["style"] {
  return cursor.shape === "underline" ? "underline" : "block"
}

/** Map a composited-caret style to the cell attributes that render it. */
function caretCellAttrs(style: CompositedCaret["style"]): {
  inverse?: boolean
  underline?: boolean
} {
  switch (style) {
    case "underline":
      return { underline: true }
    case "block":
    default:
      return { inverse: true }
  }
}

/**
 * Paint a semantic caret into a presentation buffer for managed terminal frames.
 *
 * The source buffer stays untouched. Runtime diff state stores the presentation
 * buffer so moving/hiding the caret clears the previous frame's overlay like any
 * other cell update.
 *
 * @param windowFocused - whether the terminal WINDOW is focused. An UNFOCUSED
 *   window composites NO caret (@km/code/v0.2/19702, reframed 2026-06-18: hide
 *   the cursor COMPLETELY, replacing 20082's hollow box). Defaults to `true` —
 *   a fail-safe so a single user with a focused terminal (or any caller that
 *   hasn't wired standard `?1004` focus reporting) still sees the filled block,
 *   never a vanished caret on unknown focus. For a composited caret the hardware
 *   cursor is parked-and-hidden regardless of focus (see `managedCursorSuffix`),
 *   so an unfocused pane shows nothing at all — and a dropped `?25l` cannot
 *   strand a hardware cursor. The one exception is a `cursorActive` island
 *   host-caret, shown as the real hardware cursor when the window is focused
 *   (see `computeManagedFrame` / @hab 20398).
 */
export function composeManagedCaret(
  buffer: TerminalBuffer,
  cursor: CursorRect | null,
  windowFocused = true,
): ManagedCaretFrame {
  // @km/code/v0.2/19702: an UNFOCUSED window hides the caret completely — no
  // composited overlay. (Default-true keeps a plain/unknown-focus terminal
  // visible; only a confirmed-unfocused window suppresses.)
  if (!windowFocused || !cursor?.visible || !buffer.inBounds(cursor.x, cursor.y)) {
    return { buffer, compositorCaret: null }
  }

  const next = buffer.clone()
  // Cloning intentionally drops dirty-row metadata. Mark all rows so the diff
  // compares this presentation buffer against the previous presentation buffer
  // and cannot skip unrelated app content that changed in the same frame.
  next.markAllRowsDirty()
  const style = caretStyle(cursor)
  next.mergeAttrsInRect(cursor.x, cursor.y, 1, 1, caretCellAttrs(style))
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

/**
 * STRICT (tier 2, slug `cursor`) — no-fallback park invariant.
 *
 * When an editable declares a `parkOffset` (resolved to `parkRect`) and no
 * visible caret owns the frame, the managed hardware cursor MUST park on that
 * declared cell — never `home(0,0)` or a box-origin fallback. This pins that the
 * @km/code/v0.2/19702 fix stays wired: a regression that re-introduces a
 * fallback overriding the declared park target throws HERE instead of silently
 * stranding the cursor above the prompt (the recurring #undead signature, where
 * a dropped `?25l` surfaces the mis-parked cursor). The undeclared-editable case
 * (an editable that declares NO park) has no generic runtime signal — it is
 * pinned by the composer park-target contract + the parkOffset mutation test.
 * Fires only under `SILVERY_STRICT=cursor` / tier ≥ 2.
 *
 * Exported for direct mutation-proof unit testing (the fault path can't arise
 * from the correct `managedCursorSuffix`, so the test simulates a fallback park).
 */
export function verifyParkHonorsDeclaredTarget(
  cursor: CursorRect | null,
  parkRect: Rect | null,
  parkTarget: { x: number; y: number } | null,
): void {
  if (!isStrictEnabled(CARET_OVERLAY_STRICT_SLUG, CARET_OVERLAY_STRICT_MIN_TIER)) return
  // Only meaningful when no caret owns the frame and a park target was declared.
  if (cursor !== null || parkRect === null) return
  if (parkTarget !== null && parkTarget.x === parkRect.x && parkTarget.y === parkRect.y) return

  throw new IncrementalRenderMismatchError(
    `STRICT no-fallback park: parkOffset declared at (${parkRect.x},${parkRect.y}) and no caret ` +
      `owns the frame, but the hardware cursor parked at ` +
      `${parkTarget ? `(${parkTarget.x},${parkTarget.y})` : "none"} instead.\n` +
      `  A managed frame MUST park on the editable's declared input cell — never a\n` +
      `  box-origin / home(0,0) fallback. A dropped ?25l would then strand the cursor off\n` +
      `  the prompt — the @km/code/v0.2/19702 cursor-above-composer mechanism.\n` +
      `  Fix: managedCursorSuffix must honor findActiveParkRect's result.\n` +
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
 *   2. The editable's DECLARED input-cell park target (`parkOffset`, resolved by
 *      `findActiveParkRect`) — present even when the editable is unfocused/idle,
 *      so a dropped hide surfaces the cursor ON the prompt input cell.
 *   3. Home (0,0) — last resort, ONLY for a frame with no editable/park declarer
 *      at all (no input locus to be "above"). Never a dynamic transcript/chrome
 *      row.
 *
 * The earlier composer-ORIGIN fallback (the editable's box top/border row — one
 * cell ABOVE the `>` prompt) is DELETED: it was the @km/code/v0.2/19702
 * bug-masking fallback (a multiplexer dropping `?25l` surfaced the parked cursor
 * one row above the prompt). Per Fail-Loud / no-defensive-fallbacks, a present
 * editable now declares its input cell via `parkOffset` instead of relying on a
 * silent box-origin degrade.
 */
export function managedCursorSuffix(
  cursor: CursorRect | null,
  parkRect: Rect | null,
  opts?: { visible?: boolean },
): ManagedCursorControls {
  const park =
    cursor !== null
      ? { x: cursor.x, y: cursor.y }
      : parkRect !== null
        ? { x: parkRect.x, y: parkRect.y }
        : { x: 0, y: 0 }
  // Default: park-then-HIDE (@km/code/v0.2/19702 anti-stranding). A `cursorActive`
  // island host-caret (@km/silvery/19426) instead parks-then-SHOWS — the focused
  // guest terminal's real cursor is the one hardware cursor we deliberately leave
  // visible. Parking first means a shown cursor lands exactly on the guest cell.
  const tail = opts?.visible === true ? ANSI.CURSOR_SHOW : ANSI.CURSOR_HIDE
  return {
    suffix: ANSI.moveCursor(park.x, park.y) + tail,
    parkTarget: park,
  }
}

/**
 * Transport-safe managed cursor delivery.
 *
 * The semantic suffix is still "park then hide" (`managedCursorSuffix` above).
 * Output paths append this idempotent SGR reset after it so the managed cursor
 * controls are not the literal trailing run of cursor-control bytes. That keeps
 * multiplexers that drop a trailing cursor-control tail from peeling the park
 * move away from the content frame that required it.
 */
export function protectManagedCursorSuffix(cursorSuffix: string): string {
  return cursorSuffix.length === 0 ? "" : cursorSuffix + ANSI.RESET
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
 * @param opts.windowFocused - whether the terminal WINDOW is focused
 *   (@km/code/v0.2/19702, reframed). `true`/omitted → filled inverse block;
 *   `false` → NO caret composited (hidden completely — the pane shows nothing).
 *   The hardware cursor is parked-and-hidden in BOTH states. All three render
 *   entry points read their shared window-focus signal (standard DEC `?1004`
 *   focus reporting) and pass it here; omitting it is the fail-safe focused
 *   default (a single user with a focused terminal that never emits focusIn must
 *   still see the caret).
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
  opts?: {
    legacyCursor?: CursorRect | null
    prevCaret?: OutputCompositorCaret | null
    windowFocused?: boolean
  },
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
  // @km/code/v0.2/20082: the window-focus state selects the caret SHAPE (filled
  // block when focused, hidden when unfocused). Default focused — the fail-safe so
  // unknown focus never yields a hidden caret.
  const windowFocused = opts?.windowFocused ?? true

  // @km/silvery/19426 / @hab/.../20398 — island host-caret. A `cursorActive`
  // island is a REAL guest terminal (a shell PTY, an embedded app) whose guest
  // cursor must render as the host HARDWARE caret: a real, VISIBLE cursor at the
  // guest cell (like the focused pane of a terminal multiplexer). The 19702
  // managed model — composite an inverse block + park-and-HIDE the hardware cursor
  // (`?25l`) — is correct for silvery's OWN declarative editables, whose "caret" is
  // painted content with no real hardware cursor to show. Lumping islands into it
  // published the focused shell's guest cursor as a HIDDEN hardware cursor — the
  // "focused shell has no cursor" recurrence (20398). So an island host-caret is
  // shown as the hardware cursor instead, gated on window focus (an unfocused
  // window shows nothing). The island block in `findActiveCursorRect` already
  // gates on the guest's own `cursorVisible`, so an island provenance here means
  // the guest wants its cursor shown.
  const islandHardwareCursor =
    active?.provenance === "island" && windowFocused && treeCursor?.visible === true

  // Composite the VISIBLE inverse caret for everything EXCEPT (a) a non-focused
  // declarative fallback (@km/code/v0.2/19702) and (b) an island host-caret, which
  // is shown as a real hardware cursor below — compositing an inverse block on top
  // of it would double the caret.
  const compositeCursor =
    legacyCursor !== null
      ? legacyCursor
      : islandHardwareCursor || suppressDeclarativeFallback
        ? null
        : treeCursor
  const managed = composeManagedCaret(sourceBuffer, compositeCursor, windowFocused)

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

  // Hardware-cursor park target: caret cell when a caret exists, else the
  // editable's DECLARED input-cell park (`parkOffset`, present even unfocused/
  // idle), else home for an editable-less frame. Parking is a SAFETY net for a
  // dropped `?25l`, so it runs even when the visible caret is suppressed. The
  // park is resolved NON-focus-gated so an unfocused/idle composer still parks
  // on its prompt cell (@km/code/v0.2/19702 — replaces the box-origin fallback
  // that stranded the cursor one row above the prompt).
  const parkRect = findActiveParkRect(root)
  // Island host-caret → park at the guest cell and leave the hardware cursor
  // VISIBLE (`?25h`): the focused guest terminal's real cursor is the one hardware
  // cursor we deliberately show. Every other managed frame parks-then-HIDES
  // (`?25l`) — the 19702 anti-stranding safety net.
  const managedCursor = managedCursorSuffix(cursor, parkRect, { visible: islandHardwareCursor })
  // STRICT (tier 2, slug `cursor`): the no-fallback park invariant — a declared
  // parkOffset MUST be honored, never overridden by a box-origin/home fallback.
  verifyParkHonorsDeclaredTarget(cursor, parkRect, managedCursor.parkTarget)

  let cursorTarget: OutputCursorTarget | null = null
  let expectedTerminal: OutputCursorTarget | null = null
  if (cursor) {
    cursorTarget = { x: cursor.x, y: cursor.y, visible: cursor.visible, shape: cursor.shape }
    // The island host-caret is the one managed frame that leaves the hardware
    // cursor VISIBLE; every other managed frame hides it.
    expectedTerminal = { ...cursorTarget, visible: islandHardwareCursor }
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
