# Table

A generic data table with headers, aligned columns, intrinsic sizing, custom
React cells, and one-row truncation.

## Import

```tsx
import { Table, type TableColumn } from "silvery"
```

## Props

| Prop          | Type                        | Default      | Description                     |
| ------------- | --------------------------- | ------------ | ------------------------------- |
| `columns`     | `readonly TableColumn<T>[]` | **required** | Generic column definitions      |
| `data`        | `readonly T[]`              | **required** | Data rows                       |
| `showHeader`  | `boolean`                   | `true`       | Show the header row             |
| `headerColor` | `string`                    | `$fg-accent` | Header text color               |
| `padding`     | `number`                    | `2`          | Minimum spacing between columns |

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

`width` fixes a track. Otherwise the track uses its header and keyed values as
its intrinsic basis, respects `minWidth` / `maxWidth`, and fills remaining
space when `grow` is true. Every data item occupies one measured row; string
cells ellipsize and arbitrary React cells are clipped to that row.

## Usage

```tsx
<Table
  columns={[
    { header: "Name", key: "name", grow: true },
    { header: "Age", key: "age", width: 5, align: "right" },
  ]}
  data={[
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
  ]}
/>
```

Output:

```text
Name                 Age
Alice                 30
Bob                   25
```

## See Also

- [TreeTable](./TreeTable.md) -- hierarchical rows with the same columns
- [Box](./Box.md) -- layout container
