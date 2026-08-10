# Link

Renders link text for URLs or app-owned actions. When `href` is present, the text is wrapped in an OSC 8 hyperlink for supporting terminals (iTerm2, Ghostty, Kitty, etc.).

## Import

```tsx
import { Link } from "silvery"
```

## Props

`LinkProps` extends `TextProps` (excluding `children`).

| Prop          | Type        | Default      | Description                                      |
| ------------- | ----------- | ------------ | ------------------------------------------------ |
| `href`        | `string`    | --           | Optional OSC 8 URL; omit for an app-owned action |
| `children`    | `ReactNode` | --           | Link text content                                |
| `color`       | `string`    | `"$fg-link"` | Link text color                                  |
| `revealColor` | `string`    | `"$fg"`      | Brighter color used when the role reveals        |

All `TextProps` style props (bold, italic, etc.) are also accepted.

## Usage

```tsx
<Link href="https://example.com">Visit Example</Link>

// Internal link with custom handler
<Link
  href="app://node/abc123"
  onClick={(event) => {
    event.preventDefault()
    navigate("abc123")
  }}
>
  Internal Link
</Link>

// App-owned action with no OSC 8 destination
<Link onClick={() => navigateBack()}>
  Back
</Link>
```

## Behavior

- Role derives reveal policy: an `href` is a content link and reveals on
  Cmd/Super-hover; an action-only link is a control and reveals on plain hover.
- Reveal brightens the text. Underline is stable link semantics: it may be
  always present or always absent, but never changes because of hover.
- The `onClick` callback runs first. If it calls `preventDefault()`, it owns the
  activation; otherwise a revealed click emits `"link:open"` through the app
  event chain when `href` is present. An action-only Link with no `href` never
  emits `"link:open"` or paints an OSC 8 destination.

## See Also

- [Text](./Text.md) -- base text component
