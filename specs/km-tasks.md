# Tasks

Task management in km, inspired by Notational Velocity and Simplenote.

---

## Design Principles

**From Notational Velocity:**
- Unified search/create field — type to filter OR create
- Instant incremental filtering — no submit button
- Keyboard-first — vim keys, no mouse required

**From Simplenote:**
- Minimal UI — content over chrome
- Frictionless capture — thought to task in one step
- Tags over folders — flexible categorization

**From km:**
- Collapsing ancestors — `Taxes / .md #` shows hierarchy compactly
- Unified node schema — tasks are nodes
- Event log — full history, undo, sync
- Markdown-native — files you own

---

## Core Workflow

**Daily:**
1. Morning: Review Next list, curate from inbox/scheduled
2. During day: Work through Next actions, add notes, complete tasks
3. End of day: Process inbox, defer incomplete

**Weekly:**
1. Review projects, schedule tasks
2. Process Someday list
3. Archive completed

---

## Views

Six views accessed via number keys `1-6`:

| View     | Purpose                              |
|----------|--------------------------------------|
| Next     | Next actions, overdue surfaces       |
| Inbox    | Unprocessed items                    |
| All      | All open tasks                       |
| Projects | Grouped by ancestor                  |
| Waiting  | Blocked on external                  |
| Someday  | Maybe/later ideas                    |

See [TUI Views](km-tasks-tui.md#views) for filter definitions.

---

## Key Features

### Unified Search/Create

Single input field:
- Type to filter existing tasks
- Enter on no match creates new task
- `#tag` in input adds tag

### Split-Pane Layout

List (left) + Detail (right):
- Navigate list with j/k
- Enter opens detail pane
- h/Esc closes detail

### Easy Re-parenting

`p` key opens fuzzy project picker:
- Recent projects at top
- Type to filter
- Bulk move with visual selection

### Recurring Tasks

iCal RRULE format:
- When done, clone with next occurrence
- Original stays in history

### TextBundle Import/Export

Interop with Bear, Ulysses, Craft:
- `km import file.textbundle`
- `km export --textpack`

---

## Related Specs

- [km-tasks-data.md](km-tasks-data.md) — Data model, states, fields
- [km-tasks-tui.md](km-tasks-tui.md) — TUI layout, views, keybindings
- [km-tasks-cli.md](km-tasks-cli.md) — CLI commands

---

## See Also

- [km-ui.md](km-ui.md) — Collapsing, display functions
- [km-data-model.md](km-data-model.md) — Node schema
