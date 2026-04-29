---
id: "@km/tui/signals/3-cursor-selection-reads-via-usesignal"
aliases:
  - km-tui.signals.3
  - km-tui-signals-3
  - "@km/tui/signals/3"
created_by: Bjørn Stabell
created_at: 2026-04-05T07:52:58Z
closed_at: 2026-04-05T09:22:35Z
close_reason: All 7 sel useAppStore selectors migrated to useSignal. Bridge
  deleted. grep useAppStore.*sel in views → 0 hits. 62 test files pass.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Cursor + selection reads via useSignal @km/tui #task #P2 @Bjørn Stabell

## Cursor + selection reads via useSignal

### Problem  
~15 useAppStore selectors in view files read sel.node.cursor(), sel.node.ids(), sel.text() through the Zustand store bridge. Each goes through: alien-signals → _selVersion bump → store notification → useAppStore re-evaluates selector. Extra indirection + timing issues.

### Solution
Replace useAppStore selectors that read sel state with useSignal(sel.node.cursor) etc. Direct subscription to the alien-signals computed — no bridge.

### Files (from grep)
- Board.tsx: cursor, selIds, textEditState, sel, hasDetailPane (~8 selectors)
- TreeNode.tsx: editNodeId (~1)
- CardColumn.tsx: isInlineEditing, isDirectlyEditing (~3)
- WorkspaceChrome.tsx: cursorId, moveMode (~2)
- ListView.tsx: editingNodeId (~1)
- TabsView.tsx: editingNodeId (~1)

### Depends on
- signals.2 (useSignal hook must exist first)

### Acceptance
```
grep 'useAppStore.*sel\.' apps/km-tui/src/views/ -r → 0 hits
grep 'useAppStore.*cursor' apps/km-tui/src/views/ -r → 0 hits
```