# Era 2 Quick Start

_Status: draft (2026-03-16). Minimal app → full app in progressive steps._

_The canonical "this is what a silvertea app looks like" — three sizes._

## Shape A: Todo App (minimal)

Six concepts: signal, command, keymap, view, withTerminal, run.

```typescript
// todo.tsx — a complete Era 2 app in one file
import { signal, derived } from "@silvery/platter"
import { keymap, when, invoke } from "@silvery/tea"
import { createApp, pipe } from "@silvery/tea"
import { withTerminal } from "@silvery/tea-platter"
import { useSignal } from "@silvery/tea-react"

// ── Signals ─────────────────────────────────────────────
const items = signal(["Buy milk", "Write docs", "Ship feature"])
const cursor = signal(0)
const mode = signal<"normal" | "insert">("normal")
const isNormal = derived(() => mode.value === "normal")

// ── Commands ────────────────────────────────────────────
// Plain objects. fn reads/writes signals directly. No registry.
const commands = {
  navigation: {
    down: { fn() { cursor.value = Math.min(cursor.value + 1, items.value.length - 1) } },
    up:   { fn() { cursor.value = Math.max(cursor.value - 1, 0) } },
  },
  edit: {
    toggle_done: {
      fn() {
        const i = cursor.value
        const item = items.value[i]!
        items.value = items.value.map((t, j) =>
          j === i ? (t.startsWith("✓ ") ? t.slice(2) : `✓ ${t}`) : t
        )
      },
    },
    remove: {
      fn() {
        items.value = items.value.filter((_, i) => i !== cursor.value)
        cursor.value = Math.min(cursor.value, items.value.length - 1)
      },
    },
  },
  app: {
    quit: { fn() { process.exit(0) } },
  },
}

// ── Keymap ──────────────────────────────────────────────
// Declarative: key → command. when() gates by mode.
const keys = keymap(
  { "ctrl+c": commands.app.quit, q: commands.app.quit },
  when(isNormal, {
    j: commands.navigation.down,
    k: commands.navigation.up,
    x: commands.edit.toggle_done,
    "d d": commands.edit.remove,   // chord
  }),
)

// ── View ────────────────────────────────────────────────
// Pure rendering. No input handling. Reads signals via useSignal().
function ListView() {
  const list = useSignal(items)
  const cur = useSignal(cursor)
  return (
    <Box flexDirection="column">
      {list.map((item, i) => (
        <Text key={i} color={i === cur ? "$primary" : undefined}>
          {i === cur ? "> " : "  "}{item}
        </Text>
      ))}
    </Box>
  )
}

// ── Run ─────────────────────────────────────────────────
const app = pipe(
  createApp(),
  withTerminal({ view: <ListView />, keys }),
)
using handle = await run(app)
await handle.waitUntilExit()
```

**What this demonstrates:**

- Signals as state (no store, no useState)
- Commands as `{ fn }` objects (no registry, no string IDs)
- Keymap as pure function (key → Invocation | null)
- View reads signals via `useSignal()` — no other hooks
- `withTerminal` owns input dispatch — view has no `onKeyDown`
- Chord binding (`d d`) — keymap-local state
- Mode predicate (`when(isNormal, ...)`) — keymap filters, not command

---

## Shape B: AI Chat (medium — aichat-v2)

Adds: createModel, scope, async generators, providers, plugins.

```typescript
// aichat/main.tsx — Era 2 composition
import { signal } from "@silvery/platter"
import { createScope, createInstantScope } from "@silvery/tea"
import { keymap, when, doublePress, invoke, pipe, createApp } from "@silvery/tea"
import { withTerminal } from "@silvery/tea-platter"
import { useChat } from "./model.js"
import { ChatView } from "./view.js"

// ── Scope ───────────────────────────────────────────────
// --fast: instant scope skips all animation delays
using scope = args.fast ? createInstantScope() : createScope()

// ── Model ───────────────────────────────────────────────
// createModel(factory) → typed hook. Factory receives { scope }.
// bind() initializes the singleton.
const chat = useChat.bind({ scope }, script)

// ── Keymap ──────────────────────────────────────────────
const isActive = signal(true)
const ctrlD = doublePress(scope, "ctrl+d", chat.commands.exit)
const keys = keymap(
  when(isActive, { "ctrl+l": chat.commands.compact }),
  { escape: chat.commands.exit },
  ctrlD.bindings,
)

// ── Surface ─────────────────────────────────────────────
using handle = await withTerminal({
  view: <ChatView ctrlDPending={ctrlD.pending} />,
  keys,
})

// ── Behavioral plugins ──────────────────────────────────
chat.advance()
if (args.auto) {
  autoAdvance(scope, chat, script)
} else {
  idleAutoSubmit(scope, chat)
}
```

```typescript
// aichat/model.ts — model factory
import { signal, createModel, type ModelContext } from "@silvery/tea"

export type Phase = "idle" | "thinking" | "streaming" | "tools"

export function createChat(ctx: ModelContext, script: ScriptEntry[]) {
  const { scope } = ctx

  // ── Signals ─────────────────────────────────────────
  const messages = signal<Message[]>([{ id: 0, role: "system", content: "..." }])
  const phase = signal<Phase>("idle")
  const currentContent = signal("")
  const done = signal(false)

  // ── Commands ────────────────────────────────────────
  const commands = {
    submit: {
      args: z.object({ text: z.string() }),
      fn({ text }: { text: string }) {
        if (done.value || !text.trim()) return
        addMessage({ role: "user", content: text })
        scheduleResponse()
      },
    },
    compact: {
      async fn() {
        /* compaction logic using scope.sleep() */
      },
    },
    exit: {
      fn() {
        done.value = true
      },
    },
  }

  return { messages, phase, currentContent, done, commands, respond, advance }

  // ── Streaming via async generator ───────────────────
  async function* respond(entry: ScriptEntry): AsyncGenerator<void> {
    phase.value = "streaming"
    currentContent.value = ""
    for (const word of entry.content.split(/(\s+)/)) {
      currentContent.value += word
      yield // cooperate
      if (word.trim()) await scope.sleep(50) // scoped timer
    }
    // Commit final content
    messages.value = [...messages.value, { ...entry, content: entry.content }]
    currentContent.value = ""
    phase.value = "idle"
  }
}

export const useChat = createModel(createChat)
```

```typescript
// aichat/model.test.ts — pure model test, no React
import { useChat } from "./model.js"
import { invoke } from "@silvery/tea"
import { createInstantScope } from "@silvery/tea"

function createChat(script = SCRIPT) {
  return useChat.create({ scope: createInstantScope() }, script)
}

test("submit via invoke adds user message", () => {
  const chat = createChat()
  invoke({ command: chat.commands.submit, args: { text: "hello" } })
  expect(chat.messages.value).toHaveLength(2)
  expect(chat.messages.value[1]!.role).toBe("user")
})

test("respond streams content", async () => {
  const chat = createChat([])
  for await (const _ of chat.respond({ role: "agent", content: "Hello world" })) {
  }
  expect(chat.messages.value.at(-1)!.content).toBe("Hello world")
  expect(chat.phase.value).toBe("idle")
})
```

**What this adds over todo:**

- `createModel(factory)` wraps a factory → typed hook with `.get()`, `.create()`, `.bind()`
- Scope for structured concurrency (`scope.sleep()`, `scope.timeout()`)
- Async generators for streaming content
- `z.object()` args schema on submit command
- `doublePress()` — stateful chord binding with scope-owned timer
- `autoAdvance()` / `idleAutoSubmit()` — external behavioral plugins
- Pure model tests with `createInstantScope()`

---

## Shape C: km (full — 173 commands, multi-model, plugins)

Adds: pipe + plugins, op + apply, providers (DI), multi-model, withHistory.

```typescript
// km/main.tsx — full app composition
import { signal } from "@silvery/platter"
import { createScope, pipe, createApp, keymap, when, invoke } from "@silvery/tea"
import { withTerminal } from "@silvery/tea-platter"
import { withPersist, withFileSync } from "./plugins/persist.js"
import { withBoard } from "./plugins/board.js"
import { withTaskManagement } from "./plugins/task.js"
import { withInlineEdit } from "./plugins/inline-edit.js"
import { withSearch } from "./plugins/search.js"
import { withHistory } from "./plugins/history.js"
import { withDialogs } from "./plugins/dialogs.js"
import { withSync } from "./plugins/sync.js"
import { withTracing } from "@silvery/tea"
import { BoardView } from "./views/Board.js"

using scope = createScope()

// ── App: plugin composition ─────────────────────────────
// Each plugin adds model state + commands. Order matters for apply() wrapping.
const app = pipe(
  createApp(),

  // Runtime — I/O providers (DI boundary)
  withPersist({ dir: config.vaultPath }),
  withFileSync({ watcher: true }),

  // Domain models — each adds signals + commands to app.model.*
  withBoard({ rootPath: config.rootPath }),       // model.board: navigation, columns, cards, cursor
  withTaskManagement(),                            // model.task: statuses, priorities, due dates
  withInlineEdit(),                                // model.edit: TextArea, EditContext
  withSearch(),                                    // model.search: omnibox, local find, replace
  withDialogs(),                                   // model.dialog: modal pickers, prompts, confirmations
  withSync({ sqlite: config.dbPath }),             // model.sync: file↔sqlite bidirectional

  // Cross-cutting — wrap apply() for interception
  withHistory(),                                   // intercepts model ops for undo/redo
  withTracing(),                                   // logs all ops via loggily

  // Surface — terminal view + keymap
  withTerminal({
    view: <BoardView />,
    keys: buildKeymap(app),                        // 173 commands, 45+ chords
  }),
)

using handle = await run(app)
await handle.waitUntilExit()
```

```typescript
// km/plugins/board.ts — domain model plugin
import { signal, derived } from "@silvery/platter"
import { type Plugin, op } from "@silvery/tea"

export function withBoard(config: { rootPath: string }): Plugin {
  return (app) => {
    const cursor = signal<string | null>(null)
    const columns = signal<Column[]>([])
    const selectedNodes = signal<Set<string>>(new Set())
    const viewMode = signal<ViewMode>("board")
    const foldDepths = signal<Map<string, number>>(new Map())

    // Derived signals — O(1) subscriptions
    const currentNode = derived(() => {
      const id = cursor.value
      return id ? findNode(columns.value, id) : null
    })
    const isAtRoot = derived(() => !cursor.value || isRootLevel(cursor.value, columns.value))

    app.model.board = {
      cursor,
      columns,
      selectedNodes,
      viewMode,
      foldDepths,
      currentNode,
      isAtRoot,

      moveCursor({ dir }: { dir: Direction }) {
        const next = resolveDirection(cursor.value, dir, columns.value)
        if (next) cursor.value = next
      },

      selectToggle({ nodeId }: { nodeId: string }) {
        const s = new Set(selectedNodes.value)
        s.has(nodeId) ? s.delete(nodeId) : s.add(nodeId)
        selectedNodes.value = s
      },

      foldNode({ nodeId, depth }: { nodeId: string; depth?: number }) {
        const m = new Map(foldDepths.value)
        m.set(nodeId, depth ?? 0)
        foldDepths.value = m
      },

      unfoldNode({ nodeId }: { nodeId: string }) {
        const m = new Map(foldDepths.value)
        m.delete(nodeId)
        foldDepths.value = m
      },
    }

    // Commands — thin wrappers that route through op() for interception
    app.commands.navigation = {
      down: {
        fn() {
          op(app.model).board.moveCursor({ dir: "down" })
        },
      },
      up: {
        fn() {
          op(app.model).board.moveCursor({ dir: "up" })
        },
      },
      left: {
        fn() {
          op(app.model).board.moveCursor({ dir: "left" })
        },
      },
      right: {
        fn() {
          op(app.model).board.moveCursor({ dir: "right" })
        },
      },
      page_down: {
        fn() {
          /* page jump logic */
        },
      },
      page_up: {
        fn() {
          /* page jump logic */
        },
      },
    }
    app.commands.fold = {
      fold_node: {
        fn() {
          /* fold current or selected */
        },
      },
      unfold_node: {
        fn() {
          /* unfold current or selected */
        },
      },
      fold_all: {
        fn() {
          /* fold all columns */
        },
      },
      unfold_all: {
        fn() {
          /* unfold all columns */
        },
      },
    }

    return app
  }
}
```

```typescript
// km/plugins/task.ts — batch-aware task commands
import { type Plugin, op } from "@silvery/tea"
import { z } from "zod"

export function withTaskManagement(): Plugin {
  return (app) => {
    const { board } = app.model

    app.model.task = {
      setStatus({ nodeId, status }: { nodeId: string; status: TaskStatus }) {
        // writes to storage via op(app.rt)
        op(app.rt).providers.persist.updateNode(nodeId, { task_status: status })
      },
      setPriority({ nodeId, priority }: { nodeId: string; priority: number }) {
        op(app.rt).providers.persist.updateNode(nodeId, { priority })
      },
      cycleDone({ nodeId }: { nodeId: string }) {
        const node = findNode(board.columns.value, nodeId)
        const next = node?.task_status === "done" ? "todo" : "done"
        op(app.model).task.setStatus({ nodeId, status: next })
      },
    }

    // Commands use getSelectedCards() for batch operations
    app.commands.task = {
      toggle_done: {
        fn() {
          const cards = getSelectedCards(app.model.board)
          for (const card of cards) {
            op(app.model).task.cycleDone({ nodeId: card.id })
          }
        },
        args: z.object({
          nodeId: z
            .string()
            .optional()
            .default(() => board.cursor.value),
        }),
      },
      set_priority: {
        fn(a: { priority: number }) {
          const cards = getSelectedCards(app.model.board)
          for (const card of cards) {
            op(app.model).task.setPriority({ nodeId: card.id, priority: a.priority })
          }
        },
        args: z.object({
          nodeId: z
            .string()
            .optional()
            .default(() => board.cursor.value),
          priority: z.number(),
        }),
      },
    }

    return app
  }
}
```

```typescript
// km/keymap.ts — 173 commands, 45+ chords, vim-style modes
import { keymap, when, invoke } from "@silvery/tea"
import { signal, derived } from "@silvery/platter"

export function buildKeymap(app: App) {
  const { board, edit, dialog } = app.model
  const cmd = app.commands

  // Mode predicates — derived signals
  const isNormal = derived(() => !edit.active.value && !dialog.open.value)
  const isEditing = derived(() => edit.active.value)
  const isDialog = derived(() => dialog.open.value)
  const isMoveMode = derived(() => board.moveMode.value)

  return keymap(
    // ── Global ──────────────────────────────────────
    { "ctrl+c": cmd.app.quit },

    // ── Normal mode ─────────────────────────────────
    when(isNormal, {
      // Navigation (33 commands)
      j: cmd.navigation.down,
      k: cmd.navigation.up,
      h: cmd.navigation.left,
      l: cmd.navigation.right,
      "ctrl+d": cmd.navigation.page_down,
      "ctrl+u": cmd.navigation.page_up,
      "g g": cmd.navigation.go_top, // chord
      G: cmd.navigation.go_bottom,

      // Editing (28 commands)
      o: cmd.edit.insert_below,
      O: cmd.edit.insert_above,
      i: cmd.edit.enter_inline,
      a: cmd.edit.enter_inline_append,
      "d d": cmd.edit.remove, // chord
      "y y": cmd.edit.copy, // chord
      p: cmd.edit.paste,
      Tab: cmd.edit.indent,
      "shift+tab": cmd.edit.outdent,

      // Tasks (11 commands)
      x: cmd.task.toggle_done,
      "! 0": cmd.task.set_priority_0, // verb × location
      "! 1": cmd.task.set_priority_1,
      "! 2": cmd.task.set_priority_2,
      "! 3": cmd.task.set_priority_3,
      "! 4": cmd.task.set_priority_4,
      d: cmd.task.set_due_date,

      // Selection (12 commands)
      V: cmd.selection.visual_mode,
      "shift+j": cmd.selection.extend_down,
      "shift+k": cmd.selection.extend_up,

      // View (17 commands)
      z: cmd.fold.fold_node,
      Z: cmd.fold.unfold_node,
      "z a": cmd.fold.fold_all, // chord

      // Dialogs (12 commands)
      "/": cmd.dialog.search,
      n: cmd.dialog.new_item,
      "ctrl+p": cmd.dialog.item_picker,
      "ctrl+k": cmd.dialog.command_palette,

      // Favorites (verb × location pattern)
      "g i": cmd.navigation.goto_inbox, // goto × inbox
      "g j": cmd.navigation.goto_journal,
      "g 1": cmd.navigation.goto_fav_1,
      "m i": cmd.edit.move_to_inbox, // move × inbox
      "m 1": cmd.edit.move_to_fav_1,

      // Panes (22 commands — Ctrl+W chord prefix)
      "ctrl+w v": cmd.pane.split_vertical,
      "ctrl+w s": cmd.pane.split_horizontal,
      "ctrl+w h": cmd.pane.focus_left,
      "ctrl+w l": cmd.pane.focus_right,
      "ctrl+w =": cmd.pane.equalize,
    }),

    // ── Insert mode ─────────────────────────────────
    when(isEditing, {
      escape: cmd.edit.exit_edit,
      // Text editing delegated to TextArea component
    }),

    // ── Dialog mode ─────────────────────────────────
    when(isDialog, {
      escape: cmd.dialog.cancel,
      enter: cmd.dialog.confirm,
      "ctrl+j": cmd.dialog.nav_down,
      "ctrl+k": cmd.dialog.nav_up,
    }),

    // ── Move mode ───────────────────────────────────
    when(isMoveMode, {
      j: cmd.navigation.down,
      k: cmd.navigation.up,
      enter: cmd.edit.confirm_move,
      escape: cmd.edit.cancel_move,
    }),
  )
}
```

```typescript
// km/plugins/history.ts — op interception for undo
import { signal, type Plugin } from "@silvery/tea"

export function withHistory(): Plugin {
  return (app) => {
    const undoStack = signal<Op[]>([])
    const redoStack = signal<Op[]>([])

    // Wrap apply() — intercept model ops for undo
    const { apply } = app
    app.apply = (o) => {
      if (o.target === "model" && !o.path.includes("_internal")) {
        undoStack.value = [...undoStack.value, o]
        redoStack.value = []
      }
      return apply(o)
    }

    app.commands.history = {
      undo: {
        fn() {
          const op = undoStack.value.at(-1)
          if (op) {
            undoStack.value = undoStack.value.slice(0, -1)
            redoStack.value = [...redoStack.value, op]
            // invert and apply
          }
        },
      },
      redo: {
        fn() {
          const op = redoStack.value.at(-1)
          if (op) {
            redoStack.value = redoStack.value.slice(0, -1)
            undoStack.value = [...undoStack.value, op]
            // re-apply
          }
        },
      },
    }

    return app
  }
}
```

**What this adds over aichat:**

- `pipe(createApp(), ...plugins)` — composable app assembly
- `op(app.model).*` — opt-in interception for undo/tracing/recording
- Provider plugins (`withPersist`, `withFileSync`) — DI boundary
- Multiple domain model plugins contributing to `app.model.*`
- Cross-cutting plugins (`withHistory`, `withTracing`) wrapping `apply()`
- Batch-aware commands (`getSelectedCards()` → iterate)
- Complex keymap: 4 modes, 45+ chords, verb×location grids
- `args` schemas with signal defaults for CLI/MCP compatibility

---

## Spike Map (Pre-Phase B)

Five patterns that must work in Era 2. Each needs a spike example.

### Spike 1: Focus/Input Flow

**Problem**: TextInput captures typing. Dialogs trap focus. Esc returns to board. How does this compose with signals + keymap?

**Current**: ~2,000 LOC across focus-manager.ts, focus-events.ts, focus-queries.ts, with-focus.ts

**What the spike must prove**:

- TextInput receives typing while focused (keymap doesn't intercept)
- Dialog open → focus transfers to dialog → board keymap deactivated
- Dialog close (Esc/Enter) → focus returns to board → board keymap reactivated
- Nested dialogs (picker → sub-picker) work

**Spike shape**: `focus-dialog.tsx` — Board with TextInput, button that opens a SelectList dialog, Esc to close

**Signal-based approach**:

```typescript
const focusTarget = signal<"board" | "dialog" | "input">("board")
const isBoard = derived(() => focusTarget.value === "board")
const isDialog = derived(() => focusTarget.value === "dialog")

// Keymap — when() predicates gate by focus target
const keys = keymap(
  when(isBoard, { j: cmd.down, k: cmd.up, "/": cmd.openSearch }),
  when(isDialog, { escape: cmd.closeDialog, enter: cmd.confirmDialog }),
)
```

### Spike 2: Cursor Re-render Optimization

**Problem**: CursorStore currently bypasses React to avoid O(n) re-renders when only the cursor moves. How does this work with signals?

**Current**: ~150 LOC in CursorStore

**What the spike must prove**:

- Moving cursor between 1000 items causes O(1) signal notifications (only the two affected items re-render)
- No full-list re-render on cursor change

**Signal-based approach**:

```typescript
const cursor = signal(0)

function Item({ index }: { index: number }) {
  // Each item subscribes to cursor independently
  const isCurrent = useSignal(derived(() => cursor.value === index))
  return <Text color={isCurrent ? "$primary" : undefined}>{items[index]}</Text>
}
```

**Key question**: Does `derived(() => cursor.value === index)` create per-item derived signals efficiently? Or do we need a different pattern (e.g., a signal map)?

### Spike 3: Chord/Count Keybindings

**Problem**: km has 45+ chords (`g g`, `d d`, `! 1`, `ctrl+w v`), count prefixes (`3 j`), and verb×location grids (`g/m/l × i/j/1-9`). Can `keymap()` handle all of this?

**Current**: ~1,300 LOC in chord-state.ts, verb-locations.ts, keybindings.ts

**What the spike must prove**:

- Simple chords: `d d` → delete, `g g` → go top
- Count prefix: `3 j` → move down 3 times
- Verb×location: `g i` → goto inbox, `m i` → move to inbox
- Chord timeout: incomplete chord resets after 2s
- Chord indicator: UI shows pending chord state (e.g., "d" waiting for second key)

**Spike shape**: `chord-keymap.tsx` — List with full chord/count/verb-location support

### Spike 4: Multi-Selection Batch Commands

**Problem**: All node-operating commands must handle multiple selected nodes. Pattern: gather → validate → confirm? → execute → cleanup.

**Current**: ~650 LOC across batch-aware command handlers

**What the spike must prove**:

- Single item: `x` toggles done on cursor node
- Multi-selection: select 3 items with `V` + `j j`, then `x` toggles all 3
- Batch validation: if any item can't be toggled, the whole batch fails
- Commands get selection from signal (`selectedNodes.value`), not from explicit args

**Signal-based approach**:

```typescript
function getSelectedCards(board: BoardModel) {
  const selected = board.selectedNodes.value
  if (selected.size > 0) return [...selected].map((id) => findNode(id))
  const cursor = board.cursor.value
  return cursor ? [findNode(cursor)] : []
}
```

### Spike 5: Provider DI for Testing

**Problem**: km uses nested React contexts for DI (RepoProvider, BoardProvider, etc.). How does Era 2 handle this without Provider nesting?

**Current**: ~500 LOC across provider contexts

**What the spike must prove**:

- Model receives providers via factory parameter (not context lookup)
- Tests create isolated instances with mock providers
- No React rendering needed for model tests
- Multiple apps in one process get separate provider instances

**Signal-based approach**:

```typescript
// Production
const app = pipe(
  createApp(),
  withPersist({ dir: "./vault" }),
  withBoard(), // board model receives app.rt.providers.persist
)

// Test — swap providers, no rendering
const app = pipe(createApp(), withPersist({ dir: tmpDir }), withBoard())
app.model.board.moveCursor({ dir: "down" })
expect(app.model.board.cursor.value).toBe("node-2")
```

---

## km Plugin Decomposition (Pre-Phase C)

How km maps into composable plugins for incremental migration.

| Plugin                   | What it owns                                                    | Signals                                                        | Commands                               | Current files                                   |
| ------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------- |
| **withBoard()**          | Navigation, columns, cards, cursor, selection, fold, view mode  | `cursor`, `columns`, `selectedNodes`, `viewMode`, `foldDepths` | 33 nav + 12 selection + 17 view + fold | board-app-store, board-actions-nav              |
| **withTaskManagement()** | Status cycling, priorities, due dates, labels, assignees        | (reads board signals)                                          | 11 task commands                       | board-actions-edit (task parts)                 |
| **withInlineEdit()**     | Text editing, EditContext, TextArea/TextInput, block navigation | `activeEditTarget`, `editMode`                                 | 28 edit + 2 block-edit + text editing  | board-actions-edit (text parts), cursor-context |
| **withSearch()**         | Omnibox, local find, search/replace                             | `searchQuery`, `searchResults`, `replaceText`                  | ~7 search/replace + ~5 local find      | board-actions-find                              |
| **withHistory()**        | Undo/redo via op interception                                   | `undoStack`, `redoStack`                                       | 2 (undo, redo)                         | useBoard history                                |
| **withSync()**           | File system ↔ SQLite bidirectional                              | `syncStatus`, `lastSync`                                       | —                                      | board-app-store (repo parts)                    |
| **withDialogs()**        | Modal dialogs, pickers, prompts, confirmations                  | `dialogState`, `dialogType`                                    | 12 dialog + 5 favorites                | ui/dialogs/\*                                   |
| **withPanes()**          | Split panes, focus routing, resize                              | `paneLayout`, `activePaneId`                                   | 22 pane commands                       | pane management                                 |

**Migration order** (simplest → most complex):

1. `withDialogs()` — validates DI + focus pattern
2. `withBoard()` — validates signal perf with large lists
3. `withTaskManagement()` — validates batch commands
4. `withInlineEdit()` — validates focus/input flow
5. `withSearch()`, `withPanes()`, `withSync()`, `withHistory()`

---

## Next Steps

1. **Review these shapes** — Are the plugin boundaries right? Any missing patterns?
2. **Implement Phase 0** — Production signal/scope/createModel
3. **Build spike examples** — One per tricky pattern, validate before Phase 1
