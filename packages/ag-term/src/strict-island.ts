/**
 * Runtime checks for `<Island>` strict slugs.
 *
 * The Island contract lives in `@silvery/ag`, but SILVERY_STRICT is a
 * terminal-target runtime gate. Keep the instrumentation here so core remains
 * target-agnostic while the terminal renderer can still enforce the contract.
 */

import { isStrictEnabled } from "./strict-mode"
import { graphemeWidth } from "./unicode"
import type { AgNode, Rect } from "@silvery/ag/types"
import type {
  IslandHandle,
  IslandInputOwner,
  IslandMouseEvent,
  IslandNodeState,
} from "@silvery/ag/island-types"
import type { CellBuffer, ViewportRect } from "@silvery/ag/viewport-types"

/** Tier-2 paint budget: one 256x256 island frame. */
export const ISLAND_PAINT_BUDGET_CELLS = 65_536

const instrumentedHandles = new WeakSet<IslandHandle>()

type SubscriptionOwner<T extends readonly unknown[]> = {
  subscribe(listener: (...args: T) => void): () => void
}

/**
 * Attach strict wrappers to a live island handle once.
 *
 * This is called from the render phase when the terminal target first sees a
 * handle. Wrapping at the target avoids pulling SILVERY_STRICT into `@silvery/ag`.
 */
export function ensureIslandStrictInstrumentation(node: AgNode): void {
  if (!needsIslandStrictInstrumentation()) return
  const state = node.islandState
  const handle = state?.handle
  if (!state || !handle || instrumentedHandles.has(handle)) return
  instrumentedHandles.add(handle)

  wrapWriteCells(handle)
  wrapSubscription(handle.output, state, "output")
  wrapSubscription(handle.size, state, "size")
  if (handle.modes) wrapSubscription(handle.modes, state, "modes")
  if (handle.input) wrapMouseInput(handle.input, handle)
}

function needsIslandStrictInstrumentation(): boolean {
  return (
    isStrictEnabled("island-paint-oob", 2) ||
    isStrictEnabled("island-dispose-leak", 2) ||
    isStrictEnabled("island-boundary-limits", 2)
  )
}

/** Render-phase checks that do not depend on guest mutation APIs. */
export function assertIslandRenderInvariants(node: AgNode, layout: Rect): void {
  const state = node.islandState
  const handle = state?.handle
  if (!state || !handle) return

  const source = handle.output.buffer
  assertResizeRace(handle, source)
  assertHostFrameContract(handle, layout)
  assertPaintBudget(source, layout)
  assertGraphemeWidth(source)
  assertCursorBoundary(handle)
  assertNoDisposedRender(state)
}

/**
 * island-host-frame (20831) — the pane-host frame contract.
 *
 * The Island residue class (20625 herdr-Island residue; same family as the
 * 19406 swallowed same-size SIGWINCH) is a HOST frame that diverges from the
 * guest's belief: the host re-framed the pane but the guest size-owner never
 * acknowledged, so stale-dim paints blit into a different-sized rect and
 * leave residual cells. One frame of divergence is legal — the resize-ack
 * window ("guest acknowledges via next paint"). The SAME divergent host frame
 * surviving a second render is the desync signature: nobody asked the guest
 * to follow, or its size subscription never fired.
 *
 * Streak state is per-handle and per-target-frame: a match resets it, and a
 * different host frame restarts the window (a live drag-resize is a sequence
 * of one-frame windows, never a violation).
 */
const hostFrameMismatchStreak = new WeakMap<
  IslandHandle,
  { cols: number; rows: number; frames: number }
>()

function assertHostFrameContract(handle: IslandHandle, layout: Rect): void {
  if (!isStrictEnabled("island-host-frame", 2)) return
  if (handle.size.cols === layout.width && handle.size.rows === layout.height) {
    hostFrameMismatchStreak.delete(handle)
    return
  }
  const prev = hostFrameMismatchStreak.get(handle)
  const frames =
    prev !== undefined && prev.cols === layout.width && prev.rows === layout.height
      ? prev.frames + 1
      : 1
  hostFrameMismatchStreak.set(handle, { cols: layout.width, rows: layout.height, frames })
  if (frames < 2) return
  throw new Error(
    `[SILVERY_STRICT=island-host-frame] host frame ${layout.width}x${layout.height} unacknowledged by ` +
      `guest size-owner ${handle.size.cols}x${handle.size.rows} for ${frames} consecutive renders — ` +
      `pane-host/guest frame desync (the Island residue class). The host must requestResize() on ` +
      `reframe and the guest's size subscription must fire; see 20831 / 20625 / 19406.`,
  )
}

function wrapWriteCells(handle: IslandHandle): void {
  const original = handle.output.writeCells.bind(handle.output)
  handle.output.writeCells = (dirtyRects, source) => {
    assertDirtyRectsInsideIsland(handle, dirtyRects, source)
    return original(dirtyRects, source)
  }
}

function wrapSubscription<T extends readonly unknown[]>(
  owner: SubscriptionOwner<T>,
  state: IslandNodeState,
  label: string,
): void {
  const original = owner.subscribe.bind(owner)
  owner.subscribe = ((listener: (...args: T) => void) => {
    return original((...args: T) => {
      assertNoPostDisposeCallback(state, label)
      listener(...args)
    })
  }) as SubscriptionOwner<T>["subscribe"]
}

function wrapMouseInput(input: IslandInputOwner, handle: IslandHandle): void {
  if (!input.onMouse) return
  const original = input.onMouse.bind(input)
  input.onMouse = (handler) => {
    return original((event) => {
      assertMouseInsideIsland(handle, event)
      handler(event)
    })
  }
}

function assertDirtyRectsInsideIsland(
  handle: IslandHandle,
  dirtyRects: readonly ViewportRect[],
  source: CellBuffer,
): void {
  if (!isStrictEnabled("island-paint-oob", 2)) return
  const cols = Math.min(handle.size.cols, source.cols)
  const rows = Math.min(handle.size.rows, source.rows)
  for (const rect of dirtyRects) {
    const c1 = rect.col + rect.width
    const r1 = rect.row + rect.height
    if (
      !Number.isInteger(rect.col) ||
      !Number.isInteger(rect.row) ||
      !Number.isInteger(rect.width) ||
      !Number.isInteger(rect.height) ||
      rect.col < 0 ||
      rect.row < 0 ||
      rect.width < 0 ||
      rect.height < 0 ||
      c1 > cols ||
      r1 > rows
    ) {
      throw new Error(
        `[SILVERY_STRICT=island-paint-oob] guest dirty rect ${formatRect(rect)} escapes island ` +
          `${cols}x${rows}`,
      )
    }
  }
}

function assertResizeRace(handle: IslandHandle, source: CellBuffer): void {
  if (!isStrictEnabled("island-resize-race", 2)) return
  if (source.cols <= handle.size.cols && source.rows <= handle.size.rows) return
  throw new Error(
    `[SILVERY_STRICT=island-resize-race] guest output ${source.cols}x${source.rows} ` +
      `exceeds size-owner acknowledgement ${handle.size.cols}x${handle.size.rows}`,
  )
}

function assertPaintBudget(source: CellBuffer, layout: Rect): void {
  if (!isStrictEnabled("island-paint-budget", 2)) return
  const paintedCols = Math.max(0, Math.min(layout.width, source.cols))
  const paintedRows = Math.max(0, Math.min(layout.height, source.rows))
  const cells = paintedCols * paintedRows
  if (cells <= ISLAND_PAINT_BUDGET_CELLS) return
  throw new Error(
    `[SILVERY_STRICT=island-paint-budget] island paints ${cells} cells in one frame ` +
      `(budget ${ISLAND_PAINT_BUDGET_CELLS})`,
  )
}

function assertGraphemeWidth(source: CellBuffer): void {
  if (!isStrictEnabled("island-grapheme-width", 2)) return
  for (let row = 0; row < source.rows; row++) {
    for (let col = 0; col < source.cols; col++) {
      const cell = source.getCell(col, row)
      if (cell.continuation) {
        if (col === 0 || !source.getCell(col - 1, row).wide) {
          throw new Error(
            `[SILVERY_STRICT=island-grapheme-width] continuation cell at ${col},${row} ` +
              `has no leading wide cell`,
          )
        }
        continue
      }

      const width = graphemeWidth(cell.char)
      if (width === 2) {
        const next = col + 1 < source.cols ? source.getCell(col + 1, row) : null
        if (!cell.wide || !next?.continuation) {
          throw new Error(
            `[SILVERY_STRICT=island-grapheme-width] wide grapheme ${JSON.stringify(
              cell.char,
            )} at ${col},${row} is missing wide+continuation metadata`,
          )
        }
        continue
      }

      if (cell.wide || width > 2) {
        throw new Error(
          `[SILVERY_STRICT=island-grapheme-width] cell ${JSON.stringify(
            cell.char,
          )} at ${col},${row} declares wide=${String(cell.wide)} but measures width ${width}`,
        )
      }
    }
  }
}

function assertCursorBoundary(handle: IslandHandle): void {
  if (!isStrictEnabled("island-boundary-limits", 2)) return
  const cursor = handle.output.cursor
  if (!handle.output.cursorVisible || !cursor) return
  if (
    cursor.row >= 0 &&
    cursor.row < handle.size.rows &&
    cursor.col >= 0 &&
    cursor.col < handle.size.cols
  ) {
    return
  }
  throw new Error(
    `[SILVERY_STRICT=island-boundary-limits] guest cursor ${cursor.col},${cursor.row} ` +
      `escapes island ${handle.size.cols}x${handle.size.rows}`,
  )
}

function assertMouseInsideIsland(handle: IslandHandle, event: IslandMouseEvent): void {
  if (!isStrictEnabled("island-boundary-limits", 2)) return
  if (
    event.row >= 0 &&
    event.row < handle.size.rows &&
    event.col >= 0 &&
    event.col < handle.size.cols
  ) {
    return
  }
  throw new Error(
    `[SILVERY_STRICT=island-boundary-limits] mouse event ${event.col},${event.row} ` +
      `escapes island ${handle.size.cols}x${handle.size.rows}`,
  )
}

function assertNoPostDisposeCallback(state: IslandNodeState, label: string): void {
  if (!isStrictEnabled("island-dispose-leak", 2)) return
  if (state.lifecycle !== "disposed" && !state.abortController.signal.aborted) return
  throw new Error(
    `[SILVERY_STRICT=island-dispose-leak] ${label} callback fired after island dispose`,
  )
}

function assertNoDisposedRender(state: IslandNodeState): void {
  if (!isStrictEnabled("island-dispose-leak", 2)) return
  if (state.lifecycle !== "disposed") return
  throw new Error("[SILVERY_STRICT=island-dispose-leak] disposed island reached render phase")
}

function formatRect(rect: ViewportRect): string {
  return `{col:${rect.col},row:${rect.row},width:${rect.width},height:${rect.height}}`
}
