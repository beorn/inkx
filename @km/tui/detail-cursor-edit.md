---
id: "@km/tui/detail-cursor-edit"
aliases:
  - km-tui.detail-cursor-edit
  - km-tui-detail-cursor-edit
created_by: Bjørn Stabell
created_at: 2026-04-03T08:36:50Z
closed_at: 2026-04-03T15:09:43Z
close_reason: "Fixed: empty content nodes returned <></> (fragment) with no id,
  breaking cursor navigation. Restored <Box id={node.id} /> so cursor can find
  all nodes."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] [bug] Detail view: cursor disappears on cursor-down, editing non-functional @km/tui #bug #P1 @Bjørn Stabell

Two related bugs in detail view (right panel):

1. Cursor disappears when pressing j/down to move through sub-items
2. Cannot edit — cursor not visible, editing doesn't seem to work

Reported from user's vault at ~/Bear/Vault with TODO board. Screenshot shows board on left (working) and detail view on right (broken).

Likely related to recent changes:
- km-5's reactive migration (d98e5ea1, af9b23f2)
- km-5's selection engine changes (f5027677, 23cbebe3)
- Our CheckboxIcon integration into DetailView

## Reproduce
1. bun km view ~/Bear/Vault
2. Navigate to a card with sub-items (e.g., "Card" in TODO column)
3. Open detail view (Enter or appropriate key)
4. Press j/down to move cursor through sub-items
5. Observe: cursor disappears
6. Try to edit: nothing works

## Done when
- Cursor visible and navigable in detail view
- Editing works in detail view