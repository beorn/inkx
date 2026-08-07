# Table

A data table with headers, column alignment, and self-allocating column widths.

## Import

```tsx
import { Table } from "silvery"
```

## Props

| Prop            | Type                | Default        | Description                                 |
| --------------- | ------------------- | -------------- | ------------------------------------------- |
| `columns`       | `Column<T>[]`       | **required**   | Column definitions                          |
| `data`          | `readonly T[]`      | **required**   | Data rows                                   |
| `showHeader`    | `boolean`           | `true`         | Show header row                             |
| `headerColor`   | `string`            | `"$fg-accent"` | Header text color                           |
| `padding`       | `number`            | `2`            | Total horizontal padding per cell           |
| `frame`         | `boolean`           | `false`        | Document-table chrome and column separators |
| `cellWrap`      | `TextProps["wrap"]` | `"truncate"`   | Body-cell overflow behavior                 |
| `rowSeparators` | `boolean`           | `false`        | Rules between body rows                     |

### Column

```ts
type Column<T> = {
  header: string
  key?: keyof T & string // Key to extract from the data row
  render?: (item: T, index: number) => React.ReactNode
  align?: "left" | "right" | "center"
  width?: number // Pin the track (auto-sized if omitted)
  minWidth?: number // Raise the measured floor
  maxWidth?: number // Lower the measured cap
  grow?: boolean // Take positive free space
  shrink?: boolean // Yield under negative free space
}
```

Columns without a `width` are measured and allocated by the shared width allocator — see [Width Allocation](/guide/width-allocation) and the [Table API reference](/api/table).

## Usage

```tsx
<Table
  columns={[
    { header: "Name", key: "name" },
    { header: "Age", key: "age", align: "right" },
  ]}
  data={[
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
  ]}
/>
```

Output:

```
Name    Age
Alice    30
Bob      25
```

## See Also

- [Width Allocation](/guide/width-allocation) -- how column widths are decided
- [Table API](/api/table) -- full props and examples
- [Box](./Box.md) -- layout container
