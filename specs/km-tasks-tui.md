# Tasks TUI

Terminal UI for task management.

> Field names follow [Unified Names](km-tasks-data.md#unified-names).

---

## Layout

### Split-Pane

```
┌────────────────────────────────────────────────────┐
│  [🔍 Type to search or create...              ⌘K] │
├────────────────────────────────────────────────────┤
│ Today (3)                              [1]        │
│ ─────────────────────────────────────────────────  │
│ ▸ [/] Review Q1 budget      Work / Finance  -2d  │
│   [ ] Call dentist          Personal        today │
│   [ ] Fix login bug         Work / Auth          │
├────────────────────────────────────────────────────┤
│                                                    │
│  Review Q1 budget                                  │
│  ───────────────────────────────────────────────── │
│  Status: in_progress    Due: Jan 10 (overdue)     │
│  Project: Work / Finance                          │
│                                                    │
│  Need to compare with [[Q4 Actuals]].             │
│                                                    │
│  ## Subtasks                                       │
│  [x] Pull last year data                          │
│  [ ] Compare forecasts                            │
│                                                    │
└────────────────────────────────────────────────────┘
```

### Components

1. **Search/Create Field** — Top, always visible
2. **List Pane** — Left side, task list
3. **Detail Pane** — Right side, selected task details

---

## Search/Create Field

NV-style unified input:

1. **Type to search** — Instant filter as you type
2. **Enter on match** — Select that task
3. **Enter on no match** — Create new task

```
[review budget]     → filters to matching tasks
[call mom]          → no match, Enter creates "call mom"
[#work fix bug]     → creates task tagged #work
```

**Fuzzy matching on:**
- Task content (title)
- Collapsed ancestor path
- Tags in content
- Due date keywords ("today", "overdue")

---

## List Pane

### Columns

```
[mark] Title                    Project / Path      Due
─────────────────────────────────────────────────────────
[/]    Review Q1 budget         Work / Finance      -2d
[ ]    Call dentist             Personal            today
[x]    Setup repo               Work / Auth         ✓
[ ] ↻  Weekly review            Personal            Mon
```

| Column  | Source                        | Width |
|---------|-------------------------------|-------|
| Mark    | `[ ]` `[x]` `[/]` from status | 3     |
| Recur   | `↻` if `recur` is set         | 2     |
| Title   | `content` first line          | flex  |
| Project | Collapsed ancestors           | 20    |
| Due     | Relative `due` or next recur  | 8     |

Recurring tasks show `↻` indicator after the mark.

### Due Date Display

| Condition    | Display                    |
|--------------|----------------------------|
| Overdue      | Red, bold, "-3d"           |
| Due today    | Yellow, "today"            |
| Due tomorrow | Normal, "tomorrow"         |
| This week    | Dim, "Wed" or "3d"         |
| Later        | Dim, "Jan 15"              |
| Done         | Dim, "✓"                   |

---

## Detail Pane

Opens on `Enter` or `l`, closes on `Esc` or `h`.

### Layout

```
┌─────────────────────────────────────────────┐
│ Task Title                            [Edit]│
├─────────────────────────────────────────────┤
│ Status:    [next ▼]      Due: [Jan 10 🔴]  │
│ Project:   [Work / Finance              ▼] │
│ Owner:     [bjorn                       ▼] │
│ Priority:  [★★☆☆☆]                         │
├─────────────────────────────────────────────┤
│ ## Description                              │
│                                             │
│ Task details in markdown...                 │
│ See [[Q4 Actuals]] for context.            │
│                                             │
├─────────────────────────────────────────────┤
│ ## Subtasks                                 │
│ [x] Pull last year data                    │
│ [ ] Compare forecasts                      │
│ + Add subtask                              │
├─────────────────────────────────────────────┤
│ ## Notes                                    │
│ 2025-01-10: Called vendor, waiting reply   │
│ 2025-01-08: Started research               │
│ + Add note                                 │
├─────────────────────────────────────────────┤
│ ## Linked from                              │
│ → Weekly Review                            │
│ → Project Alpha / Planning                 │
└─────────────────────────────────────────────┘
```

### Field Editing

- Tab through fields
- Enter to edit current field
- Dropdowns for status, project

---

## Views

Switch with number keys:

| Key | View     | Filter                                    |
|-----|----------|-------------------------------------------|
| `1` | Today    | `status IN (next, in_progress)` + overdue |
| `2` | Inbox    | `path LIKE 'inbox/%'`                     |
| `3` | All      | All open tasks                            |
| `4` | Projects | Grouped by ancestor                       |
| `5` | Waiting  | `status = waiting`                        |
| `6` | Someday  | Plain list items (type `list_item`)       |

### Today View

```
Today (3)                                    [1]
────────────────────────────────────────────────
🔴 [/] Review Q1 budget    Work / Finance   -2d
   [ ] Call dentist        Personal         today
   [ ] Fix login bug       Work / Auth
```

- Manual ordering via `parent_idx`
- Overdue tasks auto-surface at top (red indicator)
- Drag to reorder

### Inbox View

```
Inbox (5)                                    [2]
────────────────────────────────────────────────
   New note from meeting                    3h ago
   Call from John                           1d ago
   Idea: refactor auth                      2d ago
```

Actions: `t` (today), `p` (project), `s` (someday → converts to list item), `D` (delete)

### Projects View

```
Projects                                     [4]
────────────────────────────────────────────────
▼ Work / Finance / .md
    [ ] Review Q1 budget
    [ ] Send invoice

▼ Personal / Health
    [ ] Call dentist
    [ ] Schedule checkup
```

Expand/collapse with Enter.

---

## Project Picker

`p` opens fuzzy picker:

```
Move to project:
────────────────────────────
▸ Work / Finance
  Work / Auth
  Personal / Health
  [Create new project...]
────────────────────────────
Type to filter...
```

- Fuzzy search on project names
- Recent projects at top
- Enter to move task

---

## Keybindings

### Global

| Key     | Action                    |
|---------|---------------------------|
| `⌘K`    | Focus search/create field |
| `/`     | Focus search field        |
| `1-6`   | Switch view               |
| `?`     | Help                      |
| `q`     | Quit                      |

### List Navigation

| Key     | Action                    |
|---------|---------------------------|
| `j/k`   | Move down/up              |
| `g/G`   | First/last item           |
| `Enter` | Open detail pane          |
| `l`     | Open detail pane          |

### Task Actions

| Key     | Action                    |
|---------|---------------------------|
| `x`     | Toggle done               |
| `t`     | Add to today (→ next)     |
| `p`     | Change project            |
| `d`     | Set due date              |
| `s`     | Change status             |
| `S`     | Convert to someday (→ list item) |
| `e`     | Edit title inline         |
| `n`     | Add note                  |
| `a`     | Add subtask               |
| `@`     | Insert wikilink           |
| `D`     | Delete                    |

### Someday Actions

| Key     | Action                    |
|---------|---------------------------|
| `t`     | Promote to task + today   |
| `T`     | Promote to task only      |
| `p`     | Promote to task + project |
| `D`     | Delete                    |

### Detail Pane

| Key     | Action                    |
|---------|---------------------------|
| `h/Esc` | Close pane                |
| `e`     | Edit content              |
| `Tab`   | Next field                |
| `S-Tab` | Previous field            |

### Visual Selection

| Key     | Action                    |
|---------|---------------------------|
| `v`     | Start visual mode         |
| `V`     | Select entire task        |
| `J/K`   | Extend selection          |
| `Esc`   | Clear selection           |

---

## Colors

| Element          | Color    |
|------------------|----------|
| Selected row     | Inverse  |
| Task `[ ]`       | Default  |
| Task `[x]`       | Green    |
| Task `[/]`       | Yellow   |
| Due (overdue)    | Red      |
| Due (today)      | Yellow   |
| Due (future)     | Dim      |
| Project path     | Dim      |
| Type suffix      | Dim      |
| Wikilink         | Cyan     |

---

## See Also

- [km-tasks.md](km-tasks.md) — Overview
- [km-tasks-data.md](km-tasks-data.md) — Data model
- [km-tasks-cli.md](km-tasks-cli.md) — CLI spec
- [km-ui.md](km-ui.md) — Display functions
