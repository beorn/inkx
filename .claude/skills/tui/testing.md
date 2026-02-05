# inkx Testing

Programmatically drive inkx apps for testing. Uses Playwright-inspired API with auto-refreshing locators.

## Diagnostic Mode (RECOMMENDED FIRST)

**When debugging TUI rendering issues, start with `INKX_STRICT=1`**. This enables comprehensive invariant checking that catches most incremental rendering bugs:

```bash
# Test with strict mode enabled (catches incremental render bugs)
INKX_STRICT=1 bun vitest run apps/km-tui/tests/

# Run TUI with diagnostics
INKX_STRICT=1 bun km view /path/to/vault

# Or use the dedicated script
bun run test:strict
```

**What it catches:**
- Incremental vs fresh render mismatches (common TUI bugs)
- Blank cards after fold/unfold or depth changes
- Buffer content divergence after navigation

**For command-aware diagnostics** in test files, use `withDiagnostics()`:

```typescript
import { withDiagnostics } from "inkx/toolbelt"

// All checks enabled by default when you call withDiagnostics()
const driver = withDiagnostics(createBoardDriver(repo, rootId))

// Disable specific checks if needed
const driver = withDiagnostics(createBoardDriver(repo, rootId), {
  checkReplay: false  // skip ANSI replay check
})
```

See `apps/km-tui/tests/real-vault.test.ts` for testing with real vault data.

## Quick Start

```tsx
import { createRenderer } from "inkx/testing"
import { Box, Text } from "inkx"

const render = createRenderer({ cols: 80, rows: 24 })

test("renders and navigates", async () => {
  const app = render(
    <Box id="main">
      <Text>Hello World</Text>
    </Box>
  )

  // Plain text output (for assertions)
  expect(app.text).toContain("Hello World")

  // Keyboard input
  await app.press("j")
  await app.press("ArrowDown")

  // Auto-refreshing locators
  expect(app.getByText("Hello").count()).toBe(1)
  expect(app.locator("#main").boundingBox()?.width).toBe(80)
})
```

## Key APIs

### createRenderer({ cols, rows })

Creates a test renderer factory. Each `render()` call auto-unmounts the previous render.

```tsx
const render = createRenderer({ cols: 80, rows: 24 })
const app = render(<MyComponent />)
```

### app.press(key)

Send keyboard input. Awaitable. Use Playwright-style key names.

```tsx
await app.press("j")           // Letter
await app.press("ArrowUp")     // Arrow key
await app.press("Enter")       // Special key
await app.press("Control+c")   // Modifier combo
```

### app.text / app.ansi

- `app.text` - Plain text output (no ANSI codes) - use for assertions
- `app.ansi` - Styled output (with ANSI codes) - use for debugging

```tsx
expect(app.text).toContain("expected")
console.log(app.ansi)  // Debug visual output
```

### app.locator(selector)

Auto-refreshing element queries. Re-evaluates on every access - no stale locator bugs.

```tsx
// Attribute selectors
app.locator("[data-selected]")       // Presence
app.locator('[data-status="done"]')  // Value match
app.locator('[testID^="task-"]')     // Prefix match
app.locator('[testID$="-column"]')   // Suffix match
app.locator('[testID*="task"]')      // Contains

// ID selector (requires id prop on component)
app.locator("#sidebar")
```

### app.getByText(pattern)

Find elements by text content. Supports string or regex.

```tsx
app.getByText("Hello")        // Partial match
app.getByText(/Task \d+/)     // Regex
```

### app.getByTestId(id)

Find elements by `testID` prop.

```tsx
<Box testID="header">...</Box>
app.getByTestId("header").textContent()
```

### Locator Methods

```tsx
const loc = app.locator("[data-item]")

loc.count()           // Number of matches
loc.textContent()     // Text of first match
loc.first()           // Narrow to first
loc.last()            // Narrow to last
loc.nth(2)            // Narrow to index
loc.boundingBox()     // { x, y, width, height } or null
loc.isVisible()       // Boolean
loc.getAttribute("data-status")  // Attribute value
loc.resolve()         // Get underlying InkxNode
loc.resolveAll()      // Get all matching InkxNodes
```

## Frame Iteration (for fuzz testing)

Use `createApp().run()` to iterate frames after each event:

```tsx
import { createApp, useApp } from "inkx/runtime"
import { Text } from "inkx"

const app = createApp(
  () => (set) => ({ count: 0 }),
  {
    key: (input, key, { set }) => {
      if (input === "j") set((s) => ({ count: s.count + 1 }))
    },
  }
)

function Counter() {
  const count = useApp((s) => s.count)
  return <Text>Count: {count}</Text>
}

// Iterate frames (e.g., with custom test provider)
for await (const frame of app.run(<Counter />, { cols: 80, rows: 24, term })) {
  expect(frame.text).toBeDefined()
  if (someCondition) break
}
```

## Keyboard Input Reference

| Key Name | Description |
|----------|-------------|
| `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight` | Arrow keys |
| `Enter` | Enter/Return |
| `Escape` | Escape |
| `Tab` | Tab |
| `Shift+Tab` | Shift+Tab (backtab) |
| `Backspace` | Backspace |
| `Delete` | Delete |
| `Home`, `End` | Home/End |
| `PageUp`, `PageDown` | Page Up/Down |
| `Control+c`, `Control+d`, etc. | Ctrl combinations |
| `a`-`z`, `0`-`9` | Regular characters |
| `A`-`Z` | Uppercase (shift implied) |
| ` ` (space) | Space |

## Example Patterns

### Simple Navigation Test

```tsx
test("navigates with arrow keys", async () => {
  const app = render(<Board items={items} />)

  expect(app.locator("[data-cursor]").textContent()).toBe("Item 1")

  await app.press("ArrowDown")
  expect(app.locator("[data-cursor]").textContent()).toBe("Item 2")

  await app.press("ArrowDown")
  await app.press("ArrowDown")
  expect(app.locator("[data-cursor]").textContent()).toBe("Item 4")
})
```

### Testing State Changes

```tsx
test("toggles selection with space", async () => {
  const app = render(<SelectableList items={items} />)

  expect(app.locator("[data-selected]").count()).toBe(0)

  await app.press(" ")  // Space to select
  expect(app.locator("[data-selected]").count()).toBe(1)

  await app.press(" ")  // Space to deselect
  expect(app.locator("[data-selected]").count()).toBe(0)
})
```

### Auto-refreshing Locators

```tsx
test("locators auto-refresh after input", async () => {
  const app = render(<Board />)
  const cursor = app.locator("[data-cursor]")

  // Same locator object, result updates automatically
  expect(cursor.textContent()).toBe("item1")
  await app.press("j")
  expect(cursor.textContent()).toBe("item2")  // Auto-refreshed!
  await app.press("j")
  expect(cursor.textContent()).toBe("item3")  // Still fresh!
})
```

### Debugging Test Failures

```tsx
test("debug output", () => {
  const app = render(<MyComponent />)

  // Print plain text
  console.log(app.text)

  // Print with ANSI colors (visual debugging)
  console.log(app.ansi)

  // app.debug() also available for formatted output
  app.debug()
})
```

## Anti-Patterns

### Wrong: Using old createLocator pattern

```tsx
// WRONG - stale locators, manual refresh needed
const { getContainer } = render(<App />)
const locator = createLocator(getContainer())
await app.press("j")
const freshLocator = createLocator(getContainer())  // Must manually refresh!

// RIGHT - auto-refreshing locators via app
const app = render(<App />)
const cursor = app.locator("[data-cursor]")
await app.press("j")
expect(cursor.textContent()).toBe("item2")  // Same locator, fresh result!
```

### Wrong: Using stdin.write() for keyboard input

```tsx
// WRONG - manual ANSI sequences
app.stdin.write("\x1b[A")  // up arrow
app.stdin.write("j")

// RIGHT - Playwright-style API
await app.press("ArrowUp")
await app.press("j")
```

## See Also

- `vendor/beorn-inkx/CLAUDE.md` - Full inkx documentation
- `vendor/beorn-inkx/tests/` - More test examples
- `apps/km-tui/src/testing.ts` - BoardTestHarness for km-tui specific testing
