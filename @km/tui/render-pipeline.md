---
id: "@km/tui/render-pipeline"
aliases:
  - km-tui.render-pipeline
  - km-tui-render-pipeline
created_by: claude:fcaad2fa
created_at: 2026-02-18T13:14:48Z
closed_at: 2026-02-20T08:14:03Z
---

# [x] Unified task/block/item rendering and styling pipeline @km/tui #task #P2 @claude:8f007ba9

Unified NodeView component replacing 4+ separate rendering paths.

## API
```tsx
NodeView({ node, style, isSelected, width, height })
```

### Styles (detail levels)
| Style | Where | Content |
|---|---|---|
| board | Column header | title + child count |
| column | Section header (§) | section name + count |
| tab | Tab bar | title pill |
| line | Subitem in card/detail | icon + title (1 line, truncated) |
| card | Board column | icon + title + badges + N subitems (as lines) + overflow |
| detail | Side pane | metadata table + body + children (as cards) + backlinks |

### Cross-cutting props
- `isSelected` — cursor highlight (inverse/bold/border)
- Status-based styling — isDone/isDropped dims entire subtree; isWip/isBlocked get accent colors

### Key principle
Children recurse one level down: detail→card→line. Same rich text pipeline, same icon/color logic, same badge formatting at every level.

### Current duplication to eliminate
- TreeNode.tsx (card rendering)
- TaskDetailPane (detail rendering)
- FolderDetailPane (folder detail)
- ColumnItems (children in detail pane)
- tree-node-helpers.ts (style computation)
- detail-pane-helpers.ts (formatting)
- shared-components.tsx (card wrapper)

### Benefits
- 1 component, 1 code path for all node display
- Detail pane automatically gets bullet formatting, status icons
- Cards and detail pane always visually consistent
- Easier to add new styles (e.g., timeline, calendar cell)