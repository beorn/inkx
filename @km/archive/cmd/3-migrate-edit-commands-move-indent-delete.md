---
mentions:
  - km
id: "@km/cmd/3-migrate-edit-commands-move-indent-delete"
aliases:
  - km-cmd.3
  - km-cmd-3
  - "@km/cmd/3"
created_at: 2026-01-17T23:23:49Z
closed_at: 2026-01-19T11:33:18Z
---

# [x] Migrate edit commands (move, indent, delete) @km/cmd #task #P2

## Commands to Migrate

### Card Movement

- move_card_up/down (reorder within column)
- move_card_left/right (between columns)
- move_card_to_column (1-9 shortcuts)

### Structural Operations

- indent_node (Tab), outdent_node (Shift-Tab)
- delete_node

## Key Challenge

Commands compute mutation action, return TAction. Effect layer handles storage + refresh.

## Source: Board.tsx

- moveCardInColumn(), moveCardToColumn(), moveCardToColumnByIndex()
- indentNode(), outdentNode()

## Acceptance Criteria

- [ ] All edit commands in @km/commands
- [ ] Commands return TAction (storage actions)
- [ ] Fractional indexing logic extracted to shared utility
- [ ] Unit tests with mock context

