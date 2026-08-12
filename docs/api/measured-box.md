# MeasuredBox

A `<Box>` whose children render only after the outer box's size has been measured. Solves the "width=0 sentinel flash" you hit when content needs to know its own host width before it can size itself.

## Import

```tsx
import { MeasuredBox } from "silvery"
```

## Usage

```tsx
<MeasuredBox width="100%" flexDirection="column" alignItems="center">
  {({ width }) => <Banner availableWidth={width} />}
</MeasuredBox>
```

The render-prop children receive the measured rect as `{ width, height }` and are not invoked until measurement is available — eliminating the empty-frame flash that the hand-rolled `useBoxRectDangerously() + width > 0 ? <Inner /> : null` pattern produces.

## Props

| Prop                | Type                                                  | Description                                                        |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| `children`          | `(rect: { width, height }) => ReactNode \| ReactNode` | Render-prop function, or plain ReactNode (deferred until measured) |
| _all `<Box>` props_ | _see [Box](./box.md)_                                 | Pass-through to the outer measured Box                             |

## Sizing

`MeasuredBox` is a `<Box>` — it sizes by the same flex rules. To produce a non-zero width:

- Pass an explicit `width` (number or `"100%"`).
- Use `flexGrow={1}` so the box stretches into available space.
- Rely on the parent's default cross-axis stretch (when the parent uses `alignItems="stretch"`, the silvery default).

::: warning Catch-22 to avoid
A `MeasuredBox` with auto width inside a parent that uses `alignItems="center"` collapses to zero with no children — and zero-width never flips to non-zero, so the children never render. Either pass `width="100%"` (resolves against the parent's definite cross-axis size) or give the box an explicit width.
:::

## Plain ReactNode children

If you pass plain children instead of a render function, they are deferred until measurement is available and then rendered as-is — useful when the children handle their own measurement and you only need to gate on "measured at all":

```tsx
<MeasuredBox width="100%">
  <ContentThatMeasuresItself />
</MeasuredBox>
```

## See also

- [`useBoxRectDangerously`](../guide/hooks.md#useboxrect) — the underlying hook
- [`<Box>`](./box.md) — the layout primitive `MeasuredBox` wraps
