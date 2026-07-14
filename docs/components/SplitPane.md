# SplitPane

Controlled two-child pane layout with a visible divider, captured drag-resize,
integer cell minimums, row/column direction, and reversible secondary collapse.

`SplitPane` owns layout mechanics. The caller owns the ratio, whether the
secondary pane is collapsed, persistence, keyboard commands, and the domain
meaning of each pane.

## Import

```tsx
import { SplitPane } from "silvery"
```

## Usage

```tsx
import React, { useState } from "react"
import { SplitPane } from "silvery"

function TimelineWithDetail() {
  const [ratio, setRatio] = useState(0.52)
  const [detailClosed, setDetailClosed] = useState(false)

  return (
    <SplitPane
      direction="row"
      ratio={ratio}
      onRatioChange={setRatio}
      onRatioCommit={(next) => saveRatio(next)}
      minPrimarySize={80}
      minSecondarySize={72}
      secondaryCollapsed={detailClosed}
      primary={<Timeline />}
      secondary={<Detail onClose={() => setDetailClosed(true)} />}
    />
  )
}
```

`direction="row"` places the secondary pane to the right and renders a vertical
`│` sash. `direction="column"` places it below and renders a horizontal `─`
sash. The name describes child flow, avoiding the ambiguity of calling both a
row split and its vertical divider “horizontal.”

## Props

| Prop                 | Type                      | Default  | Description                                                         |
| -------------------- | ------------------------- | -------- | ------------------------------------------------------------------- |
| `direction`          | `"row" \| "column"`       | required | Child flow and divider orientation                                  |
| `ratio`              | `number`                  | required | Controlled primary fraction of non-divider cells                    |
| `onRatioChange`      | `(ratio) => void`         | --       | Called during captured pointer movement                             |
| `onRatioCommit`      | `(ratio) => void`         | --       | Called once when a resize gesture ends                              |
| `minPrimarySize`     | `number`                  | `0`      | Primary minimum on the split's main axis, in cells                  |
| `minSecondarySize`   | `number`                  | `0`      | Secondary minimum on the split's main axis, in cells                |
| `dividerSize`        | `number`                  | `1`      | Visible sash and hit-zone thickness, in cells                       |
| `secondaryCollapsed` | `boolean`                 | `false`  | Hide secondary layout and divider while keeping the subtree mounted |
| `primary`            | `ReactNode`               | required | Primary pane content                                                |
| `secondary`          | `ReactNode`               | required | Secondary pane content                                              |
| `dividerProps`       | `PaneDividerProps` subset | --       | Semantic colors and visual sash options                             |

Without `onRatioChange`, the divider remains visible but is non-interactive.
Use `onRatioCommit` for persistence so pointer movement does not write storage
on every cell.

When the container is smaller than both declared minimums combined, SplitPane
compresses the two allocations proportionally. Responsive callers should
normally switch to a single-pane presentation before reaching that state.

## Natural-size layout query

Silvery cannot infer the intrinsic size of arbitrary React children before
layout. Pass caller-known natural sizes to the pure resolver instead:

```tsx
const layout = resolveSplitPaneLayout({
  availableWidth: columns,
  availableHeight: rows,
  primary: { width: 80, height: 12 },
  secondary: { width: 72, height: 12 },
  dividerSize: 1,
  preferredDirection: "row",
})

// "row" when width fits, then "column" when height fits, else "single".
```

The resolver checks the main axis only: row uses natural widths and column uses
natural heights. Both children share the cross axis. This makes the policy
usable for height-scarce master/detail views without inventing hidden child
measurement.

`clampSplitPaneRatio()` and `splitPaneRatioAfterDrag()` expose the same pure
cell math used by the component for reducers and non-React renderers.

## SplitPane versus SplitView

- Use `SplitPane` for one controlled pair with a divider, drag resize, minimums,
  and collapse.
- Use [SplitView](./SplitView.md) to render an existing recursive binary pane
  tree. SplitView does not own interactive resize or reversible collapse.

Lifecycle-sensitive workspace renderers may intentionally keep a flat keyed
pane host so tree reshapes do not remount terminals, editors, or other stateful
guests. Those renderers can reuse SplitPane's pure ratio helpers and
`PaneDivider` without recursively composing `SplitPane`; the two-child layout
must not override guest-lifecycle invariants.

## See also

- [SplitView](./SplitView.md) -- recursive pane trees
- [Box](./Box.md) -- base flex layout
- [Divider](./Divider.md) -- static content separator
