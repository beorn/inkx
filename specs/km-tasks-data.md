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
- [ ] Call dentist # list item with status = task

## [ ] Q1 Budget Review # heading with status = task
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

A board is a markdown file with H2 columns containing embedded task references:

```markdown
# @next.md

## today add="due:past status:todo"

- ![[tasks/review-budget]]
- ![[tasks/call-dentist]]

## this-week add="due:week status:todo -due:past"

- ![[tasks/send-invoice]]

## waiting sync=status:blocked

- ![[tasks/get-approval]]
```

Boards are populated by **column rules** or **manual curation**. See [Board System](#board-system) for details.

---

## Status Model

### Five Statuses

| Mark  | Status    | Meaning                      |
| ----- | --------- | ---------------------------- |
| `[ ]` | `todo`    | Available to work on         |
| `[/]` | `wip`     | Actively being worked on     |
| `[!]` | `blocked` | Waiting on something/someone |
| `[x]` | `done`    | Completed                    |
| `[-]` | `dropped` | Cancelled, won't do          |

### Why These Five?

Status answers one question: **Can I work on this?**

- `todo` — Yes, ready to pick up
- `wip` — Someone is actively working on it
- `blocked` — No, waiting on something/someone
- `done` — No, it's finished
- `dropped` — No, decided not to do it

### Status vs Board Position

`wip` is a **status** (intrinsic to the task) rather than just board column position because:

1. **Cross-board queries**: `status:wip` finds all in-progress tasks regardless of which board they're on
2. **Multi-board consistency**: A task on `@next`, `+project`, and `@bjorn` has one status, not three column positions
3. **Event semantics**: `task_claimed` → `wip`, `task_released` → `todo`

Board columns can use `sync=status:wip` to auto-populate based on status.

### Status Flow

```
todo [ ] ──→ wip [/] ──→ done [x]
  │            │
  │            └──→ blocked [!] ──→ wip [/]
  │
  └──────────────→ dropped [-]
```

### Column-Status Sync

Use `sync=` to bidirectionally link column membership with field values:

```markdown
## waiting sync=status:blocked

- ![[tasks/get-approval]]
```

Moving a task to `@next/waiting` sets `status=blocked`. When a task becomes blocked, it moves here automatically. See [Column Rules](#column-rules) for full syntax.

---

## Fields

### Core Fields

| Field    | Syntax              | Purpose                      |
| -------- | ------------------- | ---------------------------- |
| `due:`   | `due:2025-01-15`    | When it's due                |
| `start:` | `start:2025-01-20`  | Don't show until this date   |
| `p:`     | `p:1`               | Priority (1-5, 1=highest)    |
| `recur:` | `recur:FREQ=WEEKLY` | Recurrence rule (iCal RRULE) |

### References

| Sigil | Convention       | Example               |
| ----- | ---------------- | --------------------- |
| `@`   | People, contexts | `@bjorn`, `@phone`    |
| `#`   | Tags, categories | `#finance`, `#urgent` |
| `+`   | Projects         | `+website`, `+q1`     |

**@ for People vs Contexts:**

- **People** (`@bjorn`, `@sarah`): Delegation, collaboration, agenda items to discuss
- **Contexts** (`@phone`, `@computer`, `@errands`): GTD contexts — where/how you can do the task

Both use `@` because they answer "who/where can do this?" The first `@` becomes the **owner** (assignee) — typically a person. Contexts are usually used alone or after a person reference.

All references create links to boards.

Example: `- [ ] Review budget @bjorn @sarah #finance`

- `owner` = `bjorn` (first `@`)
- `refs` = `[@bjorn, @sarah, #finance]` (all refs)

### Schema

```typescript
interface Node {
  id: string;
  type: string; // file, folder, heading, list_item

  // Task fields (optional)
  status?: "todo" | "wip" | "blocked" | "done" | "dropped";
  owner?: string; // Extracted from first @ reference (without sigil)
  refs?: string[]; // All @, #, + references (with sigils)
  due?: string; // YYYY-MM-DD
  start?: string; // YYYY-MM-DD (defer until)
  p?: number; // Priority 1-5
  recur?: string; // iCal RRULE
  recur_prev?: string; // Previous instance ID
}
```

---

## Board System

### What Boards Do

Boards organize tasks into columns. Any markdown file with H2 sections and wikilinks is a board.

### Standard GTD Boards

| Board      | Purpose           | Populated By                             |
| ---------- | ----------------- | ---------------------------------------- |
| `@inbox`   | Unprocessed items | Column rule: `add="./inbox/**"`          |
| `@next`    | Next actions      | Manual + column rules (overdue/starting) |
| `@someday` | Maybe/later       | Manual curation only                     |

> **Multi-user note:** `@next` may become `@me` (current user's board) when multi-user support is added.

### Any Reference Can Be a Board

`@person`, `+project`, and `#tag` references can have boards — they're just markdown files:

- `@bjorn.md` — agenda for discussions with Bjorn
- `+website.md` — project board for website tasks
- `#urgent.md` — board for urgent items

If the board file doesn't exist, the reference is a broken link (like any wikilink). Create the file when needed.

### Board Files

```markdown
# @next.md

## today add="due:past status:todo" add="start:past status:todo"

- ![[tasks/review-budget]]

## this-week add="due:week status:todo -due:past"

- ![[tasks/send-invoice]]

## waiting sync=status:blocked

- ![[tasks/get-approval]]

## done sync=status:done

- ![[tasks/setup-repo]]
```

### Embedding (Symlinks)

Board items are **embeddings** (symlinks) to tasks. The `![[...]]` syntax creates an embed link node that references the original task.

**Operation semantics on embedded tasks:**

| Operation Type | Target  | Rationale                                      |
| -------------- | ------- | ---------------------------------------------- |
| **Positional** | Symlink | Board organization is independent of task data |
| **Content**    | Target  | Task data has single source of truth           |

- **Moving** a card within the board moves the symlink
- **Status/priority changes** update the original task
- **Deleting** a card removes the symlink (task remains)
- **Display** always reads from the target task

This allows tasks to appear on multiple boards (e.g., `@next`, `@bjorn`, `+project`) while maintaining consistent state.

### Column Rules

Columns can have rules that control task membership and field synchronization.

| Attribute | Syntax             | Effect                               |
| --------- | ------------------ | ------------------------------------ |
| `add`     | `add="query"`      | Pull in tasks matching query         |
| `sync`    | `sync=field:value` | Bidirectional: move here ↔ set field |

**`add="query"`** — Continuously pulls in matching tasks from anywhere:

```markdown
## today add="due:past status:todo" # Overdue open tasks appear here

## inbox add="./inbox/\*\*" # Files in inbox/ folder
```

**`sync=field:value`** — Bidirectional synchronization:

```markdown
## waiting sync=status:blocked # Move here → set blocked

                                       # Become blocked → move here

## done sync=status:done # Move here → set done

                                       # Become done → move here
```

### Display Attributes

```markdown
## done sync=status:done collapse=true

## wip limit=3

## review default=true
```

| Attribute       | Effect                     |
| --------------- | -------------------------- |
| `collapse=true` | Collapsed in UI            |
| `limit=N`       | WIP limit (visual warning) |
| `default=true`  | New items go here          |

### Future: JSON Sync Syntax

> **Note:** This syntax is planned but not yet implemented.

For more complex sync rules, a JSON-like syntax allows richer semantics:

```markdown
# My Board {sync: {add: backlinks}}

## Ready {sync: {status: todo}}

## In Progress {sync: {status: wip}}

## Waiting {sync: {status: blocked}}

## Done {sync: {status: done}}
```

**Board-level rules:**

| Property         | Effect                             |
| ---------------- | ---------------------------------- |
| `add: backlinks` | Pull nodes that link TO this board |
| `add: "./path"`  | Pull nodes matching path pattern   |

**Column-level rules:**

| Property        | Effect                                |
| --------------- | ------------------------------------- |
| `status: value` | Bidirectional: move here ↔ set status |
| `add: "query"`  | Pull matching nodes into this column  |

**Semantics:**

- `add: backlinks` — Find all nodes that contain a wikilink `[[Board Name]]` and embed them
- `status: todo` — When a node moves to this column, set `task_status = todo`. When a node's status becomes `todo`, move it here.

This enables automatic board population from backlinks, which is useful for project boards where tasks reference the project via `[[Project Name]]` or `+project-name`.

---

## Node Queries

See [km-query.md](km-query.md) for full query language specification.

**Quick reference:**

```bash
status:todo @bjorn           # Field match + reference
./inbox/** -status:done      # Path + negation
+website due:week            # Project ref + date
"budget"                     # Full-text search
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

| GTD Concept   | km Implementation                       |
| ------------- | --------------------------------------- |
| Inbox         | `inbox/` folder → `@inbox` board        |
| Next Actions  | `@next` board (curated)                 |
| Waiting For   | `@next/waiting` column (status=blocked) |
| Someday/Maybe | `@someday` board                        |
| Projects      | `+project` references                   |
| Contexts      | `@context` references                   |
| Reference     | Nodes without status                    |

**Key insight:** GTD "lists" are boards. Status (todo/wip/blocked/done/dropped) indicates whether you can work on it.

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
- [km-query.md](km-query.md) — Query language
- [km-tasks-templates.md](km-tasks-templates.md) — GTD and other templates
- [km-tasks-cli.md](km-tasks-cli.md) — CLI commands
- [km-tasks-tui.md](km-tasks-tui.md) — TUI spec
