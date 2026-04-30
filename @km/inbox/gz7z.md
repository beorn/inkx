---
id: "@km/inbox/gz7z"
aliases:
  - km-gz7z
  - "@km/_orphan/gz7z"
created_at: 2026-01-17T22:59:06Z
closed_at: 2026-01-17T23:10:09Z
---

# [x] Refactor TUI long arrow functions to named functions @km/_orphan #task #P2

## Context

Per code style guidelines in CLAUDE.md section 5, long arrow functions in the main body of a function should be extracted to named functions placed after the return statement.

## Scope

Refactor all TUI code in `apps/km-tui/packages/km-ink/src/`:

### Board.tsx (primary file)
Long arrow functions to refactor:
- pushNavHistoryEntry
- getMaxSubIndex  
- updateSelectionRange
- clearSelection
- getSelectedCardIndices
- moveCardInColumn
- moveCardToColumn
- moveCardToColumnByIndex
- indentNode
- outdentNode
- progressiveSelectAll
- handleProjectSelect
- handleProjectCancel
- handleNewItemCreate
- handleNewItemCancel
- selectedPathSegments (IIFE)
- getTopBarBg

### Other files to check
- DetailPane.tsx
- ProjectPicker.tsx
- HelpOverlay.tsx
- NewItemDialog.tsx
- ListView.tsx
- TabsView.tsx
- Other view components

## Pattern

Convert from:
```tsx
const handleFoo = () => {
  // 10+ lines of logic
};
```

To:
```tsx
// At top of component - just the call
const result = handleFoo();

// After return statement
function handleFoo() {
  // 10+ lines of logic
}
```

## Exception
Very short lambdas (1-3 lines) can remain inline.