---
id: "@km/silvery/popover"
aliases:
  - km-silvery.popover
  - km-silvery-popover
created_by: Bjørn Stabell
created_at: 2026-04-03T06:55:22Z
owner: bjorn@stabell.org
---

# [ ] Popover component — floating, viewport-aware, with automatic defaults @km/silvery #feature #P2

Upgrade the current inline Tooltip to a proper floating Popover — absolutely positioned near target, viewport-aware (flip if near edge), dismiss on mouse leave with delay.

## Automatic defaults (zero opt-in)

These should just work without any extra props:

1. **Link URL preview** — hover <Link>, see URL in floating popover (like browser status bar). Link already has hover detection.
2. **Truncated text expansion** — any <Text> with textOverflow="ellipsis" or wrap="truncate" shows full text on hover. Zero effort for app devs.
3. **Keyboard shortcut hints** — focused interactive element shows its keybinding. Command system already knows the bindings.

## Explicit popover (app provides content)

```tsx
<Popover content={<FilePreview path={file} />}>
  <Text>{file}</Text>
</Popover>
```

## App-level use cases (silvery provides component, app fills content)

- File path preview (size, modified, first lines, git status)
- Error details (full stack trace from truncated error)
- Timestamp expansion ("2h ago" -> absolute time)
- Color swatch (hover #ff0000, see color block)
- Commit hash (hover short hash, see message + author)
- Image preview (Sixel/Kitty graphics where supported)
- Diff context (hover changed line, see surrounding context)

## Implementation

- Absolute positioning near target element
- Viewport-aware: flip above/below/left/right if near edge
- Dismiss on mouse leave with configurable delay
- Support both hover-triggered and click-triggered
- Keyboard accessible (show on focus for shortcut hints)
- Replace current inline Tooltip with floating Popover (backwards compat: Tooltip becomes alias)

## Existing infrastructure
- Link component: hover detection, onMouseEnter/Leave, useMouseCursor
- useModifierKeys: tracks Cmd/Ctrl/Alt/Shift
- Tooltip: basic inline version (to be replaced)
- Absolute positioning: already supported in Flexily

## Done when
- Popover renders floating near target with viewport awareness
- Link shows URL on hover by default (no opt-in)
- Truncated text shows full text on hover by default
- Focused elements show keybinding hint by default