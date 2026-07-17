# useInput

Observe the low-level `(input, key)` keyboard tuple. `useInput` is the Ink-compatible escape hatch for mixed or protocol-aware handlers; new code should choose the semantic hook that matches its intent:

| Intent                       | Preferred API                                  |
| ---------------------------- | ---------------------------------------------- |
| Bind a command               | [`useHotkey`](/api/use-hotkey)                 |
| Bind several commands        | [`useHotkeyMap`](/api/use-hotkey#usehotkeymap) |
| Receive typed or pasted text | [`useTextInput`](/api/use-text-input)          |
| Observe every raw key event  | [`useRawKeyEvent`](/api/use-raw-key-event)     |

Use `useInput` when maintaining Ink-compatible code or when one handler genuinely needs the normalized base key and the full `Key` object together.

## Import

```tsx
import { useInput } from "silvery"
```

## Usage

```tsx
function App() {
  const [count, setCount] = useState(0)

  useInput((input, key) => {
    if (key.upArrow) setCount((c) => c + 1)
    if (key.downArrow) setCount((c) => c - 1)
    if (input === "q") process.exit()
  })

  return <Text>Count: {count}</Text>
}
```

## Signature

```tsx
useInput(
  callback: (input: string, key: Key) => void | "exit",
  options?: {
    isActive?: boolean
    onPaste?: (text: string) => void
    onRelease?: (input: string, key: Key) => void | "exit"
  }
)
```

### Parameters

| Parameter           | Type                                          | Description                                                 |
| ------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| `callback`          | `(input: string, key: Key) => void \| "exit"` | Called for press and repeat events; return `"exit"` to exit |
| `options.isActive`  | `boolean`                                     | Whether to listen for input (default: `true`)               |
| `options.onPaste`   | `(text: string) => void`                      | Called once for each bracketed paste                        |
| `options.onRelease` | `(input: string, key: Key) => void \| "exit"` | Called for release events when the terminal reports them    |

### Key Object

| Property         | Type                                            | Description                                               |
| ---------------- | ----------------------------------------------- | --------------------------------------------------------- |
| `upArrow`        | `boolean`                                       | Up arrow key                                              |
| `downArrow`      | `boolean`                                       | Down arrow key                                            |
| `leftArrow`      | `boolean`                                       | Left arrow key                                            |
| `rightArrow`     | `boolean`                                       | Right arrow key                                           |
| `return`         | `boolean`                                       | Enter/Return key                                          |
| `escape`         | `boolean`                                       | Escape key                                                |
| `ctrl`           | `boolean`                                       | Control modifier                                          |
| `shift`          | `boolean`                                       | Shift modifier                                            |
| `meta`           | `boolean`                                       | Terminal Alt/Option modifier                              |
| `super`          | `boolean`                                       | Command/Windows/Super modifier                            |
| `hyper`          | `boolean`                                       | Hyper modifier                                            |
| `tab`            | `boolean`                                       | Tab key                                                   |
| `backspace`      | `boolean`                                       | Backspace key                                             |
| `delete`         | `boolean`                                       | Delete key                                                |
| `pageUp`         | `boolean`                                       | Page Up key                                               |
| `pageDown`       | `boolean`                                       | Page Down key                                             |
| `eventType`      | `"press" \| "repeat" \| "release" \| undefined` | Event type when the terminal reports it                   |
| `isModifierOnly` | `boolean \| undefined`                          | Whether this event is a modifier key pressed alone        |
| `text`           | `string \| undefined`                           | Actual text produced by the key, before key normalization |

### Normalized key identity vs typed text

The two callback arguments answer different questions:

- `input` identifies the normalized base key for physical keybindings. Shifted punctuation is decomposed, so pressing <kbd>?</kbd> produces `input === "/"` with `key.shift === true`.
- `key.text` contains the character the key produced, so the same press has `key.text === "?"`.

Prefer [`useHotkey`](/api/use-hotkey) for commands. Its binding makes the distinction explicit:

```tsx
// Match the physical Shift+/ chord.
useHotkey("shift+/", showPhysicalShiftSlashHelp)

// Match the produced character, regardless of keyboard layout.
useHotkey("?", showQuestionMarkHelp)
```

When migrating a raw handler, match a physical chord with `input` plus modifier fields and match a literal character with `key.text`. Do not compare `input` to shifted punctuation such as `"?"` or `"+"`; those values arrive as the base key (`"/"` or `"="`) plus `key.shift`. [`useHotkey`](/api/use-hotkey) and [`matchHotkey()`](/reference/input-features#matchhotkey) handle both representations across supported terminal protocols.

## Examples

### Navigation

```tsx
function Menu({ items }: { items: string[] }) {
  const [selected, setSelected] = useState(0)

  useInput((input, key) => {
    if (key.upArrow) {
      setSelected((s) => Math.max(0, s - 1))
    }
    if (key.downArrow) {
      setSelected((s) => Math.min(items.length - 1, s + 1))
    }
    if (key.return) {
      console.log(`Selected: ${items[selected]}`)
    }
  })

  return (
    <Box flexDirection="column">
      {items.map((item, i) => (
        <Text key={i} inverse={i === selected}>
          {i === selected ? "> " : "  "}
          {item}
        </Text>
      ))}
    </Box>
  )
}
```

### Low-level keyboard shortcuts

For new command bindings, prefer [`useHotkey`](/api/use-hotkey) or [`useHotkeyMap`](/api/use-hotkey#usehotkeymap). This is the equivalent Ink-compatible form:

```tsx
function App() {
  const { exit } = useApp()

  useInput((input, key) => {
    // Ctrl+C to exit
    if (input === "c" && key.ctrl) {
      exit()
    }

    // Ctrl+S to save
    if (input === "s" && key.ctrl) {
      save()
    }

    // 'h' for help
    if (input === "h") {
      showHelp()
    }
  })

  return <Text>Press h for help, Ctrl+C to quit</Text>
}
```

### Conditional Input

```tsx
function Modal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  // Only listen when modal is open
  useInput(
    (input, key) => {
      if (key.escape) onClose()
    },
    { isActive: isOpen },
  )

  if (!isOpen) return null

  return (
    <Box borderStyle="double">
      <Text>Press Escape to close</Text>
    </Box>
  )
}
```

### Custom text handling

Prefer the built-in [`TextInput`](/api/text-input) for ordinary text fields. Custom editors should separate edit commands from textual input; [`useTextInput`](/api/use-text-input) preserves shifted punctuation, composed text, graphemes, and bracketed paste:

```tsx
function CustomEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  useHotkey("Backspace", () => onChange(value.slice(0, -1)))
  useTextInput({ onText: (text) => onChange(value + text) })

  return (
    <Box>
      <Text>{value}</Text>
      <Text inverse> </Text>
    </Box>
  )
}
```

### Vi-style Movements

```tsx
function ViNavigation() {
  const [position, setPosition] = useState({ x: 0, y: 0 })

  useInput((input) => {
    switch (input) {
      case "h": // Left
        setPosition((p) => ({ ...p, x: Math.max(0, p.x - 1) }))
        break
      case "j": // Down
        setPosition((p) => ({ ...p, y: p.y + 1 }))
        break
      case "k": // Up
        setPosition((p) => ({ ...p, y: Math.max(0, p.y - 1) }))
        break
      case "l": // Right
        setPosition((p) => ({ ...p, x: p.x + 1 }))
        break
    }
  })

  return (
    <Text>
      Position: ({position.x}, {position.y})
    </Text>
  )
}
```

## Notes

- Input is only captured when the app is in raw mode (default for `render()`)
- Multiple `useInput` hooks can be active simultaneously
- Use `isActive: false` to temporarily disable input handling
- Release and modifier-only events do not reach the main callback; use `onRelease` or [`useRawKeyEvent`](/api/use-raw-key-event) when you need them
