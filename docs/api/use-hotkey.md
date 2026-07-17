# useHotkey and useHotkeyMap

Bind application commands to semantic key names. These hooks normalize legacy ANSI and Kitty keyboard events, ignore release and modifier-only events, and keep terminal protocol details out of command handlers.

## Import

```tsx
import { useHotkey, useHotkeyMap } from "silvery"
```

## Literal characters vs physical chords

A literal binding names the character the user produced. A modifier binding names a physical chord:

```tsx
// Produced character: works when the user's layout types "?" from another base key.
useHotkey("?", showHelp)

// Physical chord: specifically Shift plus the / base key.
useHotkey("shift+/", showPhysicalShortcutHelp)
```

This distinction matters for shifted punctuation. Pressing <kbd>?</kbd> on a US layout is normalized to base `input === "/"`, `key.shift === true`, and `key.text === "?"`. `useHotkey("?")` matches the text; `useHotkey("shift+/")` matches the base key and modifier. Do not implement a literal binding as `useInput((input) => input === "?")` because normalized `input` is `"/"`.

## useHotkey

```tsx
useHotkey(
  binding: string,
  handler: (event: HotkeyEvent) => void | "exit",
  options?: { isActive?: boolean },
): void
```

```tsx
function App() {
  useHotkey("mod+p", openCommandPalette)
  useHotkey("Escape", closeDialog, { isActive: dialogOpen })
  useHotkey("q", () => "exit")

  return <Text>Press Mod+P for commands</Text>
}
```

The handler receives:

| Property  | Type     | Description                                                      |
| --------- | -------- | ---------------------------------------------------------------- |
| `binding` | `string` | The binding string passed to the hook                            |
| `input`   | `string` | The normalized base key                                          |
| `key`     | `Key`    | Modifiers, named-key flags, produced text, and protocol metadata |

Return `"exit"` to exit the current runtime. Set `isActive: false` to keep the hook mounted without registering the binding.

### Binding vocabulary

Bindings use web- and platform-literate modifier names:

| Binding name                      | Matches                                      |
| --------------------------------- | -------------------------------------------- |
| `ctrl`                            | Control                                      |
| `shift`                           | Shift                                        |
| `alt`, `option`, `opt`            | Terminal Alt/Option (`key.meta`)             |
| `meta`, `cmd`, `command`, `super` | Command/Windows/Super (`key.super`)          |
| `mod`                             | Control or Command/Windows/Super             |
| `hyper`                           | Hyper, when the terminal protocol reports it |

Use canonical Playwright-style capitalization for special keys, including `Enter`, `Escape`, `Tab`, `Backspace`, `Delete`, `ArrowUp`, and `PageDown`. Modifier aliases are case-insensitive; literal characters remain exact.

## useHotkeyMap

Register several bindings through one hook:

```tsx
useHotkeyMap({
  "?": showHelp,
  "mod+p": openCommandPalette,
  Escape: closeDialog,
  q: () => "exit",
})
```

```tsx
useHotkeyMap(
  bindings: Readonly<Record<string, HotkeyHandler | undefined>>,
  options?: { isActive?: boolean },
): void
```

Bindings are checked in object insertion order and the first match wins. An `undefined` handler disables that entry. Keep the map identity stable with `useMemo` when a frequently rendering component constructs it dynamically; the hook reads handlers from the latest supplied map.

## Event semantics

- Press and repeat events can invoke handlers.
- Release and modifier-only events are ignored.
- A focused component can consume input before a global chain binding sees it.
- For typed or pasted content, use [`useTextInput`](/api/use-text-input).
- For release tracking or protocol-level observation, use [`useRawKeyEvent`](/api/use-raw-key-event).
