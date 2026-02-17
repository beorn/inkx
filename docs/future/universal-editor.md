# Universal Editing Platform - Spec

**Status:** Design
**Bead:** km-all.universal-editor
**Last Updated:** 2026-02-17

## Vision

We're building two things:

1. **A rich TUI app** — a fast, keyboard-driven workspace for knowledge workers in the terminal
2. **A rich web app** — at creative-tools polish level (think Keynote, not "web port"), with the visual quality and interaction design that implies

Both are first-class targets. The shared foundation is a **great text + node editing engine** that works across platforms — the same document model, commands, undo, and text editing logic powering both apps. Not by emulating one platform in another, but by sharing the core and using each platform's native rendering.

km already has the seed: an id-based tree model, a command system decoupled from rendering, lazy-loadable SQLite storage, and multiple views (board, outline, list). The gap is that these layers aren't cleanly separated — editing is coupled to inkx (terminal), and the board logic is tangled with view code. This design untangles them.

### Why This Matters Beyond km

A clean platform-agnostic editing engine could become a foundation that other tools build on. Think of how ProseMirror became the basis for Notion, Atlassian, and dozens of other editors — but ProseMirror is browser-only. A truly platform-agnostic equivalent doesn't exist yet. The W3C EditContext API decouples text editing from the browser DOM; we extend that idea to decouple the *entire* structured editing stack from any platform.

The terminal app proves the engine works under the tightest constraints (fixed-width grid, no mouse, no layout engine). The web app proves it scales to rich, visual, creative-tools-quality experiences. If the same engine powers both, it's robust enough for anything in between.

---

## Architecture

The architecture has three layers: **thin platform shells** at the top, a **shared app layer** in the middle, and **five engine packages** at the bottom — organized as two parallel systems (terminal rendering + editing framework) bridged by a shared runtime.

```
              ┌──────────┐                     ┌──────────┐
              │  km-tui  │                     │  km-web  │
              │  (shell) │                     │  (shell) │
              └────┬─────┘                     └────┬─────┘
                   │                                │
              ┌────▼────────────────────────────────▼────┐
              │              km-app (shared)              │
              │    views, components, state, hooks        │
              └──┬──────────────┬──────────────────┬─────┘
                 │              │                   │
   ┌─────────────▼┐  ┌─────────▼─────────┐  ┌─────▼──────────┐
   │   termily    │  │  Shared Engine     │  │  react-dom     │
   │   + flexily  │  │                    │  │  + CSS         │
   │              │  │  docily   textily  │  │                │
   │  (terminal)  │  │  runly             │  │  (browser)     │
   └──────────────┘  └───────────────────┘  └────────────────┘
```

The bulk of the application — views (Board, Outline, List), components (Card, Column, Dialog), state management, hooks — lives in **km-app**. The platform shells are thin: entry point, platform-specific setup, and concrete rendering primitives. The renderers are **alternatives** — terminal swaps for web by replacing the left column with the right.

### The Five Engine Packages

| Package | Role | Dependencies | Platform-specific? |
|---------|------|-------------|-------------------|
| **runly** | Elm-style functional reactive runtime | None | No — shared |
| **docily** | App foundation: document model, command system, undo/CRDT, plugin composition | runly | No — shared |
| **textily** | Rich text model: cursor, selection, formatting | None (zero deps) | No — shared |
| **termily** | Terminal: React renderer + components + cell buffer + ANSI diff | runly, flexily | Yes — terminal only |
| **flexily** | Standalone flexbox layout engine | None | No — but only terminal needs it |

### Two Independent Systems

**System 1: Terminal Rendering** (termily + flexily)
Everything needed to put pixels on a terminal screen. React reconciler, Box/Text/VirtualList components, cell buffer, dirty tracking, ANSI diff output, stdin input parsing, terminal detection. Flexily provides the layout algorithm since terminals have no native layout engine.

**System 2: Editing Framework** (docily + textily)
Everything needed to build a rich interactive application on any platform. Document tree with operations, command system (keyboard, mouse, touch, programmatic), undo/redo, plugin composition, CRDT-ready mutations. Textily handles the text model (cursor, selection, wrap-aware navigation) with zero dependencies.

**runly** bridges both — it's the Elm-style runtime that powers both docily's event processing and termily's render loop.

---

## The Web Story

The web app is not a port of the terminal app — it's a **first-class creative tool** that happens to share the same editing engine. It should feel like Keynote or Figma in terms of interaction polish, not like a terminal emulator in a browser.

### What's Shared vs Platform-Specific

| Layer | Terminal | Web | Shared? |
|-------|----------|-----|---------|
| **App** — views, components, state, hooks | km-app | km-app | **Yes — identical** |
| **Editing** — document model, commands, undo | docily + textily | docily + textily | **Yes — identical** |
| **Runtime** — event loop, state management | runly | runly | **Yes — identical** |
| **Rendering** — primitives, layout, output | termily + flexily | react-dom + CSS | No — swapped |
| **Input** — event parsing | stdin/ANSI | KeyboardEvent/PointerEvent | No — swapped |
| **Shell** — entry point, platform setup | km-tui | km-web | No — thin, per-platform |

Most of the code is shared. What changes per platform is the rendering layer and a thin entry-point shell.

### Component Abstraction

km-app components use **abstract primitives** (Box, Text, ScrollView) — like React Native's approach. termily implements these for the terminal; on web, a thin adapter maps them to DOM elements (Box→div, Text→span). The shared components define *what* to render (structure, state, logic); the platform provides *how*.

This is the hardest part of the architecture to get right. See Open Questions for the specific design decisions needed.

### Web-Specific Challenges

"Swap the renderer" is a one-line phrase that hides real work:

- **DOM selection/cursor**: Re-rendering can reset the browser caret. Must use the Selection API to restore it after state updates. Typing must not trigger full re-renders. See [Lexical's approach](https://news.ycombinator.com/item?id=31018746) — they treat the DOM as derived state, diffed carefully to preserve selection.

- **IME/EditContext**: The W3C [EditContext API](https://developer.mozilla.org/en-US/docs/Web/API/EditContext) is Chrome/Edge only as of 2026. Firefox and Safari need a fallback (hidden `<textarea>` or contentEditable). Expect edge cases with composition events, dead keys, CJK input.

- **Focus management**: Browsers provide DOM focus for free; terminals must implement an equivalent system (focusable elements, tab order, focus/blur events). Both platforms should expose the same abstract focus API to km-app.

- **Mouse/touch**: Web users expect clicking to place cursor, drag to select, scroll wheels. The command system needs pointer interaction handlers — registered by the platform shell, not baked into docily.

- **Accessibility**: Needs ARIA roles, focus management for screen readers, live regions for state changes, keyboard navigation that doesn't fight the browser's own.

- **Virtual scroll on web**: Variable-height elements with proportional fonts require DOM measurement (`getBoundingClientRect`), unlike terminal where wrap is computable from column width.

### Web-Specific Opportunities

Creative-tools-level polish means the web app goes far beyond terminal capabilities:

- **Rich typography**: Variable fonts, sizes, weights. Headings that look like headings.
- **Animations and transitions**: Smooth card reordering, view transitions, expand/collapse via CSS transitions and Web Animations API.
- **Drag-and-drop**: Reorder cards, move between columns, drag files in. Interaction logic lives in km-app (shared); platform event handling in the shell.
- **Rich media**: Embedded images, videos, syntax-highlighted code blocks, LaTeX. Nodes render arbitrary web content.
- **Spatial layout**: Variable-width columns, zoom levels, minimap.
- **Collaboration UI**: Presence indicators, remote cursors, conflict resolution dialogs.

The interaction *logic* (what drag-and-drop means, what reordering does) lives in km-app. The interaction *mechanics* (pointer events, DOM measurement, CSS animations) live in the platform shell.

---

## Package Details

### runly: Elm Runtime

runly provides an Elm-style functional reactive runtime: init/update/view cycle, AsyncIterable event streams, and multiple run modes. It's not an all-or-nothing commitment — **an app chooses its primary runtime style** and can **drop into Elm-style for specific subsystems or tests**.

**Three conceptual layers:**

```typescript
// Layer 1: Elm — pure functional, event-sourced
interface ElmApp<Model, Msg> {
  init: () => [Model, Cmd<Msg>]
  update: (msg: Msg, model: Model) => [Model, Cmd<Msg>]
  view: (model: Model) => View
  subscriptions: (model: Model) => Sub<Msg>
}

// Layer 2: React — component rendering (pluggable)
// termily: custom fiber reconciler → cell buffer
// browser: react-dom → DOM
// test: virtual buffer → assertions

// Layer 3: Zustand — mutable store for performance-critical paths
// Layout cache, scroll position, cursor blink state
// Derived from Elm model, but mutable for 60fps
```

**Zustand boundary rule**: The mutable store is strictly for **read-only derived caches** (layout measurements, scroll position, cursor blink) that don't initiate logic. All state transitions flow through Elm's update function. If Zustand state starts driving logic, the architecture's predictability guarantees erode.

**Run modes:** Terminal (termily → stdout), Headless (virtual buffer for testing), Browser (react-dom → DOM), Worker (no rendering).

**Why Elm-style matters** — valuable for any event-driven application with complex state:

- **Predictable state**: Every state transition is a pure function. No hidden mutations, no race conditions.
- **Time-travel debugging**: The message log IS the debug history. Replay any sequence.
- **Explicit data flow**: All events — keyboard, mouse, network, timers — funnel through the same update pipeline.
- **Testability**: Pure functions need no mocking or setup. An app that primarily uses React can still use Elm-style for testing.

These benefits apply equally to a terminal TUI, a web SPA, a collaboration server, or a background processor. The Elm runtime is not tied to any UI paradigm.

### docily: App Foundation

docily is more than a "document editor" — it's the **foundation for rich interactive applications**. Any app with a tree of editable items, a command palette, keybindings, and undo/redo can build on docily.

**What docily provides:**

- **Document model**: ID-based tree with typed nodes, lazy loading, dual paths (id + name)
- **Command system**: Registry, keybindings, chord state, command palette
- **Plugin composition**: `withCommands()`, `withScroll()`, `withHistory()` — composable behaviors
- **Undo/redo**: Operations-based, invertible, CRDT-compatible
- **Tree operations**: move, indent, outdent, fold, delete, reparent
- **Schema validation** (optional plugin): Rules for valid parent/child relationships. Not baked into core — apps opt in. Especially valuable for collaborative editing where remote ops could create inconsistent structures.
- **Cross-block navigation**: Tree-aware cursor movement across nodes
- **Selection model**: Single node, multi-node, range — all ID-based

#### Document Model — ID-Based, Lazy-Loaded, Dual Paths

```typescript
interface DocNode {
  id: string
  parentId: string | null
  parentIdx: number              // sort order
  name?: string                  // human-readable slug (for file paths)
  type: NodeType                 // oi, li, h, p, code, quote, hr, etc.
  content: string                // text content (may include inline markdown)
  data?: Record<string, unknown> // extensible metadata (dates, tags, status)
}

// PATH DUALITY: Nodes are addressable by both id and name:
//   - ID path:   "abc123"          → stable, CRDT-safe, used by editor internals
//   - Name path: "projects/km/tui" → human-readable, used by filesystem, URLs, CLI
// The DocumentStore resolves both. ID paths never change (insert-safe).
// Name paths may change on rename but are human-friendly for display/linking.

interface DocumentStore {
  // Queries (lazy — only fetch what's needed)
  getNode(id: string): DocNode | null
  getChildren(parentId: string | null): DocNode[]
  getChildCount(parentId: string | null): number
  getAncestors(id: string): DocNode[]
  search(query: string): DocNode[]

  // Mutations (atomic, undoable)
  updateNode(id: string, changes: Partial<DocNode>): void
  insertNode(parentId: string | null, node: DocNode, atIndex: number): void
  moveNode(id: string, toParentId: string, toIndex: number): void
  deleteNode(id: string): void

  // Subscription (for reactive rendering)
  subscribe(listener: () => void): Disposable
  getVersion(): number
}
```

**Platform storage implementations:**

| Platform | Implementation | Backing store |
|----------|---------------|---------------|
| Terminal | Adapter over `Repo` (existing) | SQLite + markdown files |
| Browser | IndexedDB wrapper | IndexedDB / OPFS |
| Native | Platform wrapper | CloudKit / Room / Core Data |
| Collaborative | CRDT adapter | Automerge / Yjs |

#### Cursor & Selection

```typescript
interface DocCursor {
  nodeId: string         // which tree node
  blockIndex: number     // 0=title, 1+=body blocks
  offset: number         // character offset within block text
}

interface DocSelection {
  anchor: DocCursor
  focus: DocCursor
  mode: "text" | "node" | "block"
  selectedNodeIds: Set<string>
}
```

**ID-based paths**: Slate uses `[0, 2, 1]` (fragile — changes on insert). We use `nodeId` (stable). This makes collaboration trivial — remote operations don't invalidate local cursors.

#### Undo/Redo — Operations All The Way Down

**No snapshots.** The document model can represent an entire drive — millions of nodes, gigabytes of content. Snapshots don't scale. Instead: **operations at every level**, designed for CRDT compatibility from day one.

**Design principle**: Every mutation produces an invertible operation. Undo = apply the inverse. This works at any scale because operations are proportional to the *change*, not the *document size*.

```typescript
type DocOperation =
  // Text operations (within a single node's content)
  | { type: "text.insert"; nodeId: string; offset: number; text: string }
  | { type: "text.delete"; nodeId: string; offset: number; text: string }
  | { type: "text.replace"; nodeId: string; offset: number; deleteCount: number; oldText: string; newText: string }
  // Structural operations (tree shape)
  | { type: "node.insert"; node: DocNode; parentId: string; atIndex: number }
  | { type: "node.delete"; node: DocNode; parentId: string; atIndex: number }
  | { type: "node.move"; id: string; from: { parentId: string; idx: number }; to: { parentId: string; idx: number } }
  | { type: "node.update"; id: string; field: string; before: unknown; after: unknown }
  // Selection operations (cursor state — not persisted, but part of undo)
  | { type: "select"; before: DocCursor; after: DocCursor }

function invertOp(op: DocOperation): DocOperation  // text.insert ↔ text.delete, etc.

interface UndoManager {
  record(op: DocOperation | DocOperation[]): void
  undo(): boolean
  redo(): boolean
  batch(fn: () => void): void     // group operations
  merge(op: DocOperation): boolean // merge consecutive typing into one undo step
}
```

**Undo grouping**: Consecutive `text.insert` operations merge into a single undo step (time-based: >500ms gap or non-text command breaks the group). Structural operations are always separate undo steps. `batch()` groups multiple operations.

**CRDT integration**: The operations map cleanly to **Yjs or Automerge** — we use an existing CRDT library rather than building our own:
- `text.insert/delete` → Yjs Y.Text or Automerge.Text operations
- `node.insert/delete/move` → tree CRDT operations (Automerge nested maps)
- `node.update` → field-level CRDT merge

CRDT is **easy but not required**. The DocumentStore interface has a CRDT-backed implementation as one option alongside SQLite, IndexedDB, etc. Apps that don't need collaboration never import the CRDT adapter.

**Important**: The ops as defined above lack the unique identifiers and timestamps needed for multi-user conflict resolution. The CRDT library (Yjs/Automerge) provides those — our ops translate to CRDT ops at the adapter boundary, not the other way around. See [Velt's analysis](https://velt.dev/blog/implementing-crdts-why-developers-give-up-real-time-editing) for why rolling your own is inadvisable.

**Scale**: For a drive with 1M nodes, undo only stores the operations performed this session. Old operations can be compacted/pruned — the document store is the source of truth.

#### Cross-Block & Cross-Node Navigation

```typescript
class DocumentEditor {
  cursor: DocCursor
  selection: DocSelection
  store: DocumentStore
  private activeEditContext: EditContextLike | null

  // Cursor movement
  moveUp(): void {
    if (this.activeEditContext?.atBoundary?.("up") !== false) {
      this.activeEditContext?.save()
      this.moveToPreviousBlock()
    }
  }
  moveDown(): void { /* symmetric */ }
  moveLeft(): void { /* within text, or to previous block at offset 0 */ }
  moveRight(): void { /* within text, or to next block at end */ }

  // Structural operations
  indent(nodeIds: string[]): void
  outdent(nodeIds: string[]): void
  moveNodes(nodeIds: string[], direction: "up" | "down"): void
  deleteNodes(nodeIds: string[]): void
  duplicateNodes(nodeIds: string[]): void
  foldNode(nodeId: string): void
  unfoldNode(nodeId: string): void

  // Text block operations (delegate to EditContext)
  enterEditMode(nodeId: string, blockIndex: number, cursorPos: "start" | "end"): void
  exitEditMode(): void
  splitBlock(atOffset: number): void
  mergeBlock(direction: "backward"): void
}
```

### textily: Rich Text Model

textily handles everything about text within a single block — cursor position, selection, visual line wrapping, formatting. It has **zero dependencies** and is completely standalone.

**What textily provides:**

- **Cursor math**: offset ↔ row/col conversion, visual line awareness
- **Selection**: single cursor, range selection, word/line selection
- **Wrap-aware navigation**: up/down moves between visual lines, not logical lines
- **Sticky X**: cursor remembers horizontal position across vertical moves
- **Text operations**: insert, delete, replace — all invertible
- **EditContext interface**: `EditContextLike` — the contract that platform-specific implementations fulfill

**EditContext bridge:**

```typescript
// textily defines the interface and the terminal implementation:
const ctx = new TerminalEditContext({ text, selectionStart: 0, selectionEnd: 0 })

// Platform-specific implementations live outside textily core:
// - BrowserEditContext (wraps W3C EditContext — Chrome/Edge)
// - SlateEditContextAdapter (Firefox/Safari fallback via contentEditable)
// These are provided by the platform shell, not by textily itself.

// Factory lives in the app layer — picks the right implementation:
function createEditContext(options: EditContextInit): EditContextLike {
  if (typeof window !== "undefined" && "EditContext" in window) {
    return new BrowserEditContext(options)       // Chrome/Edge native
  }
  if (typeof window !== "undefined") {
    return new SlateEditContextAdapter(options)  // Firefox/Safari fallback
  }
  return new TerminalEditContext(options)         // Terminal
}
```

**Boundary**: textily knows about text, cursor, selection, visual lines. It does NOT know about documents, trees, nodes, or navigation between blocks. That's docily's job.

### termily: Terminal Rendering

termily is the complete terminal platform — everything needed to render a React component tree to a terminal. It's what inkx becomes after the portable parts (runtime, commands, plugins) move to runly and docily.

Components follow the React Native pattern — platform-specific primitives with a familiar API:

```typescript
import { Box, Text, ScrollView, StyleSheet } from "termily"

const styles = StyleSheet.create({
  container: { flexDirection: "row", padding: 1 },
  title: { bold: true, color: "cyan" },
})

function Card({ title, children }) {
  return (
    <Box style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </Box>
  )
}
```

termily is to the terminal what `react-dom` is to the browser — a host renderer with platform-specific components (Box, Text, VirtualList, ScrollView, TextArea), plus everything the terminal needs: cell buffer, ANSI diff, dirty tracking, stdin parser, terminal detection, scroll tiers, and sticky children.

### flexily: Standalone Flexbox

flexily is a pure JavaScript flexbox layout engine. It already exists as beorn-flexx. Independent of all other packages — useful anywhere you need flexbox math without a browser.

- Zero-allocation layout algorithm
- W3C Flexbox spec compliance
- Used by termily for terminal layout
- Not needed on web (CSS handles it) or native (platform layout engines)

---

## View Layer (km-app)

Views live in the shared app layer. They define **what** to render (structure, state, logic) using abstract primitives; platform shells provide the concrete rendering.

| View | What it shows | How it maps to the document tree |
|------|--------------|----------------------------------|
| **Board** | Kanban columns + cards | L1 children = columns, L2 children = cards |
| **Outline** | Indented tree | Direct tree rendering with depth |
| **List** | Flat list + detail pane | Filtered/sorted flat view of subtree |
| **Calendar** | Time-based layout | Nodes with date fields |
| **Table** | Spreadsheet grid | Nodes as rows, metadata fields as columns |

**Views share the same docily DocumentEditor instance.** Switching views changes rendering, not state. Cursor, selection, and undo history persist across view switches.

---

## Dependency Graph

```
km-tui ──→ km-app ──→ docily ──→ runly
  │           │
  │           ├──→ textily (zero deps)
  │           │
  └──→ termily ──→ flexily
           │
           └──→ runly

km-web ──→ km-app ──→ (same as above)
  │
  └──→ react-dom + CSS

km-storage ──→ docily (implements DocumentStore)
```

**Key constraints:**
- **km-app** is the shared application layer — views, components, state, hooks. Both shells depend on it.
- textily has **zero dependencies** — standalone, usable anywhere
- docily depends on runly but NOT on termily — platform-agnostic
- termily depends on runly and flexily but NOT on docily — rendering is independent of editing
- The thin shells (km-tui, km-web) wire km-app to their platform renderer

**The rule**: If another app could use it, it goes in a named package. If it's km-specific, it stays in `km-*`.

---

## Prior Art & Alternatives

### Editing Frameworks

| System | Model | Platform | EditContext | Lazy loading | CRDT-native |
|--------|-------|----------|------------|--------------|-------------|
| **ProseMirror** | Schema-based, children[] | Browser only | No (contentEditable) | No | Via Yjs plugin |
| **Slate.js** | Children[], index paths | Browser only | No (contentEditable) | No | Via Yjs plugin |
| **Lexical** | Children[], keys | Browser only | No (contentEditable) | No | Partial |
| **CodeMirror** | Line-based | Browser only | Experimental | No | Via Yjs plugin |
| **Notion** | ID-based blocks | Browser only (Electron) | No | Yes (API-loaded) | Custom OT |
| **Obsidian** | File-based | Browser (Electron) | No | Partial | No |
| **Automerge** | CRDT document | Any | No | No | **Yes** |
| **Ours** | **ID-based, parentId/idx** | **Terminal + Browser + Native** | **Yes (aligned)** | **Yes (DocumentStore)** | **Yes (via Yjs/Automerge)** |

The unique combination: ID-based model (like Notion's blocks) + EditContext alignment (like the W3C standard) + truly platform agnostic (terminal AND creative-tools-level web) + lazy loading + CRDT via Yjs/Automerge. No existing editing framework targets both a terminal TUI and a rich web app.

For detailed comparisons of browser-only editors, see [Lexical vs Slate vs ProseMirror: Architecture](https://jkrsp.com/blog/lexical-vs-slate-vs-prosemirror-architecture/).

### Platform Strategies

| Approach | Examples | How it works |
|----------|----------|--------------|
| **Shared rendering engine** | Flutter, Qt | Custom rendering engine draws identical pixels everywhere |
| **Bridge to native views** | React Native, KMP | Shared logic, native UI widgets via bridge |
| **Web in a shell** | Electron, Tauri | Web app running in native browser shell |
| **Terminal emulation** | SSH, tmux, xterm.js | Terminal app embedded in browser/native |
| **Ours: shared core + native adapters** | — | Pure TS editor core + shared app layer, platform-specific rendering |

**Why not React Native?** No terminal support; text editing is RN's weakest point; RN is rendering-centric while we share editing logic; RN assumes eager loading; RN is heavy (Metro, bridge, Hermes).

**Why not Electron/Tauri?** No terminal; Electron ships a 300MB browser; still uses contentEditable.

### The Trade-Off

**React Native/Flutter**: Ship to many platforms quickly with acceptable quality. Great for UI-centric apps.

**Our approach**: Build a rich TUI app and a rich web app on the same editing engine. Terminal-first because it proves the engine works under the tightest constraints, then web at creative-tools polish level. We're building ProseMirror-for-any-platform, not Instagram-for-any-platform.

### Pros & Cons

| Advantage | Why |
|-----------|-----|
| **Terminal-first** | No alternative supports terminal as first-class. Flutter/RN/Electron can't render to ANSI. |
| **Truly native per platform** | Each platform uses its actual UI system. No uncanny valley. |
| **Maximal code sharing** | Views, components, state, and hooks are shared across platforms. Only rendering primitives differ. |
| **Lightweight core** | docily + textily are pure TS with zero heavy deps. No Chromium (300MB), no Skia (30MB). |
| **Text editing done right** | EditContext alignment means native input system per platform. |
| **CRDT-native** | Operations-based model means collaboration is built in, not bolted on. |
| **Lazy loading at core** | ID + parentId model with lazy DocumentStore. Handles drive-scale. |
| **Incremental adoption** | Each package independently useful. Mix and match. |
| **Pure-functional testing** | Elm-style runtime enables deterministic replay and time-travel debugging — opt in where it helps. |

| Disadvantage | Mitigation |
|--------------|------------|
| **N adapters to build** | Start with terminal (done) + browser (Phase C). Only native when demanded. |
| **Component abstraction layer** | React Native solved this; follow their patterns. Start with a small primitive set. |
| **More upfront work** | Clean interfaces pay for themselves in testability and flexibility. Extraction, not creation. |
| **Rendering inconsistency** | Feature, not bug — each platform looks native. Requires per-platform testing. |

---

## Roadmap

### Phase A — Terminal (current state)
- inkx + custom text editing + SQLite + Board/Outline/List views
- This is km today, progressively refactored
- Operations-based undo via event log

### Phase B — Extract packages
1. **textily**: Extract `text-cursor.ts` from inkx. Implement `TerminalEditContext`, `TextOp` with `invertOp()`, `useEditContext()` hook. Refactor TextArea to use EditContext internally. Tests: 50+ covering EditContext methods + events + text operations.
2. **runly**: Extract Elm runtime (init/update/view), AsyncIterable event streams, run modes. Extract React reconciler abstraction (renderer-agnostic parts). Tests: Elm cycle, event streams, run modes.
3. **docily**: Extract command system from km-commands. Define `DocNode`, `DocumentStore`, `DocCursor`, `DocSelection` interfaces. Implement `DocOperation` types with invertibility, `UndoManager`, `DocumentEditor`. Extract plugin composition. Adapter: `DocumentStore` over existing km `Repo`. Tests: Full CRUD + undo/redo + cross-block navigation + commands, all without rendering.
4. **termily**: Everything remaining in inkx — cell buffer, ANSI diff, dirty tracking, stdin parser, terminal detection. Components: Box, Text, VirtualList, ScrollView. flexily integration. Tests: Existing inkx rendering tests.
5. **flexily**: Rename beorn-flexx (already standalone).
6. **km-app**: Extract shared view logic, components, state management, and hooks from km-tui into a platform-agnostic app layer. Define abstract component primitives. Wire km-tui as a thin shell importing km-app + termily.
- **CRDT-ready from day one**: DocOperations as invertible ops mapping to Automerge/Yjs
- Tests: Existing km-tui tests pass with new engine

### Phase C — Web App
- km-web shell: React DOM rendering using km-app + react-dom
- Web-specific EditContext implementations (BrowserEditContext, SlateEditContextAdapter)
- IndexedDB storage via DocumentStore adapter
- Mouse/touch input, accessibility (ARIA), focus management
- Target: creative-tools-level polish — smooth interactions, rich visual design, mouse+keyboard

### Phase D — Collaboration (enabled by ops model)
- CRDT-backed DocumentStore (Automerge/Yjs)
- DocOperations translate directly to CRDT operations
- ID-based cursors survive concurrent edits
- Subtree-scoped sync
- Real-time multiplayer editing

### Phase E — Terminal in Browser
- termily rendering to xterm.js canvas (not stdout)
- Terminal version runs in browser with zero app code changes
- Useful for web-based terminal access, demos, embedding

### Phase F — Native
- SwiftUI (macOS/iOS) + Jetpack Compose (Android)
- Same km-app + docily + textily, native rendering and input
- Platform storage (CloudKit, Room)

---

## Scale Considerations

### Data scale — 100K+ nodes, GB+ of content

- **No full-document snapshots**: Operations-only undo
- **No eager loading**: DocumentStore queries always lazy
- **No in-memory tree**: Always query by `parentId`, no materialized `children[]`
- **Streaming operations**: Append-only log, old operations pruned
- **Content-addressable storage**: Large content stored by hash
- **Partial sync**: CRDT sync is subtree-scoped

### Visual scale — rich web app with many elements

- **Virtual rendering**: Only render visible nodes (terminal: screen rows; web: viewport intersection)
- **DOM budget**: Thousands of nodes visible simultaneously in board/outline views — need efficient reconciliation
- **Animation performance**: CSS transitions and Web Animations API for card reordering, view switches — must not block the main thread
- **Drag interactions**: Real-time pointer tracking during drag-and-drop at 60fps

---

## Risks

Extracting packages from an ~80K-line monolith and building a shared app layer has specific risks:

- **Component abstraction**: km-app needs abstract primitives (Box, Text, ScrollView) that both termily and react-dom implement. Getting this API right is critical — too thin and apps can't express platform-specific behaviors; too thick and it becomes a lowest-common-denominator framework. Mitigation: start with the React Native primitive set, which is battle-tested. Extend incrementally.

- **Hidden coupling**: Monolith code may have cross-boundary shortcuts — a terminal component directly mutating document state, or a command that assumes terminal-specific rendering. These only surface when you try to import docily without termily. Mitigation: enforce import rules via lint (e.g., docily cannot import from termily).

- **Undo breakage**: Any mutation path that bypasses the operation log will silently break undo/redo. If something directly sets `node.content = "..."` instead of going through `DocumentStore.updateNode()`, it won't be recorded. Mitigation: make DocumentStore the only way to mutate — freeze node objects, use TypeScript readonly.

- **Performance regression**: New abstraction layers add indirection. If a hot path previously inlined a function and now crosses a package boundary, V8 may not optimize it the same way. Mitigation: benchmark before and after extraction, especially for typing latency and scroll performance.

- **Integration points**: Features that cross boundaries are easy to miss. Cursor rendering, scroll sync, focus management, clipboard — these all involve coordination between editing and rendering. Mitigation: list all user-facing features and trace their data flow through the new architecture before splitting.

- **Extract incrementally**: textily first (lowest risk, self-contained, zero deps), then runly, then docily, then termily, then km-app. Test at each step.

---

## Open Questions

1. **Component abstraction strategy**: How do km-app components reference rendering primitives across platforms? Abstract primitives (React Native model)? Dependency injection? Headless components with platform skins? This is the most consequential design decision for the shared app layer.
2. **runly ↔ React DOM integration**: Does runly drive rendering (`ReactDOM.render` on each view cycle) or does React drive rendering (subscribing to runly state via hooks)? Needs prototyping.
3. **Focus abstraction**: termily needs a focus system (focusable elements, tab order, focus/blur) equivalent to the browser's DOM focus model, so km-app can use a unified API. What does that API look like?
4. **EditContext granularity**: One per block (current model) or one per visible region?
5. **Inline formatting**: Where do marks (bold, italic) live — document model, EditContext extension, or separate? Current: inline markdown. Future: structured marks?
6. **Extension model**: How do plugins extend across platforms? Scroll plugins may differ between terminal (manual) and web (native scrollbars).
7. **Operation compaction**: How aggressively to compact the operation log?
8. **Conflict resolution UI**: When CRDT operations conflict, auto-merge vs manual?
9. **runly abstraction boundary**: How much of the React reconciler is shared vs platform-specific? The fiber tree is universal but the host config is per-platform.
10. **docily vs km-commands**: How much of the existing command system is reusable vs km-specific? Keybindings are reusable, but command implementations may reference km types.
11. **Schema validation scope**: Minimal (parent/child type rules) or rich (ProseMirror-style content expressions)? Plugin or core?
12. **Package naming finality**: runly/docily/textily/termily/flexily are tentative — all available on npm. Final decision tracked in `km-infra.vendor-rename`.

---

## References

- [Lexical vs Slate vs ProseMirror: Architecture](https://jkrsp.com/blog/lexical-vs-slate-vs-prosemirror-architecture/) — detailed comparison of browser-only editor architectures, plugin systems, and React integration
- [Lexical design discussion (Hacker News)](https://news.ycombinator.com/item?id=31018746) — DOM reconciliation, selection management, accessibility
- [Why developers give up on CRDT (Velt)](https://velt.dev/blog/implementing-crdts-why-developers-give-up-real-time-editing) — tombstone bloat, sequence identifiers, cursor syncing
- [The Elm Architecture: strengths and pitfalls](https://gist.github.com/chexxor/23ccf35add7dbdd33ecdd26888663140) — pure update/view benefits and DOM input issues
- [W3C EditContext API](https://developer.mozilla.org/en-US/docs/Web/API/EditContext) — custom text editing surfaces without contentEditable
- [Ink: React for CLI](https://github.com/vadimdemedes/ink) — React-style components and flex layout in terminals (termily's spiritual ancestor)

---

## Appendix: Current State & Extraction

km-specific details for the package extraction. These reference the current codebase and will be outdated once the extraction is complete.

### What's Portable in inkx

Analysis of the current inkx codebase reveals a **60/40 split** between portable and terminal-specific code:

**Portable (~60%) → runly + docily:**

| Module | What it does | Destination |
|--------|-------------|-------------|
| Elm runtime | Functional reactive: init/update/view cycle | runly |
| React reconciler | Fiber-based custom renderer | runly (abstract) or termily |
| Command system | Registry, keybindings, executor, chord state | docily |
| Plugin composition | withCommands, withScroll, withHistory | docily |
| Event streams | AsyncIterable event processing | runly |
| Unicode handling | grapheme segmentation, East Asian width | textily or shared util |
| Virtual scroll | Viewport-aware lazy rendering | docily (logic) + termily (impl) |

**Terminal-specific (~40%) → termily:**

| Module | What it does | Why not portable |
|--------|-------------|-----------------|
| Cell buffer | 2D grid of styled characters | Terminal concept — browsers use DOM |
| ANSI diff | Compute minimal escape sequences | Terminal output format |
| Dirty flag system | Track which cells changed | Terminal optimization |
| Stdin parser | Raw mode + ANSI sequence parsing | Terminal input format |
| Terminal detection | Capabilities, color depth, size | Terminal-specific queries |
| Scroll tiers | Container-aware scroll regions | Terminal rendering strategy |
| Sticky children | Position:sticky for cell buffers | Terminal layout extension |

**Key insight**: The cell buffer, diff algorithm, and dirty tracking are terminal-specific, not core. On web, the browser handles layout, painting, and diffing. The core is the component model + event system + command dispatch + virtual scroll logic.

### Extraction Candidates

| Component | Location | Lines | Destination |
|-----------|----------|-------|-------------|
| `text-cursor.ts` | `vendor/beorn-inkx/src/text-cursor.ts` | 196 | textily (pure functions) |
| `TextArea` | `vendor/beorn-inkx/src/components/TextArea.tsx` | 412 | textily + termily |
| Elm runtime | `vendor/beorn-inkx/src/runtime/` | ~1500 | runly |
| React reconciler | `vendor/beorn-inkx/src/reconciler/` | ~2000 | termily |
| Cell buffer + diff | `vendor/beorn-inkx/src/output/` | ~1200 | termily |
| Command system | `packages/km-commands/src/` | ~22K | docily |
| `KNode` | `packages/km-core/src/types.ts` | 474 | docily (11 node types, ID+parentId) |
| `Repo` | `packages/km-storage/src/` | 40+ files | km-storage (DocumentStore adapter) |
| `board-actions.ts` | `apps/km-tui/src/board/board-actions.ts` | 1,380 | docily (111-case dispatch) |
| Board actions (edit) | `apps/km-tui/src/board/board-actions-edit.ts` | 580 | docily |
| Board actions (nav) | `apps/km-tui/src/board/board-actions-nav.ts` | 285 | docily |
| Board actions (selection) | `apps/km-tui/src/board/board-actions-selection.ts` | 142 | docily |
| Board actions (zoom) | `apps/km-tui/src/board/board-actions-zoom.ts` | 325 | docily |
| Flexx layout | `vendor/beorn-flexx/` | ~3000 | flexily (standalone) |

**Key finding**: No Slate.js dependency. Text editing is entirely custom via the command-dispatch pattern and `blockEditTargetRef`. No Slate to remove.

### What This Replaces

| Current | Future | Why better |
|---------|--------|-----------|
| Custom text editing (blockEditTargetRef) | textily EditContext + factory | W3C-aligned, swappable implementations |
| `KNode.children[]` arrays (in-memory tree) | docily ID + `parentId/parentIdx` queries | Lazy loading, CRDT-friendly, matches storage |
| `board-actions.ts` (1,380-line switch) | docily DocumentEditor | Pure logic, testable without rendering |
| inkx monolith (runtime + rendering + commands) | runly + termily + docily | Clean separation, web-portable |
| inkx-only rendering | termily (terminal) or react-dom (web) | Same editing engine, native rendering per platform |
| Custom `wrapSegment` etc. | textily text-cursor (done!) | Standalone, tested, reusable |
| Eager tree loading | docily DocumentStore lazy queries | Handles 100K+ node vaults |
