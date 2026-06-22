/**
 * Create the silvery-loop runtime kernel.
 *
 * The runtime owns the event loop, diffing, and output. Users interact via:
 * - events() - AsyncIterable of all events (keys, resize, effects)
 * - schedule() - Queue effects for async execution
 * - render() - Output a buffer (diffing handled internally)
 *
 * NOTE: This runtime is designed for single-consumer use. Calling events()
 * multiple times concurrently will cause events to be split between consumers.
 * Each call returns a fresh AsyncIterable, but they share the underlying queue.
 *
 * @example
 * ```typescript
 * using runtime = createRuntime({ target: termTarget })
 *
 * for await (const event of runtime.events()) {
 *   state = reducer(state, event)
 *   runtime.render(layout(view(state), runtime.getDims()))
 * }
 * ```
 */

import { createOutputPhase } from "../pipeline/output-phase"
import { takeUntil } from "@silvery/create/streams"
import { diff } from "./diff"
import type { Buffer, Dims, Event, Runtime, RuntimeOptions } from "./types"
import {
  recordOutputCursorDiagnostics,
  type OutputCompositorCaret,
  type OutputCursorBounds,
  type OutputCursorTarget,
  type PrevPresentation,
} from "../cursor-diagnostics"
import { ANSI } from "../output"
import { computeManagedFrame } from "../managed-caret"
// Side-effect import: install the terminal wrap-measurer adapter into
// `@silvery/ag`'s registry the moment a runtime is constructed. The
// registration itself is idempotent (see ./wrap-measurer-registration.ts);
// re-import here keeps the production `createRuntime` path armed even
// when callers bypass `runtime/index.ts`.
import "./wrap-measurer-registration"

// =============================================================================
// Event Channel - unified async iterable for all internal events
// =============================================================================

function buffersHaveSameVisibleCells(prev: Buffer, next: Buffer): boolean {
  const prevBuffer = prev._buffer
  const nextBuffer = next._buffer
  if (prevBuffer.width !== nextBuffer.width || prevBuffer.height !== nextBuffer.height) {
    return false
  }
  const minRow = nextBuffer.minDirtyRow
  if (minRow < 0) return true
  const maxRow = Math.min(nextBuffer.maxDirtyRow, nextBuffer.height - 1)
  for (let y = minRow; y <= maxRow; y++) {
    if (!nextBuffer.isRowDirty(y)) continue
    if (
      !nextBuffer.rowMetadataEquals(y, prevBuffer) ||
      !nextBuffer.rowCharsEquals(y, prevBuffer) ||
      !nextBuffer.rowExtrasEquals(y, prevBuffer)
    ) {
      return false
    }
  }
  return true
}

interface EventChannel {
  push(event: Event): void
  events(): AsyncIterable<Event>
  dispose(): void
}

/**
 * Create an event channel that bridges callbacks to AsyncIterable.
 *
 * This is the single point where callbacks (resize, effect completion)
 * are converted to the async iterable pattern. External sources like
 * keyboard events are already AsyncIterable and merged at a higher level.
 */
function createEventChannel(signal: AbortSignal): EventChannel {
  const queue: Event[] = []
  let pendingResolve: ((event: Event | null) => void) | undefined
  let disposed = false

  // Resolve pending waiter on abort
  const onAbort = () => {
    if (pendingResolve) {
      pendingResolve(null)
      pendingResolve = undefined
    }
  }
  signal.addEventListener("abort", onAbort, { once: true })

  return {
    push(event: Event): void {
      if (disposed || signal.aborted) return

      if (pendingResolve) {
        const r = pendingResolve
        pendingResolve = undefined
        r(event)
      } else {
        queue.push(event)
      }
    },

    events(): AsyncIterable<Event> {
      return {
        [Symbol.asyncIterator](): AsyncIterator<Event> {
          return {
            async next(): Promise<IteratorResult<Event>> {
              if (disposed || signal.aborted) {
                return { done: true, value: undefined }
              }

              // Return queued event if available
              if (queue.length > 0) {
                return { done: false, value: queue.shift()! }
              }

              // Wait for next event or abort
              const event = await new Promise<Event | null>((resolve) => {
                pendingResolve = resolve
              })

              if (event === null || disposed || signal.aborted) {
                return { done: true, value: undefined }
              }

              return { done: false, value: event }
            },
          }
        },
      }
    },

    dispose(): void {
      disposed = true
      signal.removeEventListener("abort", onAbort)
      if (pendingResolve) {
        pendingResolve(null)
        pendingResolve = undefined
      }
    },
  }
}

/**
 * Auto-wrap fullscreen frames at or above this many output bytes in DEC 2026
 * synchronized-output markers, so the terminal composites the whole repaint
 * atomically (no visible tear/flicker). See km bead 19633-output-flicker.
 *
 * Why a byte threshold (not always-on): older Ghostty builds corrupt
 * *incremental cursor-positioned* updates inside a sync region. Those are the
 * tiny diffs — dogfood captures show p50 ≈ 66 B, p90 ≈ 636 B — which stay
 * unwrapped here and avoid the caveat. The frames that visibly flicker are the
 * large ones: streaming/scroll diffs that repaint most of a pane (~7k changed
 * cells ≈ 20 KB) and full-screen first renders. 2 KB sits well above the
 * incremental-diff range and clearly inside "large repaint" territory.
 */
const LARGE_FULLSCREEN_SYNC_BYTES = 2048

// =============================================================================
// Runtime Factory
// =============================================================================

/**
 * Create a runtime kernel.
 *
 * @param options Runtime configuration
 * @returns Runtime instance implementing Symbol.dispose
 */
export function createRuntime(options: RuntimeOptions): Runtime {
  const { target, signal: externalSignal, mode = "fullscreen" } = options
  const syncUpdate = mode === "fullscreen" && options.syncUpdate === true
  // Window-focus reader (@km/code/v0.2/20082) — selects the caret shape each
  // frame. Default focused (fail-safe) when the host doesn't wire it.
  const readWindowFocused = options.windowFocused ?? (() => true)

  // Inline mode needs persistent cursor tracking across frames.
  // If no outputPhaseFn provided, create one so prevCursorRow/prevOutputLines
  // persist between renders (bare diff() creates fresh state each call).
  const fallbackOutputPhase = mode === "inline" ? createOutputPhase({}) : undefined
  let outputPhaseFn = options.outputPhaseFn ?? fallbackOutputPhase

  // Internal abort controller for cleanup
  const controller = new AbortController()
  const signal = controller.signal

  // Wire external signal if provided - track for cleanup
  let externalAbortHandler: (() => void) | undefined
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalAbortHandler = () => controller.abort()
      externalSignal.addEventListener("abort", externalAbortHandler, {
        once: true,
      })
    }
  }

  // Track the previous presentation buffer for diffing, bundled with the
  // composited caret painted into it (managed-caret.ts). The caret is threaded
  // back into `computeManagedFrame` so a caret that moves off / is suppressed on
  // a static row gets that row marked dirty and the stale `inverse` overlay
  // cleared — the @km/code/v0.2/19702 overlay-residue fix. Buffer and caret live
  // in one struct so they cannot desync: every write sets both in a single
  // assignment (including the zero-diff early-return, which stores a presentation
  // buffer but emits nothing), so the diff baseline can never advance without the
  // caret it was composited with (see `PrevPresentation`).
  let prevPresentation: PrevPresentation<Buffer> | null = null
  let renderedOnce = false
  let lastRenderDims: Dims | null = null
  let lastCursorSuffix = ""
  let clearNextFullscreenRender = false
  // Resize-repaint latch (fullscreen only). Set on every resize notification,
  // cleared ONLY after a render() actually writes bytes. Distinct from
  // `clearNextFullscreenRender` (a one-frame clear request that any render —
  // including a no-output early-return — resets): this latch survives
  // intermediate no-output frames so the eventual content render is guaranteed
  // to clear+repaint. A same-size terminal/emulator reflow can blank or
  // scramble the visible cells while silvery's shadow `prevBuffer` still holds
  // the prior frame, which made the zero-diff fast path emit nothing and leave
  // the screen blank. Bead: @km/code/v0.2/19604-focus-blank.
  let resizePaintPending = false

  // Scrollback offset tracking (inline mode only)
  let scrollbackOffset = 0

  // Track if disposed
  let disposed = false

  // Unified event channel for resize and effect events
  const eventChannel = createEventChannel(signal)

  // Subscribe to resize events if supported
  let unsubscribeResize: (() => void) | undefined
  if (target.onResize) {
    unsubscribeResize = target.onResize((dims) => {
      if (mode === "fullscreen") {
        clearNextFullscreenRender = true
        // Latch a guaranteed clear+repaint that survives any intermediate
        // no-output frame until a real paint lands. See `resizePaintPending`.
        resizePaintPending = true
      }
      eventChannel.push({ type: "resize", cols: dims.cols, rows: dims.rows })
    })
  }

  // Effect ID counter
  let effectId = 0

  return {
    events(): AsyncIterable<Event> {
      // Return channel events wrapped with takeUntil for cleanup
      return takeUntil(eventChannel.events(), signal)
    },

    schedule<T>(effect: () => Promise<T>, opts?: { signal?: AbortSignal }): void {
      if (disposed) return

      const id = `effect-${effectId++}`
      const effectSignal = opts?.signal

      // Check if already aborted
      if (effectSignal?.aborted) return

      // Execute effect asynchronously
      const execute = async () => {
        // Track abort handler for cleanup
        let abortHandler: (() => void) | undefined

        try {
          if (effectSignal) {
            // Create abort race with cleanup
            const aborted = new Promise<never>((_resolve, reject) => {
              abortHandler = () => reject(new Error("Effect aborted"))
              effectSignal.addEventListener("abort", abortHandler, {
                once: true,
              })
            })

            const result = await Promise.race([effect(), aborted])

            // Clean up abort listener after success
            if (abortHandler) {
              effectSignal.removeEventListener("abort", abortHandler)
            }

            eventChannel.push({ type: "effect", id, result })
          } else {
            const result = await effect()
            eventChannel.push({ type: "effect", id, result })
          }
        } catch (error) {
          // Clean up abort listener on error too
          if (abortHandler && effectSignal) {
            effectSignal.removeEventListener("abort", abortHandler)
          }

          // Check for abort by name (handles DOMException, AbortError, etc.)
          if (
            error instanceof Error &&
            (error.message === "Effect aborted" || error.name === "AbortError")
          ) {
            // Silently ignore aborted effects
            return
          }
          eventChannel.push({
            type: "error",
            error: error instanceof Error ? error : new Error(String(error)),
          })
        }
      }

      // Start immediately (microtask)
      queueMicrotask(() => {
        void execute()
      })
    },

    render(buffer: Buffer): void {
      if (disposed) return

      // Compute diff internally — pass terminal rows to cap output.
      // Inline mode: prevents scrollback corruption (cursor-up clamped at row 0).
      // Fullscreen mode: prevents buffer overflow that scrolls the terminal and
      // desynchronizes prevBuffer from actual terminal state (ghost pixel garble).
      const offset = scrollbackOffset
      scrollbackOffset = 0 // Consume the offset
      const targetDims = target.getDims()
      const termRows = targetDims.rows
      const targetDimsChanged =
        lastRenderDims !== null &&
        (lastRenderDims.cols !== targetDims.cols || lastRenderDims.rows !== targetDims.rows)
      // `resizePaintPending` forces a clear+repaint that the zero-diff
      // early-return below cannot swallow: a resize notification may have
      // reflowed/cleared the visible cells even when our tracked dims and the
      // shadow buffer are unchanged (same-size reflow), so emitting nothing
      // would leave the screen blank. The latch is cleared only after a real
      // write lands (see the write site below), so an intermediate no-output
      // frame can't consume it. Bead: @km/code/v0.2/19604-focus-blank.
      const clearFullscreen =
        mode === "fullscreen" &&
        renderedOnce &&
        (clearNextFullscreenRender || targetDimsChanged || resizePaintPending)
      const overlayChanged = !!buffer.overlay && buffer.overlay.length > 0
      let renderBuffer = buffer
      let cursorSuffix = ""
      let cursorTarget: OutputCursorTarget | null = null
      let expectedTerminal: OutputCursorTarget | null = null
      let compositorCaret: OutputCompositorCaret | null = null
      let promptBounds: OutputCursorBounds | null = null
      let composerBounds: OutputCursorBounds | null = null
      if (mode === "fullscreen") {
        // Single source of truth for managed-frame cursor handling
        // (managed-caret.ts). It finds the active cursor, composites a visible
        // caret ONLY for a focused editable (the @km/code/v0.2/19702 fix — a
        // non-focused fallback declarer must not strand an inverse cell in the
        // transcript), and parks+hides the hardware cursor regardless so a
        // dropped/overridden `?25l` cannot leave a hollow cursor in
        // transcript/chrome. All three render entry points call this — see
        // `docs/lessons/no-parallel-derivation.md`.
        const managed = computeManagedFrame(buffer._buffer, buffer.nodes, "fullscreen", {
          prevCaret: prevPresentation?.caret ?? null,
          windowFocused: readWindowFocused(),
        })
        promptBounds = managed.promptBounds
        composerBounds = managed.composerBounds
        compositorCaret = managed.compositorCaret
        if (managed.presentationBuffer !== buffer._buffer) {
          renderBuffer = { ...buffer, _buffer: managed.presentationBuffer }
        }
        cursorSuffix = managed.cursorSuffix
        cursorTarget = managed.cursorTarget
        expectedTerminal = managed.expectedTerminal
      }
      if (
        prevPresentation &&
        buffersHaveSameVisibleCells(prevPresentation.buffer, renderBuffer) &&
        offset === 0 &&
        !targetDimsChanged &&
        !clearFullscreen &&
        !overlayChanged &&
        cursorSuffix === lastCursorSuffix
      ) {
        // Store the PRESENTATION buffer (`renderBuffer`), not the raw `buffer`.
        // In fullscreen mode `renderBuffer._buffer` carries the composited
        // managed caret (an `inverse` cell painted by composeManagedCaret) and
        // is what the terminal actually shows. The next real diff baselines
        // against this buffer; if we stored the raw buffer here (no caret
        // overlay), the next frame's diff would not see the OLD caret cell as
        // "inverse → not-inverse" and would never emit a clear for it, leaving
        // a stranded reverse-video block on that (usually blank) cell. That is
        // the @km/code/v0.2/19702 "stale inverse on blank cells" signature:
        // a no-op early-return frame lands between two caret positions and the
        // old caret's inverse is never cleared. `buffer` and `renderBuffer` are
        // the same reference when no caret is active, so this is a no-op there.
        // The next frame's overlay-clear baselines against THIS caret, so the
        // buffer and caret are stored as one unit even on this no-op frame.
        prevPresentation = { buffer: renderBuffer, caret: compositorCaret }
        lastRenderDims = { cols: targetDims.cols, rows: targetDims.rows }
        renderedOnce = true
        clearNextFullscreenRender = false
        return
      }

      // Use scoped output phase if provided (threads measurer/caps correctly),
      // otherwise fall back to raw diff() for backwards compatibility.
      //
      // When `clearFullscreen` is set the repaint BODY is a FULL render of
      // `next` (NOT a diff): `bufferToAnsi` moves to `\x1b[H` and writes EVERY
      // cell of EVERY row (`char || " "`) via absolute per-row CUP, so the
      // repaint by itself overwrites the entire alt-screen viewport — including
      // any multiplexer-injected residue (cmux dumping main-screen content on a
      // workspace switch, @ag/code/19604). That is why no separate destructive
      // `2J`/`ED` clear is needed (and why we no longer emit one — see the
      // clear-frame framing block below; @ag/code/20297-pane-flicker-on-resize).
      //
      // The full render is also required for correctness: a same-size
      // terminal/emulator reflow can blank/scramble the visible cells while the
      // shadow `prevBuffer` stays byte-identical to `next`, so a diff would be
      // empty and emit nothing → blank screen. Passing `null` as prev forces the
      // output phase's first-render path (full `bufferToAnsi`).
      // Beads: @ag/code/19604-focus-blank, @ag/code/20297-pane-flicker-on-resize.
      const diffPrev = clearFullscreen ? null : (prevPresentation?.buffer._buffer ?? null)
      let patch: string
      if (outputPhaseFn) {
        const nextBuf = renderBuffer._buffer
        patch = outputPhaseFn(diffPrev, nextBuf, mode, offset, termRows)
      } else {
        patch = diff(
          clearFullscreen ? null : (prevPresentation?.buffer ?? null),
          renderBuffer,
          mode,
          offset,
          termRows,
        )
      }
      // The presentation buffer and the caret composited into it are stored as
      // one unit so the next frame's overlay-clear always sees the caret that
      // matches the baseline it diffs against. @km/code/v0.2/19702.
      prevPresentation = { buffer: renderBuffer, caret: compositorCaret }

      // Append Kitty graphics overlay (scrim placements for emoji in the
      // backdrop-fade region). The overlay is a self-contained save-cursor /
      // CUP / place / restore-cursor block — appending it after the main diff
      // keeps the output phase's cursor tracking intact.
      if (buffer.overlay && buffer.overlay.length > 0) {
        patch += buffer.overlay
      }

      // Cursor positioning suffix. In fullscreen mode the post-frame terminal
      // cursor must land at the active textarea/textinput (or be hidden).
      // Layout-output cursors (BoxProps.cursorOffset → cursorRect signal —
      // Phase 2 of `km-silvery.view-as-layout-output`) are read from the AgNode
      // tree exposed via `buffer.nodes`. Fixes
      // `km-silvercode.cursor-startup-position`: the createApp render path
      // previously emitted no cursor ANSI at all, so the hardware cursor
      // stayed wherever the last buffer-cell write landed.
      //
      // Inline mode skips this — `inlineCursorSuffix` (in output-phase.ts)
      // already positions the cursor inside the diff output.
      patch += cursorSuffix

      // No destructive screen clear on a resize/focus/reflow frame.
      //
      // The clear-frame repaint above is a FULL `bufferToAnsi` render that opens
      // with `\x1b[H` and overwrites every cell of every row, so it IS the clear
      // — a separate `\x1b[2J` is redundant for our own content and, critically,
      // a bare un-synchronized `2J` blanks the screen for one composited frame
      // before the repaint lands (the visible flash the user reported on every
      // resize). DEC 2026 only makes the REPAINT atomic; a `2J` outside the sync
      // region flashes regardless. We therefore emit NO `2J` and let the
      // sync-wrapped full repaint (below) do the clearing all-or-nothing.
      // Bead: @ag/code/20297-pane-flicker-on-resize.
      //
      // Residue safety (@ag/code/19604): the full repaint writes a real char or
      // a space to every cell of all `termRows`, so multiplexer-injected residue
      // (cmux main-screen dump on a workspace switch) is overwritten by the
      // repaint just as the old `2J` did. Ghostty safety: the old constraint was
      // specifically "never perform `ED`/`2J` inside `?2026h…?2026l`" — with no
      // `2J` anywhere that corruption mode cannot occur. Atomicity (19633) is
      // preserved by the existing size-gated `wrapBody` below: a large clear
      // repaint (a real Silver Code pane) is sync-wrapped so the whole-viewport
      // overwrite composites all-or-nothing; a small full repaint stays
      // unwrapped (still a single `target.write` with no interleaved `2J`, so
      // nothing blank is ever composited).
      const clearPrefix = ""

      if (patch.length === 0) {
        lastCursorSuffix = cursorSuffix
        lastRenderDims = { cols: targetDims.cols, rows: targetDims.rows }
        renderedOnce = true
        clearNextFullscreenRender = false
        // `resizePaintPending` deliberately stays set on this no-output frame —
        // a clearFullscreen frame ALWAYS produces a full-repaint `patch` (diffPrev
        // is null → first-render path), so an empty patch here means there was no
        // content at all (degenerate 0-cell buffer), not a swallowed resize.
        return
      }

      // Debug: capture raw ANSI output that's actually written to the terminal
      if (process.env.SILVERY_CAPTURE_RAW) {
        try {
          const fs = require("fs")
          fs.appendFileSync("/tmp/silvery-runtime-raw.ansi", clearPrefix + patch)
        } catch {}
      }

      // DEC 2026 synchronized-output framing — the invariants that must hold
      // (km beads 19604-focus-blank + 19633-output-flicker + 20297-pane-flicker):
      //
      // 1. NEVER perform a destructive clear (`ED`/`2J`) inside — OR outside,
      //    visibly — a sync region. Older Ghostty corrupts a `2J` performed
      //    inside `?2026h…?2026l` (19604 original symptom). A `2J` performed
      //    OUTSIDE the sync region instead blanks the pane for one composited
      //    frame before the repaint lands (20297 flicker). Resolution: emit no
      //    `2J` at all on a resize/focus frame — the full `bufferToAnsi` repaint
      //    (forced via `diffPrev=null` above) overwrites every cell itself, so
      //    it IS the clear. See the `clearPrefix = ""` block above.
      //
      // 2. DO swap a large repaint atomically. A large fullscreen repaint
      //    written un-synchronized tears under terminal/compositor load and can
      //    drop cells — a focus-in/resize repaint then settles blank with stray
      //    residue (19604 recurrence: the un-synced repaint was the second
      //    failure mode). Wrapping the body makes the terminal apply it
      //    all-or-nothing. Small frames (incremental cursor-positioned diffs AND
      //    small full repaints) stay unwrapped to avoid the older-Ghostty
      //    incremental caveat (19633); a small full repaint can't flicker
      //    anyway — it's one `target.write` with no interleaved `2J`.
      //
      // Net for a focus-in/resize frame: NO `2J`, then a (size-gated) sync-wrapped
      // full repaint. Neither the clear-in-sync corruption, the unsynced-`2J`
      // flash, nor the torn-unsynced-repaint blank can occur.
      const wrapBody =
        patch.length > 0 &&
        (syncUpdate ||
          (mode === "fullscreen" && Buffer.byteLength(patch) >= LARGE_FULLSCREEN_SYNC_BYTES))
      const body = wrapBody ? `${ANSI.SYNC_BEGIN}${patch}${ANSI.SYNC_END}` : patch
      const frameOutput = clearPrefix + body
      recordOutputCursorDiagnostics({
        reason: clearFullscreen ? "fullscreen-clear-render" : "fullscreen-render",
        mode,
        width: targetDims.cols,
        height: renderBuffer._buffer.height,
        termRows,
        output: frameOutput,
        target: cursorTarget,
        expectedTerminal,
        compositorCaret,
        promptBounds,
        composerBounds,
      })
      target.write(frameOutput)
      lastCursorSuffix = cursorSuffix
      lastRenderDims = { cols: targetDims.cols, rows: targetDims.rows }
      renderedOnce = true
      clearNextFullscreenRender = false
      // Cleared only here — at the actual write. The two early-returns above
      // (zero-diff, empty-patch) deliberately leave the latch set: when
      // `resizePaintPending` is true `clearFullscreen` is true, so neither
      // early-return is taken and control always reaches this write. Clearing
      // post-write is what makes the latch survive intermediate no-output
      // frames. Bead: @km/code/v0.2/19604-focus-blank.
      resizePaintPending = false
    },

    addScrollbackLines(lines: number): void {
      if (mode !== "inline" || lines <= 0) return
      scrollbackOffset += lines
    },

    invalidate(options?: { clearScreen?: boolean }): void {
      // No prev buffer ⇒ next frame is a full render; there is no stale overlay
      // to clear, so the presentation buffer + its caret are dropped together.
      prevPresentation = null
      if (options?.clearScreen && mode === "fullscreen") {
        clearNextFullscreenRender = true
      }
    },

    isResizePending(): boolean {
      return resizePaintPending
    },

    setOutputPhaseFn(fn: RuntimeOptions["outputPhaseFn"]): void {
      if (fn) outputPhaseFn = fn
    },

    resetInlineCursor(): void {
      // Reset inline cursor tracking — delegates to the output phase (either
      // the caller-provided one or the inline-mode fallback created above).
      const fn = outputPhaseFn as { resetInlineState?: () => void } | undefined
      fn?.resetInlineState?.()
    },

    getInlineCursorRow(): number {
      const fn = outputPhaseFn as { getInlineCursorRow?: () => number } | undefined
      return fn?.getInlineCursorRow?.() ?? -1
    },

    promoteScrollback(content: string, lines: number): void {
      const fn = outputPhaseFn as { promoteScrollback?: (c: string, l: number) => void } | undefined
      fn?.promoteScrollback?.(content, lines)
    },

    getDims(): Dims {
      return target.getDims()
    },

    [Symbol.dispose](): void {
      if (disposed) return
      disposed = true

      // Abort all pending operations
      controller.abort()

      // Remove external signal listener if still attached
      if (externalAbortHandler && externalSignal) {
        externalSignal.removeEventListener("abort", externalAbortHandler)
      }

      // Unsubscribe from resize
      if (unsubscribeResize) {
        unsubscribeResize()
      }

      // Dispose event channel
      eventChannel.dispose()
    },
  }
}
