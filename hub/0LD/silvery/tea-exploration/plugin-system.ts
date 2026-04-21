/**
 * SUPERSEDED (2026-04-11). Current prototype: design/v15-tea/plugin-system-v1r.ts
 * Canonical design: design/v10-terminal/app-composition.md
 *
 * Plugin System v1 — Original prototype (op.handled flag model, not adopted)
 *
 * Structure: core composition at top, helpers at bottom.
 * Run path no longer valid (file moved to archive).
 *
 * Reference: archive/era2-drafts/00-architecture.md
 */

// ============================================================================
// TYPES — the shared vocabulary
// ============================================================================

type Op = { type: string; handled?: boolean; needsRender?: boolean; [key: string]: unknown }

interface KeyData {
  ctrl: boolean
  shift: boolean
  meta: boolean
  super: boolean
  hyper: boolean
  escape: boolean
  return: boolean
  tab: boolean
  backspace: boolean
  delete: boolean
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  eventType?: "press" | "repeat" | "release"
  isModifierOnly?: boolean
}

interface ModifierState {
  super: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
}

interface FocusNode {
  id: string
  parent?: FocusNode
  onKeyDown?: (e: SyntheticKeyEvent) => void
  onKeyUp?: (e: SyntheticKeyEvent) => void
  onKeyDownCapture?: (e: SyntheticKeyEvent) => void
  onPaste?: (e: SyntheticPasteEvent) => void
  nextFocusUp?: string
  nextFocusDown?: string
  nextFocusLeft?: string
  nextFocusRight?: string
}

interface PastePayload {
  text: string
  source: "internal" | "unknown"
  internalClipboard?: unknown
}

type InputCallback = (input: string, key: KeyData) => void | "exit"
type PasteCallback = (payload: PastePayload) => void
type Plugin<A, B> = (app: A) => B

// ============================================================================
// FOUNDATION — create() + pipe()
// ============================================================================

interface BaseApp {
  dispatch(op: Op): boolean
  apply(op: Op): boolean
  run?(): Promise<void>
}

function create(): BaseApp {
  let processing = false
  const app: BaseApp = {
    dispatch(op) {
      if (processing) throw new Error(`Reentrant dispatch: ${op.type}`)
      processing = true
      try {
        return app.apply(op)
      } finally {
        processing = false
      }
    },
    apply(_op) {
      return false
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
// PLUGINS — each wraps apply(), owns a store
// ============================================================================

// --- withTerminal: raw observer (modifiers, dims, focus) -------------------

interface TerminalStore {
  cols: number
  rows: number
  focused: boolean
  modifiers: ModifierState
  subscribe(cb: () => void): () => void
  getSnapshot(): { cols: number; rows: number; focused: boolean; modifiers: ModifierState }
}

function withTerminal(): <A extends BaseApp>(app: A) => A & { terminal: TerminalStore } {
  return <A extends BaseApp>(app: A) => {
    const store = createTerminalStore()
    const prevApply = app.apply.bind(app)

    app.apply = (op) => {
      if (op.type === "input:key") {
        // Raw lane: always update modifier state, never consume
        const key = op.key as KeyData
        store.modifiers = { super: !!key.super, ctrl: !!key.ctrl, alt: !!key.meta, shift: !!key.shift }
      }
      if (op.type === "term:resize") {
        store.cols = op.cols as number
        store.rows = op.rows as number
        return true
      }
      if (op.type === "input:focus") {
        store.focused = op.focused as boolean
        if (!op.focused) store.modifiers = { super: false, ctrl: false, alt: false, shift: false }
        return true
      }
      return prevApply(op)
    }

    return Object.assign(app, { terminal: store })
  }
}

// --- withFocus: focused lane (focus tree + spatial focus) -------------------

interface FocusManagerLike {
  activeElement: FocusNode | null
  focusNext(): void
  focusPrev(): void
  blur(): void
  focus(id: string): void
}

function withFocus(): <A extends BaseApp>(app: A) => A & { focusManager: FocusManagerLike } {
  return <A extends BaseApp>(app: A) => {
    const fm: FocusManagerLike = {
      activeElement: null,
      focusNext() {},
      focusPrev() {},
      blur() {
        fm.activeElement = null
      },
      focus(_id) {},
    }

    const prevApply = app.apply.bind(app)
    app.apply = (op) => {
      if (op.type === "input:key") {
        const { input, key } = op as { input: string; key: KeyData }
        if (key.eventType === "release" || key.isModifierOnly) return prevApply(op)

        // Sequential focus: Tab / Shift+Tab
        if (key.tab && !key.shift) {
          fm.focusNext()
          op.handled = true
          return true
        }
        if (key.tab && key.shift) {
          fm.focusPrev()
          op.handled = true
          return true
        }

        // Escape: blur
        if (key.escape && fm.activeElement) {
          fm.blur()
          op.handled = true
          return true
        }

        // Spatial focus: arrow keys → nextFocus* neighbor
        if (fm.activeElement) {
          let neighborId: string | undefined
          if (key.upArrow) neighborId = fm.activeElement.nextFocusUp
          else if (key.downArrow) neighborId = fm.activeElement.nextFocusDown
          else if (key.leftArrow) neighborId = fm.activeElement.nextFocusLeft
          else if (key.rightArrow) neighborId = fm.activeElement.nextFocusRight
          if (neighborId) {
            fm.focus(neighborId)
            op.handled = true
            return true
          }
        }

        // Focus dispatch: capture → target → bubble
        if (fm.activeElement) {
          const event = createSyntheticKeyEvent(input, key, fm.activeElement)
          dispatchThroughFocusTree(event)
          if (event.propagationStopped || event.defaultPrevented) {
            op.handled = true
            return true
          }
        }

        return prevApply(op)
      }

      // Paste: focused onPaste before global handlers
      if (op.type === "input:paste" && fm.activeElement?.onPaste) {
        const e = createSyntheticPasteEvent(
          op.text as string,
          (op.source as "internal" | "unknown") ?? "unknown",
          fm.activeElement,
        )
        fm.activeElement.onPaste(e)
        if (e.propagationStopped || e.defaultPrevented) {
          op.handled = true
          return true
        }
      }

      return prevApply(op)
    }

    return Object.assign(app, { focusManager: fm })
  }
}

// --- withDomEvents: mouse dispatch -----------------------------------------

function withDomEvents(): <A extends BaseApp>(app: A) => A & { click(x: number, y: number): void } {
  return <A extends BaseApp>(app: A) => {
    const prevApply = app.apply.bind(app)
    app.apply = (op) => {
      if (op.type === "input:mouse") {
        // Hit test → component tree dispatch → bubble → click-to-focus
        // Prototype: pass through
      }
      return prevApply(op)
    }
    return Object.assign(app, {
      click(x: number, y: number) {
        app.dispatch({ type: "input:mouse", x, y, button: 0, action: "down" })
        app.dispatch({ type: "input:mouse", x, y, button: 0, action: "up" })
      },
    })
  }
}

// --- withInput: fallback lane (useInput / usePaste registry) ----------------

interface InputStore {
  onInput(handler: InputCallback): () => void
  onPaste(handler: PasteCallback): () => void
}

function withInput(): <A extends BaseApp>(app: A) => A & { input: InputStore } {
  return <A extends BaseApp>(app: A) => {
    const inputHandlers = new Set<InputCallback>()
    const pasteHandlers = new Set<PasteCallback>()

    const store: InputStore = {
      onInput(h) {
        inputHandlers.add(h)
        return () => inputHandlers.delete(h)
      },
      onPaste(h) {
        pasteHandlers.add(h)
        return () => pasteHandlers.delete(h)
      },
    }

    const prevApply = app.apply.bind(app)
    app.apply = (op) => {
      // Fallback keys — only if focus didn't consume
      if (op.type === "input:key" && !op.handled) {
        const { input, key } = op as { input: string; key: KeyData }
        if (key.eventType === "release" || key.isModifierOnly) return prevApply(op)
        for (const h of inputHandlers) {
          if (h(input, key) === "exit") return false
        }
        op.handled = true
        return true
      }
      // Fallback paste
      if (op.type === "input:paste" && !op.handled) {
        const payload: PastePayload = {
          text: op.text as string,
          source: (op.source as "internal" | "unknown") ?? "unknown",
          internalClipboard: op.internalClipboard,
        }
        for (const h of pasteHandlers) h(payload)
        op.handled = true
        return true
      }
      return prevApply(op)
    }

    return Object.assign(app, { input: store })
  }
}

// --- withCommands: keymap → command resolution -----------------------------

interface CommandDef {
  title: string
  fn: (args?: Record<string, unknown>) => void | Promise<void>
}

interface CommandStore {
  commands: Record<string, Record<string, CommandDef>>
  keymap(bindings: Record<string, CommandDef>): void
}

function withCommands(): <A extends BaseApp>(app: A) => A & { cmd: CommandStore } {
  return <A extends BaseApp>(app: A) => {
    const commands: Record<string, Record<string, CommandDef>> = {}
    const bindings: Array<{ key: string; command: CommandDef }> = []

    const store: CommandStore = {
      commands,
      keymap(map) {
        for (const [k, cmd] of Object.entries(map)) bindings.push({ key: k, command: cmd })
      },
    }

    const prevApply = app.apply.bind(app)
    app.apply = (op) => {
      if (op.type === "input:key" && !op.handled) {
        const { input } = op as { input: string }
        for (let i = bindings.length - 1; i >= 0; i--) {
          if (bindings[i]!.key === input) {
            bindings[i]!.command.fn()
            op.handled = true
            return true
          }
        }
      }
      return prevApply(op)
    }

    return Object.assign(app, { cmd: store })
  }
}

// --- withReact: renderer only (no event routing) ---------------------------

function withReact(_element: unknown): <A extends BaseApp>(app: A) => A {
  return <A extends BaseApp>(app: A) => {
    // Mounts reconciler, provides RuntimeContext to tree
    // RuntimeContext.on("input") → app.input.onInput (bridges to withInput store)
    // Does NOT route events — that's withInput's job
    return app
  }
}

// ============================================================================
// COMPOSITION — the full picture
// ============================================================================

function demo() {
  const app = pipe(
    create(),
    withTerminal(), // raw: modifier tracking (always fires, never consumes)
    withFocus(), // focused: dispatch to focus tree first
    withDomEvents(), // mouse: hit test + bubble
    withInput(), // fallback: only unhandled events reach useInput
    withCommands(), // keymap: key → command resolution
    withReact(null), // renderer: mounts React, no event routing
  )

  // --- Domain setup ---
  let cursor = 0
  app.cmd.commands.nav = {
    down: { title: "Move Down", fn: () => cursor++ },
    up: { title: "Move Up", fn: () => cursor-- },
  }
  app.cmd.keymap({ j: app.cmd.commands.nav!.down!, k: app.cmd.commands.nav!.up! })

  // --- Hook registration (React hooks would do this) ---
  app.input.onInput((input, key) => {
    if (key.escape) return "exit"
    console.log(`[useInput fallback] ${input}`)
  })
  app.input.onPaste((p) => console.log(`[usePaste] ${p.text} (${p.source})`))

  // --- Simulate events ---
  console.log("--- j (keypress) → command ---")
  app.dispatch({ type: "input:key", input: "j", key: { ...emptyKey(), eventType: "press" } })
  console.log(`cursor = ${cursor}`)

  console.log("\n--- Escape (no focus) → useInput fallback ---")
  app.dispatch({ type: "input:key", input: "", key: { ...emptyKey(), escape: true, eventType: "press" } })

  console.log("\n--- Shift (modifier-only) → raw only ---")
  app.dispatch({
    type: "input:key",
    input: "",
    key: { ...emptyKey(), shift: true, isModifierOnly: true, eventType: "press" },
  })
  console.log(`modifiers.shift = ${app.terminal.modifiers.shift}`)

  console.log("\n--- paste → usePaste ---")
  app.dispatch({ type: "input:paste", text: "hello world", source: "unknown" })
}

// ============================================================================
// EVENT FLOW — how a keypress traverses the chain
// ============================================================================
//
// app.dispatch({ type: "input:key", input: "Escape" })
//   │
//   ├─ withTerminal.apply  — updates modifier store, PASSES THROUGH
//   ├─ withFocus.apply     — if focused, dispatch to tree; CONSUME if handled
//   ├─ withDomEvents.apply — keys pass through (mouse only)
//   ├─ withInput.apply     — if !op.handled, dispatch to useInput; CONSUME
//   ├─ withCommands.apply  — if !op.handled, check keymap; CONSUME if match
//   └─ withReact.apply     — no event handling (renderer only)
//
// Precedence is controlled by op.handled flag:
//   - withFocus sets handled=true → withInput/withCommands skip
//   - withTerminal never sets handled → always passes through
//   - Composition order determines who wraps outermost (runs first)

// ============================================================================
// HELPERS — implementation details below the fold
// ============================================================================

interface SyntheticKeyEvent {
  input: string
  key: KeyData
  target: FocusNode
  currentTarget: FocusNode
  stopPropagation(): void
  preventDefault(): void
  propagationStopped: boolean
  defaultPrevented: boolean
}

interface SyntheticPasteEvent {
  text: string
  source: "internal" | "unknown"
  target: FocusNode
  currentTarget: FocusNode
  stopPropagation(): void
  preventDefault(): void
  propagationStopped: boolean
  defaultPrevented: boolean
}

function createSyntheticKeyEvent(input: string, key: KeyData, target: FocusNode): SyntheticKeyEvent {
  let stopped = false,
    prevented = false
  return {
    input,
    key,
    target,
    currentTarget: target,
    get propagationStopped() {
      return stopped
    },
    get defaultPrevented() {
      return prevented
    },
    stopPropagation() {
      stopped = true
    },
    preventDefault() {
      prevented = true
    },
  }
}

function createSyntheticPasteEvent(
  text: string,
  source: "internal" | "unknown",
  target: FocusNode,
): SyntheticPasteEvent {
  let stopped = false,
    prevented = false
  return {
    text,
    source,
    target,
    currentTarget: target,
    get propagationStopped() {
      return stopped
    },
    get defaultPrevented() {
      return prevented
    },
    stopPropagation() {
      stopped = true
    },
    preventDefault() {
      prevented = true
    },
  }
}

function dispatchThroughFocusTree(event: SyntheticKeyEvent): void {
  const path: FocusNode[] = []
  let node: FocusNode | undefined = event.target
  while (node) {
    path.push(node)
    node = node.parent
  }
  const isRelease = event.key.eventType === "release"

  // Capture: root → target (press/repeat only)
  if (!isRelease) {
    for (let i = path.length - 1; i > 0; i--) {
      if (event.propagationStopped) return
      const n = path[i]!
      if (n.onKeyDownCapture) {
        ;(event as { currentTarget: FocusNode }).currentTarget = n
        n.onKeyDownCapture(event)
      }
    }
  }
  // Target
  if (!event.propagationStopped) {
    const t = path[0]!
    ;(event as { currentTarget: FocusNode }).currentTarget = t
    const h = isRelease ? t.onKeyUp : t.onKeyDown
    h?.(event)
  }
  // Bubble: target parent → root
  for (let i = 1; i < path.length; i++) {
    if (event.propagationStopped) return
    const n = path[i]!
    ;(event as { currentTarget: FocusNode }).currentTarget = n
    const h = isRelease ? n.onKeyUp : n.onKeyDown
    h?.(event)
  }
}

function createTerminalStore(): TerminalStore {
  let state = {
    cols: 80,
    rows: 24,
    focused: true,
    modifiers: { super: false, ctrl: false, alt: false, shift: false } as ModifierState,
  }
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const cb of listeners) cb()
  }
  return {
    get cols() {
      return state.cols
    },
    set cols(v) {
      state = { ...state, cols: v }
      notify()
    },
    get rows() {
      return state.rows
    },
    set rows(v) {
      state = { ...state, rows: v }
      notify()
    },
    get focused() {
      return state.focused
    },
    set focused(v) {
      state = { ...state, focused: v }
      notify()
    },
    get modifiers() {
      return state.modifiers
    },
    set modifiers(v) {
      state = { ...state, modifiers: v }
      notify()
    },
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    getSnapshot() {
      return state
    },
  }
}

function emptyKey(): KeyData {
  return {
    ctrl: false,
    shift: false,
    meta: false,
    super: false,
    hyper: false,
    escape: false,
    return: false,
    tab: false,
    backspace: false,
    delete: false,
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
  }
}

// ============================================================================
// RUN
// ============================================================================

demo()
