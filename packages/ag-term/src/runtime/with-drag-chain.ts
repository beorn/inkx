/**
 * withDragChain — apply-chain ownership for node drag gestures.
 *
 * The DragFeature owns gesture state and drag-event dispatch. This plugin
 * gives that feature first refusal over typed input ops so the production
 * runtime has one explicit decision channel for pointer ownership instead of
 * a second ad-hoc mouse loop.
 */

import type { AgNode } from "@silvery/ag/types"
import type { ApplyResult, Effect, Op } from "@silvery/create/types"
import type { BaseApp } from "@silvery/create/runtime/base-app"
import type { KeyShape } from "@silvery/create/runtime/with-terminal-chain"
import type { DragFeature } from "../features/drag"

export interface DragPointerEffect extends Effect {
  readonly type: "drag:pointer"
  /** The drag feature owns this pointer sequence, so selection must stand down. */
  readonly ownsPointer: true
  /** Skip component-tree dispatch (move and active-drag mouseup). */
  readonly suppressEvent: boolean
}

export interface DragKeyEffect extends Effect {
  readonly type: "drag:key"
  /** Escape cancelled an armed or active drag and must not reach app handlers. */
  readonly suppressEvent: true
}

export type DragChainEffect = DragPointerEffect | DragKeyEffect

export function isDragChainEffect(effect: Effect): effect is DragChainEffect {
  return effect.type === "drag:pointer" || effect.type === "drag:key"
}

export interface WithDragChainOptions {
  readonly feature: DragFeature
  readonly hitTest: (x: number, y: number) => AgNode | null
}

interface MouseOp extends Op {
  readonly type: "term:mouse"
  readonly action: "down" | "up" | "move" | "wheel"
  readonly x: number
  readonly y: number
  readonly button: number
}

/** Install drag gesture ownership as an outer apply-chain plugin. */
export function withDragChain(options: WithDragChainOptions): <A extends BaseApp>(app: A) => A {
  return <A extends BaseApp>(app: A): A => {
    const { feature, hitTest } = options
    const prev = app.apply

    app.apply = (op: Op): ApplyResult => {
      if (op.type === "input:key") {
        const key = (op as { key?: KeyShape & { escape?: boolean } }).key
        if (key?.escape && feature.tracking) {
          feature.cancel()
          return [{ type: "drag:key", suppressEvent: true } satisfies DragKeyEffect]
        }
        return prev(op)
      }

      if (op.type !== "term:mouse") return prev(op)
      const mouse = op as MouseOp
      if (mouse.button !== 0 || mouse.action === "wheel") return prev(op)

      if (mouse.action === "down") {
        const source = hitTest(mouse.x, mouse.y)
        if (!source || !feature.handleMouseDown(mouse.x, mouse.y, source)) return prev(op)
        return [
          {
            type: "drag:pointer",
            ownsPointer: true,
            suppressEvent: false,
          } satisfies DragPointerEffect,
        ]
      }

      if (!feature.tracking) return prev(op)

      if (mouse.action === "move") {
        feature.handleMouseMove(mouse.x, mouse.y, hitTest)
        return [
          {
            type: "drag:pointer",
            ownsPointer: true,
            suppressEvent: true,
          } satisfies DragPointerEffect,
        ]
      }

      // Op payloads cross a runtime boundary despite the structural type above.
      // Never reinterpret an unknown action as pointer release.
      if (mouse.action !== "up") return prev(op)

      const wasDragging = feature.state !== null
      feature.handleMouseUp(mouse.x, mouse.y, hitTest)
      return [
        {
          type: "drag:pointer",
          ownsPointer: true,
          // An armed click still reaches the component tree. Once the drag
          // threshold was crossed, mouseup must not synthesize a click.
          suppressEvent: wasDragging,
        } satisfies DragPointerEffect,
      ]
    }

    return app
  }
}
