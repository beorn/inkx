# Table

A generic data table with headers, aligned columns, intrinsic sizing, custom
React cells, and one-row truncation. Its opt-in interactive mode delegates row
navigation, pointer activation, scrolling, and follow behavior to `ListView`.

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

Interactive-only props:

| Prop               | Type                               | Default    | Description                                |
| ------------------ | ---------------------------------- | ---------- | ------------------------------------------ |
| `interactive`      | `true`                             | _omitted_  | Enable the stable-ID row cursor            |
| `getRowId`         | `(row, index) => string \| number` | _required_ | Stable row identity                        |
| `cursorId`         | `string \| number`                 | —          | Controlled cursor identity                 |
| `defaultCursorId`  | `string \| number`                 | first/last | Initial uncontrolled cursor                |
| `onCursorIdChange` | `(id) => void`                     | —          | Observe cursor identity changes            |
| `onActivate`       | `(row) => void`                    | —          | Enter/click row action                     |
| `height`           | `number`                           | row count  | Bounded data-row viewport height           |
| `active`           | `boolean`                          | `true`     | Whether the Table receives keyboard input  |
| `follow`           | `"none" \| "end"`                  | `"none"`   | Follow until navigation/scroll anchors     |
| `anchorKey`        | `string \| number`                 | —          | Reset unseen-row baseline on scope changes |

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

## Interactive Rows

```tsx
<Table
  interactive
  height={8}
  follow="end"
  anchorKey={`${base}:${filter}`}
  getRowId={(run) => run.id}
  columns={columns}
  data={runs}
  onActivate={(run) => openRun(run)}
/>
```

`j`/`k`, arrows, `g`/`G`, Home/End, and paging are ListView navigation.
Enter and a row click call `onActivate` exactly once. The cursor stores the ID,
so a surviving row remains selected across reshuffles. Moving away from the
live edge anchors the viewport; IDs absent from that baseline render as a
muted `N new` affordance. Returning to the end (including `G`) acknowledges the
count and resumes `follow="end"`.

Omitting `interactive` preserves the display-only component and its byte output.

## See Also

- [TreeTable](./TreeTable.md) -- hierarchical rows with the same columns
- [Box](./Box.md) -- layout container
