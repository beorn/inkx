# Table

Generic one-row data display with intrinsic column sizing, alignment, custom
React cells, and truncation.

## Import

```tsx
import { Table, type TableColumn } from "silvery"
```

## Usage

```tsx
type Process = { name: string; status: string; count: number }

const columns = [
  { key: "name", header: "Name", grow: true },
  { key: "status", header: "Status", maxWidth: 12 },
  { key: "count", header: "Count", width: 8, align: "right" },
] as const satisfies readonly TableColumn<Process>[]

<Table
  columns={columns}
  data={[
    { name: "Item 1", status: "active", count: 42 },
    { name: "Item 2", status: "pending", count: 7 },
  ]}
/>
```

## Props

| Prop          | Type                        | Default      | Description                  |
| ------------- | --------------------------- | ------------ | ---------------------------- |
| `columns`     | `readonly TableColumn<T>[]` | _required_   | Generic column definitions   |
| `data`        | `readonly T[]`              | _required_   | Data rows                    |
| `showHeader`  | `boolean`                   | `true`       | Show the header row          |
| `headerColor` | `string`                    | `$fg-accent` | Header text color            |
| `padding`     | `number`                    | `2`          | Minimum inter-column spacing |

### TableColumn

```ts
type TableColumn<T> = {
  header: string
  key?: keyof T & string
  render?: (item: T, index: number) => React.ReactNode
  align?: "left" | "right"
  width?: number
  minWidth?: number
  maxWidth?: number
  grow?: boolean
}
```

String cells truncate with an ellipsis when their track is narrower than the
value. Custom React cells remain intact but are measured and clipped to one
row, so a wrapping renderer cannot consume rows belonging to later items.

## Sizing

When `width` is omitted, Table uses the header and keyed values as the track's
intrinsic basis. Use `minWidth` / `maxWidth` to bound it and `grow` to let it
take remaining space. Only grow tracks shrink under overflow, preserving
fixed and intrinsic sibling columns.

## Custom Cells

```tsx
<Table
  columns={[
    { header: "Name", key: "name", grow: true },
    {
      header: "State",
      key: "state",
      render: (row) => <Text color="$fg-success">{row.state}</Text>,
    },
  ]}
  data={rows}
/>
```

## See Also

- [TreeTable](/components/TreeTable) -- hierarchical rows using the same Table contract
