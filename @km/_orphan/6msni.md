---
id: "@km/_orphan/6msni"
aliases:
  - km-6msni
created_at: 2026-02-02T10:13:40Z
closed_at: 2026-02-02T10:35:17Z
---

# [x] Review km-tui for React feature adoption @km/_orphan #feature #P2 @claude:5fa2decc

## Implementation Status

### Phase 1: ErrorBoundary ✅ DONE (commit 85cc47c9)
Added ErrorBoundary to 5 components:
- DetailPane.tsx - wraps content rendering
- TreeNode.tsx - protects recursive children
- Board.tsx - all 4 view modes (cards/columns/list/tabs)
- SearchDialog.tsx - wraps filtered results
- ConsoleModal.tsx - wraps console entries

### Phase 2: forwardRef ✅ DONE
| File | Handle Type | Methods |
|------|-------------|---------|
| CardColumn.tsx | VirtualizedCardListHandle | scrollToItem(index) |
| SearchDialog.tsx | SearchDialogHandle | focusInput(), clearQuery() |
| ConsoleModal.tsx | ConsoleModalHandle | scrollToBottom() |
| ColumnsView.tsx | ColumnTreeHandle, VirtualizedTreeCardListHandle | scrollToItem(index) |

### Phase 3: Concurrent Features ✅ DONE
- **useDeferredValue**: Added to SearchDialog for responsive filtering
- **useTransition**: Architecture uses Redux-style reducers - not suited without significant refactoring. Heavy filtering handled by useDeferredValue. Documented for future if perf issues arise.

### Error Logging Research Note
**Question**: Should we add error logging to file?

**Options to investigate**:
1. **@beorn/logger pattern**: Use existing debug logger infrastructure with log rotation
2. **DEBUG_LOG pattern**: Write to file via \`DEBUG=km:* DEBUG_LOG=/tmp/km-errors.log\`
3. **ErrorBoundary onError callback**: Already available, could write to logger

**Recommendation**: Verify if this is valuable by monitoring real error frequency first. If needed, the DEBUG_LOG pattern already exists and could be extended for ErrorBoundary errors.

### Low Priority (deferred)
- React DevTools support (see @km/_orphan/j4uan, P4)
- Offscreen API (experimental React feature)