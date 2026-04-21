/**
 * HelpOverlay v3 — `pipe()` + `with*()` + `createSlice` shape.
 *
 * Lineage:
 *   v1: `with-help-overlay.ts` (213) + bridge (60) + hook (23)  = 296 LOC / 3 files / singleton
 *   v2: `help-overlay.v2.ts`                                    =  33 LOC / definePlugin factory
 *   v3: this file                                               =  42 LOC / pipe plugin
 *
 * Why v3 is 9 LOC larger than v2:
 *   +createSlice init factory    (explicit, testable without React)
 *   +apply wrapper               (composes into the pipe's apply chain)
 *   +useHelpOverlay hook         (reads from app via useSyncExternalStore)
 *
 * What v3 enables that v2 couldn't:
 *   - emit cross-plugin dispatches ({type:"dispatch", op:...}) — e.g. "opening
 *     help dims the board" without a factory wiring layer.
 *   - participate in the pipe's ordering (runs BEFORE or AFTER withFocusChain
 *     as appropriate — v2's per-plugin store is outside any ordering).
 *   - register commands via withApp.keymap() so help shows up in the palette.
 */

import { createSlice, type AppPlugin } from "@silvery/create"
import type { BaseApp } from "@silvery/create/runtime/base-app"
import type { AppWithApp } from "@silvery/create"
import { useSyncExternalStore } from "react"

export interface HelpState {
  visible: boolean
  scrollOffset: number
}

export const helpSlice = createSlice(
  (): HelpState => ({ visible: false, scrollOffset: 0 }),
  {
    show: (s) => (s.visible ? s : { visible: true, scrollOffset: 0 }),
    hide: (s) => (s.visible ? { visible: false, scrollOffset: 0 } : s),
    toggle: (s) => (s.visible ? { visible: false, scrollOffset: 0 } : { visible: true, scrollOffset: 0 }),
    scrollUp: (s) => (s.visible ? { ...s, scrollOffset: Math.max(0, s.scrollOffset - 1) } : s),
    scrollDown: (s) => (s.visible ? { ...s, scrollOffset: s.scrollOffset + 1 } : s),
  },
)

export type HelpContribution = {
  help: { get(): HelpState; subscribe(l: () => void): () => void }
}

export function withHelpOverlay(): AppPlugin<BaseApp & AppWithApp, HelpContribution> {
  return (app) => {
    let state: HelpState = { visible: false, scrollOffset: 0 }
    const listeners = new Set<() => void>()
    const notify = () => { for (const l of listeners) l() }
    const prev = app.apply

    app.apply = (op) => {
      if (!op.type.startsWith("help.")) return prev(op)
      const method = op.type.slice("help.".length) as keyof typeof helpSlice
      const next = (helpSlice as any)[method](state, op) as HelpState
      if (next === state) return []
      state = next
      notify()
      return []
    }

    app.keymap({
      "?": { title: "Toggle help", fn: () => app.dispatch({ type: "help.toggle" }) },
      Escape: { title: "Close help", fn: () => app.dispatch({ type: "help.hide" }), when: () => state.visible },
      j: { title: "Scroll help down", fn: () => app.dispatch({ type: "help.scrollDown" }), when: () => state.visible },
      k: { title: "Scroll help up", fn: () => app.dispatch({ type: "help.scrollUp" }), when: () => state.visible },
    })

    return Object.assign(app, {
      help: {
        get: () => state,
        subscribe(l: () => void) {
          listeners.add(l)
          return () => listeners.delete(l)
        },
      },
    })
  }
}

export function useHelpOverlay(app: { help: HelpContribution["help"] }): HelpState {
  return useSyncExternalStore(app.help.subscribe, app.help.get, app.help.get)
}
