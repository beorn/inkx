# Migration: render() → createApp()

> **Era2 design doc.** When era2 ships, integrate this into `vendor/silvery/docs/getting-started/migrate-from-ink.md` as a new section after the existing compat layer content.

The existing Ink migration guide covers the drop-in import swap, API differences, and the `withInk()` compat layer. This doc covers the next step: moving from render-only to silvery's app framework.

## When to migrate

`render()` is fine for simple apps. You feel the pain when:

- **Input handlers are scattered.** Multiple `useInput` hooks across components, each handling some keys. You add a feature and accidentally break a shortcut in another component because they both respond to the same key.
- **Modes are fragile.** Normal mode, insert mode, search mode — tracked with `useState` and checked with `if (mode === "normal")` inside every `useInput`. One missed check and keys leak between modes.
- **You can't test behavior without UI.** To test "pressing j moves the cursor down," you have to mount the full component tree and simulate keypresses. There's no way to call the action directly.
- **You want a command palette.** With `useInput`, there's no list of "what can the user do right now?" — it's buried in conditionals. A command palette would require manually duplicating every action's name and function.
- **You want CLI/MCP/AI access.** The same actions users perform via keyboard should be callable from a CLI (`km task toggle-done`), MCP tool, or AI agent — but with `useInput` the logic lives inside React components.

If none of these bother you, stay with `render()`. When they do, `createApp()` solves all of them.

## The migration

### Before: render-only

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
      // ... handle text input
    }
  })

  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Text key={i}>{i === cursor ? "> " : "  "}{item}</Text>
      ))}
      <Text dimColor>{mode === "normal" ? "j/k move, x delete, i insert, q quit" : "ESC to exit"}</Text>
    </Box>
  )
}

await render(<App />)
```

Problems:
- All input logic lives in one component — can't split it without prop drilling `mode` and `setMode`
- Testing requires rendering the full UI and simulating keypresses
- No way to list available actions or generate a CLI
- Adding search mode means another `if (mode === ...)` branch in the same callback

### After: createApp

```typescript
import { createApp, signal, useSignal, Box, Text } from 'silvery'

// State — testable, shareable, outside React
const items = signal(["Buy milk", "Fix bug"])
const cursor = signal(0)
const mode = signal<"normal" | "insert">("normal")

// Commands — named, testable, discoverable
const app = createApp()
app.commands.nav = {
  down:   { fn: () => cursor(Math.min(cursor() + 1, items().length - 1)) },
  up:     { fn: () => cursor(Math.max(cursor() - 1, 0)) },
  delete: { fn: () => items(items().filter((_, i) => i !== cursor())) },
}
app.commands.mode = {
  insert: { fn: () => mode("insert") },
  normal: { fn: () => mode("normal") },
}
app.commands.app = {
  quit: { fn: () => process.exit(0) },
}

// Keymaps — declarative, mode-aware, no conditionals
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

// View — pure renderer, zero input logic
function App() {
  const m = useSignal(mode)
  const c = useSignal(cursor)
  const list = useSignal(items)
  return (
    <Box flexDirection="column">
      {list.map((item, i) => (
        <Text key={i}>{i === c ? "> " : "  "}{item}</Text>
      ))}
      <Text dimColor>{m === "normal" ? "j/k move, x delete, i insert, q quit" : "ESC to exit"}</Text>
    </Box>
  )
}

await app.run(<App />)
```

What changed:
- **Input logic is gone from the view.** The component is a pure function of state.
- **Modes are declarative.** `when(() => mode() === "normal", { ... })` replaces `if (mode === "normal")` inside callbacks. Adding a search mode is one more `when()` block, not another branch in a growing conditional.
- **Every action is testable without UI.** `app.commands.nav.down.fn()` — call it, check state. No rendering needed.
- **Actions are discoverable.** Walk `app.commands` to list everything the user can do. Auto-generates a command palette, CLI help, MCP tool list.

### What you gain at each step

| Step | What | Why bother |
|---|---|---|
| `createApp()` | Entry point for commands + keymaps | You can define actions outside components |
| `app.commands` | Named action objects | Testable, discoverable, composable |
| `app.keymap()` | Declarative key bindings | No scattered `useInput`, mode-aware via `when()` |
| `when()` | Conditional bindings | Modes without `if` chains |
| `signal()` | Reactive state outside React | Share state between commands/views/tests (optional — `useState` works too) |
| `app.run()` | Full app lifecycle | Replaces `render()` — same thing plus commands/scope |

### Migration checklist

1. `const app = createApp()`
2. Extract actions from `useInput` → `app.commands`
3. Replace `useInput` → `app.keymap()` with `when()` for modes
4. Optionally: `useState` → `signal()` for state shared outside components
5. Simplify views: remove all input logic
6. `render(<App />)` → `await app.run(<App />)`
7. Remove `silvery/ink` imports — use `silvery` directly

### You don't have to migrate all at once

`render()` and `createApp()` coexist. You can have some components using `useInput` and others driven by keymaps. Migrate one component at a time.

## FAQ

**Do I need signals?**
No. `useState` works with `createApp()`. Signals help when state is shared across components or accessed outside React (commands, tests, CLI). Optional.

**Do I need createApp()?**
No. `render()` is fine for simple apps. Migrate when you feel the pain described above.

**Can I use both useInput and keymap?**
Yes. Components with `useInput` still work — unmatched keys fall through from the keymap to component handlers. Replace them gradually.
