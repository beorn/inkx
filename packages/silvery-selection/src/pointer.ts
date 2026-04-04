/**
 * Pure pointer state machine.
 *
 * applyPointerEvent(ptrState, event, helpers) -> [newPtrState, SelectionEffect[]]
 *
 * No side effects. The caller applies returned effects to the selection state.
 *
 * Manipulation drag emits "manipulation-drag" effect (NOT a selection drag).
 * sel.drag is only for area-select and text-drag.
 */

import type {
  ID,
  Modifiers,
  PointerEvent,
  PointerHelpers,
  PointerOrigin,
  PointerState,
  PressHit,
  SelectionEffect,
} from "./types.ts"

// --- Helpers ---

function distance(a: PointerOrigin, b: { x: number; y: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

const IDLE: PointerState = Object.freeze({ phase: "idle" }) as PointerState

// --- Main entry point ---

/**
 * Pure pointer state machine transition.
 *
 * @returns [newPointerState, effects] where effects are selection operations to apply.
 */
export function applyPointerEvent(
  ptrState: PointerState,
  event: PointerEvent,
  helpers: PointerHelpers,
): [PointerState, SelectionEffect[]] {
  switch (ptrState.phase) {
    case "idle":
      return handleIdle(event)
    case "pointing-empty":
      return handlePointingEmpty(ptrState, event, helpers)
    case "pointing-node":
      return handlePointingNode(ptrState, event, helpers)
    case "pointing-selection":
      return handlePointingSelection(ptrState, event, helpers)
    case "pointing-text":
      return handlePointingText(ptrState, event, helpers)
    case "dragging-area":
      return handleDraggingArea(ptrState, event, helpers)
    case "dragging-text":
      return handleDraggingText(ptrState, event, helpers)
  }
}

// --- Idle ---

function handleIdle(event: PointerEvent): [PointerState, SelectionEffect[]] {
  if (event.type === "pointerDown") {
    const { hit, origin, isSelected } = event
    switch (hit.kind) {
      case "empty":
        return [{ phase: "pointing-empty", hit, origin }, []]
      case "node":
        if (isSelected) {
          return [{ phase: "pointing-selection", hit, origin }, []]
        }
        return [{ phase: "pointing-node", hit, origin }, []]
      case "text":
        return [{ phase: "pointing-text", hit, origin }, []]
    }
  }

  if (event.type === "doubleClick") {
    return handleDoubleClick(event.hit)
  }

  // All other events in idle: no-op
  return [IDLE, []]
}

// --- Pointing states (before drag threshold) ---

function handlePointingEmpty(
  ptrState: PointerState & { phase: "pointing-empty" },
  event: PointerEvent,
  helpers: PointerHelpers,
): [PointerState, SelectionEffect[]] {
  switch (event.type) {
    case "pointerUp":
      return [IDLE, [{ type: "deselect" }]]

    case "pointerMove": {
      const dist = distance(ptrState.origin, { x: event.x, y: event.y })
      if (dist >= helpers.dragThreshold) {
        // Transition to dragging-area
        return [
          {
            phase: "dragging-area",
            hit: ptrState.hit,
            origin: ptrState.origin,
          },
          [{ type: "drag.start", hit: ptrState.hit, origin: ptrState.origin }],
        ]
      }
      return [ptrState, []]
    }

    case "escape":
      return [IDLE, []]

    default:
      return [ptrState, []]
  }
}

function handlePointingNode(
  ptrState: PointerState & { phase: "pointing-node" },
  event: PointerEvent,
  helpers: PointerHelpers,
): [PointerState, SelectionEffect[]] {
  switch (event.type) {
    case "pointerUp": {
      const hit = ptrState.hit as PressHit & { kind: "node" }
      const { cmd, shift } = event.modifiers
      if (cmd) {
        return [IDLE, [{ type: "node.select", ids: [hit.nodeId], toggle: true }]]
      }
      if (shift) {
        return [IDLE, [{ type: "node.extend", cursor: hit.nodeId }]]
      }
      return [IDLE, [{ type: "node.select", ids: [hit.nodeId] }]]
    }

    case "pointerMove": {
      const dist = distance(ptrState.origin, { x: event.x, y: event.y })
      if (dist >= helpers.dragThreshold) {
        // Preselect + manipulation drag (app-level, NOT sel.drag)
        const hit = ptrState.hit as PressHit & { kind: "node" }
        return [
          IDLE,
          [
            { type: "node.select", ids: [hit.nodeId] },
            {
              type: "manipulation-drag",
              hit: ptrState.hit,
              origin: ptrState.origin,
            },
          ],
        ]
      }
      return [ptrState, []]
    }

    case "escape":
      return [IDLE, []]

    default:
      return [ptrState, []]
  }
}

function handlePointingSelection(
  ptrState: PointerState & { phase: "pointing-selection" },
  event: PointerEvent,
  helpers: PointerHelpers,
): [PointerState, SelectionEffect[]] {
  switch (event.type) {
    case "pointerUp": {
      // Reselect: collapse multi to this one
      const hit = ptrState.hit as PressHit & { kind: "node" }
      return [IDLE, [{ type: "node.select", ids: [hit.nodeId] }]]
    }

    case "pointerMove": {
      const dist = distance(ptrState.origin, { x: event.x, y: event.y })
      if (dist >= helpers.dragThreshold) {
        // Manipulation drag — selection stays, app handles drag
        return [
          IDLE,
          [
            {
              type: "manipulation-drag",
              hit: ptrState.hit,
              origin: ptrState.origin,
            },
          ],
        ]
      }
      return [ptrState, []]
    }

    case "escape":
      return [IDLE, []]

    default:
      return [ptrState, []]
  }
}

function handlePointingText(
  ptrState: PointerState & { phase: "pointing-text" },
  event: PointerEvent,
  helpers: PointerHelpers,
): [PointerState, SelectionEffect[]] {
  switch (event.type) {
    case "pointerUp": {
      const hit = ptrState.hit as PressHit & { kind: "text" }
      return [IDLE, [{ type: "text.edit", nodeId: hit.nodeId, offset: hit.offset }]]
    }

    case "pointerMove": {
      const dist = distance(ptrState.origin, { x: event.x, y: event.y })
      if (dist >= helpers.dragThreshold) {
        const hit = ptrState.hit as PressHit & { kind: "text" }
        return [
          {
            phase: "dragging-text",
            hit: ptrState.hit,
            origin: ptrState.origin,
          },
          [
            { type: "text.edit", nodeId: hit.nodeId, offset: hit.offset },
            {
              type: "drag.start",
              hit: ptrState.hit,
              origin: ptrState.origin,
            },
          ],
        ]
      }
      return [ptrState, []]
    }

    case "escape":
      return [IDLE, []]

    default:
      return [ptrState, []]
  }
}

// --- Dragging states (after threshold) ---

function handleDraggingArea(
  ptrState: PointerState & { phase: "dragging-area" },
  event: PointerEvent,
  helpers: PointerHelpers,
): [PointerState, SelectionEffect[]] {
  switch (event.type) {
    case "pointerMove": {
      const hit = helpers.hitTest(event.x, event.y)

      if (hit.kind === "text") {
        // Morph area -> text drag
        return [
          {
            phase: "dragging-text",
            hit: ptrState.hit,
            origin: ptrState.origin,
          },
          [{ type: "text.edit", nodeId: hit.nodeId, offset: hit.offset }],
        ]
      }

      // Area select: find nodes in rect
      const ids = helpers.nodesInRect(ptrState.origin, {
        x: event.x,
        y: event.y,
      })
      const effects: SelectionEffect[] = []

      // If we were in text mode, clear sub first
      effects.push({ type: "sub.clear" })

      if (event.modifiers.cmd) {
        effects.push({ type: "node.select", ids, toggle: true })
      } else {
        effects.push({ type: "node.select", ids })
      }

      return [ptrState, effects]
    }

    case "pointerUp":
      return [IDLE, [{ type: "drag.end" }]]

    case "escape":
      return [IDLE, [{ type: "drag.cancel" }]]

    default:
      return [ptrState, []]
  }
}

function handleDraggingText(
  ptrState: PointerState & { phase: "dragging-text" },
  event: PointerEvent,
  helpers: PointerHelpers,
): [PointerState, SelectionEffect[]] {
  switch (event.type) {
    case "pointerMove": {
      const hit = helpers.hitTest(event.x, event.y)

      if (hit.kind === "text") {
        // Continue text drag: extend text range
        return [ptrState, [{ type: "text.select", cursor: hit.offset }]]
      }

      // Morph text -> area drag
      const ids = helpers.nodesInRect(ptrState.origin, {
        x: event.x,
        y: event.y,
      })
      return [
        {
          phase: "dragging-area",
          hit: ptrState.hit,
          origin: ptrState.origin,
        },
        [{ type: "sub.clear" }, { type: "node.select", ids }],
      ]
    }

    case "pointerUp":
      return [IDLE, [{ type: "drag.end" }]]

    case "escape":
      return [IDLE, [{ type: "drag.cancel" }]]

    default:
      return [ptrState, []]
  }
}

// --- Double-click ---

function handleDoubleClick(hit: PressHit): [PointerState, SelectionEffect[]] {
  switch (hit.kind) {
    case "node":
      return [IDLE, [{ type: "text.edit", nodeId: hit.nodeId, offset: 0 }]]
    case "text":
      // Select word — emit text.edit at offset; word boundary detection is app-defined
      return [IDLE, [{ type: "text.edit", nodeId: hit.nodeId, offset: hit.offset }]]
    case "empty":
      return [IDLE, []]
  }
}
