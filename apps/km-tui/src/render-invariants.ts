import type { SignalStoreApi as StoreApi } from "./state/signal-store.ts"
import { getActiveBoardPane, type BoardAppStore } from "./state/board-app-store.ts"

type LocatorLike = {
  count(): number
  boundingBox(): { x: number; y: number; width: number; height: number } | null
}

type RenderTreeLike = {
  readonly width?: number
  readonly height?: number
  locator(selector: string): LocatorLike
}

export class RenderInvariantError extends Error {
  constructor(
    readonly check: string,
    message: string,
  ) {
    super(`Render invariant violation [${check}]: ${message}`)
    this.name = "RenderInvariantError"
  }
}

export interface RenderInvariantOptions {
  columns?: number
  rows?: number
}

export function checkRenderInvariants(
  tree: RenderTreeLike,
  store: StoreApi<BoardAppStore>,
  action = "render",
  options: RenderInvariantOptions = {},
): void {
  const state = store.getState()
  const boardPane = getActiveBoardPane(state)
  const cursorId = (boardPane?.sel.node.cursor() as string | null) ?? null
  const isIdle = state.sel.kind() === "idle"
  const isMoveMode = boardPane?.moveState.active ?? false
  const isDetailMode = boardPane?.viewMode === "detail"
  if (!cursorId || isIdle || isMoveMode || isDetailMode) return

  const cursor = tree.locator("[data-cursor]")
  const cursorCount = cursor.count()
  if (cursorCount !== 1) {
    throw new RenderInvariantError(
      "cursor-visible-once",
      `expected exactly one visible rendered cursor after ${action}; found ${cursorCount} (cursor=${cursorId})`,
    )
  }

  const box = cursor.boundingBox()
  if (!box) {
    throw new RenderInvariantError(
      "cursor-has-box",
      `visible rendered cursor has no bounding box after ${action} (cursor=${cursorId})`,
    )
  }

  const columns = options.columns ?? tree.width
  const rows = options.rows ?? tree.height

  if (columns !== undefined && (box.x < 0 || box.x >= columns)) {
    throw new RenderInvariantError(
      "cursor-x-in-viewport",
      `cursor x=${box.x} is outside [0, ${columns}) after ${action} (cursor=${cursorId})`,
    )
  }

  if (rows !== undefined && (box.y < 0 || box.y >= rows)) {
    throw new RenderInvariantError(
      "cursor-y-in-viewport",
      `cursor y=${box.y} is outside [0, ${rows}) after ${action} (cursor=${cursorId})`,
    )
  }
}

export function withCheckRenderInvariants<T extends RenderTreeLike>(
  app: T,
  store: StoreApi<BoardAppStore>,
  options: RenderInvariantOptions = {},
): T & { checkRenderInvariants(action?: string): void } {
  return Object.assign(app, {
    checkRenderInvariants(action?: string) {
      checkRenderInvariants(app, store, action, options)
    },
  })
}
