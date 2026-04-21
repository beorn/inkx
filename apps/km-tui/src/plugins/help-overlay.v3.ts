/**
 * HelpOverlay v3 — `pipe()` + `with*()` + `createSlice` shape.
 *
 * Replaces both:
 *   v1: `with-help-overlay.ts`  (213 LOC, zustand + bridge + hook)
 *   v2: `help-overlay.v2.ts`    ( 33 LOC, definePlugin factory)
 *
 * v3 pattern (validated by aichat composition prototype, 2026-04-21):
 *   - pure reducer via createSlice (typed dispatch, no name string needed)
 *   - with*() shape for the capability: withHelpOverlay(app) → app & { help }
 *   - integrates into the existing silvery pipe() substrate
 *   - NO factory, NO name namespace, NO per-plugin zustand store
 *
 * Feature-flagged via KM_TEA_HELP_V3=1 so parity tests exercise all three
 * paths (v1 legacy, v2 definePlugin, v3 pipe/with). v1 and v2 stay in
 * place until v3 cutover lands in production (km-tui.tea-help-overlay-v3).
 *
 * ## Known upstream issue (filed as next-session followup)
 *
 * `withApp()` from `@silvery/create` returns `{...app, ...appExt}` — a
 * fresh object — which silently breaks the apply-chain contract
 * documented in `runtime/base-app.ts`. `BaseApp.dispatch` is closed over
 * the original `app`, so any downstream plugin that captures `app.apply`
 * and replaces it on the post-spread object never gets invoked. Fix is
 * one line (`Object.assign(app, appExt)`), but the v3 wrapper cannot
 * depend on that fix landing before its first cutover, so it is
 * deliberately written to require ONLY `BaseApp`. If the app it receives
 * happens to also satisfy `AppWithApp`, the wrapper registers its four
 * commands via `app.keymap()`; otherwise it skips registration silently.
 * The state machine is identical in both cases.
 *
 * See:
 *   hub/silvery/prototype/pipe-with-composition/help-overlay.v3.ts (spike)
 *   hub/silvery/prototype/pipe-with-composition/README.md          (rationale)
 */
import { createSlice, pipe, type AppPlugin, type AppWithApp, type CommandEntry } from "@silvery/create"
import { createBaseApp, type BaseApp } from "@silvery/create/plugins"
import { useSyncExternalStore } from "react"

// =============================================================================
// State + reducer (pure — testable without React)
// =============================================================================

export interface HelpState {
  visible: boolean
  scrollOffset: number
}

const init = (): HelpState => ({ visible: false, scrollOffset: 0 })

/**
 * Pure reducer. Each handler returns the next state (or the same one, to
 * signal no-op — avoids pointless rerenders).
 */
export const helpSlice = createSlice(init, {
  show: (s: HelpState): HelpState => (s.visible ? s : { visible: true, scrollOffset: 0 }),
  hide: (s: HelpState): HelpState => (s.visible ? { visible: false, scrollOffset: 0 } : s),
  toggle: (s: HelpState): HelpState =>
    s.visible ? { visible: false, scrollOffset: 0 } : { visible: true, scrollOffset: 0 },
  scrollUp: (s: HelpState): HelpState => (s.visible ? { ...s, scrollOffset: Math.max(0, s.scrollOffset - 1) } : s),
  scrollDown: (s: HelpState): HelpState => (s.visible ? { ...s, scrollOffset: s.scrollOffset + 1 } : s),
})

export const helpInit = init

// =============================================================================
// Feature flag
// =============================================================================

export const isTeaHelpV3Enabled = (): boolean => process.env.KM_TEA_HELP_V3 === "1"

// =============================================================================
// withHelpOverlay() — AppPlugin<BaseApp, HelpContribution>
// =============================================================================
//
// Contract:
//   - wraps `app.apply` to handle ops prefixed `help.`; delegates other ops
//     to the downstream chain via `prev(op)`.
//   - owns state in a closure (no external store — instance lifetime is
//     the `pipe()` call's lifetime).
//   - notifies subscribers on state change; no-op transitions (same ref
//     from the slice) do not notify, so `useSyncExternalStore` skips
//     re-render.
//   - registers 4 discoverable commands via `app.keymap({...})` IF the
//     app also satisfies `AppWithApp`. Otherwise skipped (see upstream
//     note at the top of the file). Commands dispatch back through
//     `app.dispatch({type:"help.*"})` so the apply chain is the single
//     source of truth.
//
// Intentionally synchronous, no effects. Help has no I/O and no
// cross-plugin dispatches today. Future hooks (e.g. "opening help dims
// the board") would emit `{type:"dispatch", op:...}` effects from apply
// and rely on BaseApp's drain loop to re-enter the chain.

/** The capability this plugin contributes to the pipe. */
export interface HelpContribution {
  help: {
    /** Current state snapshot — stable ref when nothing changed. */
    get(): HelpState
    /** Subscribe to state changes. Returns unsubscribe. */
    subscribe(listener: () => void): () => void
  }
}

/** Op shape handled by the wrapper. */
type HelpOpShape = { type: `help.${"show" | "hide" | "toggle" | "scrollUp" | "scrollDown"}` }

// Slice method names we route ops to. `apply` / `Op` / `create` are slice
// machinery, not handlers, and must not be treated as ops.
const HELP_SLICE_HANDLERS = new Set(["show", "hide", "toggle", "scrollUp", "scrollDown"])

/** True when the given app also exposes `AppWithApp` (registries + keymap). */
function hasKeymap(app: object): app is AppWithApp {
  return typeof (app as { keymap?: unknown }).keymap === "function"
}

export function withHelpOverlay<A extends BaseApp>(): AppPlugin<A, A & HelpContribution> {
  return (app) => {
    let state: HelpState = init()
    const listeners = new Set<() => void>()
    const notify = (): void => {
      for (const l of listeners) l()
    }

    // --- apply chain: handle help.* ops, delegate everything else ---
    const prev = app.apply
    app.apply = (op) => {
      if (typeof op.type !== "string" || !op.type.startsWith("help.")) return prev(op)
      const method = op.type.slice("help.".length)
      if (!HELP_SLICE_HANDLERS.has(method)) return prev(op)
      const next = helpSlice.apply(state, { op: method } as Parameters<typeof helpSlice.apply>[1])
      if (next === state) return []
      state = next
      notify()
      return []
    }

    // --- optional: register discoverable commands if the app has withApp ---
    if (hasKeymap(app)) {
      const bindings: Record<string, CommandEntry> = {
        "?": { title: "Toggle help", fn: () => app.dispatch({ type: "help.toggle" } as HelpOpShape) },
        Escape: {
          title: "Close help",
          fn: () => app.dispatch({ type: "help.hide" } as HelpOpShape),
          when: () => state.visible,
        },
        j: {
          title: "Scroll help down",
          fn: () => app.dispatch({ type: "help.scrollDown" } as HelpOpShape),
          when: () => state.visible,
        },
        k: {
          title: "Scroll help up",
          fn: () => app.dispatch({ type: "help.scrollUp" } as HelpOpShape),
          when: () => state.visible,
        },
      }
      app.keymap(bindings)
    }

    return Object.assign(app, {
      help: {
        get: () => state,
        subscribe(l: () => void) {
          listeners.add(l)
          return () => {
            listeners.delete(l)
          }
        },
      },
    })
  }
}

// =============================================================================
// React bridge
// =============================================================================

/** Read help state from an app that has been composed with `withHelpOverlay()`. */
export function useHelpOverlayV3(app: HelpContribution): HelpState {
  return useSyncExternalStore(app.help.subscribe, app.help.get, app.help.get)
}

// =============================================================================
// Production singleton — shared by board-actions dual-write + React bridge
// =============================================================================
//
// km-tui today doesn't run a single `pipe(createBaseApp, withApp, ...)` chain
// yet (see tui.tsx:383 TODO). So the production v3 path stands up its own
// mini-chain as a module-level singleton — same lifetime model v1 and v2
// use for the same reason. When km graduates to a unified pipe chain (Phase
// 1 / `withDialogs`), this singleton drops in favor of the real app; the
// wrapper itself doesn't change.
//
// Production builds intentionally skip `withApp()` until the upstream
// spread-break is fixed — see the top-of-file note. Unit tests may still
// build `pipe(createBaseApp(), withApp(), withHelpOverlay())` once that
// lands to exercise the keymap branch end-to-end.

export type HelpV3App = BaseApp & HelpContribution

let singleton: HelpV3App | null = null

/** The process-wide v3 app. Built lazily so tests can opt-out by flipping the flag. */
export function getHelpV3App(): HelpV3App {
  if (!singleton) singleton = pipe(createBaseApp(), withHelpOverlay())
  return singleton
}

/** Test-only: discard the singleton so the next `getHelpV3App()` call is fresh. */
export function resetHelpV3App(): void {
  singleton = null
}
