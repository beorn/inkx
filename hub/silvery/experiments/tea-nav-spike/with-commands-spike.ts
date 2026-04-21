/**
 * withCommandsSpike — a minimal keybinding/command plugin for the
 * Phase 2 dialog-precedence spike.
 *
 * Responsibilities (deliberately tiny):
 *   - Ctrl+P (or `/`)      → dispatch { type: "dialog:open" }
 *   - `j`  (dialog closed) → dispatch { type: "cursor_down" }
 *   - Enter (dialog open)  → dispatch { type: "cursor_down" }
 *                            (Pro's "Enter dispatches one board op")
 *   - Escape while closed  → pass through (no-op)
 *
 * When the dialog is OPEN, this plugin does NOT fire board keybindings
 * (j, k, etc) because the dialog plugin — installed OUTER in pipe() —
 * consumes those keys first.
 *
 * Precedence ordering the pipe expects:
 *
 *   pipe(
 *     createBaseApp(),
 *     withTerminalChain(),    // base: observer
 *     withInputChain,         // fallback useInput
 *     withBoardSpike(),       // inner: board ops
 *     withCommandsSpike(...), // middle: key -> op translation
 *     withDialogSpike,        // outer: focus scope
 *   )
 *
 * So dispatch order is: dialog -> commands -> board -> input -> terminal.
 */

import type { ApplyResult, Effect, Op } from "@silvery/create/types"
import type { BaseApp } from "@silvery/create/runtime/base-app"

import { getTracer } from "./trace.ts"
import type { DialogSpikeStore } from "./with-dialog-spike.ts"

interface KeyWithNamedParts {
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
  super?: boolean
  hyper?: boolean
  return?: boolean
  escape?: boolean
  leftArrow?: boolean
  rightArrow?: boolean
  backspace?: boolean
  eventType?: "press" | "repeat" | "release"
}

/**
 * The commands plugin needs to know whether the dialog is open so that
 * Enter maps to a board op only in that context. It takes the dialog
 * store as an explicit dependency — classic DI that keeps this plugin
 * independent of dialog internals.
 */
export interface WithCommandsSpikeDeps {
  dialog: DialogSpikeStore
}

export function withCommandsSpike(deps: WithCommandsSpikeDeps) {
  return <A extends BaseApp>(app: A): A => {
    const t = getTracer("withCommandsSpike")
    const prev = app.apply
    app.apply = (op: Op): ApplyResult => {
      if (op.type !== "input:key") return t.passed(op, prev(op))

      const input = (op as { input?: string }).input
      const key = (op as { key?: KeyWithNamedParts }).key
      if (key?.eventType === "release") return t.passed(op, prev(op))

      const dialogOpen = deps.dialog.state.open

      // Ctrl+P opens the dialog. We only care when the dialog is NOT
      // already open — otherwise let the dialog see the key itself.
      if (!dialogOpen && key?.ctrl && input === "p") {
        return t.handled(op, [{ type: "dispatch", op: { type: "dialog:open" } }])
      }

      // Enter inside the dialog → board cursor_down. Outside the dialog
      // we don't bind Enter, so it passes through.
      if (dialogOpen && key?.return) {
        return t.handled(op, [{ type: "dispatch", op: { type: "cursor_down" } }])
      }

      // `j` outside the dialog → board cursor_down.
      if (!dialogOpen && input === "j") {
        return t.handled(op, [{ type: "dispatch", op: { type: "cursor_down" } }])
      }

      return t.passed(op, prev(op))
    }
    return app
  }
}
