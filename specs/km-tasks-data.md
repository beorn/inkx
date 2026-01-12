# Tasks Data Model

Data model for task management in km.

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

A board is a markdown file with H2 columns containing wikilinks to tasks:

```markdown
# @next.md

## today
- [[tasks/review-budget]]
- [[tasks/call-dentist]]

## this-week
- [[tasks/send-invoice]]
```

Boards are populated by **automations** or **manual curation**.

---

## Status Model

### Three Statuses

| Mark | Status | Meaning |
|------|--------|---------|
| `[ ]` | `open` | Available to work on |
| `[x]` | `done` | Completed |
| `[-]` | `dropped` | Cancelled, won't do |

**Three statuses only.** Everything else is a board or a field.

### Why So Few?

Status answers one question: **Can I work on this?**

- `open` — Yes
- `done` — No, it's finished
- `dropped` — No, I decided not to

Other concepts are fields or boards:

| Concept | Implementation | Why Not Status? |
|---------|----------------|-----------------|
| In progress | On `@next` board | Board membership shows intent |
| Waiting | `waiting:` field → `@waiting` board | Track WHO you're waiting on |
| Blocked | `blocked:` field → `@blocked` board | Track WHAT is blocking |
| Someday | `@someday` board | Just a list, no special semantics |

### Status Flow

```
open [ ] ──→ done [x]
  │
  └──→ dropped [-]
```

---

## Fields

### Core Fields

| Field | Syntax | Purpose |
|-------|--------|---------|
| `due:` | `due:2025-01-15` | When it's due |
| `start:` | `start:2025-01-20` | Don't show until this date |
| `p:` | `p:1` | Priority (1-5, 1=highest) |
| `waiting:` | `waiting:@sarah` | Who/what you're waiting on |
| `blocked:` | `blocked:"API migration"` | What's blocking this |
| `recur:` | `recur:FREQ=WEEKLY` | Recurrence rule (iCal RRULE) |

### References

| Sigil | Convention | Example |
|-------|------------|---------|
| `@` | People, contexts | `@bjorn`, `@phone` |
| `#` | Tags, categories | `#finance`, `#urgent` |
| `+` | Projects | `+website`, `+q1` |

First `@` is the **owner** (assignee). All references create links to boards.

### Schema

```typescript
interface Node {
  id: string;
  type: string;           // file, folder, heading, list_item

  // Task fields (optional)
  status?: 'open' | 'done' | 'dropped';
  owner?: string;         // First @ reference
  references?: string[];  // All @, #, + references
  due?: string;           // YYYY-MM-DD
  start?: string;         // YYYY-MM-DD (defer until)
  p?: number;             // Priority 1-5
  waiting?: string;       // Who/what waiting on
  blocked?: string;       // What's blocking
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
| `@waiting` | Waiting on others | Automation: has `waiting:` field |
| `@waiting/@sarah` | Waiting on Sarah | Automation: `waiting:@sarah` |
| `@blocked` | Blocked tasks | Automation: has `blocked:` field |
| `@someday` | Maybe/later | Manual curation only |

### Reference Boards

| Board | Purpose | Populated By |
|-------|---------|--------------|
| `+project` | Project tasks | Automation: `+project` reference |
| `@person` | Person agenda | Automation: `@person` reference |
| `#tag` | Tagged items | Automation: `#tag` reference |

### Board Files

```markdown
# @waiting.md

## @sarah
- [[tasks/budget-approval]]
- [[tasks/contract-review]]

## @vendor
- [[tasks/api-access]]
```

Sub-boards for waiting are auto-generated from the `waiting:` field value.

### Column Attributes

```markdown
## wip limit:3
## done collapse:true
## review default:true
```

| Attribute | Effect |
|-----------|--------|
| `limit:N` | WIP limit (visual warning) |
| `collapse:true` | Collapsed in UI |
| `default:true` | New items go here |

---

## Queries

### Query Syntax

Google-like search with filters:

```bash
km task budget                         # Full-text search
km task @bjorn                         # Has @bjorn reference
km task +website                       # Has +website reference
km task @next                          # On @next board
km task -@next                         # NOT on @next board
```

### Reference & Board Filters

| Query | Matches |
|-------|---------|
| `@bjorn` | Has @bjorn reference |
| `+website` | Has +website reference |
| `#urgent` | Has #urgent reference |
| `@next` | On @next board |
| `@waiting/@sarah` | On @waiting/@sarah board |
| `-@next` | NOT on @next board |

### Field Filters

| Filter | Matches |
|--------|---------|
| `status:open` | Status is open |
| `status:done` | Status is done |
| `due:today` | Due today |
| `due:past` | Overdue |
| `due:week` | Due within 7 days |
| `due:none` | No due date |
| `start:past` | Start date reached |
| `waiting:@sarah` | Waiting on Sarah |
| `owner:bjorn` | Owned by bjorn |
| `p:1` | Priority 1 |

### Path Filters

| Query | Matches |
|-------|---------|
| `inbox/` | In inbox folder |
| `projects/website/` | In specific folder |
| `projects/**` | Recursive glob |

### Combining Filters

```bash
km task status:open due:week           # Open + due this week
km task +website -@next                # Project tasks not on @next
km task budget owner:bjorn             # Search + filter
```

---

## Batch Operations

### Adding to Boards

Add multiple tasks to a board at once:

```bash
# Add by query
km @next add --query "status:open due:today"
km @next add --query "+website status:open"

# Add by path
km @next add --query "projects/website/**"

# Add specific tasks
km @next add task-1 task-2 task-3

# Preview first
km @next add --query "due:week" --dry-run

# Add to specific column
km @next add --query "due:today" --column today
```

### Removing from Boards

```bash
km @next remove --query "status:done"
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
| Waiting For | `waiting:` field → `@waiting` board |
| Someday/Maybe | `@someday` board (just a list) |
| Projects | `+project` references |
| Contexts | `@context` references |
| Reference | Nodes without status |

**Key insight:** GTD "lists" are boards. A task's status (open/done/dropped) is independent of which lists it's on.

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

### Waiting Task

```markdown
- [ ] Get budget approval waiting:@sarah
```

Appears on: `@waiting`, `@waiting/@sarah`

### Blocked Task

```markdown
- [ ] Deploy to prod blocked:"API migration"
```

Appears on: `@blocked`

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
