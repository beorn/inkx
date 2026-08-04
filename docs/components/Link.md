# Link

Renders armed link text for URLs or app-owned actions. When `href` is present, the text is wrapped in an OSC 8 hyperlink for supporting terminals (iTerm2, Ghostty, Kitty, etc.).

## Import

```tsx
import { Link } from "silvery"
```

## Props

`LinkProps` extends `TextProps` (excluding `children`).

| Prop       | Type                                   | Default              | Description                                      |
| ---------- | -------------------------------------- | -------------------- | ------------------------------------------------ |
| `href`     | `string`                               | --                   | Optional OSC 8 URL; omit for an app-owned action |
| `children` | `ReactNode`                            | --                   | Link text content                                |
| `variant`  | `"arm-on-cmd-hover" \| "arm-on-hover"` | `"arm-on-cmd-hover"` | How the link arms for clicking                   |
| `color`    | `string`                               | `"$fg-link"`         | Link text color                                  |

All `TextProps` style props (bold, italic, etc.) are also accepted.

## Usage

```tsx
<Link href="https://example.com">Visit Example</Link>

// Always clickable on hover (no modifier needed)
<Link href="https://example.com" variant="arm-on-hover">Always Clickable</Link>

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
<Link variant="arm-on-hover" onClick={() => navigateBack()}>
  Back
</Link>
```

## Behavior

- **`arm-on-cmd-hover`** (default): Link underlines and becomes clickable when hovered while holding Cmd/Super.
- **`arm-on-hover`**: Link underlines and becomes clickable on plain hover (no modifier needed).
- The `onClick` callback runs first. If it calls `preventDefault()`, it owns the
  activation; otherwise an armed click emits `"link:open"` through the app
  event chain when `href` is present. An action-only Link with no `href` never
  emits `"link:open"` or paints an OSC 8 destination.

## See Also

- [Text](./Text.md) -- base text component
