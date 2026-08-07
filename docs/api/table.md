# Table

Data grid display component with column alignment, self-allocating column widths, and optional document-table chrome.

## Import

```tsx
import { Table } from "silvery"
```

## Usage

```tsx
const columns = [
  { key: "name", header: "Name" },
  { key: "status", header: "Status", align: "center" },
  { key: "count", header: "Count", align: "right" },
]

const data = [
  { name: "Item 1", status: "active", count: 42 },
  { name: "Item 2", status: "pending", count: 7 },
]

<Table columns={columns} data={data} frame />
```

## Props

| Prop            | Type                | Default        | Description                                                     |
| --------------- | ------------------- | -------------- | --------------------------------------------------------------- |
| `columns`       | `Column<T>[]`       | _required_     | Column definitions                                              |
| `data`          | `readonly T[]`      | _required_     | Data rows to display                                            |
| `headerColor`   | `string`            | `"$fg-accent"` | Theme token or color for header text                            |
| `showHeader`    | `boolean`           | `true`         | Render the header row                                           |
| `padding`       | `number`            | `2`            | Total horizontal padding per cell, in cells                     |
| `frame`         | `boolean`           | `false`        | Draw document-table chrome (outer border + column separators)   |
| `cellWrap`      | `TextProps["wrap"]` | `"truncate"`   | Body-cell overflow behavior; also decides each column's floor   |
| `rowSeparators` | `boolean`           | `false`        | Draw a rule between body rows (framed / document presentations) |

`cellWrap` accepts the full [wrap-mode vocabulary](/guide/layouts#text-layout) (`"wrap"`, `"even"`, `"hard"`, `"truncate"`, `"truncate-start"`, `"truncate-middle"`, `"truncate-end"`, `"clip"`, `false`). It is load-bearing beyond appearance: word-aware modes let a column wrap rather than truncate when space runs out.

### Column

```ts
type Column<T> = {
  /** Column header text. */
  header: string
  /** Key to read from the data item. */
  key?: keyof T & string
  /** Custom renderer; a returned string also participates in intrinsic sizing. */
  render?: (item: T, index: number) => React.ReactNode
  /** Text alignment. */
  align?: "left" | "right" | "center"
  /** Fixed total track width. */
  width?: number
  /** Smallest total width the allocator may assign to this track. */
  minWidth?: number
  /** Largest total width the allocator may assign to this track. */
  maxWidth?: number
  /** Allow this track to consume positive free space. */
  grow?: boolean
  /** Allow this track to yield under negative free space. */
  shrink?: boolean
}
```

`width`, `minWidth`, and `maxWidth` are **total** track widths — cell padding included.

## Column widths

Omit `width` and the table sizes the column itself. It measures a `[min-content, max-content]` band from the rendered cell text, then hands the whole set of bands plus the measured container width to the shared `apportion()` allocator: one tension slides every column across its own band together, so wide prose yields most of the deficit, short columns barely move, and no column shrinks as the terminal widens.

When the container is too narrow for every column's floor, the table escalates in three visible rungs — bands as measured, then (for wrap-capable `cellWrap` modes) character-level wrapping with floors dropped to one cell, then a flex fallback where truncation marks the loss with an ellipsis. **Truncation is only the last rung**, not the general behavior: with a word-aware `cellWrap`, a column that runs out of room wraps instead.

[Width Allocation](/guide/width-allocation) documents the model in full, including `feasible`, monotone rounding, and how to call `apportion()` from your own layouts.

## Output

Plain (default):

```
Name     Status    Count
Item 1   active       42
Item 2   pending       7
```

With `frame`:

```
┌──────────┬──────────┬───────┐
│ Name     │  Status  │ Count │
├──────────┼──────────┼───────┤
│ Item 1   │  active  │    42 │
│ Item 2   │  pending │     7 │
└──────────┴──────────┴───────┘
```

## Examples

### Auto-sized columns

```tsx
const columns = [
  { key: "file", header: "File" },
  { key: "size", header: "Size", align: "right" },
]

<Table
  columns={columns}
  data={[
    { file: "README.md", size: "2.4 KB" },
    { file: "package.json", size: "1.1 KB" },
  ]}
/>
```

Every column auto-sizes from its measured content and the available width. No `width` values, no proportional math.

### Steering the allocator

```tsx
<Table
  data={packages}
  cellWrap="wrap"
  columns={[
    { key: "name", header: "Package", minWidth: 16 },
    { key: "version", header: "Version", width: 10, align: "right" },
    { key: "description", header: "Description", grow: true },
  ]}
/>
```

`width` pins a column rigid; `minWidth` / `maxWidth` clamp the measured band; `grow` marks the column that absorbs whatever space the others leave. `cellWrap="wrap"` lets narrow columns break lines instead of truncating.

### Custom cell rendering

```tsx
<Table
  data={runs}
  columns={[
    { key: "id", header: "Run" },
    {
      header: "State",
      render: (run) => (run.ok ? "passed" : "failed"),
    },
  ]}
/>
```

A `render()` that returns a string or number participates in intrinsic sizing, so the column is measured from the *rendered* text — a long source field rendered down to a short label does not inflate the column. A `render()` returning a React node contributes nothing to the measurement; give such a column an explicit `minWidth`.

## See Also

- [Width Allocation](/guide/width-allocation) — the allocator behind column sizing
- [Text Layout](/guide/layouts#text-layout) — wrap modes and what each does to a column's floor
