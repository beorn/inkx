---
id: "@km/inbox/df4b"
aliases:
  - km-df4b
  - "@km/_orphan/df4b"
created_at: 2026-01-16T10:50:25Z
closed_at: 2026-01-16T11:35:20Z
---

# [x] Update architecture docs to reference km-board-navigation.md spec @km/_orphan #task #P3

Update architecture and spec docs to reference the new Visual Board Navigation Model spec.

## Files to Update

### 1. specs/README.md
- Add @km/board-navigation/md to the spec table
- Add terminology to glossary if needed (cursoring, extend-select, shifting, etc.)

### 2. specs/@km/tui-state/md
- Add reference to @km/board-navigation/md
- Update BoardAction section to mention visual navigation actions (CURSOR_*, EXTEND_SELECT_*, SHIFT_*)
- Ensure terminology is consistent ('cursoring' not 'cursor movement')

### 3. specs/@km/ui/md
- Add reference to @km/board-navigation/md for interactive navigation
- @km/ui/md focuses on display/rendering; @km/board-navigation/md focuses on interaction

### 4. CLAUDE.md
- May need to add @km/board-navigation/md to relevant sections

## Terminology Alignment
Per @km/board-navigation/md:
- 'cursoring' / 'cursor-select' = moving cursor (hjkl)
- 'navigating' = changing board root (zoom)
- 'extend-select' = extending selection (shift+hjkl)
- 'shifting' = moving nodes in visual direction (opt+hjkl)
- 'moving' = relocating nodes arbitrarily (m + destination)

## Layering Impact
The visual navigation model lives in the Board Layer (@km/core/board):
- spatialNav.ts implements cross-column algorithms
- boardReducer.ts handles CURSOR_*, EXTEND_SELECT_*, SHIFT_* actions
- TUI layer (@km/tui) maps keys to these actions

This is already consistent with @km/tui-state/md architecture.