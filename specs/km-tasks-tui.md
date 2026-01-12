# Tasks TUI

Terminal UI for task management.

---

## Layout

### Split-Pane

```
┌────────────────────────────────────────────────────┐
│  [🔍 Type to search or create...              ⌘K] │
├────────────────────────────────────────────────────┤
│ @next (3)                                    [1]  │
│ ─────────────────────────────────────────────────  │
│ ▸ [.] Review Q1 budget      Work / Finance  -2d  │
│   [ ] Call dentist          Personal        today │
│   [ ] Fix login bug         Work / Auth          │
├────────────────────────────────────────────────────┤
│                                                    │
│  Review Q1 budget                                  │
│  ───────────────────────────────────────────────── │
│  Status: wip    Due: Jan 10 (overdue)             │
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
3. **Detail Pane** — Right side, selected task

---

## Search/Create Field

Unified NV-style input:

1. **Type to search** — Instant filter as you type
2. **Enter on match** — Select that task
3. **Enter on no match** — Create new task

```
[review budget]     → filters to matching tasks
[call mom]          → no match, Enter creates "call mom"
[#work fix bug]     → creates task with #work reference
```

**Fuzzy matching on:**
- Task content (title)
- Collapsed ancestor path
- References (`@`, `#`, `+`)
- Due date keywords ("today", "overdue")

---

## List Pane

### Columns

```
[mark] Title                    Project / Path      Due
─────────────────────────────────────────────────────────
[.]    Review Q1 budget         Work / Finance      -2d
[ ]    Call dentist             Personal            today
[x]    Setup repo               Work / Auth         ✓
[ ] ↻  Weekly review            Personal            Mon
```

| Column | Source | Width |
|--------|--------|-------|
| Mark | `[ ]` `[.]` `[x]` `[-]` | 3 |
| Recur | `↻` if recurring | 2 |
| Title | First line of content | flex |
| Project | Collapsed ancestors | 20 |
| Due | Relative due date | 8 |

### Status Marks

| Mark | Status | Display |
|------|--------|---------|
| `[ ]` | open | Default |
| `[x]` | done | Green, dim |
| `[-]` | dropped | Dim, strikethrough |

### Due Date Display

| Condition | Display |
|-----------|---------|
| Overdue | Red, bold, "-3d" |
| Due today | Yellow, "today" |
| Due tomorrow | Normal, "tomorrow" |
| This week | Dim, "Wed" or "3d" |
| Later | Dim, "Jan 15" |
| Done | Dim, "✓" |

---

## Detail Pane

Opens on `Enter` or `l`, closes on `Esc` or `h`.

```
┌─────────────────────────────────────────────┐
│ Task Title                            [Edit]│
├─────────────────────────────────────────────┤
│ Status:    [wip ▼]       Due: [Jan 10 🔴]  │
│ Project:   [Work / Finance              ▼] │
│ Owner:     [@bjorn                      ▼] │
│ Waiting:   [@sarah                      ▼] │
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
│ ## Linked from                              │
│ → Weekly Review                            │
│ → @bjorn / to-discuss                      │
└─────────────────────────────────────────────┘
```

### Field Editing

- Tab through fields
- Enter to edit
- Dropdowns for status, project

---

## Favorites

Number keys `1-6` open favorite boards. Configure in `.km/config.yml`:

```yaml
favorites:
  1: "@next"
  2: "@inbox"
  3: "@waiting"
  4: "@someday"
  5: "+current-project"
  6: "@bjorn"
```

### Board View

All boards display as columns:

```
@next                                        [1]
────────────────────────────────────────────────
┌──────────────────┐ ┌──────────────────┐
│ today            │ │ this-week        │
├──────────────────┤ ├──────────────────┤
│ 🔴 [.] Budget    │ │ [ ] Send invoice │
│    [ ] Dentist   │ │ [ ] Review PR    │
└──────────────────┘ └──────────────────┘
```

```
@waiting                                     [3]
────────────────────────────────────────────────
┌──────────────────┐ ┌──────────────────┐
│ @sarah           │ │ @vendor          │
├──────────────────┤ ├──────────────────┤
│ [ ] Approval     │ │ [ ] API access   │
│ [ ] Sign-off     │ │                  │
└──────────────────┘ └──────────────────┘
```

### Person Board

```
@bjorn                                       [6]
────────────────────────────────────────────────
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ to-discuss  │ │ discussed   │ │ done        │
├─────────────┤ ├─────────────┤ ├─────────────┤
│ [ ] Budget  │ │ [x] Hiring  │ │ [x] Offsite │
│ [ ] Q1 Plan │ │             │ │             │
└─────────────┘ └─────────────┘ └─────────────┘
```

---

## Keybindings

### Global

| Key | Action |
|-----|--------|
| `⌘K` | Focus search/create |
| `/` | Focus search |
| `1-6` | Open favorite |
| `?` | Help |
| `q` | Quit |
| `u` | Go up (parent view) |

### List Navigation

| Key | Action |
|-----|--------|
| `j/k` | Move down/up |
| `g/G` | First/last item |
| `Enter` | Open detail pane |
| `l` | Open detail pane |

### Task Actions

| Key | Action |
|-----|--------|
| `x` | Toggle done |
| `n` | Add to @next |
| `p` | Change project |
| `d` | Set due date |
| `s` | Change status |
| `w` | Set waiting (prompts for who) |
| `e` | Edit title inline |
| `N` | Add note |
| `a` | Add subtask |
| `@` | Insert reference |
| `D` | Delete |

### Inbox Actions

When viewing `@inbox`:

| Key | Action |
|-----|--------|
| `n` | Add to @next |
| `p` | Set project |
| `s` | Move to @someday |
| `d` | Mark done |
| `D` | Delete |

### Detail Pane

| Key | Action |
|-----|--------|
| `h/Esc` | Close pane |
| `e` | Edit content |
| `Tab` | Next field |
| `S-Tab` | Previous field |

### Visual Selection

| Key | Action |
|-----|--------|
| `v` | Start visual mode |
| `V` | Select entire task |
| `J/K` | Extend selection |
| `Esc` | Clear selection |

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

- Fuzzy search on names
- Recent projects at top
- Enter to move task

---

## Colors

| Element | Color |
|---------|-------|
| Selected row | Inverse |
| Task `[ ]` | Default |
| Task `[x]` | Green |
| Task `[-]` | Dim |
| Due (overdue) | Red |
| Due (today) | Yellow |
| Due (future) | Dim |
| Project path | Dim |
| Reference `@` | Blue |
| Reference `#` | Green |
| Reference `+` | Magenta |
| Wikilink | Cyan |

---

## See Also

- [km-tasks.md](km-tasks.md) — Overview
- [km-tasks-data.md](km-tasks-data.md) — Data model
- [km-tasks-cli.md](km-tasks-cli.md) — CLI spec
- [km-tasks-auto.md](km-tasks-auto.md) — Automation rules
