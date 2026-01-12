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
- Unified node schema — tasks are nodes with status
- Event log — full history, undo, sync
- Markdown-native — files you own

---

## Core Concepts

### Everything is a Node

Any node can become a task by having a status:

```markdown
- [ ] Call dentist                     # list item with status
## [ ] Q1 Budget Review                # heading with status
```

### References Create Links

`@bjorn`, `#finance`, `+project` are references to nodes:

```markdown
- [ ] Review budget @bjorn #finance +q1
```

All create links. First `@` is owner.

### Boards Display Tasks

A board is a node with columns (H2 sections) containing wikilinks:

```markdown
# @bjorn.md

## to-discuss
- [[tasks/review-budget]]

## discussed
- [[tasks/hiring-plan]]
```

---

## Core Workflow

**Daily:**
1. Morning: Review Next list, curate from inbox
2. During day: Work through tasks, add notes, complete
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
| Next     | Open + WIP tasks, overdue surfaces   |
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
- References in input (`@`, `#`, `+`) create links

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

- [km-tasks-data.md](km-tasks-data.md) — Data model, status, boards
- [km-tasks-tui.md](km-tasks-tui.md) — TUI layout, views, keybindings
- [km-tasks-cli.md](km-tasks-cli.md) — CLI commands
- [km-tasks-prior-art.md](km-tasks-prior-art.md) — Prior art research
