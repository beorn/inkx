# Migration: render() → createApp()

> **Era2 design doc.** When era2 ships, integrate this into `vendor/silvery/docs/getting-started/migrate-from-ink.md` as a new section after the existing compat layer content.

The existing Ink migration guide (`docs/getting-started/migrate-from-ink.md`) covers Steps 1-3: drop-in import swap, API differences, and the `withInk()` compat layer. This doc adds Steps 4-5: migrating from render-only to the full app framework.

## Step 4: Replace Ink hooks with commands

Each Ink hook has a silvery-native replacement. Replace them one at a time.

### `useInput` → keymap

Ink's `useInput` is imperative — you handle raw keys in a callback. Silvery's keymap is declarative — you bind keys to commands.

```diff
- import { useInput } from 'silvery/ink'
+ import { createApp } from 'silvery'

- useInput((input, key) => {
-   if (input === 'j') setCursor(c => c + 1)
-   if (input === 'k') setCursor(c => c - 1)
-   if (key.return) openItem()
-   if (input === 'q') process.exit(0)
- })

+ const app = createApp()
+ app.commands.nav = {
+   down:   { title: "Move Down",  fn: () => setCursor(c => c + 1) },
+   up:     { title: "Move Up",    fn: () => setCursor(c => c - 1) },
+   open:   { title: "Open",       fn: () => openItem() },
+   quit:   { title: "Quit",       fn: () => process.exit(0) },
+ }
+ app.keymap({
+   j: app.commands.nav.down,
+   k: app.commands.nav.up,
+   Enter: app.commands.nav.open,
+   q: app.commands.nav.quit,
+ })
```

What you gain: commands are testable (`app.commands.nav.down.fn()`), discoverable (auto-generated CLI, command palette, MCP tools), and composable (plugins add commands without touching view code).

### `useApp().exit()` → command

```diff
- import { useApp } from 'silvery/ink'
- const { exit } = useApp()
- exit()

+ app.commands.app.quit.fn()
```

### `useFocus` → silvery focus system

```diff
- import { useFocus } from 'silvery/ink'
- const { isFocused } = useFocus({ autoFocus: true })

+ import { useFocusable } from 'silvery'
+ const { isFocused } = useFocusable({ autoFocus: true })
```

Or use `<Box focusScope>` for container-level focus management.

### Hook replacement reference

| Ink hook | Silvery equivalent | Notes |
|---|---|---|
| `useInput(fn)` | `app.keymap()` + commands | Declarative, composable |
| `useApp()` | `app.commands` | Named actions |
| `useFocus()` | `useFocusable()` or `<Box focusScope>` | Container-level focus |
| `useFocusManager()` | Silvery focus system | Tab/Shift+Tab built-in |
| `useStdin()` | `useInput()` from silvery | Better escape handling |
| `useStdout()` | `useContentRect()` | Dimensions + resize |

## Step 5: Migrate from render() to createApp()

This is the biggest change — moving from Ink's render-only model to silvery's app framework.

### Before: render-only (Ink style)

```typescript
import { render } from 'silvery/ink'

function App() {
  const [count, setCount] = useState(0)
  useInput((input) => {
    if (input === 'j') setCount(c => c + 1)
    if (input === 'q') process.exit(0)
  })
  return <Text>Count: {count}</Text>
}

render(<App />)
```

### After: createApp (silvery style)

```typescript
import { createApp, signal, Box, Text, useSignal } from 'silvery'

// State — outside React, testable, shareable (signals are optional)
const count = signal(0)

// App — commands, keymaps, rendering
const app = createApp()
app.commands.counter = {
  increment: { title: "Increment", fn: () => count(count() + 1) },
  quit:      { title: "Quit",      fn: () => process.exit(0) },
}
app.keymap({
  j: app.commands.counter.increment,
  q: app.commands.counter.quit,
})

// View — pure renderer, no input handling
function App() {
  const c = useSignal(count)
  return <Text>Count: {c}</Text>
}

await app.run(<App />)
```

### What changes

| Concern | render() | createApp() |
|---|---|---|
| **State** | `useState` inside components | `signal()` outside React (optional — useState still works) |
| **Input** | `useInput` callback per component | `keymap()` — declarative, composable |
| **Actions** | Inline in `useInput` | Named commands — testable, discoverable |
| **Testing** | Mount component, simulate keys | Call `command.fn()` directly |
| **CLI** | Build separately | Auto-generated from command tree |
| **AI/MCP** | Build separately | Auto-generated from command tree |

### Migration checklist

1. Create the app: `const app = createApp()`
2. Move input handling: `useInput` → `app.keymap()` + commands
3. Optionally move state: `useState` → `signal()` (not required — useState works fine)
4. Simplify views: remove input logic, just render state
5. Remove `silvery/ink` imports — use `silvery` directly
6. Remove `withInk()` if you were using it during transition

### You don't have to migrate all at once

`render()` and `createApp()` coexist. You can have some components using `useInput` (Ink style) and others driven by keymaps. Migrate incrementally — one component at a time.

## FAQ

**Do I need signals?**
No. `useState` works fine with `createApp()`. Signals are useful when state needs to be shared across components or accessed outside React (commands, tests, CLI). They're optional.

**Do I need createApp()?**
No. `render()` works perfectly for simple apps. Use `createApp()` when you want commands, keymaps, or the auto-generated CLI/MCP surfaces.

**What about third-party Ink plugins?**
Most work unchanged with `silvery/ink`. If they import from `ink` directly, alias `ink` → `silvery/ink` in your bundler config.
