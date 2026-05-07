---
mentions:
  - km
id: "@km/cmd/10-command-quality-review-and-refactoring"
aliases:
  - km-cmd.10
  - km-cmd-10
  - "@km/cmd/10"
created_at: 2026-01-17T23:24:49Z
closed_at: 2026-01-19T11:33:25Z
---

# [x] Command quality review and refactoring @km/cmd #task #P3

## Goal

After implementing the command system, step back and analyze whether commands can be consolidated by thinking in terms of **tree operations** rather than view-specific concepts (board/column/card/section).

## Key Questions

### 1. Movement Commands

Currently we have:

- `cursor_up/down` (visual), `cursor_prev/next` (structural)
- `nav_cross_column_left/right`
- `move_card_up/down`, `move_card_left/right`

Can these be unified as tree operations?

- `cursor_move(direction)` - one command, direction determines behavior
- `node_move(direction)` - move node in tree (reorder siblings, reparent)

### 2. Selection Commands

Currently:

- `select_toggle`, `select_all_siblings`, `select_all`
- `extend_select_up/down/left/right`
- `progressive_select_all`

Tree-first alternative:

- `select(scope)` where scope = "node" | "siblings" | "subtree" | "all"
- `extend_select(direction)` - unified with one direction param

### 3. View-Specific vs Tree-Generic

Which commands are genuinely view-specific?

- Column collapse (columns view only)
- Tab switching (tabs view only)

Which are tree operations wearing view-specific clothes?

- "Move card to column" = "Reparent node to sibling"
- "Move card up in column" = "Reorder among siblings"

### 4. The Core Tree Operations

Consider if ALL commands can map to these primitives:

- **Navigate**: move cursor through tree
- **Select**: mark nodes for bulk operations
- **Mutate**: change node properties (status, content)
- **Restructure**: move/reparent/reorder nodes
- **View**: change how tree is visualized (fold, depth, mode)

### 5. Command Parameterization

Instead of many specific commands, fewer parameterized ones:

```typescript
// Instead of 10 cursor commands:
cursor_move({ direction: "up" | "down" | "in" | "out" | ... })

// Instead of 6 extend_select commands:
extend_select({ direction: "up" | "down" | ... })

// Instead of 4 move_card commands:
node_move({ direction: "up" | "down" | "in" | "out" })
```

### 6. Terminology Audit

Review all command names against docs/* to ensure consistent terminology:

- Check docs/06-ui.md for navigation model terms
- Check docs/03-storage.md for data model terms
- Check docs/08-ui.md for UI element names
- Verify: Are we using "node" vs "card" vs "item" consistently?
- Verify: Are we using "parent/child/sibling" vs "column/row" appropriately?
- Verify: Direction terms match docs (prev/next vs up/down)

## Deliverables

- [ ] Audit of all commands with tree-operation mapping
- [ ] **Terminology review** against docs/* definitions
- [ ] Proposal for consolidated command set
- [ ] Identify commands that can be parameterized vs truly distinct
- [ ] Identify genuinely view-specific commands
- [ ] Update docs/09-commands.md with findings
- [ ] Create follow-up issues for consolidation/renaming work

## Why This Matters

- Simpler mental model for users
- Easier to maintain fewer commands
- Keybindings become more consistent
- @km/_orphan/sh becomes more intuitive
- Tree-first thinking enables future view modes
- **Consistent terminology** reduces cognitive load

