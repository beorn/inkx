# Migration: render() → createApp()

> **Era2 design doc.** When era2 ships, integrate into `vendor/silvery/docs/getting-started/migrate-from-ink.md` after the existing compat layer content.

## When render() is enough

Most apps. Change `import { ... } from 'ink'` to `import { ... } from 'silvery/ink'`. Enjoy 100x faster rendering, responsive layouts, 30+ components. Stay here forever if you want.

## When you need createApp()

When input handling becomes the problem:

- **Scattered handlers.** Multiple `useInput` hooks across components. You add a shortcut and accidentally shadow one in another component.
- **Fragile modes.** Normal, insert, search — tracked with `useState`, checked with `if (mode === "normal")` in every handler. One missed check and keys leak.
- **Untestable actions.** To test "j moves cursor down" you mount the full component tree and simulate keypresses.
- **No discoverability.** You want a command palette, but there's no list of "what can the user do?" — it's buried in conditionals.
- **No automation surface.** The same actions should be callable from CLI, MCP tools, AI agents, or test scripts — but the logic lives inside React components.

## The migration

### Before

```typescript
import { render, useInput } from 'silvery'

function App() {
  const [items, setItems] = useState(["Buy milk", "Fix bug"])
  const [cursor, setCursor] = useState(0)
  const [mode, setMode] = useState<"normal" | "insert">("normal")

  useInput((input, key) => {
    if (mode === "normal") {
      if (input === "j") setCursor(c => Math.min(c + 1, items.length - 1))
      if (input === "k") setCursor(c => Math.max(c - 1, 0))
      if (input === "x") setItems(items.filter((_, i) => i !== cursor))
      if (input === "i") setMode("insert")
      if (input === "q") process.exit(0)
    }
    if (mode === "insert") {
      if (key.escape) setMode("normal")
    }
  })

  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Text key={i}>{i === cursor ? "> " : "  "}{item}</Text>
      ))}
    </Box>
  )
}

await render(<App />)
```

### After

```typescript
import { createApp, signal, useSignal, when, Box, Text } from 'silvery'

const items = signal(["Buy milk", "Fix bug"])
const cursor = signal(0)
const mode = signal<"normal" | "insert">("normal")

// Simplified API — the full composition uses pipe(create(), withScope(), withApp(), ...)
// See 00-architecture.md § Full Pipe and § Preset for the complete picture.
const app = createApp()
app.commands.nav = {
  down:   { title: "Move Down",   fn: () => cursor(Math.min(cursor() + 1, items().length - 1)) },
  up:     { title: "Move Up",     fn: () => cursor(Math.max(cursor() - 1, 0)) },
  delete: { title: "Delete Item", fn: () => items(items().filter((_, i) => i !== cursor())) },
}
app.commands.mode = {
  insert: { title: "Insert Mode", fn: () => mode("insert") },
  normal: { title: "Normal Mode", fn: () => mode("normal") },
}
app.commands.app = {
  quit: { title: "Quit", fn: () => process.exit(0) },
}

app.keymap({
  ...when(() => mode() === "normal", {
    j: app.commands.nav.down,
    k: app.commands.nav.up,
    x: app.commands.nav.delete,
    i: app.commands.mode.insert,
    q: app.commands.app.quit,
  }),
  ...when(() => mode() === "insert", {
    Escape: app.commands.mode.normal,
  }),
})

function App() {
  const c = useSignal(cursor)
  const list = useSignal(items)
  return (
    <Box flexDirection="column">
      {list.map((item, i) => (
        <Text key={i}>{i === c ? "> " : "  "}{item}</Text>
      ))}
    </Box>
  )
}

await app.run(<App />)
```

### What's different

**Input logic is gone from the view.** The component renders state. That's it.

**Modes are declarative.** `when(() => mode() === "normal", { ... })` replaces `if (mode === "normal")` inside callbacks. Adding search mode is one more `when()` block.

**Every action is testable without UI.** `app.commands.nav.down.fn()` then check `cursor()`. No rendering.

**Actions are discoverable.** Walk `app.commands` → auto-generated command palette, CLI, MCP tools.

**`useInput` and keymaps coexist.** Unmatched keys fall through from the keymap to `useInput` handlers. Migrate one component at a time.

## Checklist

- [ ] `const app = createApp()`
- [ ] Extract actions from `useInput` into `app.commands`
- [ ] Replace `useInput` with `app.keymap()` + `when()` for modes
- [ ] `render()` → `await app.run()`
- [ ] Remove `silvery/ink` imports → `silvery`
- [ ] Optional: `useState` → `signal()` for state shared outside components
- [ ] Optional: `withInk()` → remove when no Ink-compat hooks remain

## FAQ

**Do I need signals?** No. `useState` works with `createApp()`. Signals help when state is shared outside React.

**Do I need createApp()?** No. `render()` is fine until scattered handlers and untestable actions become painful.

**Can I use both useInput and keymap?** Yes. Unmatched keys fall through. Migrate gradually.
