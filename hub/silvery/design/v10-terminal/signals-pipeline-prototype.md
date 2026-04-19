# Signals Pipeline Prototype — Design Exploration

**Bead**: km-silvery.reactive-pipeline
**Date**: 2026-04-10
**Status**: Exploration — trying different signal designs against the actual pipeline algorithm

## What we're trying to express

The current pipeline has 7 dirty flags with manual cascade formulas. The core algorithm from CLAUDE.md:

```typescript
// Current: 7 flags, manually set by reconciler, manually cascaded
node.contentDirty // text content changed
node.stylePropsDirty // visual style changed (color, bold, inverse)
node.bgDirty // backgroundColor specifically changed
node.childrenDirty // children added/removed/reordered
node.layoutDirty // layout-affecting props changed
node.subtreeDirty // some descendant has dirty flags
node.layoutChangedThisFrame // layout position/size changed (set by layout phase)

// The skip condition (all must be false to skip rendering):
!contentDirty &&
  !stylePropsDirty &&
  !layoutChanged &&
  !subtreeDirty &&
  !childrenDirty &&
  !childPositionChanged &&
  !ancestorLayoutChanged &&
  !scrollOffsetChanged

// Derived values (cascade formulas — the complex part):
contentAreaAffected =
  contentDirty ||
  layoutChanged ||
  childPositionChanged ||
  childrenDirty ||
  bgDirty ||
  textPaintDirty ||
  absoluteChildMutated ||
  descendantOverflowChanged

contentRegionCleared = (hasPrevBuffer || ancestorCleared) && contentAreaAffected && !props.backgroundColor

childrenNeedFreshRender = (hasPrevBuffer || ancestorCleared) && (contentAreaAffected || bgRefillNeeded) && !bgOnlyChange

skipBgFill = hasPrevBuffer && !ancestorCleared && !contentAreaAffected && !bgRefillNeeded
```

Plus the cascade propagation to children:

```typescript
childHasPrev = childrenDirty || childPositionChanged || childrenNeedFreshRender ? false : hasPrevBuffer
childAncestorCleared = contentRegionCleared || (ancestorCleared && !props.backgroundColor)
childAncestorLayoutChanged = node.layoutChangedThisFrame || ancestorLayoutChanged
```

## Design A: alien-signals directly

```typescript
import { signal, computed } from "alien-signals"

function createNodeSignals(node: AgNode) {
  // Writable signals (set by reconciler)
  const contentDirty = signal(false)
  const stylePropsDirty = signal(false)
  const bgDirty = signal(false)
  const childrenDirty = signal(false)
  const layoutDirty = signal(false)

  // Derived by layout phase
  const layoutChanged = signal(false) // set by layout phase after comparing rects

  // Derived computeds (replace cascade formulas)
  const textPaintDirty = computed(() => node.type === "silvery-text" && stylePropsDirty())

  const contentAreaAffected = computed(
    () =>
      contentDirty() ||
      layoutChanged() ||
      childPositionChanged() ||
      childrenDirty() ||
      bgDirty() ||
      textPaintDirty() ||
      absoluteChildMutated() ||
      descendantOverflowChanged(),
  )

  const needsRender = computed(
    () => contentDirty() || stylePropsDirty() || layoutChanged() || subtreeDirty() || childrenDirty(),
  )

  return {
    contentDirty,
    stylePropsDirty,
    bgDirty,
    childrenDirty,
    layoutDirty,
    layoutChanged,
    contentAreaAffected,
    needsRender,
  }
}
```

**Pros**: simple, each derived value is a one-liner, dependency tracking is automatic.
**Cons**: `subtreeDirty` needs tree traversal (how does a parent know if any descendant is dirty?). `childPositionChanged` needs sibling awareness. These are TREE computations, not node-local.

## Design B: reactiveTree (km's DSL)

```typescript
import { createTree as reactiveTree, signal } from "alien-trees"

const pipeline = reactiveTree((tree) => ({
  // Writable state (set by reconciler)
  contentDirty:    signal(false),
  stylePropsDirty: signal(false),
  bgDirty:         signal(false),
  childrenDirty:   signal(false),
  layoutDirty:     signal(false),
  layoutChanged:   signal(false),

  // Tree-scoped computeds (THIS is the magic)
  subtreeDirty:    tree.descendants(s => s.needsRender).some(),
  hasLayoutDirtyDescendant: tree.descendants(s => s.layoutDirty).some(),
  ancestorLayoutChanged: tree.ancestors(s => s.layoutChanged).some(),
  ancestorHasBg: tree.ancestors(s => s.hasBg).some(),

  // Node-local computeds (same as Design A)
  needsRender: computed(() => /* ... */),
  contentAreaAffected: computed(() => /* ... */),
}), { parent: getParent, children: getChildren })

// Usage in render phase:
function shouldSkip(nodeId: string): boolean {
  const n = pipeline.get(nodeId)
  return !n.needsRender() && !n.subtreeDirty()
}
```

**Pros**: `subtreeDirty` is ONE LINE: `tree.descendants(s => s.needsRender).some()`. This replaces the entire manual upward propagation. `ancestorLayoutChanged` is also one line. Tree-scoped computeds handle the hard parts.
**Cons**: reactiveTree was designed for km's board (hundreds of nodes with relatively stable tree). The pipeline has thousands of nodes with frequent structural changes (children mount/unmount). Need to verify the reactive graph handles structural changes efficiently.

## Design C: Version counting (no signals)

```typescript
// Each node has a single version number
interface NodeVersions {
  propsVersion: number // bumped by reconciler on any prop change
  layoutVersion: number // bumped by layout phase when rect changes
  renderVersion: number // bumped by render phase after rendering
  childStructureVersion: number // bumped when children change
}

// Skip condition: pure arithmetic, no flags
function shouldSkip(node: NodeVersions, lastRendered: number): boolean {
  return (
    node.propsVersion <= lastRendered &&
    node.layoutVersion <= lastRendered &&
    node.childStructureVersion <= lastRendered
  )
}

// Subtree version: max of self + children versions
function subtreeVersion(node: NodeVersions, children: NodeVersions[]): number {
  let v = Math.max(node.propsVersion, node.layoutVersion, node.childStructureVersion)
  for (const child of children) v = Math.max(v, subtreeVersion(child, getChildren(child)))
  return v
}
```

**Pros**: simplest possible implementation. One comparison replaces 8 boolean checks. No signal overhead. No dependency tracking machinery.
**Cons**: loses granularity — can't distinguish "only style changed" from "content changed" from "layout changed." The fast paths (bg-only, style-only restyle) need that granularity to skip expensive work. Version counting is a coarser tool.

## Design D: Hybrid — version counting + signals for derived values

```typescript
import { signal, computed } from "alien-signals"

function createNodeState(node: AgNode) {
  // Version signals (fine-grained: one per category)
  const contentVersion = signal(0)
  const styleVersion = signal(0)
  const layoutVersion = signal(0)
  const childStructureVersion = signal(0)
  const bgVersion = signal(0)
  const renderVersion = signal(0) // bumped after rendering

  // Derived: is this node dirty? (computed, automatic)
  const isDirty = computed(
    () =>
      contentVersion() > renderVersion() ||
      styleVersion() > renderVersion() ||
      layoutVersion() > renderVersion() ||
      childStructureVersion() > renderVersion(),
  )

  // Derived: what KIND of dirty? (for fast path selection)
  const isStyleOnly = computed(
    () =>
      styleVersion() > renderVersion() &&
      contentVersion() <= renderVersion() &&
      layoutVersion() <= renderVersion() &&
      childStructureVersion() <= renderVersion(),
  )

  const isBgOnly = computed(
    () =>
      bgVersion() > renderVersion() &&
      contentVersion() <= renderVersion() &&
      layoutVersion() <= renderVersion() &&
      childStructureVersion() <= renderVersion() &&
      styleVersion() <= renderVersion(),
  )

  // Derived: contentAreaAffected (replaces the cascade formula)
  const contentAreaAffected = computed(
    () =>
      contentVersion() > renderVersion() ||
      layoutVersion() > renderVersion() ||
      childStructureVersion() > renderVersion() ||
      bgVersion() > renderVersion(),
  )

  return {
    contentVersion,
    styleVersion,
    layoutVersion,
    childStructureVersion,
    bgVersion,
    renderVersion,
    isDirty,
    isStyleOnly,
    isBgOnly,
    contentAreaAffected,
  }
}

// Reconciler: bump the right version
function onPropChange(node: NodeState, prop: string, oldVal: unknown, newVal: unknown) {
  if (isLayoutProp(prop)) node.layoutVersion(node.layoutVersion() + 1)
  else if (prop === "backgroundColor") node.bgVersion(node.bgVersion() + 1)
  else if (isStyleProp(prop)) node.styleVersion(node.styleVersion() + 1)
  else node.contentVersion(node.contentVersion() + 1)
}

// Render phase: check, render, bump renderVersion
function renderNode(node: NodeState) {
  if (!node.isDirty()) return // skip — automatic, correct

  if (node.isBgOnly()) {
    // bg-only fast path — fillBg, skip children
    renderBgOnly(node)
  } else if (node.isStyleOnly()) {
    // style-only fast path — restyleRegion, skip content collection
    renderStyleOnly(node)
  } else {
    // full render
    renderFull(node)
  }

  // Mark as rendered — all derived computeds automatically update
  node.renderVersion(
    Math.max(
      node.contentVersion(),
      node.styleVersion(),
      node.layoutVersion(),
      node.childStructureVersion(),
      node.bgVersion(),
    ),
  )
}
```

**Pros**:

- Version counting gives cheap skip checks (integer comparison)
- Signals give automatic dependency tracking for derived values
- Fast paths (bg-only, style-only) preserved via computed granularity
- `renderVersion` bump automatically makes all `isDirty`/`isStyleOnly`/etc. recompute to false
- No manual flag clearing pass
- Adding a new category is: add a version signal + update the relevant computeds

**Cons**:

- Still needs tree-level computeds for subtreeDirty / ancestorLayoutChanged (combine with Design B)
- 6 version signals per node × 1000 nodes = 6000 signals (measure overhead)

## Design E: Hybrid D + reactiveTree for tree computeds

Combine Design D (version signals per node) with Design B (reactiveTree for tree-scoped aggregates):

```typescript
const pipeline = reactiveTree(
  (tree) => ({
    // Per-node version signals
    contentVersion: signal(0),
    styleVersion: signal(0),
    layoutVersion: signal(0),
    childStructureVersion: signal(0),
    bgVersion: signal(0),
    renderVersion: signal(0),

    // Node-local computeds
    isDirty: computed(/* ... from Design D ... */),
    isStyleOnly: computed(/* ... */),
    isBgOnly: computed(/* ... */),
    contentAreaAffected: computed(/* ... */),

    // Tree-scoped computeds (the killer feature)
    subtreeDirty: tree.descendants((s) => s.isDirty).some(),
    ancestorLayoutChanged: tree.ancestors((s) => s.layoutChanged).some(),
    hasLayoutDirtyInSubtree: tree.descendants((s) => s.layoutDirty).some(),
  }),
  traversal,
)

// Render phase skip: one computed check
if (!node.isDirty() && !node.subtreeDirty()) return // skip entire subtree

// Layout phase skip: one computed check
if (!node.hasLayoutDirtyInSubtree()) return // skip entire layout phase
```

**This is the endgame design.** The entire skip condition is TWO computed reads. The entire cascade is implicit in the dependency graph. The entire `subtreeDirty` propagation is replaced by one line in the schema.

## Evaluation

| Design                      | Ergonomics    | Performance            | Handles tree?        | Fast paths?               | Complexity |
| --------------------------- | ------------- | ---------------------- | -------------------- | ------------------------- | ---------- |
| A (alien-signals)           | Good          | Good                   | ❌ No tree computeds | ✅                        | Low        |
| B (reactiveTree)            | Excellent     | ? (structural changes) | ✅                   | ❌ No version granularity | Medium     |
| C (version counting)        | OK            | Excellent              | ❌ Manual subtree    | ❌ Coarse                 | Very low   |
| D (hybrid versions+signals) | Very good     | Good                   | ❌ No tree computeds | ✅                        | Medium     |
| **E (D + reactiveTree)**    | **Excellent** | **Good**               | **✅**               | **✅**                    | **Medium** |

## Recommendation

**Design E** is the target. But get there incrementally:

1. Start with **Design C** (version counting) — simplest, proves the concept
2. Add **alien-signals** for the computed derivations (Design D) — proves signals work
3. Add **reactiveTree** for tree aggregates (Design E) — the full vision

Each step is independently valuable and testable via shadow oracle.

## Open questions

1. Can reactiveTree handle 1000+ nodes with frequent structural changes (mount/unmount)?
2. What's the memory overhead of 6 signals × 1000 nodes?
3. Does alien-signals' batching work correctly with React's commit phase?
4. Can the layout phase set `layoutVersion` inside a batch without triggering premature recomputation?

These are the Phase 0 prototype questions.

## Design F: Full reactive pipeline — phases dissolve into computeds

The radical extension of Design E. Instead of keeping the 8-phase pipeline and using signals _within_ each phase, make the phases themselves reactive. Most phases become lazy computeds that only recompute when their inputs change.

### Current pipeline: 8 explicit phases

```
measure → layout → scroll → sticky → scrollRect → notify → content → output
```

Each phase is a tree walk. Even with dirty flags, the phase structure is rigid — every frame runs the same sequence.

### Design F: 2 explicit phases + lazy computeds

```typescript
import { signal, computed, effect, batch } from "alien-signals"

function createReactiveNode(node: AgNode, parent: ReactiveNode | null) {
  // === WRITABLE STATE (set by reconciler) ===
  const props = signal(node.props) // all props as one signal
  const children = signal(node.children) // child array
  const text = signal(node.textContent) // text content

  // Categorized version signals (for fast path selection)
  const contentVersion = signal(0)
  const styleVersion = signal(0)
  const layoutVersion = signal(0)
  const bgVersion = signal(0)
  const childStructureVersion = signal(0)
  const renderVersion = signal(0) // bumped after rendering

  // === MEASURE (was Phase 1 — now lazy) ===
  const intrinsicSize = computed(() => {
    if (!needsMeasure(props())) return null
    return measureNode(text(), props()) // only runs when text/props change
  })

  // === LAYOUT (was Phase 2 — now lazy) ===
  // Flexily remains imperative internally, but wrapped in computed
  const boxRect = computed(() => {
    const p = props()
    const parentRect = parent?.boxRect()
    const siblings = parent?.children()
    const mySize = intrinsicSize()
    return flexilyLayout(p, parentRect, siblings, mySize)
  })

  // Layout changed this frame (replaces layoutChangedThisFrame flag)
  const prevBoxRect = signal<Rect | null>(null)
  const layoutChanged = computed(() => {
    const prev = prevBoxRect()
    const curr = boxRect()
    return prev !== null && !rectEqual(prev, curr)
  })

  // === SCROLL (was Phase 3 — now lazy) ===
  const scrollOffset = computed(() => {
    if (props().overflow !== "scroll") return 0
    const requested = props().scrollTo ?? 0
    const maxScroll = totalChildrenHeight() - boxRect().height
    return clamp(requested, 0, maxScroll)
  })

  // === SCREEN RECTS (was Phase 5 — now lazy) ===
  const screenRect = computed(() => {
    const rect = boxRect()
    const ancestorScroll = parent?.accumulatedScrollOffset() ?? 0
    return { ...rect, y: rect.y - ancestorScroll }
  })

  const accumulatedScrollOffset = computed(() => {
    const parentOffset = parent?.accumulatedScrollOffset() ?? 0
    return parentOffset + scrollOffset()
  })

  // === DIRTY CATEGORIZATION (from Design D) ===
  const isDirty = computed(
    () =>
      contentVersion() > renderVersion() ||
      styleVersion() > renderVersion() ||
      layoutVersion() > renderVersion() ||
      childStructureVersion() > renderVersion() ||
      bgVersion() > renderVersion(),
  )

  const isStyleOnly = computed(
    () =>
      styleVersion() > renderVersion() &&
      contentVersion() <= renderVersion() &&
      layoutVersion() <= renderVersion() &&
      childStructureVersion() <= renderVersion() &&
      bgVersion() <= renderVersion(),
  )

  const isBgOnly = computed(
    () =>
      bgVersion() > renderVersion() &&
      contentVersion() <= renderVersion() &&
      styleVersion() <= renderVersion() &&
      layoutVersion() <= renderVersion() &&
      childStructureVersion() <= renderVersion(),
  )

  // === TREE AGGREGATES (from Design B/E) ===
  // These use reactiveTree's tree-scoped computeds
  const subtreeDirty = tree.descendants((s) => s.isDirty).some()
  const hasLayoutDirtyInSubtree = tree.descendants((s) => s.layoutChanged).some()
  const ancestorLayoutChanged = tree.ancestors((s) => s.layoutChanged).some()
  const ancestorHasBg = tree.ancestors((s) => !!s.props().backgroundColor).first()

  // === CONTENT AREA ANALYSIS (replaces cascade formulas) ===
  const contentAreaAffected = computed(
    () =>
      contentVersion() > renderVersion() ||
      layoutChanged() ||
      hasChildPositionChanged() ||
      childStructureVersion() > renderVersion() ||
      bgVersion() > renderVersion(),
  )

  // inheritedBg — declarative, no tree walk at render time
  const inheritedBg = computed(() => {
    const ownBg = props().backgroundColor
    if (ownBg) return ownBg
    return parent?.inheritedBg() ?? null
  })

  return {
    props,
    children,
    text,
    contentVersion,
    styleVersion,
    layoutVersion,
    bgVersion,
    childStructureVersion,
    renderVersion,
    intrinsicSize,
    boxRect,
    layoutChanged,
    prevBoxRect,
    scrollOffset,
    screenRect,
    accumulatedScrollOffset,
    isDirty,
    isStyleOnly,
    isBgOnly,
    subtreeDirty,
    hasLayoutDirtyInSubtree,
    ancestorLayoutChanged,
    contentAreaAffected,
    inheritedBg,
  }
}

// === THE PIPELINE: only 2 explicit phases remain ===

function executeFrame(root: ReactiveNode, buffer: TerminalBuffer) {
  // Phase 1: CONTENT RENDER
  // Walk only dirty subtrees. All layout/scroll/screen rects are
  // lazy computeds — accessed on demand during render, recomputed
  // only if their inputs changed.
  renderSubtree(root, buffer)

  // Phase 2: OUTPUT
  // Diff buffer, emit ANSI. Same as today.
  outputPhase(prevBuffer, buffer)

  // Post-frame: sync prevBoxRect for next frame's layoutChanged
  syncPrevRects(root)
}

function renderSubtree(node: ReactiveNode, buffer: TerminalBuffer) {
  if (!node.isDirty() && !node.subtreeDirty()) return // skip entire subtree

  if (node.isDirty()) {
    // Reading screenRect() triggers lazy layout recomputation if needed
    const rect = node.screenRect()

    if (node.isBgOnly()) {
      buffer.fillBg(rect, node.props().backgroundColor)
    } else if (node.isStyleOnly()) {
      buffer.restyleRegion(rect, computeStyle(node.props()))
    } else {
      renderNodeFull(node, buffer, rect)
    }

    // Mark as rendered
    node.renderVersion(
      Math.max(
        node.contentVersion(),
        node.styleVersion(),
        node.layoutVersion(),
        node.childStructureVersion(),
        node.bgVersion(),
      ),
    )
  }

  // Recurse into dirty children
  for (const child of node.children()) {
    renderSubtree(child, buffer)
  }
}
```

### What dissolves

| Current phase | In Design F                   | How                                                |
| ------------- | ----------------------------- | -------------------------------------------------- |
| measure       | Lazy computed `intrinsicSize` | Only runs when text/props actually change          |
| layout        | Lazy computed `boxRect`       | Only runs when props or parent rect change         |
| scroll        | Lazy computed `scrollOffset`  | Only runs when scrollTo or children heights change |
| sticky        | Computed from scroll signals  | Position derives from scroll + layout              |
| scrollRect    | Lazy computed `screenRect`    | Derives from boxRect - ancestor scroll offsets     |
| notify        | Effect on `boxRect`           | `useBoxRect()` subscribes to the signal directly   |
| **content**   | **Explicit phase (kept)**     | Walks dirty subtrees, reads lazy computeds         |
| **output**    | **Explicit phase (kept)**     | Buffer diff, ANSI emission (unchanged)             |

### How Flexily integrates

Flexily stays imperative internally — it does constraint-based layout that doesn't map well to pure signal composition. But we **wrap** Flexily:

```typescript
// The Flexily wrapper — one computed per node, cached automatically
const boxRect = computed(() => {
  // This computed depends on:
  // - props() (flex props)
  // - parent.boxRect() (available space)
  // - children sizes (for fit-content)
  // When NONE change, the computed returns cached rect — zero cost.
  // When ANY change, Flexily recalculates this subtree.

  const node = flexilyNode(props())
  node.parent = parent?.flexilyNode
  flexily.calculateLayout(node, parent?.boxRect().width ?? termWidth)
  return { x: node.left, y: node.top, width: node.width, height: node.height }
})
```

**Key insight**: Flexily's `calculateLayout` already works bottom-up through the flex tree. Making `boxRect` a computed means only _affected_ subtrees recalculate. A style change on node A doesn't trigger Flexily for node B's subtree — the computed short-circuits because B's inputs haven't changed.

### inheritedBg becomes a signal chain

Today: `findInheritedBg()` walks up the tree at render time (O(depth) per text node).

Design F: `inheritedBg = computed(() => props().backgroundColor ?? parent?.inheritedBg())` — evaluated once, cached, automatically invalidated when any ancestor's bg changes. O(1) reads during render.

### The hasPrevBuffer/ancestorCleared cascade simplifies

Today: 5 interdependent booleans propagated through function parameters.

Design F: the entire cascade is implicit in the version signals:

```typescript
// "Does this node need fresh render?" = "has any version changed since last render?"
// The buffer clone gives us hasPrevBuffer automatically.
// ancestorCleared dissolves into: "did any ancestor's contentAreaAffected change?"
const needsFreshContent = computed(
  () => isDirty() || ancestorLayoutChanged() || parent?.contentAreaAffected() || parent?.needsFreshContent(),
)
```

The cascade formulas from the current CLAUDE.md (contentRegionCleared, childrenNeedFreshRender, skipBgFill) become 3 simple computeds that derive from other computeds. No manual propagation.

### The notify phase becomes a signal subscription

Today: `useBoxRect()` stores callbacks in `layoutSubscribers`, notified by explicit `notifyLayoutSubscribers` phase.

Design F: `useBoxRect()` subscribes to `node.screenRect()` directly. When layout changes, the computed updates, the subscription fires. No explicit notify phase.

```typescript
function useBoxRect(): Rect {
  const node = useAgNode()
  const reactive = getReactiveNode(node)
  // React integration: useSyncExternalStore subscribes to the computed
  return useSyncExternalStore(
    (cb) =>
      effect(() => {
        reactive.screenRect()
        cb()
      }),
    () => reactive.screenRect(),
  )
}
```

### Scroll containers

The three-tier scroll strategy (buffer shift, viewport clear, subtree-only) maps to signals:

```typescript
const scrollDelta = computed(() => scrollOffset() - prevScrollOffset())
const scrollOnly = computed(() => scrollDelta() !== 0 && !subtreeDirty() && !childStructureVersion())
const needsViewportClear = computed(
  () => childStructureVersion() > renderVersion() || (scrollDelta() !== 0 && hasStickyChildren()),
)
```

Tier selection becomes a computed read, not a tree walk.

### Pros

- **8 phases → 2 explicit + 6 lazy computeds**: dramatic simplification
- **Layout-on-demand is automatic**: if no layout props changed, `boxRect` returns cached — no skip logic needed
- **inheritedBg is O(1)**: signal chain vs O(depth) tree walk
- **The cascade formulas dissolve**: 5 booleans become 3 computeds
- **notify phase disappears**: direct signal subscription
- **Adding new pipeline features is trivial**: new computed, automatic invalidation
- **Scroll tier selection is declarative**: computed, not imperative tree walk

### Cons

- **Flexily wrapping is the hardest part**: constraint propagation interacts with the computed graph. A single dirty node in a flex container forces all siblings to recalculate (flex distributes space among siblings). This means the `boxRect` computed's dependency on `siblings` creates O(siblings) invalidation per dirty node in a flex row. Pro's review flagged this — "the real complexity is path to root plus affected sibling sets."
- **Memory**: more computeds per node than Design E. ~15 computeds × 1000 nodes = 15,000 signals. Need to measure alien-signals overhead.
- **React integration boundary**: `useSyncExternalStore` + `effect()` bridge is the most delicate part. Must not trigger re-renders outside React's commit phase.
- **Debugging**: reactive graphs are harder to debug than explicit phase execution. Need good dev tools (signal graph visualization, dependency tracing).
- **Scroll containers are the acid test**: the three-tier strategy has edge cases that took months to stabilize. Making it reactive could re-introduce bugs if the signal dependencies don't perfectly model the imperative logic.

### Risk: Flexily sibling invalidation

The biggest risk. In a flex container with 5 columns:

```
[Col1 flexGrow=1] [Col2 flexGrow=1] [Col3 flexGrow=1] [Col4 flexGrow=1] [Col5 flexGrow=1]
```

If Col3's content changes height, Flexily must recalculate ALL 5 columns (flex redistributes the remaining space). This means Col3's `boxRect` computed invalidates → triggers `calculateLayout` → updates ALL siblings' rects.

This is fine for correctness, but means "O(dirty node)" is really "O(dirty node + siblings in each affected flex container up to root)." For a deeply nested layout, one change can cascade through several flex containers.

**Mitigation**: Flexily can return early if the _result_ didn't change. If Col3's height change doesn't affect the flex distribution (e.g., it's still smaller than the container), the other columns' `boxRect` computeds get the same value and their subscribers don't fire. alien-signals has this optimization built in (computed returns same value → no downstream notifications).

## Evaluation (updated)

| Design                         | Ergonomics      | Performance        | Handles tree? | Fast paths? | Phases | Complexity                        |
| ------------------------------ | --------------- | ------------------ | ------------- | ----------- | ------ | --------------------------------- |
| A (alien-signals)              | Good            | Good               | ❌            | ✅          | 8      | Low                               |
| B (reactiveTree)               | Excellent       | ?                  | ✅            | ❌          | 8      | Medium                            |
| C (version counting)           | OK              | Excellent          | ❌            | ❌          | 8      | Very low                          |
| D (hybrid versions+signals)    | Very good       | Good               | ❌            | ✅          | 8      | Medium                            |
| E (D + reactiveTree)           | Excellent       | Good               | ✅            | ✅          | 8      | Medium                            |
| **F (full reactive pipeline)** | **Outstanding** | **Good-Excellent** | **✅**        | **✅**      | **2**  | **High initially, low long-term** |

### Design F vs Design E — when to stop

Design E is the _safe_ choice: signals within the existing phase structure. The pipeline stays familiar. Risk is low.

Design F is the _ambitious_ choice: phases dissolve into the reactive graph. Dramatically simpler long-term but harder to get right initially. The Flexily wrapping and scroll container reactification are the hard parts.

**Recommendation**: implement Design E first (Phases 1-3 of the bead). If it works and the ergonomics are good, evaluate whether Design F's additional simplification is worth the Flexily wrapping complexity. Design E can evolve into Design F incrementally — they're not incompatible.

## /big Analysis — Key Insights

Analysis against 15 hypotheses revealed critical improvements to the design.

### H3: cascade-predicates.ts IS the migration surface

The existing `computeCascade()` already extracts the 14-input → 7-output boolean algebra into a pure function. Making its inputs reactive and its outputs computed is _mechanical_. This preserves the battle-tested truth table while getting automatic invalidation.

### H4: tree-walking computeds are O(n) per read (CRITICAL)

`tree.descendants(s => s.isDirty).some()` walks the _entire_ subtree on every read. For the root of 1000 nodes, that's O(1000). SolidJS and Vue 3 avoid tree aggregates by design.

**Better**: incremental aggregation. Each node maintains a `dirtyChildCount` signal, incremented when a descendant becomes dirty, decremented when it becomes clean. `subtreeDirty = dirtyChildCount > 0` is O(1) per read, O(depth) per write. Matches current flag propagation cost but with automatic cleanup.

### H7: buffer validity token replaces 3 booleans

hasPrevBuffer, ancestorCleared, ancestorLayoutChanged represent one concept: "can this subtree trust the cloned buffer?" Replace with `BufferValidity = "trusted" | "cleared" | "shifted" | "fresh"` — one inherited signal.

### H10: batch at reconciler boundary (trivial)

`startBatch()/endBatch()` around the reconciler commit phase ensures zero intermediate recomputations. 4 lines of code.

### H13: reactiveTree.rebind() is O(all-computeds)

When a child mounts/unmounts, `rebind()` invalidates _every_ tree-walking computed in the graph. Scoped invalidation needed — each node's tree computeds should depend on its own parent/children signals, not a global version.

### H14: dirty set eliminates tree walk (REFRAME)

Instead of walking the tree to find dirty nodes, maintain a `dirtySet`. The render phase iterates only dirty nodes, reading `screenRect()` (lazy computed) on demand. Browser compositors do this — "needs paint" list rather than DOM walk.

### H8: SILVERY_STRICT is the shadow oracle

Existing `SILVERY_STRICT=1` compares incremental vs. fresh cell-by-cell. No new infrastructure needed for migration.

## Recommendation (final)

1. **Phase 0**: prototype React-signals boundary + batching (2 days)
2. **Phase 1**: wrap cascade-predicates inputs as signals, outputs as computeds — _mechanical, preserves truth table_ (1 week)
3. **Phase 2**: incremental dirtyChildCount aggregation — replaces O(n) tree walks (1 week)
4. **Phase 3**: dirty set for render phase — eliminates tree walk entirely (1 week)
5. **Phase 4**: buffer validity token — simplifies 3 params → 1 signal (days)
6. **Phase 5**: lazy layout computeds (Design F Flexily wrapping) — only if needed (2 weeks)
7. **Phase 6**: paint list / display list — only if Phase 5 isn't enough (3 weeks)

Each step is independently valuable and shadow-oracle testable via SILVERY_STRICT.

## /pro Review — Key Corrections (Round 1)

GPT 5.4 Pro review identified several critical issues.

### FATAL: version math is wrong

The `renderVersion = max(contentVersion, styleVersion, ...)` scheme breaks with independent counters:

```
styleVersion = 100, renderVersion = 100
contentVersion increments 1 → 2
contentVersion() > renderVersion() = 2 > 100 = FALSE ← MISSED UPDATE
```

**Fix**: use a single **global monotonic epoch**. Each category stores "last changed epoch":

```typescript
let epoch = 0
function nextEpoch() {
  return ++epoch
}

// Reconciler: contentChangedAt = nextEpoch()
// Render: lastRenderedAt = currentEpoch
// isDirty = contentChangedAt > lastRenderedAt || styleChangedAt > lastRenderedAt || ...
```

This makes all version comparisons correct regardless of category ordering.

### Layout must be container-level, not child-level

The Design F `boxRect = computed(() => flexilyLayout(... siblings ...))` per child is wrong. Flex layout is container-level — a child's rect depends on the entire sibling set.

**Fix**: one computed per container:

```typescript
const layoutResult = computed(() => {
  const childSizes = children().map((c) => c.intrinsicSize())
  return flexily.calculateLayout(containerProps(), parentAvailableSize(), childSizes)
})

// Each child derives from the container result:
const boxRect = computed(() => parent.layoutResult().childRects.get(nodeId))
```

This correctly bounds invalidation to: path to root + affected flex containers.

### Frame stabilization barrier is still needed

Measure → layout → scroll involves feedback loops (wrapped text height depends on available width, scrollbar visibility changes viewport). Full lazy read-during-paint risks inconsistent snapshots.

**Fix**: keep explicit barriers. Signals within phases, not replacing phases:

```
[reactive invalidation] → measure barrier → layout barrier → scroll planner → content → output
```

### Ancestor-induced invalidation doesn't disappear

"Did the parent's repaint destroy or shift the child's retained pixels?" is not captured by `child.isDirty || child.subtreeDirty`. The cascade is encoded differently in signals but still exists.

### Recommendation: Design E+

E+ = reactive invalidation + explicit frame/layout/scroll planning:

- Categorized invalidation via signals
- Global epoch for version correctness
- Container-level memoized layout
- Tree aggregates (with incremental counters, not O(n) walks)
- **Explicit** measure/layout/paint/output barriers remain
- **Explicit** scroll/damage planner (not dissolved)
- Previous-frame snapshot commit

### Prior art to steal from

- **Flutter render tree**: `markNeedsLayout`, `markNeedsPaint`, relayout/repaint boundaries
- **Blink/Gecko**: retained display lists, old bounds ∪ new bounds damage
- **Adapton**: self-adjusting computation (reactive with dynamic dependency graphs)
- **Jetpack Compose / SwiftUI**: reactive composition, explicit layout/paint phases

**Key lesson**: reactivity is excellent for dependency tracking; engines still keep explicit layout/paint boundaries.

### Shadow oracle: dual compute, single paint

- Old engine decides actual paint
- New engine computes planned layout/damage/skip
- Diff decisions, log minimal counterexample tree
- Safer than dual rendering every frame

## /big Round 2 — Phase 0 Breakthrough

### H20: Epoch-stamped flags eliminate clearDirtyFlags walk (HIGHEST VALUE)

Instead of boolean `contentDirty`, store `contentDirtyEpoch: number`. A flag is "set" when `node.contentDirtyEpoch === globalEpoch`. The reconciler writes the current epoch. The render phase "clears" ALL flags by incrementing `globalEpoch`. The O(N) `clearDirtyFlags` walk (touching every node in skipped subtrees) becomes `globalEpoch++`.

```typescript
// Before: O(N) clear walk per frame
function clearDirtyFlags(root: AgNode) {
  for (const node of depthFirst(root)) {
    // visits ALL nodes
    node.contentDirty = false
    node.stylePropsDirty = false
    node.bgDirty = false
    node.childrenDirty = false
    node.layoutDirty = false
    node.subtreeDirty = false
    node.layoutChangedThisFrame = false
  }
}

// After: O(1) clear
let renderEpoch = 0
function clearAllFlags() {
  renderEpoch++
}

// Flag check: same semantics, different encoding
const isDirty = node.contentDirtyEpoch === renderEpoch // was: node.contentDirty
```

### H17: subtreeDirty upward walk IS the incremental counter

The current layout phase walks up from dirty nodes setting `subtreeDirty = true`, short-circuiting at first already-dirty ancestor. This is already O(depth), matching the incremental counter pattern. The real win isn't incrementalizing the _set_ — it's eliminating the O(subtree) _clear_. With epochs, the clear is a no-op.

### H19: cascade-predicates.ts is the oracle, not the target

Don't replace cascade-predicates — use them as the shadow oracle. E+ decides what to skip, independently `computeCascade()` verifies, STRICT asserts equivalence.

### H21: category-specific epochs for layout vs render

`subtreeDirty` is set by layout phase AND reconciler. If layout and render share one epoch, render-phase clear would also "clear" layout-phase flags not yet consumed. Fix: `layoutEpoch` and `renderEpoch` — both monotonic, bumped at different phase boundaries.

### H22: dirty set IS the epoch-stamped flags

No separate `Set<AgNode>` needed. The render phase tree walk already visits via `subtreeDirty` paths. A node is dirty when any `*DirtyEpoch === currentEpoch`. The dirty set is implicit in the epoch stamps.

### H23: Phase 0 prototype — zero behavioral change

The simplest thing that could work:

1. Add `renderEpoch: number` to pipeline context
2. Change each boolean dirty flag to a number (epoch stamp)
3. Flag reads: `node.contentDirty` → `node.contentDirtyEpoch === epoch`
4. Flag sets: `node.contentDirty = true` → `node.contentDirtyEpoch = epoch`
5. Replace `clearDirtyFlags()` subtree walk with `epoch++`
6. Run STRICT — zero behavioral change

This is purely mechanical. No cascade changes. No layout restructuring. No signals yet. Just epoch-stamped flags. Expected improvement: measurable on 500+ node trees where clearDirtyFlags walks hundreds of nodes per frame.

## Final Recommendation (post /big R1 + /pro + /big R2)

### Phase 0: Epoch-stamped flags (days)

- Change boolean flags → epoch numbers
- Eliminate O(N) clearDirtyFlags walk
- STRICT validates: zero behavioral change
- Audit each flag's lifetime matches its clear boundary
- Edge cases: fresh/removed nodes, no mutation during render, truthiness bugs

### Phase 1: Category-specific epochs (1 week)

- Partition epochs by clear boundary/owner, not just subsystem:
  - **invalidateEpoch**: reconciler-owned (contentDirty, styleDirty, childrenDirty, bgDirty)
  - **layoutEpoch**: layout-produced (layoutChanged, childPositionChanged)
  - **bufferEpoch**: what snapshot the cached buffer corresponds to
- Rule: flags cleared together share an epoch. Different lifetimes → different epochs.

### Phase 1.5: Complete skip/buffer-validity oracle (days)

- Enumerate ALL reasons a cached buffer is invalid (Pro's #1 risk)
- Enumerate ALL non-local dependencies that force repaint
- Document which phase owns each fact and when it clears
- Extend cascade-predicates.ts to cover scroll offset, bg interactions, absolute positioning
- This prevents "beautifully incremental and wrong"

### Phase 2: Reactive cascade derivations (1 week)

- alien-signals behind thin adapter (`@silvery/signals` already wraps)
- Coarse graph: one computed per node or per container
- isDirty, isStyleOnly, isBgOnly as computeds
- startBatch/endBatch around reconciler commit (4 lines)

### Phase 3: Container-level layout memoization (1 week)

- `container.layoutResult()` as one computed per flex container
- Children derive boxRect from parent result
- inheritedBg as computed chain (O(1) reads)
- useBoxRect via useSyncExternalStore

### EVALUATE — stop here if good enough

- If cascade bugs eliminated and ergonomics improved: DONE
- If subtree traversal still hot: Phase 4
- If more perf needed: paint list (Phase 5+)

### Phase 4: Incremental dirtyChildCount + dirty set (1 week, only if needed)

- subtreeDirty as O(1) counter read
- Buffer validity token (3 booleans → 1 enum)
- Render phase driven by dirty set traversal

### Phase 5+: Paint list / Design F lazy computeds (only if Phase 4 isn't enough)

Each phase: shadow oracle via SILVERY_STRICT, independently shippable.

## Options Landscape — End-to-End Reactive Graph

Full comparison of all approaches, from safest to most ambitious:

| Option                  | What                                          | Reward                                        | Risk                                      | Cost        | Ceiling                          |
| ----------------------- | --------------------------------------------- | --------------------------------------------- | ----------------------------------------- | ----------- | -------------------------------- |
| **0: Epoch flags**      | Boolean → epoch numbers, O(1) clear           | Immediate perf, zero behavioral change        | Almost none                               | Days        | Same complexity, better perf     |
| **1: E+**               | Epoch + alien-signals cascades                | Declarative cascades, correct by construction | Medium (memory, batching)                 | 4–6 weeks   | 25–40× pipeline, no cascade bugs |
| **2: Design F**         | Phases → lazy computeds                       | 8→2 phases, dramatic simplification           | HIGH (Flexily wrapping, stabilization)    | 2–3 months  | 100×+ theoretical                |
| **3: Reactive Flexily** | Signal wrapper around Flexily                 | Truly incremental layout                      | HIGH (sibling invalidation, measure loop) | 2–4 weeks   | Unlocks Design F                 |
| **4: End-to-end graph** | One signal graph: app→layout→render→output    | Theoretical maximum, zero manual coordination | VERY HIGH (4 system boundaries)           | 3–6 months  | Unlimited                        |
| **5: SolidJS target**   | Replace React reconciler with signal compiler | Eliminate React 30% ceiling                   | EXTREME (new framework)                   | 6–12 months | Maximum perf possible            |

### Recommended path (confirmed)

**E+ first, plus reactive Flexily wrapper.**

#### E+ Pipeline (signals for dirty tracking)

| Phase   | What                                            | Effort | Expected impact                              |
| ------- | ----------------------------------------------- | ------ | -------------------------------------------- |
| **0**   | Epoch-stamped flags, O(1) clear                 | Days   | Eliminates O(N) clearDirtyFlags walk         |
| **1**   | Category-specific epochs (layout/render/buffer) | 1 week | Correct flag lifecycle management            |
| **1.5** | Complete skip/buffer-validity oracle            | Days   | Prevents "beautifully incremental and wrong" |
| **2**   | Reactive cascade derivations (alien-signals)    | 1 week | Declarative isDirty/isStyleOnly/isBgOnly     |
|         | **EVALUATE**                                    |        | Stop if cascade bugs eliminated              |
| **3**   | dirtyChildCount + buffer validity token         | 1 week | O(1) subtreeDirty reads                      |

#### Reactive Flexily (signals for layout)

| Phase  | What                                | Effort    | Expected impact                          |
| ------ | ----------------------------------- | --------- | ---------------------------------------- |
| **F0** | Layout-on-demand gate               | Days      | Skip 38% of pipeline when no layoutDirty |
| **F1** | Container-level signal wrapper      | 1–2 weeks | Only dirty containers recalculate        |
| **F2** | inheritedBg as computed chain       | Days      | O(1) bg reads vs O(depth) tree walk      |
| **F3** | useBoxRect via useSyncExternalStore | Days      | Eliminate notify phase entirely          |

**E+ and Flexily phases are independent tracks** — they can proceed in parallel or interleaved.

#### Flexily Architecture Decision

Flexily stays imperative internally (11-phase constraint solver, zero-alloc design, fingerprint caching). Signals wrap at the container boundary:

```typescript
// Container-level wrapper — Flexily's internals untouched
const layoutResult = computed(() => {
  // Depends on: container flex props + children's intrinsic sizes
  // Flexily handles constraint solving imperatively
  root.calculateLayout(availableWidth, availableHeight, direction)
  return extractChildRects(root)
})

// Each child derives its rect from parent's result
const boxRect = computed(() => parent.layoutResult().childRects.get(nodeId))
```

The wrapper is **layout-engine-agnostic** — it works with Flexily, Yoga, Taffy, or any future engine. Silvery already supports Yoga as a pluggable engine. The computed wraps the API boundary, not the internals.

Why wrapper not rewrite:

- Flexily's constraint solver (2000 LOC) is deeply mutative — not expressible as signal graph
- Zero-alloc design (pre-allocated arrays, FlexInfo mutation) would regress with signal overhead
- Fingerprint caching (5.5× skip optimization) works on 6-field exact comparison — faster than signal deps
- The bottleneck is calling Flexily when nothing changed, not Flexily's dirty tracking

#### Later options (only if needed)

| Phase                     | What                        | When                                     |
| ------------------------- | --------------------------- | ---------------------------------------- |
| Paint list / display list | O(changed) rendering        | If E+ + Flexily wrapper < 100×           |
| Design F dissolution      | 8→2 explicit phases         | If phase barriers still cause complexity |
| @silvery/solid            | Eliminate React 30% ceiling | v2.0, if React becomes the bottleneck    |

The vision: one `@silvery/signals` graph from app state to terminal cells. React is the user API (front door). Signals are the engine room. Flexily is wrapped at the container level. Each step is independently shippable and shadow-oracle testable.

## Design G: Two-Level Reactive Graph — Content to Cells

The full reactive vision. Two interconnected signal graphs:

### Level 1: Component tree graph (per node)

```
props() → flexConstraints → Flexily layout → boxRect() → screenRect()
```

Each JSX component is a node in this graph. Layout flows top-down (constraints) and bottom-up (sizes). Flexily remains imperative internally but wrapped at container level.

### Level 2: Text internals graph (per text node)

```
text() → preparedText() → intrinsicSize() ←→ boxRect().width → wrappedLines() → renderedCells()
```

Text processing happens entirely within the signal graph. The measure callback reads `preparedText()` (cached). The render reads `wrappedLines()` (cached per width).

### The connection

Level 2's `intrinsicSize()` feeds into Level 1's Flexily layout (measure callback). Level 1's `boxRect().width` feeds into Level 2's `wrappedLines()`. This is a bidirectional dependency that Flexily resolves via iterative constraint solving — but each individual signal read is still O(1).

### Architecture diagram

```
Level 1 (tree)                         Level 2 (text)
──────────────                         ──────────────
React creates tree structure           text content signal
    │                                       │
    ├→ props signal                         ├→ preparedText (CACHED)
    │      │                                │   graphemes, widths, breakpoints
    │      ├→ flex constraints              │      │
    │      │      │                         │      ├→ intrinsicSize → feeds Flexily
    │      │      ├→ Flexily layout         │      │
    │      │      │      │                  │      ├→ wrappedLines(width) (CACHED per width)
    │      │      │      ├→ boxRect ────────┤      │      │
    │      │      │      │                  │      │      ├→ renderedCells (CACHED)
    │      ├→ screenRect │                  │      │      │      │
    │      │      │      │                  │      │      │      └→ buffer cells
    │      ├→ inheritedBg (CACHED)          │      │      │
    │      │                                │      ├→ bgRuns + styleRuns (render metadata)
    └→ style signal                         │
           │                                └→ childSpans (inline rects)
           └→ renderedCells for non-text nodes
```

### PreparedText: the shared text analysis cache

Pro-reviewed architecture (two tiers):

```typescript
interface PreparedTextCore {
  text: string // visible text (ANSI stripped)
  graphemes: string[] // segmented clusters
  widths: number[] // display width per grapheme
  cumWidths: number[] // prefix sums for O(log n) width queries
  breakpoints: number[] // word-break opportunity indices
  wrapMemo: Map<number, WrapResult> // width → line breaks (cached per width)
}

interface PreparedTextRender {
  bgRuns: BgRun[] // grapheme-index based bg segments
  childSpans: ChildSpan[] // grapheme-index based inline rects
  styleRuns: StyleRun[] // ANSI/inline style segments
}
```

- **Core** is width-invariant, shared by measure and render
- **Render metadata** is built lazily on first render
- **Wrap results** are memoized per width (measure probes multiple widths)
- Both are computed signals — invalidated automatically when text changes

### Invalidation levels

| Change                | What recomputes                                                      | What's cached                      |
| --------------------- | -------------------------------------------------------------------- | ---------------------------------- |
| Text content          | preparedText → intrinsicSize → layout → wrappedLines → renderedCells | Nothing                            |
| Style (color/bold)    | renderedCells only                                                   | preparedText, layout, wrappedLines |
| Width (resize)        | wrappedLines → renderedCells                                         | preparedText, intrinsicSize        |
| Cursor move (inverse) | 2 nodes' renderedCells                                               | Everything else                    |

### Implementation sequence

Each step is independently valuable and benchmarkable:

| Step   | What                                                            | Depends on              | Expected impact                                           |
| ------ | --------------------------------------------------------------- | ----------------------- | --------------------------------------------------------- |
| **G1** | `preparedText = computed(text)` — shared text analysis          | Existing reactive infra | Eliminate redundant text processing. 15-30% on text-heavy |
| **G2** | Measure callback reads `preparedText()`                         | G1                      | Layout 38% → 20-28% (Pro estimate)                        |
| **G3** | `wrappedLines = computed(preparedText, width)`                  | G1 + G2                 | Render avoids re-wrapping unchanged text                  |
| **G4** | `renderedCells = computed(wrappedLines, style)`                 | G3                      | Content 20% → 12-16% (Pro estimate)                       |
| **G5** | Lazy boxRect via epoch-synced snapshot                          | Independent             | Eliminate propagateLayout tree walk                       |
| **G6** | Connect to buffer: `effect(renderedCells → buffer.writeRegion)` | G4                      | Render phase becomes effect-driven                        |

### What this replaces

| Current                                                     | Design G                                 |
| ----------------------------------------------------------- | ---------------------------------------- |
| `collectPlainText` (measure) + `collectTextWithBg` (render) | One `preparedText` computed              |
| `wrapText` (measure) + `formatTextLines` (render)           | One `wrappedLines` computed per width    |
| `renderGraphemes` (imperative buffer writes)                | `renderedCells` computed → buffer effect |
| `propagateLayout` tree walk                                 | Lazy boxRect reads                       |
| Manual text cache invalidation                              | Automatic via signal dependencies        |

### Framework-agnostic signal graph

The signal graph (preparedText, wrappedLines, boxRect, renderedCells) is framework-agnostic. It doesn't depend on React or Solid — it's pure `@silvery/signals`.

The difference between frameworks is the **adapter thickness**:

| Framework    | Adapter                     | What it does                                    | Overhead        |
| ------------ | --------------------------- | ----------------------------------------------- | --------------- |
| **React**    | Thick (reconciler)          | Reconciles virtual tree, then writes to signals | 30% of pipeline |
| **SolidJS**  | Thin (compiler)             | Compiles JSX directly to signal writes          | ~0%             |
| **Svelte 5** | Medium (compiler + runtime) | Compiles to fine-grained updates                | ~5%             |

The signal graph is **the same** regardless of adapter. Building it for React means `@silvery/solid` becomes a thinner adapter into the same graph — the 30% React overhead disappears without changing any pipeline code.

```
React adapter:   commitUpdate → writes to signal graph → pipeline computeds → buffer
Solid adapter:   JSX compiles → writes to signal graph → pipeline computeds → buffer
                                 ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                 This part is shared — same code, same signals
```

This is the architectural payoff: the signal graph is the platform; frameworks are just input adapters.

### Risk assessment

| Risk                                 | Severity       | Mitigation                                                              |
| ------------------------------------ | -------------- | ----------------------------------------------------------------------- |
| Signal overhead for 1000+ text nodes | Medium         | Measure: ~15 computeds/text node × 200 text nodes = 3000 signals        |
| Flexily measure callback timing      | Medium         | Flexily calls measure synchronously; computed reads are synchronous too |
| ANSI text parsing in signal graph    | Low            | Parse once in preparedText, store as styleRuns                          |
| Wrap memo memory                     | Low            | LRU eviction after N entries per node                                   |
| React integration                    | Already solved | Existing alien-signals + SILVERY_REACTIVE infrastructure                |
