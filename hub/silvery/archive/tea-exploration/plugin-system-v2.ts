/**
 * SUPERSEDED (2026-04-11). Current prototype: design/v15-tea/plugin-system-v1r.ts
 * Canonical design: design/v10-terminal/app-composition.md
 *
 * Plugin System v2 — Unified TEA Model (exploration, not adopted)
 *
 * ONE abstraction: (state, op) → [state, effects]
 *
 * The STORE is central:
 *   - React components REGISTER into it (via hooks)
 *   - Plugin apply handlers ROUTE through registered state
 *   - Effects are plain data, runners are swappable
 *
 * Three improvements over the first draft:
 *   1. Explicit "pass" return — no identity-based ambiguity
 *   2. Observer/handler split — observers always run, handlers first-match
 *   3. Immutable state — spread produces new objects, tea() handles subscriptions
 *
 * Run: bun hub/silvery/design/v15-tea/plugin-system-v2.ts
 *
 * References:
 *   docs/design/tea-state-machines.md — the principle
 *   packages/create/src/core/slice.ts — createSlice()
 *   packages/create/src/tea/index.ts  — tea() middleware + collect()
 */

// ============================================================================
// CORE
// ============================================================================

/** An effect is plain data with a type discriminant */
type Effect = { type: string; [key: string]: unknown }

/** Handler result: "pass" = I don't handle this op. [state, effects] = handled. */
type HandlerResult<S> = "pass" | readonly [S, Effect[]]

/** Observer result: always returns new state (or same state if no change). Never "pass". */
type ObserverResult<S> = S

/** Normalize a possibly-plain-state result to [state, effects] */
function collect<S>(result: S | readonly [S, Effect[]]): [S, Effect[]] {
  return Array.isArray(result) ? (result as [S, Effect[]]) : [result, []]
}

// ============================================================================
// COMPOSE — observer + handler split
// ============================================================================

type ObserverFn<S> = (state: S, op: Op) => ObserverResult<S>
type HandlerFn<S> = (state: S, op: Op) => HandlerResult<S>

/**
 * Compose observers and handlers into one apply function.
 *
 * Observers always run (modifier tracking, telemetry, recording).
 * Handlers: first match wins. "pass" means try next handler.
 *
 * Returns [state, effects, handled]. The handled flag lets the caller
 * know whether any handler claimed the op.
 */
function compose<S>(
  observers: ObserverFn<S>[],
  handlers: HandlerFn<S>[],
): (state: S, op: Op) => [S, Effect[], boolean] {
  return (state, op) => {
    // Observers always run, in order
    for (const obs of observers) {
      state = obs(state, op)
    }

    // Handlers: first match wins
    for (const h of handlers) {
      const result = h(state, op)
      if (result !== "pass") {
        const [newState, effects] = result
        return [newState, effects, true]
      }
    }

    return [state, [], false] // unhandled
  }
}

// ============================================================================
// TYPES
// ============================================================================

type Op = { op: string; [key: string]: unknown }

interface KeyData {
  ctrl: boolean
  shift: boolean
  meta: boolean
  super: boolean
  tab: boolean
  escape: boolean
  return: boolean
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  eventType?: "press" | "repeat" | "release"
  isModifierOnly?: boolean
}

function emptyKey(): KeyData {
  return {
    ctrl: false,
    shift: false,
    meta: false,
    super: false,
    tab: false,
    escape: false,
    return: false,
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
  }
}

// ============================================================================
// STORE — all state lives here (immutable updates)
// ============================================================================

interface Store {
  terminal: TerminalState
  focus: FocusState
  input: InputState
  board: BoardState
  keymap: Record<string, { op: string; [k: string]: unknown }>
}

interface TerminalState {
  cols: number
  rows: number
  focused: boolean
  modifiers: { super: boolean; ctrl: boolean; alt: boolean; shift: boolean }
}

interface FocusNode {
  id: string
  onKeyDown?: (input: string, key: KeyData) => boolean
  onPaste?: (text: string) => boolean
  nextFocusUp?: string
  nextFocusDown?: string
  nextFocusLeft?: string
  nextFocusRight?: string
}

interface FocusState {
  activeId: string | null
  previousId: string | null
  nodes: Map<string, FocusNode>
}

interface InputHandler {
  id: number
  handler: (input: string, key: KeyData) => void | "exit"
  active: boolean
}

interface InputState {
  handlers: InputHandler[]
  nextId: number
}

interface BoardState {
  cursor: string | null
  viewMode: "cards" | "columns" | "tabs"
}

// ============================================================================
// OBSERVERS — always run, never consume
// ============================================================================

/** Raw lane: update modifier state from every key event */
function modifierObserver(state: Store, op: Op): Store {
  if (op.op !== "key") return state
  const key = op.key as KeyData
  const newMods = { super: !!key.super, ctrl: !!key.ctrl, alt: !!key.meta, shift: !!key.shift }
  const old = state.terminal.modifiers
  if (
    newMods.super === old.super &&
    newMods.ctrl === old.ctrl &&
    newMods.alt === old.alt &&
    newMods.shift === old.shift
  )
    return state
  return { ...state, terminal: { ...state.terminal, modifiers: newMods } }
}

// ============================================================================
// HANDLERS — first match wins, return "pass" to skip
// ============================================================================

/** Terminal handler: resize, focus change */
function terminalHandler(state: Store, op: Op): HandlerResult<Store> {
  if (op.op === "resize") {
    return [
      { ...state, terminal: { ...state.terminal, cols: op.cols as number, rows: op.rows as number } },
      [{ type: "render" }],
    ]
  }
  if (op.op === "focus_change") {
    const focused = op.focused as boolean
    const mods = focused ? state.terminal.modifiers : { super: false, ctrl: false, alt: false, shift: false }
    return [{ ...state, terminal: { ...state.terminal, focused, modifiers: mods } }, []]
  }
  return "pass"
}

/** Focus handler: tab, escape, blur, spatial, focus dispatch */
function focusHandler(state: Store, op: Op): HandlerResult<Store> {
  const { focus } = state

  if (op.op === "focus_next") {
    const ids = [...focus.nodes.keys()]
    const curIdx = focus.activeId ? ids.indexOf(focus.activeId) : -1
    const nextId = ids[(curIdx + 1) % ids.length] ?? null
    return [{ ...state, focus: { ...focus, previousId: focus.activeId, activeId: nextId } }, [{ type: "render" }]]
  }
  if (op.op === "focus_prev") {
    const ids = [...focus.nodes.keys()]
    const curIdx = focus.activeId ? ids.indexOf(focus.activeId) : ids.length
    const prevId = ids[(curIdx - 1 + ids.length) % ids.length] ?? null
    return [{ ...state, focus: { ...focus, previousId: focus.activeId, activeId: prevId } }, [{ type: "render" }]]
  }
  if (op.op === "blur") {
    if (!focus.activeId) return "pass"
    return [{ ...state, focus: { ...focus, previousId: focus.activeId, activeId: null } }, [{ type: "render" }]]
  }
  if (op.op === "focus_id") {
    const id = op.id as string
    if (focus.activeId === id) return "pass"
    return [{ ...state, focus: { ...focus, previousId: focus.activeId, activeId: id } }, [{ type: "render" }]]
  }

  // Key dispatch: route to focused node's onKeyDown
  if (op.op === "key" && focus.activeId) {
    const node = focus.nodes.get(focus.activeId)
    if (node?.onKeyDown) {
      const consumed = node.onKeyDown(op.input as string, op.key as KeyData)
      if (consumed) return [state, [{ type: "render" }]]
    }
  }

  return "pass"
}

/** Keymap handler: resolve key string → domain op, produce dispatch effect */
function keymapHandler(state: Store, op: Op): HandlerResult<Store> {
  if (op.op !== "key") return "pass"
  const binding = state.keymap[op.input as string]
  if (!binding) return "pass"
  return [state, [{ type: "dispatch", ...binding }]]
}

/** Board (domain) handler */
function boardHandler(state: Store, op: Op): HandlerResult<Store> {
  const { board } = state
  if (op.op === "move_down") return [{ ...state, board: { ...board, cursor: "next-item" } }, [{ type: "render" }]]
  if (op.op === "move_up") return [{ ...state, board: { ...board, cursor: "prev-item" } }, [{ type: "render" }]]
  if (op.op === "cycle_view_mode") {
    const modes = ["cards", "columns", "tabs"] as const
    const i = modes.indexOf(board.viewMode)
    return [{ ...state, board: { ...board, viewMode: modes[(i + 1) % 3]! } }, [{ type: "render" }]]
  }
  return "pass"
}

/** Input fallback handler: dispatch to registered useInput handlers */
function inputHandler(state: Store, op: Op): HandlerResult<Store> {
  if (op.op !== "key") return "pass"
  for (const entry of state.input.handlers) {
    if (!entry.active) continue
    const result = entry.handler(op.input as string, op.key as KeyData)
    if (result === "exit") return [state, [{ type: "exit" }]]
  }
  // Handlers ran but didn't exit — op was processed (fallback consumed it)
  if (state.input.handlers.some((h) => h.active)) return [state, []]
  return "pass" // no active handlers — truly unhandled
}

// ============================================================================
// APP
// ============================================================================

interface App {
  state: Store
  dispatch(op: Op): void
  registerFocusNode(node: FocusNode): () => void
  registerInputHandler(handler: (input: string, key: KeyData) => void | "exit", active?: boolean): () => void
}

function createApp(keymap: Record<string, { op: string; [k: string]: unknown }>): App {
  let state: Store = {
    terminal: { cols: 80, rows: 24, focused: true, modifiers: { super: false, ctrl: false, alt: false, shift: false } },
    focus: { activeId: null, previousId: null, nodes: new Map() },
    input: { handlers: [], nextId: 0 },
    board: { cursor: null, viewMode: "cards" },
    keymap,
  }

  const apply = compose([modifierObserver], [terminalHandler, focusHandler, keymapHandler, boardHandler, inputHandler])

  // Effect queue — drained after apply, never during
  const effectQueue: Effect[] = []
  let draining = false

  function drainEffects() {
    if (draining) return // prevent reentrant drain
    draining = true
    while (effectQueue.length > 0) {
      const effects = effectQueue.splice(0)
      for (const eff of effects) {
        if (eff.type === "render") {
          /* schedule render */
        } else if (eff.type === "exit") {
          console.log("[exit]")
        } else if (eff.type === "dispatch") {
          app.dispatch(eff as Op)
        } // queues more effects, drained next iteration
      }
    }
    draining = false
  }

  const app: App = {
    get state() {
      return state
    },

    dispatch(op) {
      const [newState, effects] = apply(state, op)
      state = newState
      effectQueue.push(...effects)
      drainEffects()
    },

    registerFocusNode(node) {
      state.focus.nodes.set(node.id, node)
      return () => {
        state.focus.nodes.delete(node.id)
      }
    },

    registerInputHandler(handler, active = true) {
      const id = state.input.nextId++
      const entry: InputHandler = { id, handler, active }
      state.input.handlers = [...state.input.handlers, entry]
      return () => {
        state.input.handlers = state.input.handlers.filter((h) => h !== entry)
      }
    },
  }

  return app
}

// ============================================================================
// EVENT DISPATCH — stdin → ops
// ============================================================================

function processKey(app: App, input: string, key: KeyData) {
  // Release / modifier-only: dispatch through observers only
  if (key.eventType === "release" || key.isModifierOnly) {
    app.dispatch({ op: "key", input, key })
    return
  }

  // Focus navigation: Tab, Escape, spatial — dispatched as typed ops
  // These go through the full apply chain (observers + handlers)
  if (key.tab && !key.shift) {
    app.dispatch({ op: "focus_next" })
    return
  }
  if (key.tab && key.shift) {
    app.dispatch({ op: "focus_prev" })
    return
  }
  if (key.escape && app.state.focus.activeId) {
    app.dispatch({ op: "blur" })
    return
  }

  // Spatial focus
  if (app.state.focus.activeId) {
    const node = app.state.focus.nodes.get(app.state.focus.activeId)
    if (node) {
      let neighborId: string | undefined
      if (key.upArrow) neighborId = node.nextFocusUp
      else if (key.downArrow) neighborId = node.nextFocusDown
      else if (key.leftArrow) neighborId = node.nextFocusLeft
      else if (key.rightArrow) neighborId = node.nextFocusRight
      if (neighborId) {
        app.dispatch({ op: "focus_id", id: neighborId })
        return
      }
    }
  }

  // General key: flows through observers → focus → keymap → board → input
  app.dispatch({ op: "key", input, key })
}

// ============================================================================
// DEMO
// ============================================================================

function demo() {
  const app = createApp({
    j: { op: "move_down" },
    k: { op: "move_up" },
    vm: { op: "cycle_view_mode" },
  })

  // Simulate React hooks registering into the store
  const unregFocus = app.registerFocusNode({
    id: "search-box",
    onKeyDown(input, key) {
      if (key.escape) {
        console.log("  [search-box] consumed Escape")
        return true
      }
      if (input === "a") {
        console.log("  [search-box] consumed 'a'")
        return true
      }
      return false
    },
  })

  const unregInput = app.registerInputHandler((input, key) => {
    if (key.escape) {
      console.log("  [useInput] Escape → exit")
      return "exit"
    }
    console.log(`  [useInput fallback] ${JSON.stringify(input)}`)
  })

  app.dispatch({ op: "focus_id", id: "search-box" })

  console.log("=== 'a' with search-box focused → consumed by focus node ===")
  processKey(app, "a", { ...emptyKey(), eventType: "press" })

  console.log("\n=== 'j' with search-box focused → NOT consumed, keymap → move_down ===")
  processKey(app, "j", { ...emptyKey(), eventType: "press" })
  console.log(`  cursor = ${app.state.board.cursor}`)

  console.log("\n=== Escape with search-box focused → consumed by focus node (blur) ===")
  // Note: Escape goes through focus_nav in processKey (blur op) because activeId is set
  processKey(app, "", { ...emptyKey(), escape: true, eventType: "press" })
  console.log(`  activeId = ${app.state.focus.activeId}`)

  console.log("\n=== 'x' with nothing focused → useInput fallback ===")
  processKey(app, "x", { ...emptyKey(), eventType: "press" })

  console.log("\n=== Escape with nothing focused → useInput exit ===")
  processKey(app, "", { ...emptyKey(), escape: true, eventType: "press" })

  console.log("\n=== Tab → focus_next ===")
  processKey(app, "", { ...emptyKey(), tab: true, eventType: "press" })
  console.log(`  activeId = ${app.state.focus.activeId}`)

  console.log("\n=== Shift modifier-only → observer only (no handler) ===")
  processKey(app, "", { ...emptyKey(), shift: true, isModifierOnly: true, eventType: "press" })
  console.log(`  modifiers.shift = ${app.state.terminal.modifiers.shift}`)

  console.log("\n=== resize → terminal handler ===")
  app.dispatch({ op: "resize", cols: 120, rows: 40 })
  console.log(`  terminal = ${app.state.terminal.cols}x${app.state.terminal.rows}`)

  // Cleanup
  unregFocus()
  unregInput()
  console.log(
    `\n=== After unregister: ${app.state.focus.nodes.size} focus, ${app.state.input.handlers.length} input ===`,
  )
}

demo()
