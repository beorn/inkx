/**
 * Plugin System — V1 Refined
 *
 * Same shape as current silvery: plugin wraps app.apply(), owns its store slice,
 * composed via pipe(). Three improvements:
 *
 *   1. apply() returns Effect[] | false — explicit handled + effects as data
 *   2. Aligns with tea()'s TeaResult: state mutation in-place, return = effects
 *   3. Observer lane: terminal always runs before chain, never consumes
 *
 * Run: bun hub/silvery/design/v15-tea/plugin-system-v1r.ts
 */

// ============================================================================
// CORE
// ============================================================================

type Effect = { type: string; [key: string]: unknown }

/**
 * Apply return:
 *   false     — not handled, pass to next plugin
 *   Effect[]  — handled, with these effects ([] = handled, no effects)
 *
 * Plugins mutate their own stores (V1). Return is the effects channel.
 */
type ApplyResult = false | Effect[]

type Op = { type: string; [key: string]: unknown }
type Plugin<A, B> = (app: A) => B

interface BaseApp {
  dispatch(op: Op): void
  apply(op: Op): ApplyResult
}

function create(): BaseApp {
  let dispatching = false
  const effectQueue: Effect[] = []
  let draining = false

  const app: BaseApp = {
    dispatch(op) {
      if (dispatching) throw new Error(`Reentrant dispatch: ${op.type}`)
      dispatching = true
      try {
        const result = app.apply(op)
        if (result !== false) effectQueue.push(...result)
      } finally {
        dispatching = false
      }
      if (!draining) {
        draining = true
        while (effectQueue.length > 0) {
          const batch = effectQueue.splice(0)
          for (const eff of batch) {
            if (eff.type === "dispatch") app.dispatch(eff as Op)
            // Other effects: render, exit, persist — handled by runner
          }
        }
        draining = false
      }
    },
    apply() {
      return false // base: nothing handles anything
    },
  }
  return app
}

function pipe<A>(base: A): A
function pipe<A, B>(base: A, p1: Plugin<A, B>): B
function pipe<A, B, C>(base: A, p1: Plugin<A, B>, p2: Plugin<B, C>): C
function pipe<A, B, C, D>(base: A, p1: Plugin<A, B>, p2: Plugin<B, C>, p3: Plugin<C, D>): D
function pipe<A, B, C, D, E>(base: A, p1: Plugin<A, B>, p2: Plugin<B, C>, p3: Plugin<C, D>, p4: Plugin<D, E>): E
function pipe<A, B, C, D, E, F>(
  base: A,
  p1: Plugin<A, B>,
  p2: Plugin<B, C>,
  p3: Plugin<C, D>,
  p4: Plugin<D, E>,
  p5: Plugin<E, F>,
): F
function pipe<A, B, C, D, E, F, G>(
  base: A,
  p1: Plugin<A, B>,
  p2: Plugin<B, C>,
  p3: Plugin<C, D>,
  p4: Plugin<D, E>,
  p5: Plugin<E, F>,
  p6: Plugin<F, G>,
): G
function pipe(base: unknown, ...plugins: Plugin<unknown, unknown>[]): unknown {
  let result = base
  for (const plugin of plugins) result = plugin(result)
  return result
}

// ============================================================================
// TYPES
// ============================================================================

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
// PLUGINS — each wraps apply(), owns a store slice
// Last in pipe() = outermost wrapper = runs first
// ============================================================================

// --- withTerminal: observer (always runs) + resize/focus handler ------------

interface TerminalStore {
  cols: number
  rows: number
  focused: boolean
  modifiers: { super: boolean; ctrl: boolean; alt: boolean; shift: boolean }
}

function withTerminal<A extends BaseApp>(app: A): A & { terminal: TerminalStore } {
  const store: TerminalStore = {
    cols: 80,
    rows: 24,
    focused: true,
    modifiers: { super: false, ctrl: false, alt: false, shift: false },
  }
  const prevApply = app.apply
  app.apply = (op) => {
    // Observer: always update modifiers, never consume
    if (op.type === "input:key") {
      const key = op.key as KeyData
      store.modifiers = { super: !!key.super, ctrl: !!key.ctrl, alt: !!key.meta, shift: !!key.shift }
    }
    if (op.type === "term:resize") {
      store.cols = op.cols as number
      store.rows = op.rows as number
      return [{ type: "render" }]
    }
    if (op.type === "term:focus") {
      store.focused = op.focused as boolean
      if (!op.focused) store.modifiers = { super: false, ctrl: false, alt: false, shift: false }
      return []
    }
    return prevApply(op) // pass through
  }
  return Object.assign(app, { terminal: store })
}

// --- withFocus: focus tree + key dispatch to focused node --------------------

interface FocusNode {
  id: string
  onKeyDown?: (input: string, key: KeyData) => boolean
  nextFocusUp?: string
  nextFocusDown?: string
}

interface FocusStore {
  activeId: string | null
  nodes: Map<string, FocusNode>
  register(node: FocusNode): () => void
}

function withFocus<A extends BaseApp>(app: A): A & { focus: FocusStore } {
  const store: FocusStore = {
    activeId: null,
    nodes: new Map(),
    register(node) {
      store.nodes.set(node.id, node)
      return () => {
        store.nodes.delete(node.id)
      }
    },
  }
  const prevApply = app.apply
  app.apply = (op) => {
    if (op.type === "focus:next") {
      const ids = [...store.nodes.keys()]
      const i = store.activeId ? ids.indexOf(store.activeId) : -1
      store.activeId = ids[(i + 1) % ids.length] ?? null
      return [{ type: "render" }]
    }
    if (op.type === "focus:prev") {
      const ids = [...store.nodes.keys()]
      const i = store.activeId ? ids.indexOf(store.activeId) : ids.length
      store.activeId = ids[(i - 1 + ids.length) % ids.length] ?? null
      return [{ type: "render" }]
    }
    if (op.type === "focus:blur") {
      if (!store.activeId) return false
      store.activeId = null
      return [{ type: "render" }]
    }
    if (op.type === "focus:id") {
      store.activeId = op.id as string
      return [{ type: "render" }]
    }
    // Key dispatch to focused node
    if (op.type === "input:key" && store.activeId) {
      const key = op.key as KeyData
      if (key.eventType !== "release" && !key.isModifierOnly) {
        const node = store.nodes.get(store.activeId)
        if (node?.onKeyDown?.(op.input as string, key)) return [{ type: "render" }]
      }
    }
    return prevApply(op)
  }
  return Object.assign(app, { focus: store })
}

// --- withKeymap: key → command resolution -----------------------------------

interface KeymapStore {
  bindings: Record<string, { type: string; [k: string]: unknown }>
}

function withKeymap(bindings: Record<string, { type: string; [k: string]: unknown }>) {
  return <A extends BaseApp>(app: A): A & { keymap: KeymapStore } => {
    const store: KeymapStore = { bindings }
    const prevApply = app.apply
    app.apply = (op) => {
      if (op.type === "input:key") {
        const key = op.key as KeyData
        if (key.eventType !== "release" && !key.isModifierOnly) {
          const binding = store.bindings[op.input as string]
          if (binding) return [{ type: "dispatch", ...binding }]
        }
      }
      return prevApply(op)
    }
    return Object.assign(app, { keymap: store })
  }
}

// --- withInput: fallback useInput handler registry --------------------------

interface InputStore {
  handlers: Array<{ handler: (input: string, key: KeyData) => void | "exit"; active: boolean }>
  register(handler: (input: string, key: KeyData) => void | "exit", active?: boolean): () => void
}

function withInput<A extends BaseApp>(app: A): A & { input: InputStore } {
  const store: InputStore = {
    handlers: [],
    register(handler, active = true) {
      const entry = { handler, active }
      store.handlers.push(entry)
      return () => {
        const i = store.handlers.indexOf(entry)
        if (i >= 0) store.handlers.splice(i, 1)
      }
    },
  }
  const prevApply = app.apply
  app.apply = (op) => {
    if (op.type === "input:key") {
      const key = op.key as KeyData
      if (key.eventType !== "release" && !key.isModifierOnly) {
        for (const entry of store.handlers) {
          if (!entry.active) continue
          if (entry.handler(op.input as string, key) === "exit") return [{ type: "exit" }]
        }
        if (store.handlers.some((h) => h.active)) return []
      }
    }
    return prevApply(op)
  }
  return Object.assign(app, { input: store })
}

// --- withTracing: cross-cutting (wraps once at top of chain) ----------------

function withTracing<A extends BaseApp>(app: A): A {
  const prevApply = app.apply
  app.apply = (op) => {
    const result = prevApply(op)
    if (result !== false) console.log(`  [trace] ${op.type} → ${result.length} effects`)
    return result
  }
  return app
}

// ============================================================================
// EVENT DISPATCH — stdin → typed ops
// ============================================================================

type FullApp = BaseApp & { terminal: TerminalStore; focus: FocusStore; input: InputStore; keymap: KeymapStore }

function processKey(app: FullApp, input: string, key: KeyData) {
  if (key.tab && !key.shift) {
    app.dispatch({ type: "focus:next" })
    return
  }
  if (key.tab && key.shift) {
    app.dispatch({ type: "focus:prev" })
    return
  }
  if (key.escape && app.focus.activeId) {
    app.dispatch({ type: "focus:blur" })
    return
  }
  if (app.focus.activeId) {
    const node = app.focus.nodes.get(app.focus.activeId)
    if (node) {
      let neighborId: string | undefined
      if (key.upArrow) neighborId = node.nextFocusUp
      else if (key.downArrow) neighborId = node.nextFocusDown
      if (neighborId) {
        app.dispatch({ type: "focus:id", id: neighborId })
        return
      }
    }
  }
  app.dispatch({ type: "input:key", input, key })
}

// ============================================================================
// DEMO
// ============================================================================

function demo() {
  // Pipe order: left-to-right. Last wraps outermost (runs first).
  // Chain: tracing → focus → keymap → input → terminal(base)
  // This means: focus checks first, then keymap, then input fallback.
  const app = pipe(
    create(),
    withTerminal, // base: observer + resize/focus
    withInput, // fallback: useInput handlers
    withKeymap({ j: { type: "board:move_down" }, k: { type: "board:move_up" } }),
    withFocus, // focus: dispatch to focused node first
    withTracing, // cross-cutting: sees all results
  )

  // Register hooks
  const unregFocus = app.focus.register({
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
  const unregInput = app.input.register((input, key) => {
    if (key.escape) {
      console.log("  [useInput] exit")
      return "exit"
    }
    console.log(`  [useInput fallback] "${input}"`)
  })

  app.dispatch({ type: "focus:id", id: "search-box" })

  console.log("\n=== 'a' focused → search-box consumes ===")
  processKey(app, "a", { ...emptyKey(), eventType: "press" })

  console.log("\n=== 'j' focused → NOT consumed → keymap → board:move_down ===")
  processKey(app, "j", { ...emptyKey(), eventType: "press" })

  console.log("\n=== Escape focused → blur ===")
  processKey(app, "", { ...emptyKey(), escape: true, eventType: "press" })
  console.log(`  activeId = ${app.focus.activeId}`)

  console.log("\n=== 'x' unfocused → useInput fallback ===")
  processKey(app, "x", { ...emptyKey(), eventType: "press" })

  console.log("\n=== Escape unfocused → useInput exit ===")
  processKey(app, "", { ...emptyKey(), escape: true, eventType: "press" })

  console.log("\n=== Tab → focus:next ===")
  processKey(app, "", { ...emptyKey(), tab: true, eventType: "press" })
  console.log(`  activeId = ${app.focus.activeId}`)

  console.log("\n=== Shift modifier-only → observer only ===")
  processKey(app, "", { ...emptyKey(), shift: true, isModifierOnly: true, eventType: "press" })
  console.log(`  modifiers.shift = ${app.terminal.modifiers.shift}`)

  console.log("\n=== resize ===")
  app.dispatch({ type: "term:resize", cols: 120, rows: 40 })
  console.log(`  ${app.terminal.cols}x${app.terminal.rows}`)

  console.log("\n=== Store slices ===")
  console.log(`  terminal: ${app.terminal.cols}x${app.terminal.rows}, mods=${JSON.stringify(app.terminal.modifiers)}`)
  console.log(`  focus: activeId=${app.focus.activeId}, ${app.focus.nodes.size} nodes`)
  console.log(`  input: ${app.input.handlers.length} handlers`)
  console.log(`  keymap: ${Object.keys(app.keymap.bindings).join(",")}`)

  unregFocus()
  unregInput()
  console.log(`\n=== Cleanup: ${app.focus.nodes.size} nodes, ${app.input.handlers.length} handlers ===`)
}

demo()
