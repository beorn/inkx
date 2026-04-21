/**
 * aichat-composed — aichat's feature plugins expressed via pipe() + with*() + createSlice.
 *
 * STATUS: research spike. Does not run. Types check against the silvery surface
 *         but no attempt is made to compile the full app (the components.tsx
 *         view is shown briefly at the bottom, not re-implemented).
 *
 * Shape:
 *   pipe(createBaseApp(), withApp(), withScript(...), withStream(...), ...)
 *
 * Every feature lives in its own ~40-80 LOC plugin function. Each plugin:
 *   - owns its slice of state via createSlice
 *   - wraps app.apply to handle its own ops
 *   - emits {type:"dispatch", op} for cross-plugin messaging
 *   - emits fx.delay / fx.interval / fx.cancel timer effects for animation
 *
 * See pipe-with-composition-prototype.md for the design doc.
 */

import React, { useCallback, useSyncExternalStore } from "react"
import { Box, Text, ListView, useWindowSize, useTerminalFocused } from "silvery"
import { run, useExit } from "silvery/runtime"
import {
  createBaseApp,
  createSlice,
  fx,
  pipe,
  withApp,
  withReact,
  type AppPlugin,
} from "@silvery/create"
import type { BaseApp } from "@silvery/create/runtime/base-app"
import type { AppWithApp } from "@silvery/create"
import type { Exchange, ScriptEntry, ToolCall } from "../../vendor/silvery/examples/apps/aichat/types"

// =============================================================================
// Shared types
// =============================================================================

/** One cross-plugin event: a plugin's state changed in a way worth broadcasting. */
type Subscriber = () => void

/** Minimal subscribable slice wrapper — used by all plugins to bridge React. */
interface SubscribableSlice<S> {
  get(): S
  subscribe(listener: Subscriber): () => void
}

function asSubscribable<S>(initial: S): SubscribableSlice<S> & { set(next: S): void } {
  let state = initial
  const listeners = new Set<Subscriber>()
  return {
    get: () => state,
    set(next) {
      if (next === state) return
      state = next
      for (const l of listeners) l()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

// =============================================================================
// withScript — script walk-through + exchange list
// =============================================================================

export interface ScriptState {
  exchanges: Exchange[]
  scriptIdx: number
  offScript: boolean
  nextId: number
}

const scriptSlice = createSlice(
  (): ScriptState => ({ exchanges: [], scriptIdx: 0, offScript: false, nextId: 1 }),
  {
    appendExchange: (s, { entry }: { entry: ScriptEntry }): ScriptState => ({
      ...s,
      exchanges: [...s.exchanges, { ...entry, id: s.nextId }],
      nextId: s.nextId + 1,
    }),
    advance: (s): ScriptState => ({ ...s, scriptIdx: s.scriptIdx + 1 }),
    setOffScript: (s, { offScript }: { offScript: boolean }): ScriptState => ({ ...s, offScript }),
    skipUser: (s, { nextIdx }: { nextIdx: number }): ScriptState => ({ ...s, scriptIdx: nextIdx }),
  },
)
export type ScriptContribution = { script: SubscribableSlice<ScriptState>; scriptSlice: typeof scriptSlice }

export function withScript(opts: {
  script: ScriptEntry[]
  autoMode: boolean
  fastMode: boolean
  initial: Exchange[]
}): AppPlugin<BaseApp, ScriptContribution> {
  return (app) => {
    const box = asSubscribable<ScriptState>({
      exchanges: opts.initial,
      scriptIdx: 0,
      offScript: false,
      nextId: opts.initial.length + 1,
    })
    const prev = app.apply

    app.apply = (op) => {
      if (op.type === "script.appendExchange") {
        box.set((scriptSlice as any).appendExchange(box.get(), op))
        return []
      }
      if (op.type === "script.advance") {
        const s = box.get()
        if (s.scriptIdx >= opts.script.length) {
          // Off-script: trigger a random response via withStream.
          box.set({ ...s, offScript: true })
          return [fx.delay(1200, { type: "script.respondRandom" })]
        }
        const entry = opts.script[s.scriptIdx]!
        box.set({ ...(scriptSlice as any).advance(s), exchanges: [...s.exchanges, { ...entry, id: s.nextId }], nextId: s.nextId + 1 })
        // Hand off to withStream.
        return [{ type: "dispatch", op: { type: "stream.startStreaming", hasThinking: !!entry.thinking, isAgent: entry.role === "agent" } }]
      }
      if (op.type === "script.respondRandom") {
        // withStream handles the random response logic; we just forward.
        return [{ type: "dispatch", op: { type: "stream.startRandom" } }]
      }
      return prev(op)
    }

    return Object.assign(app, { script: box, scriptSlice }) as typeof app & ScriptContribution
  }
}

// =============================================================================
// withStream — thinking spinner, reveal fraction, tool-call timing, pulse
// =============================================================================

export type StreamPhase = "idle" | "thinking" | "streaming" | "tools" | "done"
export interface StreamState {
  phase: StreamPhase
  revealFraction: number
  pulse: boolean
}

const streamSlice = createSlice(
  (): StreamState => ({ phase: "idle", revealFraction: 1, pulse: false }),
  {
    startThinking: (s): StreamState => ({ ...s, phase: "thinking", revealFraction: 0 }),
    startStreaming: (s): StreamState => ({ ...s, phase: "streaming", revealFraction: 0 }),
    startTools: (s): StreamState => ({ ...s, phase: "tools", revealFraction: 1 }),
    tick: (s, { rate }: { rate: number }): StreamState => ({
      ...s,
      revealFraction: Math.min(s.revealFraction + rate, 1),
    }),
    done: (s): StreamState => ({ ...s, phase: "done", revealFraction: 1 }),
    togglePulse: (s): StreamState => ({ ...s, pulse: !s.pulse }),
  },
)
export type StreamContribution = { stream: SubscribableSlice<StreamState> }

export function withStream(opts: {
  fast: boolean
  getLast: () => Exchange | undefined
}): AppPlugin<BaseApp & ScriptContribution & AppWithApp, StreamContribution> {
  return (app) => {
    const box = asSubscribable<StreamState>({ phase: "idle", revealFraction: 1, pulse: false })
    const prev = app.apply

    // Pulse ticker — a tiny heartbeat effect; kicked off by withMount.
    app.apply = (op) => {
      if (op.type === "stream.startStreaming") {
        const { hasThinking, isAgent } = op as any
        if (!isAgent || opts.fast) {
          box.set({ phase: "done", revealFraction: 1, pulse: box.get().pulse })
          return [{ type: "dispatch", op: { type: "script.advance" } }]
        }
        if (hasThinking) {
          box.set({ ...box.get(), phase: "thinking", revealFraction: 0 })
          return [fx.delay(1200, { type: "stream.endThinking" })]
        }
        box.set({ ...box.get(), phase: "streaming", revealFraction: 0 })
        return [fx.interval(50, { type: "stream.tick", rate: 0.12 }, "reveal")]
      }
      if (op.type === "stream.endThinking") {
        box.set({ ...box.get(), phase: "streaming", revealFraction: 0 })
        return [fx.interval(50, { type: "stream.tick", rate: 0.08 }, "reveal")]
      }
      if (op.type === "stream.tick") {
        const rate = (op as any).rate ?? 0.12
        const next = Math.min(box.get().revealFraction + rate, 1)
        box.set({ ...box.get(), revealFraction: next })
        if (next < 1) return []
        const last = opts.getLast()
        const toolCalls = last?.toolCalls ?? []
        if (toolCalls.length > 0) {
          box.set({ ...box.get(), phase: "tools" })
          return [fx.cancel("reveal"), fx.delay(600 * toolCalls.length, { type: "stream.endTools" })]
        }
        box.set({ ...box.get(), phase: "done" })
        return [fx.cancel("reveal"), { type: "dispatch", op: { type: "script.advance" } }]
      }
      if (op.type === "stream.endTools") {
        box.set({ ...box.get(), phase: "done" })
        return [{ type: "dispatch", op: { type: "script.advance" } }]
      }
      if (op.type === "stream.togglePulse") {
        box.set({ ...box.get(), pulse: !box.get().pulse })
        return []
      }
      return prev(op)
    }

    return Object.assign(app, { stream: box }) as typeof app & StreamContribution
  }
}

// =============================================================================
// withMount — kicks off the pulse ticker + initial script advance
// =============================================================================

export function withMount(opts: { autoMode: boolean }): AppPlugin<
  BaseApp & ScriptContribution & StreamContribution,
  {}
> {
  return (app) => {
    const prev = app.apply
    app.apply = (op) => {
      if (op.type === "mount") {
        const effects = [fx.interval(400, { type: "stream.togglePulse" }, "pulse")]
        if (opts.autoMode) effects.push({ type: "dispatch", op: { type: "script.advance" } } as any)
        return effects
      }
      return prev(op)
    }
    return app
  }
}

// =============================================================================
// withCompact — /compact lifecycle + auto-trigger at 95% context
// =============================================================================

export interface CompactState {
  compacting: boolean
  contextBaseline: number
}

export function withCompact(opts: { fast: boolean; contextWindow: number }): AppPlugin<
  BaseApp & ScriptContribution,
  { compact: SubscribableSlice<CompactState> }
> {
  return (app) => {
    const box = asSubscribable<CompactState>({ compacting: false, contextBaseline: 0 })
    const prev = app.apply

    app.apply = (op) => {
      if (op.type === "compact.trigger") {
        if (box.get().compacting) return []
        const exchanges = app.script.get().exchanges
        const currentContext = exchanges.reduce((m, ex) => Math.max(m, ex.tokens?.input ?? 0), 0)
        box.set({ compacting: true, contextBaseline: currentContext })
        return [
          fx.cancel("reveal"),
          fx.cancel("typing"),
          fx.delay(opts.fast ? 300 : 3000, { type: "compact.done" }),
        ]
      }
      if (op.type === "compact.done") {
        box.set({ ...box.get(), compacting: false })
        return [{ type: "dispatch", op: { type: "script.advance" } }]
      }
      return prev(op)
    }

    return Object.assign(app, { compact: box })
  }
}

// =============================================================================
// withSubmit — user-submitted text + off-script fallback
// =============================================================================

export function withSubmit(): AppPlugin<
  BaseApp & ScriptContribution & StreamContribution,
  {}
> {
  return (app) => {
    const prev = app.apply
    app.apply = (op) => {
      if (op.type === "submit") {
        const text = (op as any).text as string
        if (!text.trim()) return [fx.cancel("typing")]
        // Fast-forward any streaming.
        const effects: any[] = [fx.cancel("reveal"), fx.cancel("typing")]
        effects.push({
          type: "dispatch",
          op: {
            type: "script.appendExchange",
            entry: { role: "user", content: text, tokens: { input: text.length * 4, output: 0 } },
          },
        })
        effects.push({ type: "dispatch", op: { type: "script.advance" } })
        return effects
      }
      return prev(op)
    }
    return app
  }
}

// =============================================================================
// withKeys — global keybindings (Escape, Tab, Ctrl+D, Ctrl+L)
// =============================================================================

export function withKeys(): AppPlugin<
  BaseApp & AppWithApp & ScriptContribution & StreamContribution,
  { keys: SubscribableSlice<{ ctrlDPending: boolean }> }
> {
  return (app) => {
    const box = asSubscribable<{ ctrlDPending: boolean; lastCtrlD: number }>({
      ctrlDPending: false,
      lastCtrlD: 0,
    })

    // Commands — registered via withApp.keymap so they show up in the palette.
    app.keymap({
      Escape: { title: "Exit", fn: () => app.dispatch({ type: "app.exit" }) },
      "ctrl+l": { title: "Compact context", fn: () => app.dispatch({ type: "compact.trigger" }) },
      "ctrl+d": {
        title: "Quit (double-tap)",
        fn: () => {
          const now = Date.now()
          const prev = box.get()
          if (now - prev.lastCtrlD < 500) app.dispatch({ type: "app.exit" })
          else {
            box.set({ ctrlDPending: true, lastCtrlD: now })
          }
        },
      },
    })

    return Object.assign(app, {
      keys: { get: () => ({ ctrlDPending: box.get().ctrlDPending }), subscribe: box.subscribe },
    })
  }
}

// =============================================================================
// withAutoExit — effect-only plugin: on done=true + autoStart, delay-exit
// =============================================================================

export function withAutoExit(opts: { autoStart: boolean }): AppPlugin<BaseApp, {}> {
  return (app) => {
    const prev = app.apply
    app.apply = (op) => {
      if (op.type === "session.done" && opts.autoStart) {
        return [fx.delay(1000, { type: "app.exit" })]
      }
      return prev(op)
    }
    return app
  }
}

// =============================================================================
// Composition — this is the whole architecture diagram.
// =============================================================================

export function buildAIChatApp(opts: {
  script: ScriptEntry[]
  autoStart: boolean
  fastMode: boolean
  view: React.ReactElement
  initial: Exchange[]
  contextWindow: number
}) {
  const app = pipe(
    createBaseApp(),
    withApp(),
    withScript({
      script: opts.script,
      autoMode: opts.autoStart,
      fastMode: opts.fastMode,
      initial: opts.initial,
    }),
    // withStream needs a peek at the latest exchange for tool-call timing —
    // a lambda rather than reaching into withScript's mutable state directly.
    withStream({
      fast: opts.fastMode,
      getLast: () => {
        const ex = app.script.get().exchanges
        return ex[ex.length - 1]
      },
    }),
    withMount({ autoMode: opts.autoStart }),
    withCompact({ fast: opts.fastMode, contextWindow: opts.contextWindow }),
    withSubmit(),
    withKeys(),
    withAutoExit({ autoStart: opts.autoStart }),
    withReact(opts.view),
  )
  return app
}

// =============================================================================
// React view — unchanged from current aichat (components.tsx provides the heavy
// lifting). View reads plugin slices via useAppSlice.
// =============================================================================

function useAppSlice<S>(slice: SubscribableSlice<S>): S {
  return useSyncExternalStore(slice.subscribe, slice.get, slice.get)
}

export function AIChatView({ app, script, autoStart }: {
  app: ReturnType<typeof buildAIChatApp>
  script: ScriptEntry[]
  autoStart: boolean
}) {
  const exit = useExit()
  const { rows: termRows } = useWindowSize()
  const scriptState = useAppSlice(app.script)
  const streamState = useAppSlice(app.stream)
  const compactState = useAppSlice(app.compact)
  const { ctrlDPending } = useAppSlice({
    get: () => app.keys.get(),
    subscribe: app.keys.subscribe,
  } as SubscribableSlice<{ ctrlDPending: boolean }>)

  // Mount — single dispatch, no hook graph.
  React.useEffect(() => {
    app.dispatch({ type: "mount" })
  }, [app])

  const onSubmit = useCallback(
    (text: string) => app.dispatch({ type: "submit", text }),
    [app],
  )

  // The actual render is identical to current aichat — ListView + DemoFooter.
  // Omitted here for brevity (this is a code sketch, not a full port).
  return (
    <Box flexDirection="column" width="100%" paddingX={1}>
      <ListView
        items={scriptState.exchanges}
        getKey={(ex) => ex.id}
        height={termRows}
        estimateHeight={6}
        renderItem={(ex, index) => {
          const isLatest = index === scriptState.exchanges.length - 1
          // ... ExchangeItem call with streamState.phase / revealFraction / pulse ...
          return <Box>{/* see components.tsx */}</Box>
        }}
      />
      {/* DemoFooter unchanged, passes onSubmit + ctrlDPending + streamState */}
    </Box>
  )
}

// =============================================================================
// Main
// =============================================================================

export async function main() {
  const args = process.argv.slice(2)
  const script: ScriptEntry[] = [] // loaded elsewhere
  const initial: Exchange[] = [{ id: 0, role: "system", content: "Intro..." }]
  const autoStart = args.includes("--auto")
  const fastMode = args.includes("--fast")

  // We pass a placeholder view in; the real view receives app via context.
  let appRef: ReturnType<typeof buildAIChatApp> | null = null
  const Placeholder = () => (appRef ? <AIChatView app={appRef} script={script} autoStart={autoStart} /> : null)

  const app = buildAIChatApp({
    script,
    autoStart,
    fastMode,
    view: <Placeholder />,
    initial,
    contextWindow: 200_000,
  })
  appRef = app

  using handle = await run(app, { mode: "inline" })
  await handle.waitUntilExit()
}
