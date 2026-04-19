# Silvery Signals Engine — Draft Architecture

**Bead**: km-silvery.signals-engine (P4)
**Horizon**: v2.0+ (canvas motivates; terminal validates)
**Status**: Speculative draft — not approved for implementation
**Date**: 2026-04-09

## One-line summary

A composable rendering engine where layout, content, and output are computed signals in one dependency graph, assembled via `pipe()` plugins.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ User code (React JSX / SolidJS JSX / signals)           │
├─────────────────────────────────────────────────────────┤
│ Framework bridge: withReact() / withSolid()             │
│   Maps framework operations → SceneNode mutations       │
├─────────────────────────────────────────────────────────┤
│ Scene graph: createScene()                              │
│   SceneNodes + spatial index + signal records            │
├──────────┬──────────┬──────────┬────────────────────────┤
│ Layout   │ Content  │ Output   │ (plugins via pipe())   │
│ plugin   │ plugin   │ plugin   │                        │
│          │          │          │                        │
│ Position │ Cell     │ ANSI /   │                        │
│ signals  │ signals  │ Canvas / │                        │
│          │          │ SVG      │                        │
└──────────┴──────────┴──────────┴────────────────────────┘
```

## Core types

```typescript
// ─── Signal primitives (from alien-signals) ────────────

type Signal<T> = { (): T; (value: T): void }
type Computed<T> = { (): T }

// ─── Scene graph ────────────────────────────────────────

interface SceneNode {
  readonly id: string
  readonly type: "box" | "text"
  readonly parent: Signal<SceneNode | null>
  readonly children: Signal<readonly SceneNode[]>

  // Style signals — writable by framework bridge
  readonly style: {
    readonly width: Signal<StyleValue>
    readonly height: Signal<StyleValue>
    readonly flexDirection: Signal<FlexDirection>
    readonly flexGrow: Signal<number>
    readonly flexShrink: Signal<number>
    readonly borderStyle: Signal<BorderStyle | undefined>
    readonly backgroundColor: Signal<string | undefined>
    readonly color: Signal<string | undefined>
    readonly bold: Signal<boolean>
    readonly padding: Signal<Edges>
    readonly margin: Signal<Edges>
    readonly overflow: Signal<Overflow>
    readonly position: Signal<PositionType>
    // ... all Box/Text props as individual signals
  }

  // Text content (for text nodes)
  readonly textContent: Signal<string>
}

// ─── Layout plugin output ───────────────────────────────

interface LayoutSignals {
  // Computed by withLayout() — read-only to other plugins
  readonly width: Computed<number>
  readonly height: Computed<number>
  readonly x: Computed<number> // parent-relative
  readonly y: Computed<number>
  readonly screenX: Computed<number> // absolute (accounts for scroll)
  readonly screenY: Computed<number>
}

// ─── Content plugin output ──────────────────────────────

interface CellSignal {
  readonly char: Computed<string>
  readonly fg: Computed<RgbColor | null>
  readonly bg: Computed<RgbColor | null>
  readonly bold: Computed<boolean>
  readonly dim: Computed<boolean>
  readonly italic: Computed<boolean>
  readonly underline: Computed<UnderlineStyle>
}

// ─── Spatial index ──────────────────────────────────────

interface SpatialIndex {
  // Returns nodes covering a screen position, z-ordered (topmost first)
  at(col: number, row: number): Computed<readonly SceneNode[]>
  // Returns all nodes intersecting a rect
  query(rect: Rect): Computed<readonly SceneNode[]>
  // Dirty region tracking for output plugins
  readonly dirtyRegions: Computed<readonly Rect[]>
}

// ─── Scene ──────────────────────────────────────────────

interface Scene {
  readonly root: SceneNode
  readonly spatialIndex: SpatialIndex

  // Node lifecycle
  createNode(type: "box" | "text"): SceneNode
  insertChild(parent: SceneNode, child: SceneNode, index: number): void
  removeChild(parent: SceneNode, child: SceneNode): void

  // Per-node signal access (layout plugin attaches these)
  layout(node: SceneNode): LayoutSignals
  // Per-cell signal access (content plugin attaches these)
  cell(col: number, row: number): CellSignal

  // Dimensions
  readonly dims: Signal<{ cols: number; rows: number }>
}
```

## Plugin interfaces

```typescript
// ─── Plugin protocol ────────────────────────────────────

// A plugin takes a Scene and adds capabilities to it.
// Same pattern as silvery's app-level withReact(), withFocus(), etc.
type ScenePlugin = (scene: Scene) => Scene

// pipe() composes plugins left-to-right (already exists in silvery)
function pipe(scene: Scene, ...plugins: ScenePlugin[]): Scene

// ─── Layout plugin ──────────────────────────────────────

interface LayoutPlugin extends ScenePlugin {
  // When applied, attaches LayoutSignals to every SceneNode.
  // Each LayoutSignal is a computed depending on:
  //   - node.style.* signals (width, flexGrow, etc.)
  //   - parent's available space (computed from parent's layout)
  //   - siblings' sizes (for flex distribution)
  //   - children's intrinsic sizes (for shrink-wrap)
}

function withLayout(engine: LayoutEngine): LayoutPlugin
// LayoutEngine = flexily | cssGrid | absolute | custom

// ─── Content plugin ─────────────────────────────────────

interface ContentPlugin extends ScenePlugin {
  // When applied, attaches CellSignals to each screen position.
  // Each CellSignal is a computed depending on:
  //   - spatialIndex.at(col, row) — which nodes cover this cell
  //   - those nodes' LayoutSignals (position, size)
  //   - those nodes' style signals (color, bg, bold)
  //   - those nodes' textContent (for text nodes)
  //   - z-order (topmost non-transparent wins)
}

function withContent(): ContentPlugin

// ─── Output plugins ─────────────────────────────────────

interface OutputPlugin extends ScenePlugin {
  // When applied, subscribes to CellSignals or dirtyRegions.
  // When cells change, produces output in target format.
}

function withTerminalOutput(): OutputPlugin
// Subscribes to cell signals. On change:
//   - Cursor-position to (col, row)
//   - Emit ANSI for new char/style
// No buffer. No diff. Signal tells us exactly what changed.

function withCanvasOutput(ctx: CanvasRenderingContext2D): OutputPlugin
// Subscribes to dirty regions. On change:
//   - Clear dirty rect
//   - Repaint cells in region from cell signals

function withSvgOutput(): OutputPlugin
function withHeadlessOutput(): OutputPlugin // for testing — captures TextFrame
```

## Framework bridges

```typescript
// ─── React bridge ───────────────────────────────────────

function withReact(element: ReactElement): ScenePlugin
// Uses react-reconciler to:
//   - createElement → scene.createNode()
//   - commitUpdate → write to node.style.* signals
//   - appendChild → scene.insertChild()
//   - removeChild → scene.removeChild()
// Same as today's reconciler, but writing to signals instead of ag node props.

// ─── Solid bridge ───────────────────────────────────────

function withSolid(component: () => JSX.Element): ScenePlugin
// Solid's compiler generates:
//   - createElement → scene.createNode()
//   - spread(node, props) → wire Solid signals to node.style.* signals
//   - insert/remove → scene.insertChild/removeChild
// O(changed) — Solid only fires effects for changed props.

// ─── useSignalProps (React hot-path bypass) ─────────────

function useSignalProps(props: Record<string, Signal | Computed>): Record<string, unknown>
// Creates effects that write directly to SceneNode.style.* signals,
// bypassing React's reconciliation. React still owns mount/unmount.
// The "one hook" opt-in for React users who want signal-level perf.
```

## Layout plugin: flexily-as-signals

The key architectural challenge. Flexbox layout is hierarchical + iterative.

```typescript
function withLayout(engine: typeof flexily): ScenePlugin {
  return (scene) => {
    // For each node, create layout signals:
    scene.onNodeCreated((node) => {
      const parent = node.parent  // Signal<SceneNode | null>

      // Available space from parent's flex distribution
      const availableWidth = computed(() => {
        const p = parent()
        if (!p) return scene.dims().cols
        return scene.layout(p).contentWidth()
      })

      // Base size: from explicit style or intrinsic measurement
      const baseSize = computed(() => {
        const w = node.style.width()
        if (w.unit === "point") return w.value
        if (node.type === "text") return measureText(node.textContent(), availableWidth())
        return /* children shrink-wrap */ childrenMainSize()
      })

      // Flex distribution: parent collects all children's baseSizes
      // and distributes space via the freeze loop.
      // This is ONE computed containing the imperative freeze algorithm.
      const flexDistribution = computed(() => {
        const children = node.children()
        const bases = children.map(c => scene.layout(c).baseSize())
        const grows = children.map(c => c.style.flexGrow())
        const shrinks = children.map(c => c.style.flexShrink())
        return distributeFlexSpace(bases, grows, shrinks, availableWidth())
        // Returns: { finalSizes: number[], positions: number[] }
      })

      // Child position: looked up from parent's distribution
      const x = computed(() => {
        const p = parent()
        if (!p) return 0
        const dist = scene.layout(p).flexDistribution()
        const myIndex = p.children().indexOf(node)
        return dist.positions[myIndex] ?? 0
      })

      // Attach to scene
      scene.attachLayout(node, { baseSize, availableWidth, flexDistribution, x, y, width, height, ... })
    })

    return scene
  }
}
```

**Key property**: If a child's text changes but its `baseSize` computed returns the same value (text fits in same width), the parent's `flexDistribution` does NOT recompute. alien-signals' equality check short-circuits the propagation. This is what flexily's fingerprint cache approximates — but signals do it exactly and automatically.

## Content plugin: cell signals

```typescript
function withContent(): ScenePlugin {
  return (scene) => {
    // Option A: Per-cell computed (fine-grained, 12K signals for terminal)
    for (let row = 0; row < scene.dims().rows; row++) {
      for (let col = 0; col < scene.dims().cols; col++) {
        scene.attachCell(col, row, {
          char: computed(() => {
            const nodes = scene.spatialIndex.at(col, row)()
            const topNode = nodes[0] // z-order: topmost
            if (!topNode) return " "
            if (topNode.type === "text") {
              const layout = scene.layout(topNode)
              const charIndex = col - layout.screenX()
              return topNode.textContent()[charIndex] ?? " "
            }
            return renderBoxCell(topNode, col, row, layout) // border/bg
          }),
          fg: computed(() => {
            /* resolve from topmost node's style */
          }),
          bg: computed(() => {
            /* resolve from node stack's bg inheritance */
          }),
        })
      }
    }

    // Option B: Per-tile computed (coarser, for canvas scale)
    // Groups cells into 16x16 tiles. One computed per tile.
    // Better for 100K+ elements where per-cell signals are too many.

    return scene
  }
}
```

## Terminal output plugin: subscriptions

```typescript
function withTerminalOutput(): ScenePlugin {
  return (scene) => {
    const output: string[] = []

    // Subscribe to each cell. When it changes, queue ANSI output.
    for (let row = 0; row < scene.dims().rows; row++) {
      for (let col = 0; col < scene.dims().cols; col++) {
        effect(() => {
          const cell = scene.cell(col, row)
          const char = cell.char()
          const fg = cell.fg()
          const bg = cell.bg()
          // Queue: cursor to (col, row) + style + char
          output.push(cursorTo(col, row) + styleAnsi(fg, bg, cell.bold()) + char)
        })
      }
    }

    // Flush queued output after all effects settle (microtask)
    // alien-signals batches: all effects from one signal write fire synchronously,
    // then we flush once.
    scene.onFlush(() => {
      if (output.length > 0) {
        process.stdout.write(output.join(""))
        output.length = 0
      }
    })

    return scene
  }
}
```

## Reactive tree integration

km's `reactiveTree` (from `@km/reactive-tree`, `packages/reactive-tree/src/index.ts`) already does signals-on-trees with projections and aggregates. The same DSL pattern applies to the engine:

```typescript
// Current km @km/reactive-tree (proven in production):
const store = reactiveTree((tree) => ({
  cursor: signal(false),
  cursorDescendant: tree.descendants((s) => s.cursor).some(),
  selectedAncestor: tree.ancestors((s) => s.selected).some(),
  excludedSigils: tree.ancestors((s) => s.ownSigils).reduce(concat, () => []),
}))

// Engine layout signals using the same pattern:
const layoutStore = reactiveTree((tree) => ({
  baseSize: computed(() => measure(style(), constraints())),
  childSizes: tree.children((s) => s.baseSize).reduce(collectSizes, []),
  flexDistribution: computed(() => distribute(childSizes(), availWidth())),
  subtreeHeight: tree.descendants((s) => s.height).reduce(sum, 0),
  inheritedBg: tree.ancestors((s) => s.backgroundColor).first(),
  scrollOffset: signal(0),
  visibleChildren: computed(() => filterVisible(children(), scrollOffset(), height())),
}))
```

The `tree.descendants().some()` / `tree.ancestors().reduce()` pattern handles the hard parts: lazy node creation, efficient walk caching, tree rebinding. Extending from app state (cursor, selection) to engine state (layout, inherited styles) is a natural progression — same DSL, same alien-signals machinery, different domain.

**Key aggregates for the engine**:

| Aggregate                                         | Direction       | Use                                                  |
| ------------------------------------------------- | --------------- | ---------------------------------------------------- |
| `tree.children(s => s.baseSize).reduce(collect)`  | down (children) | Flex distribution input                              |
| `tree.descendants(s => s.dirty).some()`           | down            | Subtree-has-dirty (replaces subtreeDirty flag)       |
| `tree.ancestors(s => s.backgroundColor).first()`  | up (ancestors)  | Inherited background (replaces findInheritedBg walk) |
| `tree.ancestors(s => s.scrollOffset).reduce(sum)` | up              | Screen position (replaces screenRectPhase)           |
| `tree.children(s => s.height).reduce(max)`        | down            | Cross-axis size (replaces Phase 7a estimate)         |
| `tree.descendants(s => s.height).reduce(sum)`     | down            | Scroll content height                                |

Each of these replaces a hand-coded tree walk in the current pipeline with a declarative aggregate that auto-invalidates when dependencies change.

## Migration path (incremental, each step shippable)

| Phase | What                                  | Ships as                     | Effort     | Prerequisite |
| ----- | ------------------------------------- | ---------------------------- | ---------- | ------------ |
| 0     | Dirty node SET (current pipeline)     | Internal optimization        | ~3-4 days  | None         |
| 1     | @silvery/solid rendering target       | New package                  | ~1-2 weeks | None         |
| 2     | SceneNode with style signals          | Internal refactor of ag node | ~1 week    | Phase 0      |
| 3     | withLayout(flexily) as signal plugin  | Replaces layout-phase.ts     | ~2-3 weeks | Phase 2      |
| 4     | withContent() as cell computeds       | Replaces render-phase.ts     | ~3-4 weeks | Phase 3      |
| 5     | withTerminalOutput() as subscriptions | Replaces output-phase.ts     | ~1 week    | Phase 4      |
| 6     | withCanvasOutput()                    | New output target            | ~1-2 weeks | Phase 4      |

Each phase is independently testable and shippable. The existing pipeline continues to work until each phase's replacement is verified.

**Phase 2 is the key decision point**: converting ag node props from plain values to signals. This is the "point of no return" where the architecture commits to signals internally. Everything before Phase 2 is additive (dirty set, Solid target). Phase 2+ is a replacement.

## What this doc does NOT cover (future work)

- Scroll container signals (withScroll plugin)
- Sticky positioning signals (withSticky plugin)
- Animation signals (withAnimation plugin)
- Focus management as signals (withFocus plugin)
- Accessibility mirror as output plugin (withA11y)
- Undo/redo via signal snapshots (withRecorder)
- Signal graph devtools inspector

Each would be its own design doc once the core architecture (Phases 2-5) is proven.

## Open questions

1. **Per-cell vs per-tile vs per-node**: At what granularity should content signals operate? Per-cell is most precise but 12K signals for terminal. Per-tile (16x16) is better for canvas. Per-node might be the right default (each node has a "my rendered cells" computed).

2. **Signal equality for layout**: alien-signals uses `Object.is` for equality. Layout results are objects (`{ width: 80, height: 1 }`). Need structural equality or signal-per-dimension? Probably signal-per-dimension (width, height, x, y as separate signals) for finest granularity.

3. **Batch size**: How many signal updates per frame? If user types fast (10 keystrokes buffered), each keystroke is a signal write. alien-signals' batch() coalesces — but does the frame budget accommodate 10 cascading updates? Probably yes (10 × 50μs = 500μs), but needs measurement.

4. **Memory on large trees**: 500 nodes × ~20 signals per node × ~40 bytes per signal = 400KB for the signal graph. Plus cell signals. Acceptable for terminal, needs measurement for 50K-element canvas.

5. **Compatibility period**: During migration (Phases 2-5), can the old pipeline and new signal pipeline coexist? Probably yes — STRICT mode can compare old pipeline output with new signal output cell-by-cell, exactly as it compares incremental vs fresh today.
