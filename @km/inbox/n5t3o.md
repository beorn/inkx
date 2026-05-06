---
mentions:
  - km
id: "@km/inbox/n5t3o"
aliases:
  - km-n5t3o
  - "@km/_orphan/n5t3o"
created_at: 2026-02-02T18:23:30Z
closed_at: 2026-02-02T18:38:36Z
---

# [x] TUI columns: scrolling causes content to disappear in non-selected columns @km/_orphan #bug #P1

When scrolling down in columns view, the content in non-selected columns disappears. Items show as just bullet points without text.

## Reproduction

1. Create a board with multiple columns, each with 20+ items
2. Switch to columns view (press 'v' until columns)
3. Scroll down in col1 (press 'j' several times)
4. Move to col2 (press 'l')
5. Scroll down in col2 (press 'j' several times)
6. Observe: col2 items show as just bullets without text content

## Expected

All column items should show their full content regardless of which column is selected.

## Analysis

The virtualization window in VirtualizedTreeCardList uses selectedCardIndex which is the board's global card index, not the column-local index. This causes the virtualization calculations to be incorrect for non-selected columns.

