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

```yaml
# file with status = task
---
status: open
---
# Project Proposal
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

### Boards are Nodes with Columns

A board is a node that displays linked items in columns:

```markdown
# @bjorn.md

## to-discuss
- [[tasks/review-budget]]
- [[tasks/team-offsite]]

## discussed
- [[tasks/hiring-plan]]
```

When you add `@bjorn` to a task, a link appears on the `@bjorn` board.

---

## Unified Syntax

### `key:value` Everywhere

One syntax pattern for all metadata:

| Type | Syntax | Example |
|------|--------|---------|
| Reference | `@word` `#word` `+word` | `@bjorn #urgent +website` |
| Attribute | `key:value` | `due:2025-01-15 p:1` |
| Wikilink | `[[path]]` | `[[notes/meeting]]` |

### Task Example

```markdown
- [ ] Review Q1 budget @bjorn @sarah #finance +q1 due:2025-01-15 p:1
```

Parsed as:
- Content: "Review Q1 budget"
- Owner: `bjorn` (first `@`)
- References: `@bjorn`, `@sarah`, `#finance`, `+q1`
- Due: `2025-01-15`
- Priority: `1`

### Column Example

```markdown
## wip limit:3 set_status:wip
```

Parsed as:
- Column name: "wip"
- WIP limit: 3
- On enter: set task status to `wip`

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
| `[s]` | `someday` | Maybe/later |
| `[>]` | `waiting` | Waiting on external |
| `[<]` | `blocked` | Blocked by internal |

### Status Semantics

| Status | Use Case | Agent Behavior |
|--------|----------|----------------|
| `open` | Available to work on | Can pick up |
| `wip` | Actively working | In progress |
| `done` | Completed | Skip |
| `dropped` | Won't do | Skip |
| `someday` | Maybe later | Skip unless reviewing |
| `waiting` | Needs external input (human, API) | Cannot proceed autonomously |
| `blocked` | Needs internal dependency | Check blocker, may auto-resolve |

### Status Flow

```
open [ ] ──→ wip [.] ──→ done [x]
  │           │
  │           ├──→ waiting [>] ──→ (back to wip/open)
  │           │
  │           └──→ blocked [<] ──→ (auto-resolve → wip)
  │
  └──→ someday [s] ──→ (promote to open)
  │
  └──→ dropped [-]
```

---

## References

### Sigil Conventions

| Sigil | Convention | Creates Link To |
|-------|------------|-----------------|
| `@` | People, contexts | `@bjorn.md`, `@phone.md` |
| `#` | Tags, categories | `#finance.md`, `#urgent.md` |
| `+` | Projects | `+website.md`, `+q1.md` |
| `[[]]` | Any node | Explicit wikilink |

### Node Names Include Sigils

The sigil is part of the name:

```
@bjorn.md       # Person node named "@bjorn"
#finance.md     # Tag node named "#finance"
+q1-planning.md # Project node named "+q1-planning"
```

### First `@` is Owner

```markdown
- [ ] Task @bjorn @sarah #work
```

- `@bjorn` = owner (first `@`) AND reference
- `@sarah` = reference only
- `#work` = reference

All go to `references[]`. First `@` also sets `owner`.

### Reference Resolution

When you write `@bjorn`:
1. Look for `@bjorn.md` in root
2. Look for `people/@bjorn.md`
3. Look for `contexts/@bjorn.md`
4. Auto-create `@bjorn.md` if not found

---

## Boards

### Board = Node with Columns

Any node with H2 sections containing wikilinks is a board:

```markdown
# @bjorn.md

## to-discuss
- [[tasks/review-budget]]

## discussed
- [[tasks/hiring-plan]]

## action-needed
- [[tasks/send-proposal]]
```

### Column Metadata

Columns can have `key:value` attributes:

```markdown
## wip limit:3 set_status:wip

## done set_status:done collapse:true

## staging set_status:waiting set_waiting_for:QA
```

### Column Attributes

| Attribute | Effect |
|-----------|--------|
| `set_status:X` | Set task status when entering |
| `set_owner:@X` | Set task owner |
| `set_waiting_for:X` | Set waiting_for field |
| `limit:N` | WIP limit |
| `collapse:true` | Collapsed in UI by default |
| `default:true` | New items go here |

### Smart Defaults

Column names auto-map to behaviors:

| Column Name | Auto Behavior |
|-------------|---------------|
| `done`, `complete`, `finished` | `set_status:done` |
| `wip`, `doing`, `in-progress` | `set_status:wip` |
| `blocked`, `waiting` | `set_status:blocked` |
| `backlog`, `someday` | `set_status:someday` |

### Adding to Boards

When a task has `@bjorn`:

```markdown
- [ ] Review budget @bjorn #finance
```

The task appears on `@bjorn` board (in default column).

Equivalent to adding `[[tasks/review-budget]]` to `@bjorn.md`.

### Board as View

The board file stores:
- Which tasks (as wikilinks)
- Which column (under which H2)
- Column behaviors (as attributes)

The viewer renders task details by resolving links.

---

## Task Fields

### Node Schema

```typescript
interface Node {
  // Identity
  id: string;
  type: string;           // file, folder, heading, list_item, etc.

  // Task fields (optional - presence makes it a task)
  status?: Status;        // open, wip, done, dropped, someday, waiting, blocked
  owner?: string;         // First @ reference
  references?: string[];  // All @, #, + references
  due?: string;           // YYYY-MM-DD
  start?: string;         // YYYY-MM-DD (defer until)
  p?: number;             // Priority 1-5
  recur?: string;         // iCal RRULE
  recur_prev?: string;    // Previous instance ID
  waiting_for?: string;   // Who/what blocked on
}
```

### Inline Syntax

```markdown
- [ ] Task title @owner #tag +project due:DATE start:DATE p:N recur:RRULE
```

| Field | Syntax | Example |
|-------|--------|---------|
| Owner | `@name` (first) | `@bjorn` |
| References | `@name` `#tag` `+proj` | `@sarah #urgent +q1` |
| Due | `due:DATE` | `due:2025-01-15` |
| Start | `start:DATE` | `start:2025-01-20` |
| Priority | `p:N` | `p:1` |
| Recurrence | `recur:RRULE` | `recur:FREQ=WEEKLY` |
| Waiting for | `waiting_for:X` | `waiting_for:Sarah` |

### Frontmatter (File Tasks)

```yaml
---
status: wip
owner: bjorn
due: 2025-01-15
p: 1
references: ["@sarah", "#finance", "+q1"]
recur: FREQ=WEEKLY;BYDAY=MO
---
# Review Q1 Budget

Task description...
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

### Instance Linking

```typescript
interface Node {
  recur?: string;       // RRULE on active instance
  recur_prev?: string;  // ID of previous instance (linked list)
}
```

Traverse `recur_prev` to find history.

---

## Special Locations

### Inbox

Items in `inbox/` folder are unprocessed:

```
inbox/
├── quick-note.md
└── idea.md
```

**Not a status** — determined by location.

### Archive

Completed items can be moved to `archive/`:

```
archive/
├── 2025/
│   └── 01/
│       └── completed-task.md
```

**Not automatic** — explicit action to archive.

---

## Parsing Rules

### Task Line

```
- [mark] content @ref #ref +ref key:value [[link]]
```

1. `[mark]` → status (see mark table)
2. `@word` → first is owner, all go to references
3. `#word` → references
4. `+word` → references
5. `key:value` → attributes (no space around `:`)
6. `[[path]]` → wikilinks
7. Remaining text → content/title

### Heading with Attributes

```
## heading-text key:value key:value
```

1. `##` → heading level
2. Text before first `key:` → heading name
3. `key:value` pairs → attributes

### Values with Spaces

Quote values containing spaces:

```markdown
- [ ] Task waiting_for:"Sarah's review"
## column description:"Work in progress"
```

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

### Recurring Task

```markdown
- [ ] Weekly review @team #planning recur:FREQ=WEEKLY;BYDAY=MO start:2025-01-20
```

### Board (Person Agenda)

```markdown
# @bjorn.md

## to-discuss
- [[tasks/review-budget]]
- [[tasks/team-offsite]]

## discussed
- [[tasks/hiring-plan]]
```

### Board (Project Kanban)

```markdown
# +website.md

## backlog
- [[tasks/design-homepage]]

## wip limit:2 set_status:wip
- [[tasks/setup-repo]]

## review set_status:waiting
- [[tasks/code-review]]

## done set_status:done collapse:true
- [[tasks/create-project]]
```

### Board (GTD Context)

```markdown
# @phone.md

## calls
- [[tasks/call-dentist]]
- [[tasks/call-vendor]]
```

### Board (Next Actions)

```markdown
# @next.md

## today
- [[tasks/review-budget]]
- [[tasks/call-dentist]]

## this-week
- [[tasks/send-invoice]]
```

The "Next" view in the TUI is essentially viewing the `@next` board.

---

## GTD Mapping

| GTD Concept | km Implementation |
|-------------|-------------------|
| Inbox | `inbox/` folder |
| Next Actions | `@next.md` board or Next view |
| Projects | `+project` nodes or parent folders |
| Waiting For | `status = waiting` |
| Someday/Maybe | `status = someday` |
| Reference | Nodes without status |
| Contexts | `@phone.md`, `@computer.md` boards |

---

## See Also

- [km-tasks.md](km-tasks.md) — Overview
- [km-tasks-tui.md](km-tasks-tui.md) — TUI spec
- [km-tasks-cli.md](km-tasks-cli.md) — CLI spec
- [km-tasks-prior-art.md](km-tasks-prior-art.md) — Prior art research
