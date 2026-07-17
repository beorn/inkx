# useTextInput

Receive textual keyboard input and bracketed paste without treating command keys as text. This hook is the semantic boundary for custom editors; use the [`TextInput`](/api/text-input) component for ordinary single-line fields.

## Import

```tsx
import { useTextInput } from "silvery"
```

## Usage

```tsx
function Editor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  useTextInput({
    onText: (text) => onChange(value + text),
  })

  return <Text>{value}</Text>
}
```

Shifted punctuation arrives as the character the user typed. For example, <kbd>?</kbd> emits `"?"`, even though the low-level normalized base key is `"/"`.

## Signature

```tsx
useTextInput({
  isActive?: boolean
  onText: (text: string, event: TextInputEvent) => void
  onGrapheme?: (grapheme: string, event: TextInputEvent) => void
  onPaste?: (text: string, event: TextInputEvent) => void
}): void
```

| Option       | Description                                                               |
| ------------ | ------------------------------------------------------------------------- |
| `isActive`   | Enable or disable the subscriptions (default: `true`)                     |
| `onText`     | Receives every accepted keyboard text value and every bracketed paste     |
| `onGrapheme` | Called once for each Unicode grapheme in the accepted text                |
| `onPaste`    | Additional callback for bracketed paste; `onText` has already received it |

The event object contains:

| Property    | Type                    | Description                                      |
| ----------- | ----------------------- | ------------------------------------------------ |
| `source`    | `"keyboard" \| "paste"` | Where the text came from                         |
| `text`      | `string`                | The complete text value                          |
| `graphemes` | `readonly string[]`     | Unicode grapheme segmentation of `text`          |
| `input`     | `string`                | The low-level input value                        |
| `key`       | `Key \| null`           | Keyboard metadata, or `null` for bracketed paste |

## Filtering

`useTextInput` filters navigation and editing keys, Ctrl/Super/Hyper commands, release events, modifier-only events, and non-printable control text. Option/Alt text is accepted when the terminal reports produced text.

Use [`useHotkey`](/api/use-hotkey) alongside it for commands such as `Enter`, `Escape`, or `Backspace`:

```tsx
useHotkey("Enter", submit)
useHotkey("Escape", cancel)
useTextInput({ onText: insertText })
```

`onPaste` supplements `onText`; do not append the same paste in both callbacks.
