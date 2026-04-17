# Reactive Pipeline: Flexily vs Ag Signal Split

Internal design doc. Describes the two-level reactive architecture in silvery:
imperative dirty tracking in Flexily, pull-based signals in @silvery/ag,
and the one-way sync bridge between them.

Bead: km-silvery.reactive-pipeline

## The Problem

Layout engines need dirty tracking to avoid recomputing the entire tree on
every frame. The question is how that dirty tracking relates to the reactive
system that notifies UI components of layout changes.

The naive approach: wrap Flexily's `isDirty()` in a signal so the layout
engine and the UI share one reactive graph. This was explored as "Design G"
(two-level reactive graph) and rejected.

## Design G Vision: Two-Level Reactive Graph

The idea was a unified reactive graph with two tiers:

1. **Engine tier** (Flexily) -- signals track layout dirty state
2. **Consumer tier** (React/Solid/etc.) -- signals track computed rects

When a prop changes, the engine-tier signal fires, layout runs, and
consumer-tier signals emit new rects. One graph, zero manual sync.

### Why It Was Rejected

Flexily is a standalone flexbox engine. It has zero dependencies and works
in any JS environment -- browser, Node, Bun, Deno, embedded. Injecting
alien-signals as a dependency would:

1. **Couple Flexily to a specific reactive library.** alien-signals is
   excellent, but Flexily shouldn't require it. Users who want Yoga-compatible
   layout without signals would pay for an unused dependency.

2. **Create parallel dirty tracking.** Flexily already has a reliable,
   battle-tested `isDirty()` propagation: `markDirty()` walks up to the root,
   `calculateLayout()` checks `root.isDirty()`. Wrapping this in signals creates
   a second tracking system that must stay in sync with the first. This is
   exactly the class of bug we fixed by deleting `layoutDirty` from silvery's
   render flags -- a silvery-side dirty flag that duplicated Flexily's truth.

3. **Mix imperative and reactive semantics.** Flexily's layout is a batch
   operation: measure all constraints, compute all positions, emit all results.
   Signals are incremental: each write can trigger downstream effects. Running
   layout inside the reactive graph means signal effects could fire mid-layout,
   reading partially-computed positions. The batch boundary must be explicit.

## The Architecture: Imperative Engine, Reactive Consumers

Instead of one graph, two systems with a one-way bridge:

```
Flexily (imperative)              @silvery/ag (signals)              @silvery/ag-react
  markDirty() -> isDirty()    -->   syncRectSignals()           -->   useSignal() -> React
  calculateLayout()               getRectSignals(node).boxRect       useBoxRect()
                                  getNodeSignals(node).focused       useAgNode()
```

### Flexily: Imperative Dirty Tracking

Flexily owns the layout computation. Its API is procedural:

- `markDirty()` propagates up to root when a constraint changes
- `isDirty()` returns true if any descendant needs layout
- `calculateLayout()` runs the full flexbox algorithm (measure, flex, position)

This is a closed system. No signals, no subscriptions, no framework coupling.
Flexily doesn't know it's inside silvery.

### @silvery/ag: Framework-Agnostic Signals

After Flexily completes layout, silvery's pipeline calls sync functions that
copy imperative state into signals:

- **`syncRectSignals(node)`** -- called from `notifyLayoutSubscribers()` after
  layout. Copies `node.boxRect`, `node.scrollRect`, `node.screenRect` into
  writable signals. Only touches nodes that have subscribers (WeakMap lookup).

- **`syncTextContentSignal(node)`** -- called from the reconciler's
  `commitTextUpdate`. Copies `node.textContent` into a signal.

- **`syncFocusedSignal(node, focused)`** -- called from FocusManager when
  focus changes.

Signals are:

- **WeakMap-backed**: `getRectSignals(node)` lazily creates signals on first
  access. Nodes without subscribers have no signal allocation.
- **Equality-checked**: alien-signals skips downstream notifications when the
  new value equals the old. Combined with silvery's explicit `!==` check
  before writing, this eliminates redundant propagation.
- **Framework-agnostic**: signals work with React, Solid, vanilla effects,
  or any consumer that can call a function.

### @silvery/ag-react: React Bridge

The React adapter provides three layers of hooks:

**Layer 2 -- `useSignal(signal)`**: The generic bridge. Wraps any alien-signal
in a React subscription via `useLayoutEffect` + `effect()`. When the signal
value changes, the effect calls `forceUpdate()` to trigger a re-render.

**Layer 3 -- Semantic hooks**:

- `useBoxRect()` / `useBoxRect(callback)` -- inner content rect (border-box
  minus padding/border). Reactive form re-renders on change; callback form
  fires without re-rendering (for hot paths like large lists).

- `useScrollRect()` / `useScrollRect(callback)` -- scroll-adjusted position,
  pre-sticky clamping.

- `useScreenRect()` / `useScreenRect(callback)` -- actual paint position
  (the `getBoundingClientRect()` analogue).

- `useAgNode()` -- returns `{ node, signals }` for raw access to the AgNode
  and its RectSignals. Used when a component needs to subscribe to multiple
  signals or do custom reactive logic.

## The Three-Layer Stack

```
Layer 0: alien-signals (signal, computed, effect)       -- pure reactive core
Layer 1: getRectSignals, getNodeSignals                 -- @silvery/ag (framework-agnostic)
Layer 2: useSignal(signal)                              -- @silvery/ag-react (React bridge)
Layer 3: useBoxRect, useScreenRect, useAgNode           -- semantic convenience hooks
```

Each layer adds one concern:

- Layer 0: reactive primitives (read, write, subscribe, compute)
- Layer 1: per-node state mapping (which signals exist, when to sync)
- Layer 2: framework integration (signal changes -> React re-renders)
- Layer 3: semantic API (the "right" rect for the use case)

## Sync Bridge Pattern

The bridge between imperative and reactive is always the same pattern:

```
1. Imperative system mutates state (Flexily layout, reconciler commit, focus change)
2. Sync function checks if signals exist for that node (WeakMap.get, early return if not)
3. Sync function compares old and new values (reference equality or custom)
4. If changed, writes the new value to the writable signal
5. alien-signals propagates to all subscribers
```

This is a **write gate** -- the sync function controls when signals update.
Layout signals update once per frame (after the full layout pass completes).
Text and focus signals update immediately on mutation. The choice is
intentional: layout is a batch operation; text/focus are point mutations.

## G6 Deferral: Buffer Effects

During the reactive pipeline refactoring, G6 (buffer effect signals) was
explored and deferred. The idea: wrap the render buffer's dirty flags in
signals so that content changes automatically trigger re-renders of
affected screen regions.

It was deferred because:

1. **The render phase is already incremental.** Dirty flags (`contentDirty`,
   `stylePropsDirty`, `bgDirty`, `subtreeDirty`) already control which nodes
   re-render. Making them reactive doesn't add capability -- it adds a second
   mechanism tracking the same state.

2. **The output phase diffs buffers, not trees.** The ANSI output phase
   compares the current buffer with the previous buffer cell-by-cell. It
   doesn't need to know which nodes changed -- it discovers changes from
   the buffer diff. Signals would be overhead with no consumer.

3. **The render phase is a batch operation.** Like layout, rendering walks
   the tree in one pass. Injecting reactive effects mid-render could cause
   partial reads or infinite loops.

If G6 is revisited, the approach would follow the same bridge pattern:
render the full buffer, then sync dirty regions into signals for any
consumer that needs to know which screen areas changed (e.g., partial
terminal updates, damage tracking for canvas targets).

## Performance Characteristics

- **Zero cost for nodes without subscribers.** `syncRectSignals` does a
  WeakMap lookup and returns immediately if no signals exist.

- **O(n) sync per frame** where n = nodes with subscribers (typically
  a small fraction of the tree -- only nodes where a React hook called
  `getRectSignals`).

- **Equality-checked writes.** Each sync writes at most 3 values per node
  (boxRect, scrollRect, screenRect). alien-signals skips propagation when
  values are reference-equal.

- **No polling.** React hooks use `effect()` subscriptions, not interval-based
  checks. Updates are push-based from the signal graph.

## Future: What G6 Would Look Like

If buffer-level reactivity is needed (e.g., for partial terminal updates or
canvas damage tracking), it would follow the established pattern:

1. After the render phase completes, walk the buffer's dirty region list
2. For each dirty region, write the bounds to a writable signal
3. Consumers (e.g., a canvas adapter or partial-update output phase)
   subscribe to dirty region signals
4. The output phase diffing remains the fast path; signals are opt-in

This preserves the principle: imperative engines own the computation,
signals are for consumers.
