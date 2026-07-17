# useRawKeyEvent

Observe every keyboard event that reaches the input chain, including key releases and modifier-only events. Prefer [`useHotkey`](/api/use-hotkey) for commands and [`useTextInput`](/api/use-text-input) for text; this hook is for protocol-level state such as held-key tracking.

## Import

```tsx
import { useRawKeyEvent } from "silvery"
```

## Usage

```tsx
function HeldKeyTracker() {
  useRawKeyEvent(({ input, key }) => {
    if (key.eventType === "release") {
      releaseKey(input)
    } else if (key.isModifierOnly) {
      updateHeldModifiers(key)
    }
  })

  return null
}
```

Release and modifier-only events require a terminal protocol that reports them, such as Kitty keyboard protocol with the relevant flags. Legacy terminals cannot supply information they do not encode.

## Signature

```tsx
useRawKeyEvent(
  handler: (event: { input: string; key: Key }) => void,
  options?: { isActive?: boolean },
): void
```

The handler observes input; it does not consume an event or exit the runtime. Set `isActive: false` to keep the hook mounted without registering the observer.
