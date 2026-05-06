---
mentions:
  - km
id: "@km/tui/chord-vd-conflict"
aliases:
  - km-tui.chord-vd-conflict
  - km-tui-chord-vd-conflict
created_by: claude:ceb7c9cb
created_at: 2026-03-30T14:53:18Z
owner: bjorn@stabell.org
---

# [ ] Revisit v-chord keybinding conflicts: v d (hide done) vs due date mental model @km/tui #task #P3

## Problem

The 'v d' chord for toggle_hide_done conflicts with the user's mental model where 'd' means 'due date'. The due date command is 't d' (task chord prefix), but the user initially wanted 'v d' for due dates.

History: User wanted 'v d' for due dates, but it conflicted with 'done' (toggle_hide_done). Moved due dates to 'v x' but that conflicts with 'ignore_node'. Settled on 't d' for due dates.

## Current bindings

| Chord | Command             | Notes                            |
| ----- | ------------------- | -------------------------------- |
| v d   | toggle_hide_done    | 'd' = done (filtering)           |
| v x   | ignore_node         | 'x' = cross out / ignore         |
| v X   | toggle_show_ignored | shift variant, show/hide ignored |
| t d   | set_due_date        | 'd' = due date (task property)   |

## Options to explore

1. Keep as-is — 'v d' = done, 't d' = due date. Different chord prefixes disambiguate.
2. Move hide-done to 'v D' (shift-d) and free 'v d' for something else
3. Use 'v h' for hide-done ('h' = hide)
4. Accept the mnemonic overlap — users learn the prefix context

## Context

From /recall: chord design docs show 'v' prefix = view operations, 't' prefix = task properties. The separation is clean but 'd' meaning different things in each prefix is confusing.

