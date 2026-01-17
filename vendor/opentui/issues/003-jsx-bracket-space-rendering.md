# Issue 003: JSX Bracket and Space Rendering

## Summary

When rendering text with brackets followed by JSX expression spaces `{" "}`, the closing bracket and/or space may not render correctly.

## Observed Behavior

JSX like:

```tsx
<text color="black" bold>
  [{getPriorityLabel(priority)}]{" "}
</text>
```

Where `getPriorityLabel(1)` returns `"P1"`, renders as:

- Expected: `[P1] Implement auth`
- Actual: `[P1Implement auth` (missing `]` and space)

## Reproduction Steps

1. Create a component with text containing brackets and trailing space:

```tsx
<box flexDirection="row">
  <text bold>[P1] </text>
  <text>Title here</text>
</box>
```

2. The output shows `[P1Title here` instead of `[P1] Title here`

## Environment

- OpenTUI version: 0.1.73
- Bun: 1.3.6
- macOS

## Notes

This was observed in the km-tui2 storybook when rendering priority badges. The closing bracket character `]` and the trailing space `{" "}` appear to be dropped or not rendered.

This could be:

1. A JSX whitespace handling issue
2. A text measurement/layout issue where characters are being clipped
3. An ANSI escape sequence issue corrupting output

## Workaround

Not yet identified. May need to combine the bracket and space into a single string literal.
