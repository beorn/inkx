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

Boards are populated by **automations** — rules that add/remove tasks based on events.

---

## Status Model

### Status = Mark (1:1)

Each status has exactly one checkbox mark:

| Mark | Status | Meaning |
|------|--------|---------|
| `[ ]` | `open` | Available, not started |
| `[.]` | `wip` | In progress |
| `[x]` | `done` | Completed |
| `[-]` | `dropped` | Cancelled |

**Four statuses only.** Other states (waiting, someday, blocked) are handled by board membership, not status.

### Why Not More Statuses?

Previous designs had `[>]` waiting, `[s]` someday, `[<]` blocked. This created confusion:

- Two sources of truth (status AND board)
- Automations to keep them in sync
- Extra complexity with no clear benefit

**Simpler model:** Status = work state. Boards = organization/workflow.

- A task is `open` or `wip` regardless of which boards it's on
- Being on `@waiting` doesn't change the task's status
- Boards are views, not states

### Status Flow

```
open [ ] ──→ wip [.] ──→ done [x]
  │
  └──→ dropped [-]
```

---

## Board System

### What Boards Do

Boards organize tasks into columns. They're populated by automations:

| Board | Purpose | Populated By |
|-------|---------|--------------|
| `@inbox` | Unprocessed items | Items in `inbox/` folder |
| `@next` | Next actions | Manual + overdue/starting |
| `@waiting` | Waiting on others | Has `waiting:` field |
| `@waiting/@bjorn` | Waiting on Bjorn | `waiting:@bjorn` |
| `@someday` | Maybe/later | Manual curation |
| `@blocked` | Blocked tasks | Has `blocked:` field |
| `+project` | Project tasks | `+project` reference |
| `@person` | Person agenda | `@person` reference |
| `#tag` | Tagged items | `#tag` reference |

### Waiting Boards

Track WHO you're waiting on with sub-boards:

```markdown
- [ ] Get budget approval waiting:@sarah
- [ ] Await API response waiting:vendor
```

This creates entries on:
- `@waiting` (all waiting items)
- `@waiting/@sarah` (waiting on Sarah specifically)

View all items you're waiting on from Sarah:
```bash
km @waiting/@sarah
```

### Board Files

```markdown
# @waiting.md

## pending
- [[tasks/budget-approval]]
- [[tasks/api-response]]
```

Sub-boards are nested files:
```
@waiting.md           # All waiting items
@waiting/@sarah.md    # Waiting on Sarah
@waiting/@vendor.md   # Waiting on vendor
```

### Column Attributes

Columns can have `key:value` attributes:

```markdown
## wip limit:3
## done collapse:true
## review default:true
```

| Attribute | Effect |
|-----------|--------|
| `limit:N` | WIP limit (visual warning) |
| `collapse:true` | Collapsed in UI by default |
| `default:true` | New items go here |

---

## Task Fields

### Schema

```typescript
interface Node {
  // Identity
  id: string;
  type: string;           // file, folder, heading, list_item

  // Task fields (optional - presence makes it a task)
  status?: Status;        // open, wip, done, dropped
  owner?: string;         // First @ reference
  references?: string[];  // All @, #, + references
  due?: string;           // YYYY-MM-DD
  start?: string;         // YYYY-MM-DD (defer until)
  p?: number;             // Priority 1-5
  waiting?: string;       // Who/what waiting on
  blocked?: string;       // What's blocking (task ID or description)
  recur?: string;         // iCal RRULE
  recur_prev?: string;    // Previous instance ID
}

type Status = 'open' | 'wip' | 'done' | 'dropped';
```

### Inline Syntax

```markdown
- [ ] Task @owner #tag +project due:DATE start:DATE p:N waiting:WHO blocked:WHAT
```

| Field | Syntax | Example |
|-------|--------|---------|
| Owner | `@name` (first) | `@bjorn` |
| References | `@name` `#tag` `+proj` | `@sarah #urgent +q1` |
| Due | `due:DATE` | `due:2025-01-15` |
| Start | `start:DATE` | `start:2025-01-20` |
| Priority | `p:N` | `p:1` |
| Waiting | `waiting:WHO` | `waiting:@sarah` |
| Blocked | `blocked:WHAT` | `blocked:"API not ready"` |
| Recurrence | `recur:RRULE` | `recur:FREQ=WEEKLY` |

### Reference Sigils

| Sigil | Convention | Creates Link To |
|-------|------------|-----------------|
| `@` | People, contexts | `@bjorn.md`, `@phone.md` |
| `#` | Tags, categories | `#finance.md`, `#urgent.md` |
| `+` | Projects | `+website.md`, `+q1.md` |
| `[[]]` | Any node | Explicit wikilink |

### First `@` is Owner

```markdown
- [ ] Task @bjorn @sarah #work
```

- `@bjorn` = owner (first `@`) AND reference
- `@sarah` = reference only

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

Items in `inbox/` folder are unprocessed:

```
inbox/
├── quick-note.md
└── idea.md
```

Automation adds these to `@inbox` board.

### Archive Folder

Completed items can be moved to `archive/`:

```
archive/
├── 2025/
│   └── 01/
│       └── completed-task.md
```

---

## GTD Mapping

| GTD Concept | km Implementation |
|-------------|-------------------|
| Inbox | `inbox/` folder → `@inbox` board |
| Next Actions | `@next` board (curated + auto-surfaced) |
| Waiting For | `waiting:` field → `@waiting` board |
| Someday/Maybe | `@someday` board (manual) |
| Projects | `+project` references → `+project` boards |
| Contexts | `@context` references → `@context` boards |
| Reference | Nodes without status |

**Key insight:** GTD lists are boards, not statuses. A task's status (open/wip/done/dropped) is orthogonal to which GTD list it's on.

---

## Examples

### Simple Task

```markdown
- [ ] Call dentist @phone
```

### Task with Metadata

```markdown
- [ ] Review Q1 budget @bjorn @sarah #finance +q1 due:2025-01-15 p:1
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
- [ ] Weekly review recur:FREQ=WEEKLY;BYDAY=MO start:2025-01-20
```

### Person Board

```markdown
# @bjorn.md

## to-discuss
- [[tasks/review-budget]]
- [[tasks/team-offsite]]

## discussed
- [[tasks/hiring-plan]]
```

### Project Board

```markdown
# +website.md

## backlog
- [[tasks/design-homepage]]

## wip limit:2
- [[tasks/setup-repo]]

## done collapse:true
- [[tasks/create-project]]
```

---

## See Also

- [km-tasks.md](km-tasks.md) — Overview
- [km-tasks-auto.md](km-tasks-auto.md) — Automation rules
- [km-tasks-tui.md](km-tasks-tui.md) — TUI spec
- [km-tasks-cli.md](km-tasks-cli.md) — CLI spec
