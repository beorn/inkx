# Tasks Data Model

Data model for task management in km.

> **Note:** This system is currently designed for tasks. Supporting other content types (notes, documents, etc.) may require adjustments to the model.

---

## Core Concepts

### Everything is a Node

km has one primitive: **nodes**. A node is a piece of content that can be:
- A file, folder, heading, list item, paragraph
- Optionally has a **status** (making it a task)
- Optionally has **references** to other nodes (`@`, `#`, `+`, `[[]]`)

### Node with Status = Task

Any node can become a task by having a status:

```markdown
- [ ] Call dentist                     # list item with status = task
## [ ] Q1 Budget Review                # heading with status = task
```

### References are Node Links

`@bjorn`, `#finance`, `+project`, and `[[note]]` are all **references to nodes**:

```markdown
- [ ] Review budget @bjorn #finance +q1-planning [[Q4-Report]]
```

- `@bjorn` → reference to node `@bjorn` (person/context)
- `#finance` → reference to node `#finance` (tag/category)
- `+q1-planning` → reference to node `+q1-planning` (project)
- `[[Q4-Report]]` → wikilink to node `Q4-Report`

All create links. The sigil is part of the node name.

### Boards Organize Tasks

A board is a markdown file with H2 columns containing transclusions to tasks:

```markdown
# @next.md

## today
- ![[tasks/review-budget]]
- ![[tasks/call-dentist]]

## this-week
- ![[tasks/send-invoice]]

## waiting
- ![[tasks/get-approval]]
```

Boards are populated by **automations** or **manual curation**.

---

## Status Model

### Four Statuses

| Mark | Status | Meaning |
|------|--------|---------|
| `[ ]` | `open` | Available to work on |
| `[!]` | `blocked` | Can't work on it (waiting/blocked) |
| `[x]` | `done` | Completed |
| `[-]` | `dropped` | Cancelled, won't do |

### Why These Four?

Status answers one question: **Can I work on this?**

- `open` — Yes
- `blocked` — No, waiting on something/someone
- `done` — No, it's finished
- `dropped` — No, I decided not to

### Status Flow

```
open [ ] ──→ blocked [!] ──→ open [ ]
  │              │
  └──────────────┼──→ done [x]
                 │
                 └──→ dropped [-]
```

### Column-Status Automation

Board columns can auto-set status when tasks are moved:

```markdown
## waiting status:blocked
- ![[tasks/get-approval]]
```

Moving a task to `@next/waiting` automatically sets `status=blocked`.

---

## Fields

### Core Fields

| Field | Syntax | Purpose |
|-------|--------|---------|
| `due:` | `due:2025-01-15` | When it's due |
| `start:` | `start:2025-01-20` | Don't show until this date |
| `p:` | `p:1` | Priority (1-5, 1=highest) |
| `recur:` | `recur:FREQ=WEEKLY` | Recurrence rule (iCal RRULE) |

### References

| Sigil | Convention | Example |
|-------|------------|---------|
| `@` | People, contexts | `@bjorn`, `@phone` |
| `#` | Tags, categories | `#finance`, `#urgent` |
| `+` | Projects | `+website`, `+q1` |

The **first** `@` reference becomes the **owner** (assignee). All references create links to boards.

Example: `- [ ] Review budget @bjorn @sarah #finance`
- `owner` = `bjorn` (first `@`)
- `references` = `[@bjorn, @sarah, #finance]` (all refs)

### Schema

```typescript
interface Node {
  id: string;
  type: string;           // file, folder, heading, list_item

  // Task fields (optional)
  status?: 'open' | 'blocked' | 'done' | 'dropped';
  owner?: string;         // Extracted from first @ reference (without sigil)
  references?: string[];  // All @, #, + references (with sigils)
  due?: string;           // YYYY-MM-DD
  start?: string;         // YYYY-MM-DD (defer until)
  p?: number;             // Priority 1-5
  recur?: string;         // iCal RRULE
  recur_prev?: string;    // Previous instance ID
}
```

---

## Board System

### What Boards Do

Boards organize tasks into columns. Any markdown file with H2 sections and wikilinks is a board.

### Standard GTD Boards

| Board | Purpose | Populated By |
|-------|---------|--------------|
| `@inbox` | Unprocessed items | Automation: `inbox/` folder |
| `@next` | Next actions | Manual + automation (overdue/starting) |
| `@someday` | Maybe/later | Manual curation only |

### Reference Boards

| Board | Purpose | Populated By |
|-------|---------|--------------|
| `+project` | Project tasks | Automation: `+project` reference |
| `@person` | Person agenda | Automation: `@person` reference |
| `#tag` | Tagged items | Automation: `#tag` reference |

### Board Files

```markdown
# @next.md

## today
- ![[tasks/review-budget]]

## this-week
- ![[tasks/send-invoice]]

## waiting status:blocked
- ![[tasks/get-approval]]
```

### Column Attributes

```markdown
## wip limit:3
## done collapse:true
## review default:true
## waiting status:blocked
```

| Attribute | Effect |
|-----------|--------|
| `limit:N` | WIP limit (visual warning) |
| `collapse:true` | Collapsed in UI |
| `default:true` | New items go here |
| `status:X` | Auto-set status when task added |

---

## Node Queries

Unified syntax for selecting nodes. Used by `km task`, `km @board add`, and anywhere nodes are filtered.

A query is a space-separated list of **terms**. All terms are AND-ed together (intersection).

### Term Types

| Pattern | Name | Description |
|---------|------|-------------|
| `@ref` | Reference | Node has this reference (contains) |
| `#tag` | Reference | Node has this tag (contains) |
| `+proj` | Reference | Node has this project ref (contains) |
| `./path` | Path | Node is under this relative path |
| `/path` | Path | Node is under this absolute path |
| `path/` | Path | Node path contains this string |
| `key:value` | Field | Field matches value |
| `-TERM` | Negation | Exclude nodes matching TERM |
| `"text"` | Search | Full-text search |

### Modifiers

| Suffix | Effect |
|--------|--------|
| `$` | Exact match (default is contains) |
| `**` | Recursive (for paths) |

### Reference Terms

Match nodes that have a reference:

```bash
@bjorn              # Has reference containing "bjorn"
@bjorn$             # Has exactly @bjorn reference
+website            # Has +website project ref
#urgent             # Has #urgent tag
-@bjorn             # Does NOT have @bjorn reference
```

### Path Terms

Match nodes by location:

```bash
./inbox             # Under ./inbox (relative to cwd)
./inbox/**          # Under ./inbox, recursive
/projects/web       # Under /projects/web (absolute)
projects/           # Path contains "projects/"
projects/**         # Contains "projects/", recursive
./tasks/budget$     # Exactly this path
```

### Field Terms

Match field values with `key:value`:

| Field | Values | Example |
|-------|--------|---------|
| `status` | open, blocked, done, dropped | `status:open` |
| `due` | today, past, week, none, YYYY-MM-DD | `due:past` |
| `start` | past, today, YYYY-MM-DD | `start:past` |
| `owner` | name | `owner:bjorn$` |
| `p` | 1-5 | `p:1` |

### Negation

Prefix any term with `-` to exclude:

```bash
-@bjorn             # Not assigned to bjorn
-status:done        # Not done
-./archive/         # Not in archive
```

### Combining Terms

Terms are AND-ed (all must match):

```bash
status:open due:week              # Open AND due this week
+website status:open              # Has +website AND is open
./inbox/** -status:done           # In inbox AND not done
@bjorn$ status:open p:1           # Exactly bjorn, open, priority 1
```

### Examples

```bash
# Find unorganized tasks
status:open -@next -@someday

# Find project tasks not scheduled
+website status:open due:none

# Find blocked items
status:blocked

# Find tasks in inbox folder
./inbox/**

# Find tasks mentioning budget
"budget"
```

---

## Board Commands

### Board/Column Paths

Boards and columns are addressed with path-like syntax:

```bash
km @next                       # View @next board
km @next/today                 # View today column
km @next/waiting               # View waiting column
km +website                    # View project board
```

### Adding to Boards

```bash
# Add by node query
km @next add status:open due:today
km @next/today add +website status:open
km @next/waiting add @sarah

# Add by path
km @next add ./inbox/**

# Add specific nodes by ID
km @next add task-1 task-2

# Preview first
km @next add due:week --dry-run
```

### Removing from Boards

```bash
km @next remove status:done
km @next/waiting remove @sarah
```

---

## Recurrence

### Clone-on-Complete

When a recurring task is completed:
1. Current task marked `done`
2. New task cloned with next occurrence date
3. New task links back via `recur_prev`

```
Task A (recur: FREQ=WEEKLY)
├── [x] done 2025-01-06
├── [x] done 2025-01-13
└── [ ] due 2025-01-20  ← current
```

### RRULE Format

```
recur:FREQ=DAILY
recur:FREQ=WEEKLY;BYDAY=MO,WE,FR
recur:FREQ=MONTHLY;BYMONTHDAY=1
recur:FREQ=WEEKLY;INTERVAL=2
```

---

## Special Locations

### Inbox Folder

Items in `inbox/` are unprocessed. Automation adds them to `@inbox` board.

### Archive Folder

Completed items can be moved to `archive/` (manual or via automation).

---

## GTD Mapping

| GTD Concept | km Implementation |
|-------------|-------------------|
| Inbox | `inbox/` folder → `@inbox` board |
| Next Actions | `@next` board (curated) |
| Waiting For | `@next/waiting` column (status=blocked) |
| Someday/Maybe | `@someday` board |
| Projects | `+project` references |
| Contexts | `@context` references |
| Reference | Nodes without status |

**Key insight:** GTD "lists" are boards. Status (open/blocked/done/dropped) indicates whether you can work on it.

---

## Examples

### Simple Task

```markdown
- [ ] Call dentist @phone
```

### Task with Metadata

```markdown
- [ ] Review Q1 budget @bjorn #finance +q1 due:2025-01-15 p:1
```

### Blocked Task

```markdown
- [!] Get budget approval @sarah
```

On `@next/waiting` → status auto-set to `blocked`.

### Recurring Task

```markdown
- [ ] Weekly review recur:FREQ=WEEKLY;BYDAY=MO
```

---

## See Also

- [km-tasks.md](km-tasks.md) — Overview
- [km-tasks-auto.md](km-tasks-auto.md) — Automation rules
- [km-tasks-cli.md](km-tasks-cli.md) — CLI commands
- [km-tasks-tui.md](km-tasks-tui.md) — TUI spec
