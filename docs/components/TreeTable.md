# TreeTable

A passive tree with aligned Table columns. `TreeTable` flattens the hierarchy,
adds guides to the first column, and delegates sizing, alignment, custom cells,
and truncation to [Table](./Table.md).

## Import

```tsx
import { TreeTable } from "silvery"
```

## Props

| Prop          | Type                                             | Default      | Description                                     |
| ------------- | ------------------------------------------------ | ------------ | ----------------------------------------------- |
| `data`        | `readonly T[]`                                   | **required** | Root rows                                       |
| `columns`     | `readonly [TableColumn<T>, ...TableColumn<T>[]]` | **required** | Non-empty columns; the first is the tree column |
| `getChildren` | `(item: T) => readonly T[] \| undefined`         | **required** | Returns the children currently visible          |
| `guideStyle`  | `"unicode" \| "ascii"`                           | **required** | Guide character set                             |
| `showHeader`  | `boolean`                                        | `true`       | Canonical Table header option                   |
| `headerColor` | `string`                                         | `$fg-accent` | Canonical Table header color                    |
| `padding`     | `number`                                         | `2`          | Canonical Table inter-column padding            |

`TreeTable` has no expansion, selection, or navigation state. A consumer folds
a branch by returning no children for that row.

## Usage

```tsx
type Job = {
  name: string
  state: string
  visibleChildren?: readonly Job[]
}

const table = (
  <TreeTable
    data={jobs}
    columns={[
      { header: "JOB", key: "name", grow: true },
      { header: "STATE", key: "state", align: "right" },
    ]}
    getChildren={(job) => job.visibleChildren}
    guideStyle="unicode"
  />
)
```

Output:

```text
JOB                     STATE
build                 running
├── lint                 done
└── test              running
    └── integration   blocked
deploy                   todo
```

Roots have no guide. Descendants use continuation, branch, and last-child
guides. With `guideStyle="ascii"`, the same rows use `|`, `|--`, and `` `-- ``.

## See Also

- [Table](./Table.md) -- flat aligned data
- [TreeView](./TreeView.md) -- interactive expansion and navigation
