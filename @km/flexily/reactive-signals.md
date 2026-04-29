---
id: "@km/flexily/reactive-signals"
aliases:
  - km-flexily.reactive-signals
  - km-flexily-reactive-signals
created_by: Bjørn Stabell
created_at: 2026-04-12T16:50:30Z
---

# [ ] withSignals() plugin — optional reactive layout outputs @km/flexily #feature #P4

blocks:: [[@km/flexily]]

Add a withSignals() plugin to Flexily that wraps layout nodes with reactive signal outputs. alien-signals as peer dep — zero cost for imperative consumers.

## API

import { withSignals } from "flexily/signals"

const node = withSignals(createNode())
node.computedRect()   // Signal<Rect> — auto-updated after calculateLayout
node.computedLeft()   // Signal<number>
node.computedWidth()  // Signal<number>

## Architecture

- Bundled with flexily package as subpath export: flexily/signals
- alien-signals as peerDependency (not dependency)
- withSignals() wraps a Node, intercepts layout result writes
- After calculateLayout() completes and positions are written, signals auto-update
- No sync bridge needed — Flexily IS the signal source

## Impact on silvery

Once shipped:
- @silvery/ag/rect-signals.ts becomes unnecessary (Flexily provides signals directly)
- syncRectSignals() bridge eliminated
- useBoxRect/useSignal read from Flexily signals via the adapter
- Simpler stack: Flexily → signals → useSignal → React

## Design decisions

- withSignals() vs node.enableSignals(): plugin pattern is more composable
- Per-property signals vs bundled Rect signal: provide both (computedRect as computed from L/T/W/H)
- Recursive option: withSignals(root, { recursive: true }) applies to all descendants
- isDirty stays imperative boolean — signals are for outputs only, not the layout gate