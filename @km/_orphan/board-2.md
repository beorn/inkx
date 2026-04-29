---
id: "@km/_orphan/board-2"
aliases:
  - km-board-2
created_at: 2026-01-17T22:41:32Z
closed_at: 2026-02-04T11:27:23Z
---

# [x] Refactor storybook to use production rendering code only @km/_orphan #task #P3

## Problem

The storybook (`apps/km-tui/packages/km-ink/tests/storybook.tsx`) defeats its purpose by implementing styling directly with `chalk` and custom Ink components instead of exercising the actual production rendering code.

## Progress Update (2026-01-18)

### Completed ✓
- [x] TopBar component extracted and used in storybook
- [x] getStatusIcon() used for task status rendering
- [x] renderRich() used for rich text demos
- [x] TreeNode component used with DI props (getChildren, getParentContext, getBoardPills)
- [x] colorize() used for tag pill styling
- [x] chalk usage reduced to only necessary cases (level setting + displayLength demo)
- [x] Header comment documents the "production code only" philosophy
- [x] In-memory stores for storybook isolation (nodeStore, childrenStore)

### Remaining
- [ ] CardsView/CardColumn reusability for storybook - currently uses custom CardsViewDemo
- [ ] Strikethrough for done/dropped tasks (currently disabled by design decision)
- [ ] Some sections still use raw `<Text color=...>` instead of production styling functions

## Files Modified
- `tests/storybook.tsx` - Now uses production components with DI
- `src/views/TopBar.tsx` - Extracted, reusable component
- `src/views/TreeNode.tsx` - Added DI props (children, getChildren, getParentContext, getBoardPills)

## Acceptance Criteria Status

- [x] No direct `chalk.*` calls in storybook (except displayLength demo) ✓
- [x] TopBar is an extracted, reusable component ✓
- [ ] CardsView/CardColumn is usable in storybook without Board.tsx (WIP - uses CardsViewDemo)
- [x] TreeNode demos use production component ✓
- [ ] Done/dropped tasks show strikethrough (disabled by design)
- [~] Storybook output matches actual app (mostly - some demos still simplified)