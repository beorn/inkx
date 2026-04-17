# Silvery Architecture

Engineering reference for the silvery engine stack. For the broader vision and composable architecture direction, see [exploration.md](../../vision/exploration.md).

See also: [packages.md](../../vision/packages.md) | [roadmap.md](../../vision/roadmap.md)

## The Full Stack

```
                    Framework Bindings
            ┌───────────┬───────────┬──────────┐
            │   React   │  Svelte   │  Solid   │  ... (reconciler-specific host configs)
            └───────────┴───────────┴──────────┘
                  │           │          │
                  ▼           ▼          ▼
            ┌─────────────────────────────────┐
            │          AgNode Tree            │  Lightweight host tree (not DOM)
            │   (structure, props, children)  │  Framework-agnostic
            └─────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌──────────────┐ ┌────────────┐ ┌────────────┐
     │   Flexily    │ │  Pretext   │ │ silvery-tea│
     │  (layout)    │ │  (text)    │ │  (state)   │
     └──────┬───────┘ └──────┬─────┘ └─────┬──────┘
            │                │              │
            ▼                ▼              ▼
     ┌─────────────── Layout Tree ────────────────┐
     │  AgNode + computed position + text metrics │
     └────────────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   ┌─────────────┐ ┌──────────┐ ┌──────────────┐
   │ Display List│ │Semantics │ │ Interaction  │
   │ (visual)    │ │  Tree    │ │    Index     │
   │             │ │(a11y,    │ │(hit-test,    │
   │ fillRect    │ │ roles,   │ │ focus order, │
   │ drawText    │ │ labels,  │ │ pointer,     │
   │ clip        │ │ values)  │ │ selection)   │
   └──────┬──────┘ └─────┬────┘ └──────┬───────┘
          │              │             │
    ┌─────┼────┐    ┌────┘       ┌─────┘
    ▼     ▼    ▼    ▼            ▼
  Term  Canvas SVG  DOM        Input
  ANSI  2D     PDF  mirror     system
```

### Three Projections

The laid-out tree produces three outputs, not one. This is the architecture of every custom-rendered application — from Google Docs to Figma to Flutter to xterm.js. The display list alone is insufficient because:

- **Screen readers** can't derive roles/labels from draw ops
- **Hit-testing** depends on clipping, z-order, and pointer-events policy — adjacent to paint but not equivalent
- **Focus order** follows logical structure, not paint order
- **Selection geometry** needs text metrics the display list doesn't retain

The three projections are consumed by different subsystems:

| Projection        | Consumers                                                    | What it carries                                                  |
| ----------------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| Display list      | Surface adapters (terminal, canvas, SVG, PDF, image, remote) | Draw ops: fillRect, drawText, clip, transform, opacity           |
| Semantics tree    | DOM mirror, screen readers, test automation                  | Roles, labels, values, states, relationships, focus order        |
| Interaction index | Input system, pointer routing, focus manager                 | Hit regions, pointer capture, scroll containers, selection rects |

## The Pieces

### Framework Bindings (top)

The reconciler-specific layer. Translates framework updates into AgNode tree mutations.

- **React** (Shipping): host config via react-reconciler. Hooks, concurrent features, ecosystem.
- **Svelte/Solid/Vue** (Future): same AgNode mutations, different reactive model. The engine below doesn't import any framework.

React is the first and best binding. Multi-framework is architecture hygiene — the engine is reconciler-agnostic by design, not by accident.

### AgNode Tree

The host tree. Lightweight node objects with props, children, parent references. Not DOM — no attributes, no events, no style cascade. Just structure that the engine operates on.

Owned by the framework binding (React reconciler creates/updates/removes nodes). Consumed by everything below.

> **Direction:** The target architecture collapses AgNode into a composition layer on Flexily's tree (`withAg()` plugin — one tree, no dual tree). See [exploration.md](../../vision/exploration.md) for the composable `pipe(createFlexily(), withFlexbox(), withPretext(), withAg())` pattern and incremental refactoring plan.

### Flexily (layout) — Shipping

Pure JS flexbox engine. Yoga-compatible API, 2.5x faster, no WASM.

- Computes position + size for every node
- Intrinsic sizing via MeasureFunc callback (text nodes)
- Scroll containers, overflow, min/max constraints
- Provides computed bounds for hit-testing and DOM mirror positioning

Flexily doesn't know about text content — it asks MeasureFunc "how big?" and gets dimensions back. This is the seam where Pretext plugs in.

### Pretext (text measurement) — v0.5 / v2.0

Pure JS text measurement by Cheng Lou. Plugged into Flexily via the composable `withPretext()` plugin (v0.5) — `node.setTextContent("text", { font })` and Flexily handles measurement automatically.

**v1.0 terminal uses monospace text measurement** (character grid, not Pretext). **v0.5** makes Pretext a composable flexily plugin. **v2.0** uses Pretext for proportional text on canvas via TextLayoutService. See [pretext-integration.md](../v05-layout/pretext-integration.md) for the full API.

### silvery-tea (state) — Internal (v1.5)

Signals/commands/effects state management. Pure `(state, op) → [state, effects]`. Used internally by km; design still settling. Ships publicly at v1.5. Independent of the rendering engine — works with ag, react-dom, or anything.

- **Signals**: fine-grained reactive values for per-frame visual state (drag position, scroll offset, animation values, hover, selection). Bypass React reconciliation for 60fps.
- **Commands**: serializable user intents with keybindings.
- **Effects**: serializable side effects dispatched by state transitions.
- **Stores**: zustand-based state containers with TEA-shaped update functions.

The framework (React) owns structural state (what exists). Signals own ephemeral visual state (how it looks right now). This is the tldraw/signia insight: fine-grained reactivity for hot paths, framework reconciliation for structural changes.

silvery-tea's state machines (commands, signals, scope) and interaction primitives are designed to work independently of the rendering engine. They can be used with react-dom, ag-canvas, ag-term, or any other rendering approach. No dependency on AgNode or Flexily.

See [signals.md](./signals.md) and [commands.md](./commands.md) for the signals/commands architecture.

### docily (editing) — Future

Platform-agnostic document editing engine. Builds ON TOP of the rendering stack, not inside it.

- **Document model**: ID-based tree (nodes reference parents by ID — stable under concurrent edits)
- **Operations**: serializable data (`TreeOp`, `PlainTextOp`) — insert, split, merge, move
- **Command system**: keyboard/mouse/touch/programmatic — decoupled from rendering
- **Undo/redo**: operation-based, not snapshot-based. CRDT-ready.
- **Plugin composition**: wrap `.apply()` — `compose(withHistory, withVim)(Machine.apply)`

docily doesn't know about rendering. It produces operations that mutate the document model. The platform shell (terminal or canvas or web) renders the result.

### textily (rich text) — Future

Rich text model with zero dependencies. The lowest-level text editing primitive.

- Cursor: position, selection range, anchor/focus
- Text operations: insert, delete, format (bold, italic, link)
- Wrap-aware navigation: move by grapheme, word, line (uses TextLayoutService geometry)
- Selection: expand by word/line/paragraph, shift+arrow
- IME: composition range tracking

textily is to text editing what Pretext is to text measurement — pure logic, no platform dependencies. Pretext measures where text goes; textily tracks what the user is doing with it.

### Display List (visual projection) — Planned

Target-neutral draw ops. Flat, serializable, no traversal API. The AgNode tree + Flexily bounds own the spatial model; the display list is a one-way projection. See [rendering-targets.md](../v20-canvas/rendering-targets.md) for the canonical `DisplayOp` type, metadata side tables, and per-adapter consumption.

### Semantics Tree (semantic projection) — Future

Parallel tree of semantic nodes consumed by the DOM mirror, screen readers, and test automation. NOT a 1:1 mirror of the AgNode tree — decorative nodes are omitted, logical structure may differ from visual z-order.

```typescript
interface SemanticsNode {
  id: string
  role?: string // button, textbox, listbox, heading, ...
  label?: string
  value?: string
  description?: string
  bounds: Rect
  hidden?: boolean
  disabled?: boolean
  focusable?: boolean
  focused?: boolean
  selected?: boolean
  expanded?: boolean
  checked?: boolean | "mixed"
  controls?: string[] // IDs of controlled elements
  labelledBy?: string[] // IDs providing label
  describedBy?: string[] // IDs providing description
  textInput?: {
    // present for text editing nodes
    multiline?: boolean
    readOnly?: boolean
    selectionStart?: number
    selectionEnd?: number
  }
  children: readonly SemanticsNode[]
}
```

One semantic source of truth consumed by DOM mirror, tests, and screen readers. NOT a 1:1 mirror of the AgNode tree -- decorative nodes are omitted, logical structure may differ from visual z-order. Composite widgets (listbox, treegrid, menu) need special handling; naive mirroring breaks for virtualized collections.

This is how every custom-rendered application handles accessibility -- from Google Docs (canvas + semantic layer) to Flutter (widget tree + semantics tree) to PDF.js (canvas + text layer + annotation layer). See [rendering-targets.md](../v20-canvas/rendering-targets.md) for prior art and production examples.

### Interaction Index (input projection) — Future

Spatial index for pointer routing, focus management, and selection geometry. Adjacent to the display list (uses the same computed bounds) but not equivalent — focus order follows logical structure, not paint z-order. Hit-testing respects clipping, transforms, and pointer-events policy.

Contract TBD — needs: hit-test records, coordinate spaces, clip/transform handling, pointer capture model, focus traversal, keyboard target resolution, scroll-container ownership, text selection routing, event propagation order.

#### Why Own Interaction (not just rendering)

Browser built-in interaction is broken in ways that matter for real apps:

**Drag & drop.** Browser `draggable`/`dragover`/`drop` events behave differently across browsers. The drag image is browser-controlled and inconsistent. Drop zones flicker because `dragenter`/`dragleave` fire on child elements. Mobile has completely different touch-based drag with no standard drag events. `contentEditable` + drag corrupts undo state. Cross-browser testing is endless. Every serious interactive app (Figma, tldraw, Google Docs) bypasses browser drag entirely and implements pointer-based drag as a state machine: `pointerdown → track → pointermove → hit-test drop targets → pointerup → resolve`.

**Text selection across complex layouts.** Browser selection breaks across CSS columns, nested scroll containers, and absolutely positioned elements. Custom selection painting is needed for multi-cursor collaboration, column-spanning selection, and selection within virtualized lists.

**Scroll physics.** Nested scroll containers, scroll snapping, momentum scrolling, and scroll-linked animations are inconsistent across browsers and often fight each other.

**Focus management in composite widgets.** Browser tab order is flat. Real apps need roving tabindex, arrow-key navigation within composites, focus traps for dialogs, and focus restoration after overlay dismissal.

**Hover/tooltip timing.** Debouncing, enter/leave hysteresis, and multi-target hover are all app-level concerns that browser `:hover` can't express.

Silvery implements these as **surface-agnostic state machines** at the engine level (not in tea). The state machines live alongside the scene graph — the same drag/selection/scroll/focus logic works on canvas, DOM, and terminal. Only the input source differs (DOM PointerEvent vs terminal SGR mouse vs touch events). Tea _consumes_ their output (commands) but doesn't own their implementation. This is the interaction index doing real work: not just accessibility plumbing, but **interaction correctness that browsers don't provide even for DOM apps**.

This is validated by concrete experience: the Decker project (collaborative content creation, react-dom) spent months fighting browser drag & drop across Chrome/Safari/Firefox — it was never bug-free, never cross-platform. Owning the pointer pipeline from raw events would have been less work than working around browser implementations.

#### Prior Art: Interaction Architectures

Research across all major systems that own their interaction layer ($6.77, GPT 5.4 Pro). Full output: `/tmp/llm-fed8de9e-review-all-notable-systemsframeworks-roxz.txt`.

**Four architectural families:**

1. **Fully custom pointer state machines** (tldraw, Figma, Flutter, Monaco) -- own everything, browser/platform is event transport
2. **Hybrid model-driven DOM editors** (ProseMirror, Lexical, CodeMirror 6, Slate) -- own model+selection, use contentEditable as transport
3. **Hidden-input full-control editors** (Monaco) -- render own text/selection/cursors, hidden textarea for IME
4. **Sensor/recognizer architectures** (dnd-kit, Flutter GestureArena) -- abstract input into competing recognizers

**Six patterns that repeatedly work well:**

1. **Separate persistent model state from transient interaction state.** Persistent: shapes, document, selection, viewport. Transient: drag start point, active pointer, hover target, current tool substate.
2. **Normalize input first.** One pipeline for pointer, wheel, keyboard, modifiers, composition -- same state machine works on DOM PointerEvent, terminal SGR mouse, and touch.
3. **Explicit state machines for tools/gestures.** Not scattered callbacks. Especially for click-vs-drag, pan-vs-marquee, resize-vs-rotate, nested gestures.
4. **Keep a DOM/native escape hatch for text.** Hidden textarea, contentEditable overlay, native clipboard/IME bridge. Nearly everybody needs this.
5. **Separate geometry from drag logic.** Collision detection, measurement, overlay rendering, auto-scroll are distinct subsystems -- not mixed into component code.
6. **Gesture conflict resolution.** Flutter's GestureArena: competing recognizers negotiate who wins a pointer sequence (parent scroll vs child drag, tap vs pan, scale vs drag).

**Where silvery fits:**

- Interaction index maps to family 1 (tldraw/Flutter) with family 4's sensor pattern
- silvery-tea state machines already align with tldraw's statechart approach
- Flutter's GestureArena is the model for gesture conflict resolution
- Input normalization: same state machine works on DOM PointerEvent, terminal SGR mouse, and touch

**Best-in-class reference table:**

| System           | What it owns                                  | Architecture pattern                          | Main strength                            | Source                      |
| ---------------- | --------------------------------------------- | --------------------------------------------- | ---------------------------------------- | --------------------------- |
| **tldraw**       | drag, selection, hover, pan/zoom, tools       | hierarchical statechart (`StateNode`)         | best open-source editor interaction      | tldraw.dev                  |
| **Flutter**      | gestures, focus, scroll, selection, semantics | recognizers + GestureArena                    | best formal gesture architecture         | docs.flutter.dev            |
| **dnd-kit**      | drag lifecycle, collision, auto-scroll        | sensors + centralized drag store              | best modern React custom DnD             | docs.dndkit.com             |
| **ProseMirror**  | doc model, selection, transactions, clipboard | transactional model + DOM sync + plugins      | most robust rich-text foundation         | prosemirror.net             |
| **Monaco**       | selection, cursor, scroll, focus, viewport    | hidden textarea + custom controller           | most "own everything" editor             | github.com/microsoft/vscode |
| **CodeMirror 6** | state, selection, viewport, mouse, hover      | immutable state + view plugins + DOM observer | best hybrid code editor                  | codemirror.net              |
| **Konva**        | hit-testing, events, drag, hover              | scene-graph event system                      | easy canvas interaction model            | konvajs.org                 |
| **PixiJS**       | pointer events, hit-testing, hover            | federated event system                        | fast low-level base                      | pixijs.com                  |
| **Excalidraw**   | selection, drag, transform, pan/zoom          | state flags + reducers                        | simpler alternative to tldraw statechart | github.com/excalidraw       |

### Rendering Targets (platforms)

Each rendering target consumes the display list differently:

See [rendering-targets.md](../v20-canvas/rendering-targets.md) for the full rendering target matrix (terminal, canvas, DOM, SVG, PDF, image, remote, test) and per-adapter details. The DOM accessibility mirror is NOT a rendering target — it is a semantics consumer.

## How the Layers Compose

### Terminal app (today)

```
React → AgNode → Flexily (cells) + MonospaceMeasurer → TerminalBuffer → ANSI
```

### Canvas app (near-term)

```
React → AgNode → Flexily (pixels) + PretextMeasurer → Layout Tree
                                                         ├── Display List → Canvas2D
                                                         └── Semantics → DOM mirror
```

### Rich editing app (long-term)

```
React → AgNode → Flexily + Pretext → Layout Tree
           ↑                            ├── Display List → Canvas2D
     silvery-tea signals                ├── Semantics → DOM mirror (screen readers, ARIA)
     (drag, scroll, animation)          └── Interaction → Input system (IME, clipboard)
           ↑
     docily + textily
     (document model, cursor, selection, undo)
```

### Cross-framework (long-term)

```
Svelte → AgNode → Flexily + Pretext → Layout Tree → three projections
                  (same engine, different binding)
```

## SurfaceCapabilities

Components should degrade by capability, not by random `if (terminal)` checks. Each rendering target declares what it supports:

```typescript
interface SurfaceCapabilities {
  proportionalText: boolean
  pointer: boolean
  hover: boolean
  accessibilityMirror: boolean
  ime: boolean
  clipboard: boolean
  transforms: boolean
  opacity: boolean
}
```

Terminal degradation is feature-specific, not rhetorical: proportional text -> degraded, transforms -> translation only, opacity -> approximate, hover -> maybe absent, IME -> absent, selection geometry -> simplified. Components query capabilities to adapt their rendering, producing the best output each surface can handle.

## Commit Pipeline

The target commit pipeline (not yet fully implemented):

1. **Mutation** — framework reconciler applies updates to the AgNode tree
2. **Style resolution** — resolve inherited/cascaded styles to concrete values (colors, fonts, spacing)
3. **Text preparation** — TextLayoutService prepares text nodes (segmentation, measurement, caching via Pretext or MonospaceMeasurer)
4. **Flexily layout** — compute position + size for every node, calling MeasureFunc for text intrinsic sizes
5. **Three projections** — generate display list (visual), semantics tree (a11y), interaction index (input) from the laid-out tree
6. **Adapter commit** — rendering target consumes the projections and produces output (ANSI diff, canvas draw calls, DOM updates, etc.)

Today the terminal path shortcuts steps 2, 3, and 5 (no style resolution, monospace arithmetic inline, no explicit display list). The canvas path is partially there. The full pipeline is the target architecture.

## References

- [pretext-integration.md](../v05-layout/pretext-integration.md) — Pretext + Flexily integration details
- [rendering-targets.md](../v20-canvas/rendering-targets.md) — Surface adapter matrix + DOM mirror + prior art
- [signals.md](./signals.md) / [commands.md](./commands.md) — silvery-tea signals/commands architecture
- km docs: [tea.md](../../../../docs/design/tea.md) — TEA principle
- km docs: [universal-editor.md](../../../../docs/future/universal-editor.md) — docily/textily vision
- Beads: km-silvery.engine (vision), km-silvery.engine.text (text subsystem), km-silvery.tea (signals), km-silvery.pro-review-vision
