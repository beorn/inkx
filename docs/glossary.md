# Glossary

Terms and concepts used across the km ecosystem.

## How to Use This

This glossary is the single source of truth for project terminology. Use these terms consistently in design docs, code comments, and bead descriptions. When a term has a specific meaning in this codebase that differs from its general meaning, the glossary definition takes precedence.

## Project

**km** — Knowledge Machine. A workspace for agentic knowledge workers — unified notes, tasks, and calendar with a TUI interface. TypeScript, Bun, SQLite.

**pim** — Personal Information Management. The broader category km belongs to.

**silvery** — React framework for modern terminal UIs. Layout feedback, incremental rendering, multi-target. km's rendering engine.

**vault** — A directory of markdown files managed by km. The user's primary working directory, often referenced as `~vault`.

## Unified Pipeline

```
event → command/handler → op → apply(state, op) → [state, effects] → change
```

Six terms, no ambiguity:

- **event** — something happened (keyboard, mouse, FS change, sync, timer)
- **command** — registered event handler (named, keybinding-mapped, palette-discoverable). One kind of handler — FS watcher, sync, and timers also handle events but aren't commands.
- **op** — serializable data dispatched to `Machine.apply()`. Named after the consuming machine (`BoardOp`, `TreeOp`, `PlainTextOp`).
- **apply()** — pure state transition: `(state, op) → [state, effects]`. Dispatches to **op handlers**.
- **effect** — side-effect instruction emitted by apply (persist, notify, clipboard).
- **change** — persisted record of what changed (e.g., `node_created`, `node_moved`).

### Domain interface anatomy

Each domain groups: **constructor** (creates state), **selectors** (read state), **apply** (transitions state via ops), **op handlers** (implement individual op types via `createSlice()`).

### Selection path (parallel)

Selection uses **transitions** (direct pure functions) rather than dispatched ops:
- **gesture** = physical interaction with lifecycle (start, morph, commit/cancel)
- **selecting kind** = classification (`node`, `node-toggle`, `node-area`, etc.)
- **Selecting.\*** = transition functions computing next Selection from current + inputs

## Terms

### A

**action** — Banned as a type name (too vague). Use *op* for dispatch data, *command* for named intent, *change* for persisted record. "Action" is fine in informal prose.

**ag** — Short for "abstract graphics." The core rendering abstraction in silvery — a tree of `AgNode` objects produced by the React reconciler, which the pipeline lays out and renders to a terminal buffer.

**AgNode** — A node in silvery's abstract graphics tree. Each has a type (`silvery-root`, `silvery-box`, `silvery-text`), layout props (flexbox), style props (colors, borders), and children.

**anchor** — The node where a shift-select gesture began, stored as the last element of `Selection.nodes`. In text selection, the text point where a text range began. Contrast with *cursor*.

**apply** — The universal verb for state transitions in TEA machines. Every machine uses `.apply(state, op) -> [state, effects]` — pure function, two arguments, returns new state plus effects.

**area-select** — A selection gesture where the user drags across empty space to select all nodes within a rectangular region. Produces a `node-area` or `node-area-toggle` selecting kind.

**async generator** — A function (`async function*`) that yields values over time. Used throughout km for composable data pipelines (parse, transform, sync).

### B

**barrel export** — A re-export file (typically `index.ts`) that aggregates a package's public API into a single import path. Vendor packages export raw TypeScript source (no build step).

**bd** — CLI command for the beads issue tracker (`bd list`, `bd create`, `bd update <id> --claim`).

**bead** — An issue (bug, task, or feature) tracked in km's beads system. Beads have an ID (e.g., `km-silvery.selection`), priority (P1-P4), status, and description.

**block** — A leaf content node in the KNode tree where `item` is absent. Blocks cannot have children and are not directly selectable. Examples: paragraphs, code fences, blockquotes. Contrast with *item*.

**board** — The top-level visual container: the currently zoomed-in node, rendered as columns containing cards. The board root determines what is visible.

**BoardState** — Pure data representing navigation and UI state: root ID, cursor, fold depths, collapsed nodes, nav history, move mode. Contains no tree data — visual layout is derived at render time from the Repo.

**body** — Block content that appears before the first sub-item within an item node. In card view, body renders as dimmed text below the card title.

**body-column** — A ViewRole for body content rendered as a pseudo-column. Allows body blocks to participate in the column/card layout without being true structural columns.

**Box** — The fundamental layout component in silvery. Accepts flexbox props, border props, and style props. Children are laid out by flexily.

### C

**cancel** — Discarding an in-progress selection gesture. Pressing Escape clears `selecting` without modifying `selected`.

**card** — A visual role for a KNode at depth 2 (direct child of a column). Rendered as a bordered box with title, body, and sub-items. The role is positional, not typed — the same node renders differently at different depths.

**child_order** — See: parent_idx.

**chord** — A multi-key sequence bound to a command (e.g., `Ctrl+W h` for pane focus left). The first key activates a transient keymap; the second completes the command.

**collapsing** — Merging same-named folder, file, and H1 heading nodes into a single display line. The suffix (e.g., `/ .md #`) indicates what was collapsed.

**column** — A visual role for a KNode at depth 1 (direct child of the board root). Rendered as a vertical lane containing cards.

**change** — A persisted record of what changed in the storage layer (e.g., `node_created`, `node_moved`). Changes carry an `origin` (`"tui"`, `"fs"`, `"replay"`, `"system"`). The final stage of the pipeline: event → command → op → apply → effect → change.

**command** — A registered event handler with an ID (e.g., `file.save`), label, keybinding, and execute function. Commands resolve input events + context into ops. One kind of event handler — FS watcher, sync, and timers also produce ops but aren't commands (not user-invocable, not in the palette).

**command palette** — A searchable dialog listing all available commands. Opened via `:`. Users can fuzzy-search and invoke any command by name.

**commit** — Two meanings:
- *gesture*: writing a gesture's `selecting` preview into committed `selected` state. Triggered by mouseup or shift release.
- *event*: persisting a storage event to the database, journal, and broadcasting it. Distinct from *save* (which writes to the filesystem).

**composability** — A core design principle: build complex systems from simple, reusable pieces — plain objects from factories, async generator pipelines, and decorator composition.

**computed** — A derived reactive signal that recomputes when its dependencies change. In the selection model, `selectingKind`, `selecting`, `selection`, `hoverTarget`, and `dropEffect` are all computed signals.

**constructor** — A function on a domain interface that creates initial state (`Selection.create()`, `Board.create(rootId)`). Part of the domain interface anatomy alongside selectors and apply.

**boxRect** — The available content area of a component after accounting for padding, borders, and layout. Accessed via `useboxRect()` — synchronous, available during render.

**CRDT** — Conflict-free Replicated Data Type. km's architecture is designed to be CRDT-compatible (ID-based addressing, event sourcing), though CRDTs are deferred.

**createApp** — Factory function that creates a silvery app object. Extended via `pipe()` with plugins like `withFocus()`, `withCommands()`.

**createRenderer** — Factory for headless rendering in tests. Returns a function that renders a React element to a virtual terminal with `.text`, `.ansi`, `.lines`, `.press()`, `.resize()` for assertions.

**createScope** — Factory for structured concurrency. Returns a `Scope` that tracks child tasks and timers, cancellable via dispose. Works with `using` for automatic cleanup.

**createSlice()** — Factory that defines a set of op handlers and produces a typed `apply(state, op)` dispatcher. The foundation for TEA state machines in `@silvery/create`. Handlers are plain functions `(state, params) → state`; the slice infers the op union and routes by op name. See `vendor/silvery/packages/create/src/core/slice.ts`.

**createTerm** — Factory for the `Term` abstraction. Three variants: real terminals (stdin/stdout), headless (no output), and termless (terminal emulator mode).

**cursor** — The primary selected node. `sel.cursor` is always in `sel.selected`. Determines which node receives edit operations and keyboard input. At the text level, the cursor is the text caret position (`sel.sub.head`). Contrast with *anchor*. See also *cursoring*.

**cursoring** — Moving the cursor between nodes (j/k/arrow keys). Distinct from *navigate* (changing the board root / view root). Cursoring changes which node is selected; navigating changes which subtree is visible.

### D

**defineOp()** — The low-level mechanism inside `createSlice()` that binds an op handler to a type name and dispatches via `apply()`. Developers rarely use `defineOp()` directly — `createSlice()` defines the handlers, and `op()` proxy provides the ergonomic calling convention. See *op() proxy*, *createSlice()*.

**depth** — A node's distance from the board root in the tree. Determines its visual role: 0 = board, 1 = column, 2 = card, 3+ = sub-item.

**detail view** — A pane showing the full content of the selected node, including body, sub-items, and metadata.

**dirty flag** — A flag on AgNodes indicating they need re-rendering, enabling incremental rendering of only changed subtrees. In sync, marks files needing re-projection.

**dynamic scrollback** — Silvery's three-zone inline rendering model. Splits terminal output into *terminal scrollback* (released to the terminal, Cmd+F works), *app scrollback* (app-managed, virtualized, redraws on resize), and *live screen* (active React rendering). Content flows upward: live → app scrollback (virtualized) → terminal scrollback (released). Implemented via `<Static>` component and `useScrollback` hook.

**disk mode** — Storage mode active when `.km/` exists. SQLite persisted in `.km/state.db`, events logged to `changes.jsonl`, stable ULID node IDs, full history. Contrast with *memory mode*.

**disposable** — An object implementing `Symbol.dispose` for automatic cleanup via the `using` keyword (TC39 Explicit Resource Management).

**domain interface** — A domain concept modeled as a type paired with pure helper functions under one name. The type defines the data shape; the functions read and transform it without mutation. Domain interfaces keep data and operations together without classes or methods — functions are pure, easy to test, compose, and tree-shake. One import gives consumers both the type and its API. For example, `Selection` is both a type (`{ nodes, text? }`) and helpers (`Selection.cursor(sel)`, `Selection.ids(sel)`). Consumers write `Selection.includes(sel, id)`, not `sel.includes(id)`. Uses TypeScript declaration merging — an `interface` and a `const` sharing the same name. Examples: KNode, Selection, Selecting, ViewTree, KTree, PlainText. Contrast with *domain object* (stateful, factory-created) and *domain type* (plain data, no function namespace).

**domain object** — A plain object created by a factory function with explicit dependencies. The fundamental building block of km's architecture — compose via wiring, not inheritance. Contrast with *domain interface* (type + pure functions) and *domain type* (plain data shape).

**domain type** — A plain data shape without an associated function namespace. Too simple to need a domain interface. Examples: TextPoint, ID, PressHit, InsertionPoint, DropTarget. Contrast with *domain interface* (type + pure functions) and *domain object* (stateful, factory-created).

**drop** — A selection gesture where the user drags selected nodes to a new location. `dropEffect` derives from modifier keys: default = move, Opt = copy, Cmd = link.

**dropEffect** — A computed signal derived from modifier keys during a drag gesture. Values: `"move"` (default), `"copy"` (Opt held), `"link"` (Cmd held).

**dropTarget** — The node position where a dragged item would be placed, computed from pointer position during drag gestures.

### E

**effect** — A serializable data value returned alongside new state from `.apply()`. Effects are instructions for the runtime (e.g., `kill_ring_push`, `dispatch`, `persist`). The machine never executes effects itself — purity is preserved.

**emitter** — The component that handles the commit/save lifecycle: apply to DB, persist to journal, broadcast, then FS sync. Three methods: `apply()` (commit + save), `commit()` (no FS), `save()` (FS only).

**ESM** — ECMAScript Modules. km and all vendor packages use ESM exclusively — no CommonJS. Vendor packages publish raw TypeScript source.

**event** — Two meanings:
- *storage*: a canonical state mutation record persisted to the journal. Types: `node_created`, `node_updated`, `node_moved`, `node_deleted`, etc. Events carry an `origin` (`"tui"`, `"fs"`, `"replay"`, `"system"`). The final stage of the command path: command -> transform -> operation -> event.
- *input*: a DOM-style occurrence (key press, mouse click, resize) delivered by the terminal. These are raw signals, not to be confused with storage events.

**event sourcing** — State changes stored as an append-only log rather than overwriting state. km uses event-sourcing-lite: events appended to `.km/changes.jsonl`, SQLite is a rebuildable cache.

### F

**factory function** — A function that creates and returns a plain object. The preferred construction pattern — no classes, no `new`, no `this`. Examples: `createRepo()`, `createTerm()`, `createScope()`.

**fail fast** — Design principle: throw immediately on programming errors, never swallow them. Filesystem errors may be logged and continued; programming errors always throw.

**filter** — A mechanism to hide nodes matching certain criteria (task status, priority, due date). Filters reduce the visible set without removing nodes from the tree. Applied at the board level after ViewTree construction.

**fingerprint** — In flexily, a hash of a node's layout inputs used to detect whether re-layout is necessary. Matching fingerprint = skip the subtree.

**flexbox** — CSS-style flexible box layout. silvery uses flexbox via flexily for all component layout.

**flexily** — A pure JavaScript flexbox layout engine, Yoga-compatible but faster. Used by silvery for terminal layout. Zero-allocation design in hot paths.

**focus** — The mechanism that determines which component receives keyboard input. silvery uses a tree-based focus system with spatial navigation and focus scopes that isolate input handling.

**focus scope** — A boundary in the focus tree that contains focus within itself. Used by modals to prevent background components from receiving input. Applied via `focusScope` prop on Box.

**fold** — Collapsing a node's subtree to hide descendants beyond a certain depth. Part of the *visibility model*.

**FrameCell** — A cell in a TextFrame with resolved RGB colors, flattened boolean attributes, underline style, wide character info, and hyperlink URL. Used for precise style assertions in tests.

**fstype** — A node trait indicating filesystem type: `"repo"`, `"folder"`, `"file"`, or `"mdsection"`. Determines how the node maps to the filesystem.

**FTS5** — SQLite full-text search extension used for content indexing.

**fuzz** — Randomized testing that generates arbitrary inputs to find edge cases. km uses property invariant fuzz tests for silvery/flexily (render idempotence, no-op stability, inverse operations).

### G

**gesture** — A physical user interaction (click, drag, shift+click) that produces a selection change. Gestures have a lifecycle: start on mousedown, optionally morph during drag, then commit or cancel. Classified into *selecting kinds* based on input signals.

**gesture morphing** — During a drag, the selecting kind recomputes as the pointer moves. A `text-drag` crossing a node boundary becomes `node-area`; dragging back reverts.

### H

**heartbeat** — Periodic anti-entropy reconciliation in the sync system. Runs when idle, reconciles all directories to catch dropped watcher events, re-projects dirty paths.

**hoverTarget** — A computed signal indicating which node the pointer currently hovers over. Used for hover effects, tooltips, and drop target visualization. Distinct from *pressHit* (latched on mousedown).

### I

**incremental rendering** — silvery's optimization where only dirty subtrees are re-rendered. The output phase then diffs against the previous buffer to emit minimal ANSI escape sequences.

**inline edit** — Text editing mode within a node, activated by Enter or double-click. Escape returns to node mode. Part of the *mode ladder*.

**input layer** — A LIFO stack in silvery for routing keyboard input. Modals push a new layer that consumes all input; closing pops the layer.

**inputMode** — The current interaction mode: `"board"` (no selection), `"node"` (nodes selected), or `"text"` (text cursor active). Computed by `Selection.inputMode(sel)`.

**inverse** — A function that produces the operation which undoes a given operation. Every km tree operation is invertible, enabling undo without reimplementing business logic.

**item** — A structural node in the KNode tree where `item` is present. Items can have children and are cursor targets. They participate in outliner operations (indent, outdent, split, merge). Contrast with *block*.

**ItemData** — The object present on item nodes. Contains `list?: string` (bullet marker) and `task?: { marker: TaskMarker; status: TaskStatus }`.

### K

**keybinding** — A mapping from a key or key sequence to a command ID. Keybindings are the UI layer; commands are the API layer.

**keymap** — A set of keybindings active in a given context (mode + scope). Different keymaps apply in normal, move, search, and input modes. Chords activate transient keymaps for multi-key sequences.

**kill ring** — A circular buffer of killed (deleted) text, shared across all text editing contexts. Inspired by Emacs. `PlainText.apply()` emits `kill_ring_push` effects; the command layer resolves ring content for yank.

**km-ast** — The abstract syntax tree produced by km's markdown parser. Uses types like `oi` (outline item), `li` (list item), `p`, `h`, `code`, `quote`. Parse-time types that map to `KNode` in storage.

**KNode** — The universal node type. Every piece of content is a KNode: a flat record with `id`, `type`, optional `item`, `parent_id`, `parent_idx`, `content`, `title`, `symlink_to`, `fstype`, and `rules`. Also a namespace of type guards (`KNode.isItem`, `KNode.isOutline`, etc.) via the domain interface pattern.

**KTree** — A namespace of pure tree traversal functions operating on flat node stores. The primary method is `KTree.nodes(tree, rootId, opts?)` — DFS pre-order with orthogonal `match` (what to yield) and `into` (what to descend into) predicates.

### L

**latch** — A signal value set on mousedown and cleared on mouseup/cancel. `pressOrigin` and `pressHit` are latches — they freeze the gesture's starting context.

**layout feedback** — A silvery/flexily capability where components read their computed layout via `useboxRect()` during the same render pass. No second render needed.

**layout phase** — The first phase of silvery's rendering pipeline. Runs flexily's flexbox algorithm: measure, compute positions and sizes, resolve scroll offsets and sticky positioning.

**li** — A km-ast parse type for list items. Maps to KNode with `type: "p"` and `item`. Does not exist as a KNode type — parser concept only.

### M

**materializer** — The component that produces KNode records from parsed markdown. Transforms km-ast nodes into flat records with parent-child relationships for SQLite storage.

**mdast** — The standard Markdown Abstract Syntax Tree format from the unified ecosystem. km uses mdast/micromark for parsing, then transforms to km-ast.

**memory mode** — Storage mode active when no `.km/` directory exists. SQLite in RAM, rebuilt from files each run, ephemeral IDs, no history. Contrast with *disk mode*.

**micromark** — The markdown parser used by km (from the unified ecosystem). Produces mdast trees transformed into km-ast and then KNode records.

**mode ladder** — The progression of interaction modes: `text -> Esc -> node -> Esc -> board -> click/j -> node -> Enter -> text`. Each Escape steps up one level.

**modifiers** — A global input signal tracking modifier key state (Shift, Cmd, Opt, Ctrl). One of the three input signals — along with *pointer* and keyboard — driving the selection system. Modifier state determines *selecting kind* during gestures.

**mouseState** — A computed signal: `"idle"`, `"pressed"`, or `"dragging"`. Derived from pointer buttons and distance from `pressOrigin`.

### N

**navigate** — Changing the board root via zoom (Enter to drill in, u to zoom out). Distinct from *cursoring* (moving to adjacent nodes with hjkl).

**node** — The fundamental unit of content in km. Everything is a node: folders, files, sections, headings, list items, paragraphs, code blocks. Nodes form a tree via `parent_id` references.

**node-area** — A selecting kind produced by dragging from empty space. Selects all nodes within the drag rectangle, replacing the current selection.

**node-area-toggle** — A selecting kind produced by Cmd+drag from empty space. XOR-toggles nodes within the drag rectangle against the current selection.

**node-extend** — A selecting kind produced by Shift+click or Shift+j/k. Extends the selection from the anchor to the target. Preview gesture — committed on shift release.

**node-toggle** — A selecting kind produced by Cmd+click. Toggles a single node in/out of the multi-selection. Committed immediately.

**normalize/normalization** — Two meanings:
- *tree*: enforcing schema constraints after every mutation via `withNormalization()`. Ensures structural invariants hold.
- *selection*: repairing a selection after tree changes (deleted nodes, reordered siblings) so it remains valid.

### O

**oi** — A km-ast parse type for outline items (folders, files, sections). Maps to KNode with `type: "h"` and `item`. Parser concept only — `fstype` distinguishes folder, file, and mdsection at the KNode level.

**op** — Serializable data dispatched to `Machine.apply()`. Named after the consuming machine: `BoardOp`, `TreeOp`, `PlainTextOp`. The universal term for "dispatchable state-machine input." `KmOp` is the union of all domain ops. See also: *op handler*, *op() proxy*, *createSlice()*, *apply*.

**op() proxy** — Ergonomic wrapper that intercepts method calls on a model and routes them through `apply()` as serializable `{ path, args }` data. `op(model).method(args)` behaves like `model.method(args)` but is interceptable by plugins (undo, tracing, recording). The method name IS the op type, the arguments ARE the op data. Built on `createSlice()` + `apply()`. See `vendor/internal/silvery/design/v15-tea/app.md`.

**op handler** — A pure function implementing one op type within a machine. Op handlers are defined in a `createSlice()` handler map and dispatched by `apply()`. Testable independently.

**operation** — Synonym for *op*. Used in prose ("tree operations") and for the `TreeOp` type (renamed from `Operation`). At the tree level, 7 operations: `insert_node`, `remove_node`, `set_node`, `move_node`, `split_node`, `merge_node`, `set_selection`. Each becomes a *change* when persisted.

**output phase** — The final phase of silvery's rendering pipeline. Diffs the new TerminalBuffer against the previous one and emits minimal ANSI escape sequences. Supports fullscreen and inline modes.

### P

**pane** — A subdivision of the terminal displaying an independent board view. Each pane has its own selection, cursor, and view state.

**parent_id** — The ID of a node's parent in the tree. `"."` means the workspace root (the single top-level node). `null` means no parent (only the workspace root itself). Defines hierarchy without nesting.

**parent_idx** — The fractional index determining sibling order within a parent. Allows insertions without renumbering.

**parser** — The component that reads markdown text and produces km-ast nodes. Uses micromark/mdast internally. Counterpart of *serializer*.

**Path** — A `number[]` describing a node's position by sibling indices at each level (e.g., `[2, 5, 0]`). Structural coordinate system that does not encode visual role.

**pipe** — A composition function that threads a base value through plugins: `pipe(createApp(), withFocus(), withCommands())`. Returns the fully composed result.

**pipeline** — Two meanings:
- *rendering*: silvery's three-phase process: layout -> render -> output.
- *data*: composable async generator flows for parsing, syncing, and transforming content.

**PlainText** — Character-level text editing (readline-style), modeled as a *domain interface*. `PlainText.apply(state, op)` handles ~16 operations (insert, delete, cursor movement, kill, yank). Pure state machine, no framework dependency.

**PlainTextOp** — The operation type for `PlainText.apply()`. ~16 high-level ops: `insert_text`, `delete_backward`, `cursor_left`, `cursor_word_back`, `yank`, `kill_to_end`, etc.

**plugin** — A function that extends an object's capabilities by wrapping or augmenting it. In silvery: `withFocus()`, `withCommands()`, composed via `pipe()`. In km-tree: `withHistory()`, `withNormalization()`.

**Point** — Two meanings:
- *tree operations*: `{ nodeId: string; offset: number }` — a position within a node's text content using stable IDs.
- *selection model*: see *TextPoint*.

**pointer** — A global input signal tracking mouse position and button state: `{ x, y, buttons }`. One of the three input signals — along with *modifiers* and keyboard — driving the selection system.

**popover** — A floating UI element anchored to a specific position, used for tooltips, context menus, and hover previews.

**pressOrigin** — A gesture latch recording the `{ x, y }` coordinates of a mousedown. Used to calculate drag threshold. Cleared on mouseup/cancel.

**pressHit** — A gesture latch recording the node ID hit on mousedown. Determines the initial selecting kind. During drag, the kind may morph based on pointer position (see *gesture morphing*), but the original pressHit remains latched.

**property invariant** — A fuzz test pattern that verifies algebraic properties hold across random inputs. Examples: render idempotence, no-op stability, inverse operations.

**provider** — Two meanings:
- *React*: a context that supplies shared state to a subtree (e.g., `Term`, `SelectionProvider`).
- *architecture*: structurally similar to plugins but representing shared concerns rather than extensions.

### Q

**quality plateau** — The concept that a codebase reaches a level of quality where fast tests, fail-fast errors, and clean patterns self-reinforce. Dropping below it creates compounding technical debt.

### R

**Range** — Two meanings:
- *tree operations*: `{ anchor: Point; focus: Point }` — a span of text within or across nodes. When collapsed, represents a cursor position.
- *selection model*: the text portion of a `Selection`, represented as one or two `TextPoint` values on the cursor node.

**reconciliation engine** — The component that syncs filesystem changes into the database (FS -> DB). Scans FS entries, queries DB nodes, diffs to produce operations (create, update, rename, delete), and filters owned writes.

**render** — The act of producing terminal output from a React element tree. In silvery, `run(<App />, term)` starts the render loop; `createRenderer()` provides headless rendering for tests.

**render phase** — The second phase of silvery's rendering pipeline. Takes the positioned ag tree and renders content into the TerminalBuffer. Supports incremental rendering of only dirty subtrees.

**Repo** — The data store factory. `createRepo(path)` creates a disposable store backed by SQLite with queries, mutations, subscription, and filesystem watch.

**RepoTree** — The data-level tree: all KNodes in SQLite. Accessed via `repo.node(id)`, `repo.children(id)`, `repo.parent(id)`. Contains all nodes regardless of visibility. The ViewTree is a filtered, enriched projection of the RepoTree. Hooks: `useRepoTree()`.

**roundtrip** — The property that parsing markdown to KNode and serializing back produces identical markdown. km strives for roundtrip fidelity to avoid data loss during bidirectional sync.

**rules** — Per-section directives parsed from `km.*` frontmatter or inline directives. Controls collapse state, content line limits, color, and other visual behavior. Stored as `SectionRules` on KNode.

**run** — The top-level function that starts a silvery app: `await run(<App />, term)`. Sets up the event loop, renders the React tree, and handles input until exit.

### S

**save** — Writing a node's current state to the filesystem (DB -> FS). Only runs for TUI-origin events, never for FS-origin (prevents echo loops). Contrast with *commit (event)*.

**scope** — A structured concurrency primitive that tracks child tasks and timers. Disposing a scope cancels all its children. Supports nesting.

**scrollRect** — The absolute terminal coordinates of a component after layout. Used for hit testing and absolute positioning.

**scroll** — `overflow="scroll"` on a Box enables automatic scrolling. silvery measures children, renders only what fits, and shows scroll indicators.

**selector** — A pure function on a domain interface that derives a value from state without changing it. Examples: `Selection.cursor(sel)`, `Selection.ids(sel)`, `Board.visibleNodes(state)`. Part of the domain interface anatomy alongside constructors and apply.

**selected** — The committed selection state that persists between gestures. Only updated when a gesture commits. `undefined` means board mode (no selection).

**selecting** — The preview selection state during an in-progress gesture. When present, overrides `selected` in the effective selection. Discarded on cancel.

**selecting kind** — The classification of an in-progress gesture. Nine kinds: `node`, `node-toggle`, `node-extend`, `node-area`, `node-area-toggle`, `text`, `text-extend`, `text-drag`, `drop`. Determines what preview is produced.

**Selecting.\*** — A namespace of gesture algebra functions that compute the next Selection from inputs. Takes `visibleNodes` explicitly for ordering context. Separate from `Selection.*` because selecting is an action, Selection is data.

**selection** — Two meanings:
- *effective*: the computed value `selecting ?? selected` — what consumers read, overlaying any in-progress gesture preview on committed state.
- *type*: see *Selection*.

**Selection** — The core type: `{ nodes: readonly [ID, ...ID[]]; text?: readonly [TextPoint] | readonly [TextPoint, TextPoint] }`. `nodes[0]` = cursor, `nodes.at(-1)` = anchor. `text` is an optional caret/range within the cursor node. See `docs/design/selection-model.md`.

**Selection.\*** — A namespace of pure read helpers and constructors: `cursor(sel)`, `anchor(sel)`, `ids(sel)`, `includes(sel, id)`, `isEditing(sel)`, `inputMode(sel)`, `from(nodes, text?)`. Mutation logic lives in `Selecting.*`.

**SelectionProvider** — A React provider supplying selection context to a subtree. Receives visible node IDs as a prop so gestures can derive range walks and cursor repair. Each pane has its own provider.

**SelectionStore** — The per-scope reactive store created by `Selection.with(store, nodes)`. Contains the `selected` signal, computed `selecting` and `selection`, and gesture handlers. Not to be confused with *Store* (storage contract) or Zustand stores (see *Zustand*).

**serializer** — The component that converts KNode trees back to markdown text. Used by the DB -> FS sync path. Counterpart of *parser*.

**signal** — A reactive primitive that holds a value and notifies dependents when it changes. `signal<T>(initial)` creates a writable signal; `computed(() => ...)` creates a derived one.

**SlateJS heritage** — km's tree layer is inspired by SlateJS's architecture: atomic operations with inverse, Point/Range positions, normalize after mutation, withHistory plugin. Key difference: km uses stable node IDs instead of SlateJS's index-based paths, making collaboration simpler.

**split pane** — Dividing the terminal into multiple independently-scrollable board views. Each pane has its own cursor, selection, and zoom state.

**SQLite** — The embedded relational database used by km for node storage. Runs in WAL mode for concurrent access. In disk mode, persisted as `.km/state.db`; in memory mode, rebuilt from files each run.

**symlink** — Old name for **embed**. Renamed because it collided with the filesystem concept. See *embed*.

**embed** — A KNode whose content is exactly one Link with `rel: "embed"`. Cached on the node as `embed_of` (target id) for hot-path access. Created from markdown `![[Note]]` syntax when it's the sole content of a li/heading/paragraph. Contrast with *link* (a navigable reference, `rel: "link"`) and *inline embed* (an embed Link inside other prose, not promoted to node level). See [docs/design/links.md](design/links.md) for the full link model.

**Link** — The canonical reference type. Lives inside parsed AST inside `KNode.content`. Shape: `{ href: string, rel: string, alias?, md? }`. Source is implicit (the containing node). Built-in `rel` values: `link`, `embed`. Sigils (`@`, `#`, `+`) are `rel: "link"` with notation in `md.form`. User-defined rels from property syntax (e.g., `[blocked-by:: [[X]]]` → `rel: "blocked-by"`). See [docs/design/links.md](design/links.md).

**URI** — Link targets use RFC 3986 URIs. Internal: `km:<id>` or `km:<name>[#<frag>]`. External: `https://...`, `mailto:...`, etc. Future federation: `km://<authority>/<path>`. See [docs/design/links.md](design/links.md).

**rel** — On a Link, the semantic relation. Built-in: `link` (default, includes sigils), `embed`. User-defined: `blocked-by`, `author`, `cites`, etc. Same model as HTML's `rel` attribute (RFC 8288).

**sticky** — A layout feature in flexily where a node sticks to the top or bottom of its scroll container as the user scrolls.

**store** — Three meanings:
- *Store*: the minimal storage contract for node data (`peekNode`, `peekChildIds`, `commit`). Extended by `Observable` and `Replicated`. `withReactive(store)` adds per-node signals.
- *Zustand store*: a reactive state container used by silvery's `@silvery/tea` and km's board state. See *Zustand*.
- *SelectionStore*: the per-scope selection state. See *SelectionStore*.

**sub-item** — A visual role for a KNode at depth 3+ (child of a card). Rendered as an indented line that expands to a card-like frame when focused.

**submodule** — A git submodule in `vendor/`. Each vendor package is a standalone repo. Fix bugs directly — don't work around them.

**sync** — Bidirectional synchronization between SQLite and markdown files. DB -> FS writes via event handlers. FS -> DB reconciles via the reconciliation engine. FS-origin events use `commit()` only (no `save()`) to prevent loops.

### T

**TaskMarker** — The checkbox syntax in markdown: `[ ]`, `[/]`, `[!]`, `[x]`, `[-]`. Stored in `item.task.marker`.

**TaskStatus** — The semantic status derived from a task marker: `"todo"`, `"wip"`, `"blocked"`, `"done"`, `"dropped"`.

**TEA** — The Elm Architecture. Every interactive subsystem is `(state, op) -> [state, effects]`. Operations and effects are serializable data. Machines compose via effects. Enables testing, replay, undo, portability, and AI automation.

**Term** — The central terminal abstraction in silvery. Wraps a terminal backend and provides styling, capabilities, dimensions, and I/O. Also a Provider with state, events, output, and styling.

**TerminalBuffer** — An internal mutable buffer representing the terminal screen as a grid of styled cells. Written to during render, diffed during output. Consumers use *TextFrame* instead.

**termless** — Headless terminal testing framework (like Playwright for terminals). Runs a real terminal emulator in-process for full ANSI verification including colors, cursor positioning, and wide characters.

**testEnv** — A test environment that renders the full TUI in a virtual terminal. More realistic than unit tests, faster than manual TTY testing. Uses termless internally.

**text-drag** — A selecting kind produced by dragging within text content. Can morph into `node-area` if the pointer crosses a node boundary.

**text-extend** — A selecting kind produced by Shift+Arrow in text mode. Extends the text selection range. Committed on shift release.

**TextFrame** — An immutable snapshot of rendered terminal output. Provides `text` (plain), `ansi` (styled), `lines`, `cell(col, row)` (FrameCell), and `containsText()`. The public read API for rendered output.

**TextPoint** — In the selection model, `{ nodeId: ID; offset: number; affinity?: "forward" | "backward" }`. A position within a node's text content. Both endpoints target the cursor node. Never spans nodes.

**TNode** — A recursive tree node extending KNode with `children: TNode[]`. Used where recursive structure is needed. Contrast with KNode (flat, parent_id-based).

**toast** — A brief notification message that appears temporarily and auto-dismisses.

**transform** — Position adjustment: `Point.transform(point, op)` adjusts a Point or Range after an operation to keep it valid. Used for selection preservation across mutations. Note: SlateJS's `Transforms.*` (compound mutation helpers) map to methods on Repo/TreeMutator in km — we don't have a separate Transforms namespace.

**TreeLens** — The universal navigation interface for tree structures (`packages/km-board/src/tree-lens.ts`). Pure data layer — no state, no signals, lazy caching. All three lenses in the visibility pipeline implement TreeLens: `repo` (raw nodes), `createViewLens` (rooted subtree, hidden filtered, roles computed), `createVisibleLens` (collapsed/filtered/task-status applied). Methods: `get(id)`, `children(id)`, `parent(id)`, `nextInWalk(id)`, `prevInWalk(id)`, `walkOrder` (eager DFS array), `role(id)`, `isBody(id)`, `resolvedSymlink(id)`, `rules(id)`. **Layering rule**: React components should NOT consume TreeLens directly — use *ViewTree* (the React-side projection that wraps a TreeLens with per-node signal bags) via `useNode(id)`. TreeLens is for non-React code: reducers, selectors, navigation helpers, store, pane-signals reactive graph.

**TreeMutator** — The interface Repo satisfies for tree mutations: `getNode`, `getChildren`, `addNode`, `updateNode`, `moveNode`, `deleteNode`. Decouples tree logic from storage.

**tribe** — A system for coordinating multiple Claude Code sessions working on the same codebase. One session is the chief (coordinator), others are members.

### U

**ULID** — Universally Unique Lexicographically Sortable Identifier. Used for node IDs in disk mode. Stable, sortable, unique identifiers that survive structural changes.

**using** — TC39 Explicit Resource Management keyword. Ties object lifetime to scope — cleanup runs automatically on exit. Used throughout km and silvery: `using term = createTerm()`. Resources clean up in reverse order.

### V

**vendor** — The `vendor/` directory containing git submodule packages. Each is a standalone repo with its own npm scope and release cycle. Packages must not reference `vendor/` paths in their source.

**ViewLens** — The first lens in the visibility pipeline. `createViewLens(repo, { rootId, hiddenNodeIds, foldDepths })` returns a *TreeLens* scoped to a root node, with structural exclusions (`isCollapsedChild`, `isDetailOnly`, `km.collapse:: true`), symlink resolution, role computation, and folder-index file expansion. Returns the same KNode identities as the underlying repo — only visibility differs. Lazy: each method computes on demand and caches results, zero upfront allocation. **Use directly only from non-React code** (reducers, selectors, navigation helpers). React code should consume the *ViewTree* projection above this layer.

**ViewNode** — An enriched view of a KNode within the ViewTree. Carries `viewType` (visual role), `childIds` (visible children), `parentId` (visual parent), `display` (the KNode to render — self or symlink target), `isBody`, `isSymlink`, `rules`. The raw repo node is accessible via `.data`. React components subscribe to individual ViewNodes via `useNode(id)` — re-renders only when that specific node's view state changes.

**ViewType** — One of `"board"`, `"body-column"`, `"column"`, `"card"`, `"subitem"`. Assigned by tree position, not node type. (Replaces `ViewRole`.)

**ViewTree** — The React-side projection of a *TreeLens*. `createViewTree()` wraps any TreeLens with per-node signal bags via `ProjectedMap`, plus a `nodes({ from?, reverse? })` iterator for tree-wide traversal. Components subscribe to individual nodes via `useNode(id)` — re-renders only when *that node's* view state changes. The single source of truth for React rendering and navigation. Methods: `track(id)`, `sync(lens)`, `next(id)`, `prev(id)`, `nodes(opts?)`, plus delegation to the underlying lens (`node(id)`, `children(id)`, `parent(id)`). **Use this from React code**, not the raw TreeLens.

**VisibleLens** — The second lens in the visibility pipeline. `createVisibleLens(view, { collapsedNodes, taskStatusFilter, cardFilter })` wraps a *ViewLens* with column collapse, task-status filtering, and card-level predicate filtering. Same TreeLens interface as the parent — only `children()` and `walkOrder` are modified to exclude collapsed and filtered cards. Cards in collapsed columns are excluded from `walkOrder` so the cursor cannot land on them. **Use directly only from non-React code.**

**visibility model** — Three independent visibility mechanisms, each at a different layer of the lens pipeline. See [docs/design/visibility-model.md](design/visibility-model.md) for the full picture.
- **Structural exclusion** (ViewLens construction): nodes never appear in `walkOrder` — `isCollapsedChild`, `isDetailOnly`, `hiddenNodeIds`
- **Collapsed columns** (VisibleLens construction): card children of collapsed columns excluded
- **Per-node fold** (NodeStore, React layer): subtree rendering skipped in cards view; alternate views currently bypass this — see `km-tui.view-mode-feature-parity`

**visual lasso** — During area-select gestures, a rectangular overlay (inverse video + dim background) showing the drag selection region.

**visual role** — The rendering role of a KNode, determined by depth relative to the board root: 0 = board, 1 = column, 2 = card, 3+ = sub-item. Not stored — purely a view-level concept.

### W

**WAL** — Write-Ahead Logging, an SQLite journaling mode. km uses WAL for concurrent read/write access.

**watcher** — The filesystem change detector (chokidar-based). Runs in a worker thread. Debounces events before triggering reconciliation.

**when clause** — A boolean expression evaluated against current state to determine if a command or keybinding is active. Similar to VS Code's `when` clauses.

**withApp** — A silvery plugin that provides app-level context (focus, commands, themes) to the component tree. Composed via `pipe()` with `createApp()`.

**withHistory** — A decorator for TreeMutator that captures operations for undo/redo with batch grouping. Undo replays `inverse(op)` — operations are recorded, not reimplemented.

**withNormalization** — A decorator for TreeMutator that enforces schema constraints after every mutation.

**withReactive** — A decorator for Store that adds per-node reactive signals. Signals are lazy (created on first access) and updated in batch.

**withSync** — A decorator for Repo that wraps `repo.apply()` with filesystem sync, watcher setup, and heartbeat scheduling. Uses `await using` for cleanup.

**worktree** — A git worktree for parallel development. `bun worktree` (not bare `git worktree`) handles submodules, dependencies, and hooks.

### Z

**zoom** — Changing the board root to drill into or out of the node tree. Enter zooms in, u/Backspace zooms out. Navigation history tracks zoom changes.

**Zustand** — A minimal React state management library. Used by silvery's `@silvery/tea` store and km's board state for immutable updates and selectors. Not to be confused with *Store* (the storage contract) or *SelectionStore* (per-scope selection state).
