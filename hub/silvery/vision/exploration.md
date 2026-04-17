# Silvery Exploration

What silvery is, what it could become, and the architectural decisions that shape the path. Exploration from 2026-03-30.

## Horizons

### v0.5 — Flexily + Pretext: "The layout engine your canvas app is missing"

Flexily becomes composable. Pretext integration is a plugin. This is a flexily thing, not a silvery thing.

**Composable flexily:**

```typescript
import { createFlexily } from "flexily" // batteries-included (monospace)

// Most users — just works
const flex = createFlexily()
const node = flex.createNode()
node.setTextContent("Hello world")

// Compose plugins explicitly
import { createBareFlexily, pipe, withPretext, withTestMeasurer } from "flexily"
const flex = pipe(createBareFlexily(), withPretext(pretext))

// Power user — Yoga-compatible manual MeasureFunc always available
node.setMeasureFunc((width, widthMode, height, heightMode) => ({ width: 100, height: 20 }))

// Testing — deterministic measurer
const flex = pipe(createBareFlexily(), withTestMeasurer())
```

**How withPretext works:** wraps `createNode` to return enhanced nodes with `.setTextContent()`. Internally calls pretext's prepare/layout and wires it into flexily's MeasureFunc. The original low-level API is always available.

**Composition plugins (shipped and planned):**

```
SHIPPED (flexily v0.5.0):
withMonospace()         — terminal text measurement (1 char = 1 cell)
withTestMeasurer()      — deterministic widths for CI (Latin 0.8, CJK 1.0, emoji 1.8)
withPretext()           — proportional text measurement via Pretext

PLANNED (not yet implemented — requires richer plugin system):
withFlexbox()           — explicit flexbox opt-in (currently baked in)
withShrinkWrap()        — tightest-width text containers
withIntrinsicSizing()   — explicit min/max-content APIs
withGrid()              — CSS grid layout
withViewport()          — pan/zoom camera container (for ag-draw)
```

The base `createBareFlexily()` provides: node tree, calculateLayout dispatch, `setTextContent`/`getTextContent` mixin. Text measurement plugins swap the `TextLayoutService` on the engine. The default `createFlexily()` is `pipe(createBareFlexily(), withMonospace())` — most users never think about composition.

**Current plugin limitation**: The v0.5 plugin axis is text measurement only. Plugins that add node methods (withShrinkWrap), swap layout algorithms (withFlexbox, withGrid), or hook the scene graph (withAg) need a richer plugin system where plugins can wrap `createNode()` and `calculateLayout()`. This is a v1.5+ concern.

**What ships:** ~230 lines of integration code. Pretext as optional peer dep. Existing flexily API unchanged — this is additive.

**External adoption:** Konva/PixiJS/Two.js/tldraw users `npm install flexily @chenglou/pretext` and get layout + text wrapping in their existing apps. No silvery dependency.

### v1.0 — Terminal UI framework (tealess — shipping, polish)

Polished React UI for modern terminals. Already shipping. No tea — use any React state management.

- 30+ components, themes, focus management, virtualization
- Flexily layout, keyboard interaction, Ink compat
- Terminal uses monospace text measurement (not Pretext — Pretext is for proportional text in v0.5/v2.0)
- Extension: Svelte/Solid/Vue bindings (ag engine is framework-agnostic)
- ag incrementally refactored toward scene-ready shape (bead: km-silvery.ag-scene-ready)

### v1.5 — App architecture (tea)

Portable app architecture layer. Signals, commands, scopes, headless state machines. Independent of ag — works with react-dom or any framework. Design still settling; ships once it's right.

- Signals: fine-grained reactive state (alien-signals wrapper)
- Commands: discoverable, serializable user intents with keybindings
- Scopes: structured concurrency — cancellation, error boundaries
- Headless: pure `(state, action) → state` machines for component logic
- Plugin composition: `pipe(withSignals(), withCommands(), withScopes())`

### v2.0 — Embeddable layout+text engine

Flexily+Pretext proven by external adoption. Konva/PixiJS/tldraw users embedding flexily layout+text in their apps. The "Yoga for 2D canvas" story. Silvery gains proportional text on canvas — same components render with real typography.

### v3.0 — Full graphics UI engine

Own scene graph (ag-draw), own drawing, own interaction. The "build Google Docs-class apps" story.

- Rich drawing: paths, gradients, shadows, connectors, compositing
- Backends: Canvas2D, WebGL, SVG, PDF
- Interaction primitives: owned DnD, selection, focus, gestures
- Embeddable in react-dom / React Native / Electron
- API familiar to Konva/PixiJS users (Ink++ pattern: similar API, better engine)
- Can also target drawing libs as backends (display list → PixiJS for WebGL) and be embedded in them
- Terminal as capability-degraded freebie

## ag: Evolution from v1 to v3

ag doesn't need a big-bang rewrite. Incremental refactors make it scene-ready. (Bead: km-silvery.ag-scene-ready)

### v1.0 AgNode (today)

```
AgNode {
  type: root | box | text              ← 3 kinds
  props: BoxProps | TextProps           ← union type
  children: AgNode[]                   ← DUPLICATES Flexily children
  parent: AgNode | null                ← DUPLICATES Flexily parent
  layoutNode: LayoutNode | null        ← separate Flexily node
  7 dirty booleans                     ← terminal-specific
  6 computed rects                     ← mixed generic + terminal
  textContent, isRawText               ← text handling
  layoutSubscribers                    ← subscribers
}
```

### v3.0 SceneNode (target)

```
SceneNode {
  kind: group | box | text | image     ← extensible kinds
      | path | connector | viewport    ← new for drawing/freeform
  layout: flex | absolute | viewport   ← multiple layout modes
  flexNode: LayoutNode                 ← OWNED, not mirrored (no dual tree)
  dirtyBits: number                    ← bitmask, generic
  boxRect, screenRect              ← computed geometry
  hitTest?, focusable?                 ← interaction metadata
  // kind-specific props on subtypes, not a union
}
```

### Incremental refactors (do now, in order)

1. **Dirty flags → bitmask.** 7 booleans → one number. Internal, no API change.
2. **Add interaction metadata.** hitTestSpec, focusable, tabIndex on AgNode. Prepares for interaction index.
3. **Add new node kinds.** silvery-path, silvery-viewport, silvery-image. Backwards-compatible.
4. **Add layout modes.** absolute and none alongside flex. Backwards-compatible.
5. **Collapse dual tree.** (Breaking) FlexilyNode owns topology. Reconciler rewrite.
6. **Kind-specific props.** (Breaking) Discriminated types per node kind instead of union.
7. **Extract terminal render cache.** Move terminal-specific fields from core node to ag-term side tables.

Steps 1-4 are backwards-compatible and can happen now. Steps 5-7 are the v2→v3 breaking transition.

## Drawing library relationship

Every drawing library is missing layout and text. Flexily+Pretext fills the gap. For ag-draw's scene graph, three approaches — all compatible:

**A. Own scene graph, target drawing libs as backends.** Display list → Canvas2D / PixiJS / WebGL. Maximum control. Flutter model.

**B. API familiar to existing drawing libs.** Ink++ pattern — study Konva/PixiJS APIs, similar naming and patterns, better engine underneath. Migration feels natural.

**C. Embeddable in existing drawing libs.** Konva/Pixi apps embed silvery layout+text as a node. Lightweight integration.

All three at once. A is the architecture. B is the API design. C is the adoption path.

## Display list

Two kinds of ops — **semantic** (terminal-friendly: drawBox, drawParagraph) and **vector** (canvas-only: drawPath, drawLine). Terminal renders semantic ops natively, approximates or skips vector ops. Capability-based degradation without per-surface if/else.

See [rendering-targets.md](../design/v20-canvas/rendering-targets.md) for the canonical `DisplayOp` type definition.

## Three projections

Scene graph produces three outputs:

1. **Display list** (visual) — draw ops for rendering targets
2. **Semantics tree** (semantic) — roles/labels for screen readers, test automation
3. **Interaction index** (input) — hit regions, focus order, pointer capture

Terminal uses display list semantic ops only. Canvas uses all three. Capability-based degradation.

## Interaction

Browser DnD, selection, focus, and scroll are broken for complex apps. Silvery-tea implements interaction as surface-agnostic state machines: pointer events in, commands out.

Key patterns (from tldraw, Flutter, dnd-kit, ProseMirror, Monaco):

- Separate persistent state from transient interaction state
- Normalize input across pointer/wheel/keyboard/modifiers
- Explicit state machines for tools/gestures
- GestureArena-style conflict resolution
- DOM escape hatch for text input (hidden textarea, always)

## Embedding

**Silvery embeddable in others** (near-term): react-dom, React Native, Electron/Tauri.
**Others embeddable in silvery** (future): PixiJS, Three.js, video/webview.

## Everything Composes

Following era2's plugin composition pattern (`pipe`, `with*` plugins, wrappable methods), the entire stack is composition:

```typescript
// v0.5 — just layout + text (SHIPPED — anyone can use this)
const layout = pipe(createBareFlexily(), withPretext(pretext))

// v1.0 — terminal UI engine (VISION — scene graph, focus, events, dirty tracking)
const engine = pipe(createFlexily(), withFlexbox(), withPretext(), withAg())

// v1.5 — app engine (VISION — adds commands, signals, interaction)
const app = pipe(createFlexily(), withFlexbox(), withPretext(), withAg(), withTea())

// v3.0 — graphics engine (VISION — adds drawing, compositing, viewport)
const app = pipe(createFlexily(), withFlexbox(), withPretext(), withAg(), withDraw(), withTea())

// React reconciler creates nodes in the composed engine
// Each with* layer enhances nodes with additional capabilities
```

**What each layer adds (shipped + planned):**

```
SHIPPED:
withMonospace()     → engine.textLayout = MonospaceMeasurer (terminal)
withTestMeasurer()  → engine.textLayout = DeterministicTestMeasurer (CI)
withPretext()       → engine.textLayout = PretextMeasurer (proportional)

PLANNED (needs richer plugin system — wrapping createNode, hooking layout):
withFlexbox()   → explicit flexbox (currently baked in)
withAg()        → node gains: .kind, .props, .dirtyBits, .focusable, .screenRect
                  engine gains: .focusManager, .hitTest(), .findByTestID()
withDraw()      → node gains: PathNode, ConnectorNode, ViewportNode kinds
                  engine gains: display list builder, compositing layers
withTea()       → engine gains: commands, signals, interaction state machines
```

**One tree.** Flexily owns the topology. Each `with*` plugin adds metadata and capabilities to flexily nodes — no mirrored trees, no sync bugs. This resolves the dual-tree problem: ag isn't a separate tree, it's a composition layer on top of flexily's tree.

**The full stack:**

```
silvery components (SelectList, TextInput, etc.)        ← React component library
  ↓ uses
withTea (commands, signals, interaction)                 ← app architecture plugin
  ↓ composes on
withDraw (scene graph, display list, compositing)        ← graphics plugin (v3)
  ↓ composes on
withAg (node kinds, focus, events, dirty tracking)       ← UI engine plugin (v1)
  ↓ composes on
withPretext (text measurement + wrapping)                ← text plugin (v0.5)
  ↓ composes on
createFlexily() (bare node tree + calculateLayout)       ← foundation
  ↓ produces
display list → Canvas2D / WebGL / Terminal / SVG / PDF   ← rendering targets (platforms)
```

## Research

~$41 across 8 GPT 5.4 Pro deep research queries: platform rendering architectures, canvas+DOM mirror, iWork/Office/Google Docs, interaction architectures, drawing/scene graph options, ag deep dive, VoidZero/SSR.
