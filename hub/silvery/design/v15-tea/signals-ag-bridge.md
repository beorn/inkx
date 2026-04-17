# Framework-Agnostic ag — React + SolidJS + Signals

**Bead**: km-silvery.signals-ag-bridge
**Horizon**: v1.5 (tea) — portable app architecture
**Date**: 2026-04-09 (revised)

## Principle

**Don't invent a new API.** If it requires users to learn a silvery-specific reactive framework, it's wrong. Use existing frameworks (React, SolidJS, Svelte) and provide rendering targets for each.

## The opportunity

ag (silvery's scene graph) already has a framework-agnostic mutation API: `createNode`, `insertChild`, `updateProps`, `setText`. React drives it via `react-reconciler`. Any reactive framework can drive it the same way.

The biggest perf win comes from replacing React's O(tree) reconciliation with SolidJS's O(changed) fine-grained reactivity. But instead of building a custom signals API, we ship **`@silvery/solid`** — a SolidJS rendering target for ag. Users write standard Solid JSX with standard Solid primitives.

## Three levels (no new APIs)

### Level 1: useSignalProps — hot-path bypass within React (~1-2 weeks)

React manages the component tree. alien-signals bypass React for hot-path prop updates.

```tsx
// Standard React component — useSignalProps is the ONLY new API
// (it's a React hook, not a new framework)
function KanbanCard({ item, cursorSignal }: Props) {
  const active = computed(() => cursorSignal() === item.id)
  return (
    <Box {...useSignalProps({ borderStyle: () => (active() ? "double" : "single") })}>
      <Text {...useSignalProps({ bold: active })}>{item.title}</Text>
    </Box>
  )
}
```

**New API surface**: one hook (`useSignalProps`). Everything else is standard React + alien-signals.

**Prior art**: Preact Signals (`@preact/signals-react`) does exactly this for DOM.

### Level 2: @silvery/solid — SolidJS rendering target (~1-2 weeks)

Standard SolidJS JSX targeting ag instead of DOM. No new API — users write Solid.

```tsx
// Standard SolidJS — same as solid-js/web but for terminals
import { render } from "@silvery/solid"
import { Box, Text } from "@silvery/solid"
import { createSignal, Show, For } from "solid-js"

function KanbanCard(props: { title: string; active: boolean }) {
  return (
    <Box borderStyle={props.active ? "double" : "single"}>
      <Text bold={props.active}>{props.title}</Text>
    </Box>
  )
}

function App() {
  const [cursor, setCursor] = createSignal(0)
  const items = ["Task A", "Task B", "Task C"]

  return (
    <Box flexDirection="column">
      <For each={items}>{(item, i) => <KanbanCard title={item} active={cursor() === i()} />}</For>
    </Box>
  )
}

render(() => <App />, term)
```

**New API surface**: `@silvery/solid` package with `render()` + `Box`/`Text` components. The components mirror `@silvery/ag-react`'s props exactly. `For`, `Show`, `Switch`, `createSignal`, `createEffect` — all standard solid-js.

**What @silvery/solid provides** (equivalent of `solid-js/web`):

- `render(component, term)` — mount a Solid component tree onto a terminal
- `Box`, `Text` — ag-node-backed components with the same props as React silvery
- DOM-like host element interface that Solid's compiler targets: `createElement`, `insert`, `remove`, `spread`, `effect`

**What @silvery/solid does NOT provide** (standard Solid handles these):

- Reactive primitives (createSignal, createMemo, createEffect)
- Flow control (For, Show, Switch, Index)
- Stores, context, resources
- JSX compilation (Solid's babel/vite plugin)

### Level 3: @silvery/svelte, @silvery/vue (future, ~1-2 weeks each)

Same pattern — provide a rendering target for the framework's compiler output. No new APIs. Svelte compiles to imperative DOM operations; we provide the "DOM" (ag nodes). Vue's reactivity system can drive ag mutations via a custom renderer.

## Why SolidJS instead of custom signals

|                         | Custom silvery signals                          | SolidJS                                      |
| ----------------------- | ----------------------------------------------- | -------------------------------------------- |
| JSX                     | Need our own compiler or runtime interpretation | Solid's compiler handles it                  |
| Flow control (For/Show) | Build from scratch                              | Standard Solid                               |
| Ecosystem               | Nothing                                         | Stores, routers, i18n                        |
| Documentation           | Write from scratch                              | Extensive Solid docs                         |
| Community               | Zero                                            | Growing, funded by Netlify                   |
| DX                      | Users learn new API                             | Users know Solid (or learn a real framework) |
| Build tooling           | Custom                                          | Standard Solid vite/babel plugins            |

**The only silvery-specific code is the rendering target** (~500-1000 lines mapping Solid's host operations to ag mutations). Everything else is standard Solid.

## Performance expectations

| Scenario                    | React (current) | React + useSignalProps (L1) | SolidJS (L2) |
| --------------------------- | --------------- | --------------------------- | ------------ |
| Cursor move 500-node kanban | ~2ms            | ~0.1ms                      | ~0.05ms      |
| Single card text edit       | ~1ms            | ~0.2ms                      | ~0.1ms       |
| Full tree mount             | ~5ms            | ~5ms                        | ~3ms         |

## What silvery already has

- `@silvery/signals` — wraps alien-signals (used by L1 useSignalProps)
- ag scene graph — createNode, insertChild, updateProps, setText mutation API
- React reconciler — calls the same ag mutation API
- Dirty flags — contentDirty, layoutDirty, stylePropsDirty on ag nodes

The ag layer doesn't change. We add rendering targets, not a new framework.

## Reactive pipeline phases (signals bonus)

With signals in the pipeline (independent of user-facing framework choice), pipeline phases become computed signals that auto-skip when inputs haven't changed:

```typescript
const scrollState = computed(() => {
  const containers = scrollContainerSet()
  if (containers.size === 0) return EMPTY // auto-skip: no scroll containers
  return computeScrollOffsets(containers, layout())
})
```

This subsumes the "skip unused pipeline phases" optimization (P2, boolean flags). The signal graph IS the feature detection — automatic, per-frame, per-node granular. Boolean flags (~2 days) are the stepping stone; reactive pipeline phases (~included in L1/L2 work) are the destination.

## What needs building

### Level 1: useSignalProps (~1-2 weeks)

1. `useSignalProps(signalProps)` hook — creates effects that call `node.updateProps()` on signal changes, bypassing React setState. Access ag node via NodeContext.
2. `useSignalText(textSignal)` hook — same for text content.
3. Signal-aware pipeline trigger — microtask-batched: collect signal-driven mutations, trigger one doRender per batch.

### Level 2: @silvery/solid (~1-2 weeks)

1. Solid host element interface: `createElement(type)` → `ag.createNode(type)`, `insert(parent, child, before)` → `ag.insertChild(parent, child, index)`, `spread(node, props)` → reactive prop application, `effect(fn)` → layout/content dirty marking.
2. `Box` / `Text` components wrapping ag nodes with standard silvery prop types.
3. `render(component, term)` entry point integrating with silvery's `run()` / terminal I/O.
4. Test: port 3-5 existing React examples to Solid — must produce identical output.

## Dependencies

- Dirty node SET (km-silvery.dirty-node-set) — signals-driven updates need O(changed) pipeline, not O(tree)
- Long-lived Ag (km-silvery.long-lived-ag) — signals need a stable Ag to trigger pipeline on

## Recommendation

1. **Now**: Ship boolean phase-skip flags (~2 days) as quick win
2. **Soon**: Level 1 useSignalProps (~1-2 weeks) — hot-path improvement within React, one new hook
3. **v1.5**: Level 2 @silvery/solid (~1-2 weeks) — THE framework-agnostic differentiator
4. **Later**: Reactive pipeline phases — subsume boolean flags
5. **Never**: Custom silvery signals API — SolidJS already exists
