/**
 * withDialogSpike — a throwaway apply-chain plugin that proves dialog
 * precedence works on the real substrate.
 *
 * This plugin answers the Phase 2 question from GPT-5.4 Pro's dual-pro
 * review: "can a dialog that owns focus scope cleanly intercept input
 * keys via the apply chain without special ordering hacks?"
 *
 * ## Behavior
 *
 *   - Installs OUTERMOST in the pipe() so it sees ops first. Checks an
 *     `open` flag; when open, consumes `input:key` events and updates
 *     a `query` string in its own closure-owned state.
 *   - Recognizes these input:key shapes:
 *       * printable ASCII → insert at caret
 *       * left/right arrows → move caret within the query
 *       * backspace → delete character to the left of caret
 *       * escape → close dialog (handled=[])
 *   - Everything else the dialog does not handle passes through to
 *     `prev(op)` — this is how the board still sees board ops dispatched
 *     as effects (e.g. Enter → cursor_down) while the dialog is open.
 *   - Exposes `app.dialog.state` for tests.
 *
 * ## Precedence proof
 *
 *   - When `open`, arrow keys and letters NEVER reach the board plugin.
 *     They mutate `query` and return `[]` (handled, no effects).
 *   - When closed, the plugin returns `false` for every input:key — full
 *     pass-through. So the board gets j/k/etc. back.
 *
 * ## Open/close ops
 *
 * The plugin also recognises two control ops (dispatched by
 * withCommandsSpike):
 *   - { type: "dialog:open" }
 *   - { type: "dialog:close" }
 */

import type { ApplyResult, Effect, Op } from "@silvery/create/types"
import type { BaseApp } from "@silvery/create/runtime/base-app"

import { getTracer } from "./trace.ts"

export interface DialogSpikeState {
  open: boolean
  query: string
  /** Caret position within query; 0..query.length. */
  caret: number
}

export interface DialogSpikeStore {
  readonly state: DialogSpikeState
}

type PrintableKey = { input: string }

function isPrintable(input: string | undefined): input is string {
  // Single-character printable ASCII — the tight subset the spike cares
  // about (no Unicode / combining characters: this is a spike, not a
  // real input widget).
  if (!input || input.length !== 1) return false
  const code = input.charCodeAt(0)
  return code >= 0x20 && code < 0x7f
}

interface KeyWithNamedParts {
  leftArrow?: boolean
  rightArrow?: boolean
  escape?: boolean
  backspace?: boolean
  return?: boolean
  eventType?: "press" | "repeat" | "release"
}

export function withDialogSpike<A extends BaseApp>(app: A): A & { dialog: DialogSpikeStore } {
  const state: DialogSpikeState = { open: false, query: "", caret: 0 }
  const t = getTracer("withDialogSpike")

  const prev = app.apply
  app.apply = (op: Op): ApplyResult => {
    // ---- Control ops ----
    if (op.type === "dialog:open") {
      state.open = true
      state.query = ""
      state.caret = 0
      return t.handled(op, [{ type: "render" }])
    }
    if (op.type === "dialog:close") {
      state.open = false
      return t.handled(op, [{ type: "render" }])
    }

    // ---- Input key (only while open — THIS is the precedence proof) ----
    if (op.type === "input:key" && state.open) {
      const input = (op as { input?: string }).input
      const key = (op as { key?: KeyWithNamedParts }).key
      // Skip release events — the dialog only handles presses/repeats.
      if (key?.eventType === "release") return t.passed(op, prev(op))

      if (key?.escape) {
        // Close the dialog inline and consume the key. We don't emit a
        // dispatch effect for dialog:close because the state mutation is
        // trivially local.
        state.open = false
        return t.handled(op, [{ type: "render" }])
      }

      if (key?.leftArrow) {
        state.caret = Math.max(0, state.caret - 1)
        return t.handled(op, [{ type: "render" }])
      }

      if (key?.rightArrow) {
        state.caret = Math.min(state.query.length, state.caret + 1)
        return t.handled(op, [{ type: "render" }])
      }

      if (key?.backspace && state.caret > 0) {
        state.query = state.query.slice(0, state.caret - 1) + state.query.slice(state.caret)
        state.caret -= 1
        return t.handled(op, [{ type: "render" }])
      }

      if (isPrintable(input)) {
        state.query = state.query.slice(0, state.caret) + input + state.query.slice(state.caret)
        state.caret += input.length
        return t.handled(op, [{ type: "render" }])
      }

      // IMPORTANT precedence finding — Enter (`return`) is DELIBERATELY
      // left for downstream plugins (withCommandsSpike maps it to a
      // board op). This makes the dialog a "scoped focus" not a "hard
      // modal" — it swallows editing keys (printable, arrows,
      // backspace, escape) but lets commands still resolve confirm
      // actions. Real modals in km would probably want the same
      // behaviour: editing stays local, confirm/cancel are
      // command-system decisions.
      if (key?.return) return t.passed(op, prev(op))

      // Any other key while open is CONSUMED (handled-no-effects) —
      // modal focus scope means unknown keys don't leak to the board.
      return t.handled(op, [])
    }

    // ---- Otherwise, pass through ----
    return t.passed(op, prev(op))
  }

  return Object.assign(app, {
    dialog: {
      get state() {
        return state
      },
    },
  })
}
