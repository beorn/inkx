# Speculative: End-to-End Signals Engine

**Bead**: km-silvery.signals-engine (P4 — speculative/exploratory)
**Horizon**: v2.0+ (canvas motivates it; terminal doesn't need it)
**Date**: 2026-04-09

## The idea

What if the rendering engine — not just the component framework — was signal-based? Layout dimensions, cell content, and terminal output all as computed signals in one dependency graph.

## Why terminal doesn't need this

200x60 = 12,000 cells at 30fps. Walking the tree every frame works — silvery already wins 2.5-5.2x vs Ink. The O(tree) architecture is fast enough.

## Why canvas might

1920x1080 at 60fps. A spreadsheet might have 10,000+ visible elements. Walking the entire tree 60 times per second to find 3 changed cells is the bottleneck. Canvas needs O(changed) at every layer, not just the component layer.

## The six layers

| Layer             | Current                                 | Signals                                               |
| ----------------- | --------------------------------------- | ----------------------------------------------------- |
| 1. App state      | React useState / Solid createSignal     | Signal (unchanged)                                    |
| 2. Component tree | React reconciler / Solid compiler → ag  | Solid → ag (unchanged)                                |
| 3. Layout         | flexily tree walk + fingerprint cache   | Each node's width/x/y is a **computed signal**        |
| 4. Content        | render-phase tree walk → TerminalBuffer | Each cell's char/fg/bg is a **computed signal**       |
| 5. Output         | Buffer diff → ANSI                      | Subscribe to cell signals → emit on change            |
| 6. Pipeline       | 7 explicit phases in order              | Signal graph determines execution order automatically |

Layers 1-2 are handled by SolidJS (@silvery/solid). Layers 3-5 are the speculative engine change.

## Layer 3: Layout as signal graph

Flexbox layout is a DAG — each value depends on parent constraints + own style + children:

```
node.style.width  ─┐
node.textContent  ─┼→ node.baseSize (computed)
                    │
parent.availWidth ─┐│
children.baseSizes ┼┼→ parent.flexDistribution (computed: freeze loop)
                    │
distribution[i]  ───→ child.finalSize (computed: lookup)
                    │
child.finalSize  ───→ child.position (computed: cumulative sibling offset)
```

When one child's text changes:

1. Its `baseSize` recomputes
2. Parent's `flexDistribution` recomputes (only if baseSize actually differs — signal equality check)
3. If distribution unchanged (text fits same width): **nothing else happens. Zero work.**
4. If distribution changed: only shifted siblings recompute positions
5. Only affected cells update

This subsumes flexily's fingerprint cache — signals have built-in memoization via equality checks.

## Proven pattern: km's @km/reactive-tree

km already has a production signal-on-tree system in `@km/reactive-tree` (`packages/reactive-tree/src/index.ts`):

```typescript
const store = reactiveTree(
  (tree) => ({
    cursor: signal(false),
    cursorDescendant: tree.descendants((s) => s.cursor).some(),
    selectedAncestor: tree.ancestors((s) => s.selected).some(),
    excludedSigils: tree.ancestors((s) => s.ownSigils).reduce(concat, () => []),
  }),
  { parent, children },
)
```

This uses alien-signals computed() for tree aggregates — projections up (ancestors) and down (descendants) with `.some()`, `.count()`, `.reduce()`. The same pattern applies to layout:

```typescript
// Hypothetical layout-as-signals (same @km/reactive-tree DSL pattern)
const layoutTree = reactiveTree((tree) => ({
  // Leaf-up: intrinsic size
  baseSize: computed(() => measure(style(), constraints())),

  // Parent-down: available space (from parent's flex distribution)
  availWidth: tree.ancestors((s) => s.flexDistribution).first(),

  // Children-up: aggregate for flex distribution
  childSizes: tree.children((s) => s.baseSize).reduce(collectSizes, []),

  // Computed from childSizes
  flexDist: computed(() => distributeFlexSpace(childSizes(), availWidth())),

  // Final position: cumulative offset from preceding siblings
  position: computed(() => cumulativeOffset(flexDist(), siblingIndex())),
}))
```

The key: @km/reactive-tree already handles the hard parts (lazy node creation, tree rebinding, efficient walk caching). Extending it to layout signals is a natural progression, not a new invention.

## Overhead considerations

**Signal overhead per cell**: 12,000 cells × ~2ns per dependency check = ~24μs. Comparable to current buffer diff. For terminal, no win. For canvas (100K+ cells), the signal approach wins because it's O(changed) — the 24μs is worst-case (all cells dirty), not typical.

**Memory per signal**: alien-signals uses ~40 bytes per signal/computed. 12,000 cell computeds = ~480KB. Current TerminalBuffer is ~240KB (12,000 × 20 bytes per cell). 2x memory for signals. Acceptable for terminal, may need optimization for canvas (spatial grouping — one signal per tile of 16 cells instead of per-cell).

**@km/reactive-tree overhead**: km's @km/reactive-tree lazily creates per-node signal records. For a 500-node kanban, ~2000 signals (4 per node). Cost is dominated by alien-signals' internal tracking, which benchmarks at ~50ns per computed update. 2000 × 50ns = 100μs for a full-tree recompute — well under 1ms.

**Spatial grouping for canvas**: Instead of one signal per pixel, group cells into tiles (e.g., 16x16). One signal per tile. When a tile's dependency changes, the tile recomputes its 256 cells. Reduces signal count from 2M (1920×1080) to ~8K tiles. Each tile is a computed that renders its region from the scene graph nodes that intersect it.

## What this eliminates

| Current                                    | With signals engine                            |
| ------------------------------------------ | ---------------------------------------------- |
| 6 dirty flags per ag node                  | Signal dependency graph                        |
| cascade-predicates.ts                      | Signal equality checks                         |
| render-phase.ts tree walk (~2000 LOC)      | Per-node cell computeds                        |
| output-phase buffer diff                   | Cell/tile subscriptions                        |
| flexily fingerprint cache                  | Layout signal memoization                      |
| hasPrevBuffer/ancestorCleared cascade      | Gone — no incremental vs fresh distinction     |
| STRICT mode (compare incremental vs fresh) | Unnecessary — one code path                    |
| "Skip unused pipeline phases"              | Signal graph auto-skips unsubscribed computeds |
| 7-phase pipeline ordering                  | Signal dependency graph determines order       |

## Potential benefits

### Performance: O(changed) at every layer

| Scenario                           | Current (O(tree))                         | Signals (O(changed))                         | Improvement                    |
| ---------------------------------- | ----------------------------------------- | -------------------------------------------- | ------------------------------ |
| 500-node kanban, 1 text edit       | Pipeline walks 500 nodes, diffs 12K cells | 1 baseSize + 1 cell computed fires           | ~250x less work                |
| 10K-element canvas, cursor move    | Walk 10K nodes, diff 2M pixels            | 2 style signals fire → 2 tile computeds      | ~5000x less work               |
| Resize terminal (all cells change) | Walk tree + full layout + full render     | All layout signals recompute (same as today) | ~1x (no win — all cells dirty) |
| Theme change ($primary)            | Walk tree, re-render all themed nodes     | Only cells depending on $primary recompute   | Proportional to themed area    |

The win scales with **tree size / change size**. Bigger trees and smaller changes = bigger win. For tiny trees or full repaints, signals add overhead with no benefit.

### Architecture: elimination of complexity

End-to-end signals eliminate the MOST bug-prone subsystems in silvery:

- **No dirty flag system** — 6 flags per node (contentDirty, layoutDirty, stylePropsDirty, subtreeDirty, bgDirty, childrenDirty) + the cascade predicates that combine them. Every incremental rendering bug in silvery's history traces to a dirty flag not being set or cleared correctly. Signals make this impossible — dependencies are tracked automatically.

- **No incremental-vs-fresh divergence** — the #1 source of visual bugs. Currently two code paths (incremental from clone, fresh from scratch) must produce identical output. With signals there's ONE code path — each cell computes its value from its dependencies. No clone, no diff, no divergence possible.

- **No pipeline ordering bugs** — currently the 7 phases must run in exact order (measure before layout, layout before scroll, etc.). With signals the dependency graph enforces ordering automatically. You can't read a layout signal before its dependencies have been computed.

- **No stale cache bugs** — flexily's fingerprint cache, measure cache, and layout cache have produced 3 distinct bugs (documented in flexily/src/CLAUDE.md). Signals' built-in memoization replaces all three caches with one mechanism that's correct by construction.

### DX: simpler mental model for silvery contributors

Current model for fixing a rendering bug:

1. Understand 6 dirty flags and when each is set/cleared
2. Understand the cascade predicates (hasPrevBuffer, ancestorCleared, contentAreaAffected, bgRefillNeeded, childrenNeedFreshRender — 5 computed booleans with complex interdependencies)
3. Understand the 3-tier scroll strategy
4. Understand sticky two-pass rendering
5. Understand when to clear regions vs skip clearing
6. Run STRICT mode to verify incremental matches fresh

Signal model:

1. Each value is a computed signal depending on other signals
2. If the output is wrong, trace the dependency chain
3. There's only one code path — no incremental vs fresh to compare

### Ecosystem: shared signal graph across app + engine

With end-to-end signals, the app's signals and the engine's signals are the SAME graph. A km cursor signal directly connects to the cell computeds that show the cursor highlight — no React reconciliation, no dirty flag propagation, no pipeline phases in between.

This enables:

- **Debugging tools** that show the full dependency chain from user action to screen pixel
- **Performance profiling** that identifies which signal path is slow (rather than "the content phase took 5ms" with no visibility into what triggered it)
- **Hot module replacement** that patches individual signals without re-rendering the tree
- **Time-travel debugging** by recording signal values (each is a pure function of its dependencies)

### Positioning: unique in the TUI/canvas space

No other terminal or canvas framework uses end-to-end signals for rendering. React (DOM diffing), Solid (DOM mutations via signals, but not layout/rendering signals), Svelte (compiled updates, not signal-based engine), PixiJS (retained-mode display list with dirty flags — same as silvery today), Konva (full redraw per frame). An end-to-end signal engine would be genuinely novel.

## Risks and mitigations

### 1. Massive rewrite

**Risk**: flexily + render-phase + output-phase reimplemented. Months of work.
**Mitigation**: Incremental layering — each layer (dirty set → SolidJS → layout signals → cell computeds) is independently valuable and shippable. No big bang rewrite needed. See "Progression" table below.

### 2. Flexbox freeze loop — NOT A REAL RISK

**Original concern**: Iterative algorithm in a declarative signal graph.
**Why it's fine**: Signals don't require every line to be declarative — they require the DEPENDENCY GRAPH to be declarative. The freeze loop is a pure function `(children baseSizes, available space) → final sizes`. As a computed signal, it recomputes when any input changes. Imperative code inside a computed is perfectly valid — alien-signals tracks the signal reads, not the code structure.

### 3. Overlapping regions — SOLVED BY SPATIAL INDEX

**Original concern**: Absolute positioning + z-order mean multiple nodes affect one cell.
**Mitigation**: Spatial index (grid/hash) as a computed signal. `cell(5,3) = computed(() => topmost(spatialIndex.at(5,3)))`. When a node moves, only affected index entries invalidate. Same pattern as km's `rectRegistry` for hit testing. Can also use the @km/reactive-tree `.reduce()` pattern: `cellValue: tree.descendants(s => s.renderedCells).reduce(overlay, emptyCell)` — the overlay reducer takes the topmost non-transparent cell. Proven in production with km's `excludedSigils` aggregate.

### 4. Debugging — ACTUALLY BETTER THAN CURRENT

**Original concern**: No equivalent of STRICT mode.
**Why signals are better for debugging**:

- **Signal STRICT mode**: Snapshot all signal values, force-recompute every computed from scratch (ignoring memo cache), compare. If results differ, there's a memoization bug. This is MORE precise than current STRICT (which compares two different implementations). Signals test "does caching change results?" — one code path, verified.

- **Dependency tracing**: `cell(5,3)` depends on `node.textContent` depends on `cursor()`. The dependency chain IS the explanation. Current debugging requires mental reconstruction of which pipeline phase, which dirty flag, which cascade predicate affected a cell. Signals make this automatic.

- **Single code path**: No incremental-vs-fresh divergence to debug. The #1 source of visual bugs (and the hardest to diagnose) disappears entirely.

### 5. rebind() invalidation — MITIGATED BY TWO-TIER APPROACH

**Original concern**: Tree structure changes invalidate all computeds.
**Mitigations**:

- **Two-tier approach**: Signals for props/style changes (frequent, fine-grained). Imperative insert/remove for structure changes (rare, amortized). SolidJS naturally provides this — its compiler uses imperative DOM operations for structure and reactive effects for values. Structure changes don't go through the signal graph.

- **Granular invalidation**: Instead of invalidating everything on rebind, only invalidate computeds whose traversal path includes the mutated edge. A new sibling of node X doesn't affect X's descendants — only X's parent's children-aggregates. The @km/reactive-tree DSL knows direction (up/down) and can scope invalidation.

- **Batched structural mutations**: `batch(() => { insert(a); insert(b); remove(c); })` rebuilds the affected signal graph portion once. alien-signals' `startBatch/endBatch` already handles this — subscribers fire once after the batch.

### Revised risk assessment

| Risk                  | Original severity | After mitigation | Status                                      |
| --------------------- | ----------------- | ---------------- | ------------------------------------------- |
| Massive rewrite       | High              | Medium           | Incremental layering avoids big bang        |
| Flexbox freeze loop   | Medium            | **Non-issue**    | Imperative code in computed is fine         |
| Overlapping regions   | Medium            | **Solved**       | Spatial index + @km/reactive-tree reduce       |
| Debugging             | High              | **Advantage**    | Signal tracing + recompute-all STRICT       |
| rebind() invalidation | High              | **Medium**       | Two-tier + granular invalidation + batching |

The only real remaining risk is effort/scope — and that's mitigated by incremental layering.

## Scale analysis: what can signals power?

| App complexity     | Elements         | Viable?                     | Examples                                                           |
| ------------------ | ---------------- | --------------------------- | ------------------------------------------------------------------ |
| Terminal TUI       | 100-1000         | Overkill but elegant        | km, CLI tools, dev tools                                           |
| Simple canvas app  | 1K-10K           | **Sweet spot**              | Kanban, dashboard, form builder                                    |
| Complex canvas app | 10K-100K         | **Yes with spatial tiling** | Spreadsheet, diagram editor, CAD                                   |
| Rich text editor   | 100K+            | Maybe with virtualization   | Google Docs-class                                                  |
| Web browser        | 100K-10M+        | **No**                      | CSS cascade is rule engine not DAG, GPU compositing, multi-process |
| Game engine        | 1K-100K entities | Logic yes, rendering no     | ECS better for GPU rendering                                       |

**Why not browsers**: 30M+ signal nodes (10K DOM nodes × 300 CSS props), CSS selector matching is tree-structural pattern matching (not dependency tracking), 20+ interacting layout algorithms, GPU layer compositing, multi-process architecture. Browsers use specialized mechanisms (invalidation trees, layout boundaries, display lists, compositing) that beat general signals at that scale.

**Why canvas apps ARE the sweet spot**: alien-signals processes ~500M updates/sec. 50K elements × 100 signals = 5M signals. 1% fire per frame = 50K updates × ~100ns = 5ms. Fits 16ms frame budget. With spatial tiling (1 signal per 16×16 tile instead of per-pixel), 100K+ elements is viable.

### Positioning impact

Silvery with end-to-end signals becomes the **only framework where JSX components render to terminal + canvas + SVG/PDF from one codebase, at 60fps with 50K+ elements.** No one else offers this:

- React Native: native views, not canvas
- PixiJS/Konva: imperative, no component model
- Flutter: Dart, not JS/TS
- Ink: terminal-only, React-only
- Solid: DOM-only

Not "faster Ink" — **the rendering engine for interactive 2D apps.**

## Composition: pipe() all the way down

The signal engine should follow silvery's existing composition pattern — each concern is a layer plugin that adds signals to the graph.

### Engine composition (internal)

```typescript
const engine = pipe(
  createScene(), // ag node tree + spatial index
  withLayout(flexily), // layout as signal graph (swappable)
  withContent(), // cell/pixel signals from positioned nodes
  withTerminalOutput(), // subscribe to cell signals → emit ANSI
)
```

Each layer adds computed signals that depend on the previous layer's signals. `withLayout` adds position/size signals. `withContent` adds cell signals depending on positions. `withOutput` subscribes to cells.

### What composition enables

**Swappable pieces**: `withLayout(flexily)` vs `withLayout(cssGrid)` vs `withLayout(absolute)`. `withTerminalOutput()` vs `withCanvasOutput(ctx)` vs `withSvgOutput()`. `withSolid(<App/>)` vs `withReact(<App/>)`.

**Progressive complexity**: `createSilveryApp(<App/>)` for simple apps (batteries-included). `pipe(createScene(), withLayout(...), ...)` for power users who compose exactly what they need.

**Independent testing**: Test layout without output (just layout signals). Test content without terminal (cell signals only). Test output without real I/O (headless subscriber). Each layer testable in isolation — no need for full pipeline.

**Plugin ecosystem**: `withAnimation()` (springs), `withPhysics()` (games), `withAccessibility()` (DOM mirror), `withRecorder()` (replay/undo), `withDevtools()` (signal inspector), `withProfiler()` (hot-path).

### How composition reduces complexity

| Current                                        | Composed                                         |
| ---------------------------------------------- | ------------------------------------------------ |
| 7 phases in one function, implicit ordering    | Signal dependencies = automatic ordering         |
| Shared mutable state (prevBuffer, dirty flags) | Signals are the interface — no shared mutation   |
| Adding canvas = touch whole pipeline           | New output plugin, nothing else changes          |
| Testing = full pipeline for any test           | Compose only layers under test                   |
| render-phase.ts 2000 lines cascade logic       | withContent() per-node cell computeds ~200 lines |
| New layout algorithm = fork flexily            | withLayout(myLayout) plugin interface            |

### Same API, deeper composition

This is silvery's existing philosophy applied one level deeper. Today:

```
pipe(createApp(), withReact(), withTerminal(), withFocus())  // app level
```

Proposed:

```
pipe(createScene(), withLayout(), withContent(), withOutput())  // engine level
```

Both compose. Both are pipe(). Both let you swap any piece. The difference is scope: app-level composition is user-facing (v1.0, shipped). Engine-level composition is internal (v2.0, speculative). But the pattern is the same — and it's proven.

## Recommendation

**P4 — keep as speculative exploration.** Terminal doesn't need it (2.5-5.2x wins are sufficient). Canvas v2.0 might — evaluate after @silvery/solid ships and we have real canvas performance data. The @km/reactive-tree pattern is proven for tree aggregates (km uses it in production); extending to layout is a natural next step IF canvas profiling shows the tree-walk pipeline as a bottleneck.

**First concrete step**: When canvas v2.0 profiling shows pipeline as bottleneck, prototype layout-as-signals using the @km/reactive-tree DSL pattern on a 10K-element canvas scene. Compare with current flexily tree walk. If signals win by 5x+, proceed with full engine.

## Progression (each step independent)

| Step                     | When     | What                                              | Depends on             |
| ------------------------ | -------- | ------------------------------------------------- | ---------------------- |
| Dirty node SET           | Now (P1) | Pipeline visits dirty nodes, not tree             | Nothing                |
| @silvery/solid           | v1.5     | SolidJS rendering target for ag                   | Nothing                |
| Reactive pipeline phases | v1.5     | Phase computeds auto-skip                         | @silvery/solid         |
| Layout signals prototype | v2.0     | flexily-as-signals on canvas benchmark            | Canvas v2.0 profiling  |
| Cell/tile computeds      | v2.0+    | Content render as signal graph                    | Layout signals working |
| Pipeline dissolution     | v2.0+    | No explicit phases — signal graph IS the renderer | All above              |
