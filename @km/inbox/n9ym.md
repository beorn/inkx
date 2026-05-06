---
mentions:
  - km
id: "@km/inbox/n9ym"
aliases:
  - km-n9ym
  - "@km/_orphan/n9ym"
created_at: 2026-01-18T22:26:35Z
closed_at: 2026-01-20T00:58:14Z
---

# [x] Add keyboard shortcuts: page scroll and board node navigation @km/_orphan #feature #P3

## Keyboard Shortcuts for Navigation

All navigation is cursor-centric - scrolling is a side effect of cursor movement.

### 1. Page-Jump Cursor Movement (vim-style)

Move cursor by multiple items at once:

- **Ctrl+D**: Jump cursor down ~half page
- **Ctrl+U**: Jump cursor up ~half page

### 2. Board Node Navigation

Navigate the node tree:

- **Ctrl+J**: Next sibling board node
- **Ctrl+K**: Previous sibling board node
- **u**: Out (up to parent) - existing
- **i**: In (enter current node as board) - new
- **o**: Open item in detail view / external editor - existing

Note:

- Plain h/l/j/k still work for column/card movement
- Shift+J/K/H/L reserved for selection extension
- `[` and `]` reserved for history navigation

## Implementation

### Files to modify

- `apps/km-tui/packages/km-ink/src/keyboard-handler.ts`

### New key: 'i' for enter node

```tsx
// 'i': Enter current node as board (like 'o' but stays in board view)
if (input === 'i' && card) {
  const targetId = card.node.link_to || card.node.id;
  const zoomed = buildBoardState(targetId);
  zoomed.zoomStack = [...s.zoomStack, s.rootId || ''];
  pushNavHistoryEntry(...);
  ctx.setState(zoomed);
  return true;
}
```

### Sibling navigation (Ctrl+J/K)

```tsx
// Ctrl+J: next sibling board
if (input === 'j' && key.ctrl) {
  const currentRoot = getNode(ctx.state.rootId);
  const parent = currentRoot?.parent_id ? getNode(currentRoot.parent_id) : null;
  if (parent) {
    const siblings = getChildren(parent.id);
    const currentIdx = siblings.findIndex(s => s.id === currentRoot?.id);
    if (currentIdx >= 0 && currentIdx < siblings.length - 1) {
      const nextSibling = siblings[currentIdx + 1];
      const zoomed = buildBoardState(nextSibling.id);
      pushNavHistoryEntry(...);
      ctx.setState(zoomed);
    }
  }
  return true;
}
```

