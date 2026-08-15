# @silvery/create

App composition for silvery — `pipe()`, providers, TEA store, and structured state management.

```console
$ npm install @silvery/create
```

## pipe() Composition

`pipe()` composes providers left-to-right. Each provider is a function `(app) => enhancedApp` that adds one capability — terminal I/O, React rendering, focus navigation, mouse dispatch, etc.

```typescript
import { pipe, createApp, withReact, withTerminal, withTerminalLinks, withFocus, withDomEvents } from '@silvery/create'

const app = pipe(
  createApp(store),
  withReact(<Board />),
  withTerminal(process),
  withTerminalLinks({ detect: detectLinks }),
  withFocus(),
  withDomEvents(),
)
await app.run()
```

The `AppPlugin<A, B>` type is just `(app: A) => B`. TypeScript infers the accumulating type through the chain.

### Built-in Providers

All follow the `with-*` naming convention (file) / `with*` (export):

| Provider                | What                                                   |
| ----------------------- | ------------------------------------------------------ |
| `withApp()`             | Domain state registry, command tree, keymaps           |
| `withReact(element)`    | React reconciler mount, virtual buffer                 |
| `withRender(term)`      | Render pipeline from term capabilities                 |
| `withTerminal(process)` | Terminal I/O — alternate screen, raw mode, resize      |
| `withTerminalLinks()`   | Visible cell links → shared `link:open` events         |
| `withFocus()`           | Tab/Shift+Tab/Escape focus navigation                  |
| `withDomEvents()`       | Mouse dispatch — hit testing, bubbling, click-to-focus |
| `withDiagnostics()`     | Debug overlays — incremental vs fresh render checks    |
| `withLinks()`           | Hyperlink event routing                                |

### Why `with-*`?

The prefix makes providers instantly recognizable in imports and `pipe()` chains. It reads naturally: "create an app _with_ terminal, _with_ focus, _with_ mouse events." File names use kebab-case (`with-dom-events.ts`); exports use camelCase (`withDomEvents`).

## TEA Store

Optional structured state management for complex apps — pure `(action, state) -> [state, effects]` with serializable actions and effects. See the [silvery docs](https://silvery.dev/guide/runtime-layers) for full TEA store documentation.
