---
mentions:
  - km
id: "@km/silvery/table-component"
aliases:
  - km-silvery.table-component
  - km-silvery-table-component
created_by: claude:19080504
created_at: 2026-03-31T18:20:59Z
closed_at: 2026-03-31T19:03:00Z
close_reason: Table component (120 lines, 12 tests) — auto-width columns, custom
  renderers, grow columns. Used in tribe-watch (replaced 100 lines of manual
  table code).
owner: bjorn@stabell.org
---

# [x] Table/Grid component — auto-width columns from data @km/silvery #feature #P3

Silvery needs a Table or Grid component for tabular data display.

Motivation: tribe-watch had to build a custom auto-width table with computeColWidths + Cell + SessionRow + TableHeader. This pattern should be a reusable silvery component.

API sketch:

```tsx
<Table
  data={sessions}
  columns={[
    { header: 'NAME', key: 'name' },
    { header: 'ROLE', key: 'role' },
    { header: 'PROJECT', render: (s) => fmtProject(s) },
    { header: 'PID', key: 'pid' },
    { header: 'UP', render: (s) => fmtDur(s.uptimeMs) },
    { header: 'CONNECTION', key: 'conn', grow: true },
  ]}
/>
```

Features:

- Auto-width: columns sized to max(header, ...values) + padding
- Last column or grow:true column gets flexGrow={1}
- Header row with bold + $primary color
- Render functions for computed values
- Optional: sortable, selectable rows
- Uses Box flexbox layout (no padEnd strings)

