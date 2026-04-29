---
id: "@km/tui/tree/v4/p10-columns"
aliases:
  - km-tui.tree.v4.p10-columns
  - km-tui-tree-v4-p10-columns
created_by: Bjørn Stabell
created_at: 2026-04-09T04:11:33Z
---

# [ ] Phase 10: Delete @deprecated ColumnView + useColumns legacy wrapper @km/tui #task #P3

## What

use-columns.ts has @deprecated ColumnView interface and useColumns() wrapper. All new code should use colId string + useNode(id) + visibleLens. Find all consumers, migrate, delete.

## /complete

\`\`\`bash
rg 'ColumnView|useColumns' --glob '!.beads' --glob '!docs' --glob '!*.md' -t ts -c | wc -l  # 0 (or only type imports)
bun tsc --noEmit  # 0 new errors
\`\`\`