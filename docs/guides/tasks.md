# Task Management

Task data model, boards, and GTD workflow.

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

### Five Statuses

| Mark  | Status    | Meaning                      |
| ----- | --------- | ---------------------------- |
| `[ ]` | `todo`    | Available to work on         |
| `[/]` | `wip`     | Actively being worked on     |
| `[!]` | `blocked` | Waiting on something/someone |
| `[x]` | `done`    | Completed                    |
| `[-]` | `dropped` | Cancelled, won't do          |

Status answers: **Can I work on this?**

- `todo` — Yes, ready to pick up
- `wip` — Someone is actively working on it
- `blocked` — No, waiting on something/someone
- `done` — No, it's finished
- `dropped` — No, decided not to do it

### Status Flow

```
todo [ ] ──→ wip [/] ──→ done [x]
  │            │
  │            └──→ blocked [!] ──→ wip [/]
  │
  └──────────────→ dropped [-]
```

---

## References

Sigils create links to nodes:

| Sigil | Convention       | Example               |
| ----- | ---------------- | --------------------- |
| `@`   | People, contexts | `@bjorn`, `@phone`    |
| `#`   | Tags, categories | `#finance`, `#urgent` |
| `+`   | Projects         | `+website`, `+q1`     |

Any reference can have a board — it's just a markdown file (`@bjorn.md`, `+website.md`).

**@ for People vs Contexts:**

- **People** (`@bjorn`, `@sarah`): Delegation, collaboration, agenda items
- **Contexts** (`@phone`, `@computer`, `@errands`): GTD contexts — where/how to do the task

All references create links to boards. The first `@` becomes the **assigned person** (assignee).

---

## Task Fields

| Field     | Syntax                  | Purpose                      |
| --------- | ----------------------- | ---------------------------- |
| `due::`   | `due:: 2026-01-15`     | When it's due                |
| `start::` | `start:: 2026-01-20`   | Don't show until this date   |
| `priority::` | `priority:: P1`     | Priority (P0-P4 convention)  |
| `recur::` | `recur:: every 2 weeks` | Recurrence rule (RRULE + FROM) |

Legacy `key:value` syntax (single colon, no space) is also accepted for
backward compatibility.

### Schema

```typescript
interface Node {
  id: string
  type: string

  // Task fields (optional)
  status?: "todo" | "wip" | "blocked" | "done" | "dropped"
  assigned_to?: string // First @ reference (without sigil)
  refs?: string[] // All @, #, + references (with sigils)
  due?: string // YYYY-MM-DD
  start?: string // YYYY-MM-DD (defer until)
  priority?: string // Priority (P0-P4 convention)
  rrule?: string // RRULE string (+ optional FROM=DUE)
  recur_prev?: string // Previous instance ID
}
```

---

## Board System

### What Boards Do

Boards organize tasks into columns. Any markdown file with H2 sections and wikilinks is a board.

### Board File Example

```markdown
# @next.md

## today km.add:: due:past status:todo km.add:: start:past status:todo

- ![[tasks/review-budget]]

## this-week km.add:: due:week status:todo -due:past

- ![[tasks/send-invoice]]

## waiting km.sync:: status:blocked

- ![[tasks/get-approval]]

## done km.sync:: status:done km.collapse:: true
```

### Column Rules

Columns can have rules that control task membership:

| Attribute    | Syntax                  | Effect                               |
| ------------ | ----------------------- | ------------------------------------ |
| `km.add`     | `km.add:: query`        | Pull in tasks matching query         |
| `km.sync`    | `km.sync:: field:value` | Bidirectional: move here ↔ set field |

> **Note:** `km.sync::` parsing is supported (stored in `node.rules.sync`), but automatic sync evaluation is planned for a future release. Currently, `km.sync::` rules serve as documentation of intended column behavior.

**`km.add:: query`** — Continuously pulls in matching tasks:

```markdown
## today km.add:: due:past status:todo # Overdue open tasks appear here

## inbox km.add:: ./inbox/**(.) # Files in inbox/ folder
```

**`km.sync:: field:value`** — Bidirectional synchronization:

```markdown
## waiting km.sync:: status:blocked # Move here → set blocked

                                     # Become blocked → move here

## done km.sync:: status:done # Move here → set done

                                     # Become done → move here
```

### Display Attributes

```markdown
## done km.sync:: status:done km.collapse:: true

## wip km.limit:: 3

## review
```

The first non-collapsed, non-removed column is the default target for `km add`. Override with `km.default:: true`.

| Attribute            | Effect                                          |
| -------------------- | ----------------------------------------------- |
| `km.collapse:: true` | Collapsed in UI                                 |
| `km.limit:: N`       | WIP limit (visual warning)                      |
| `km.default:: true`  | Override: new items go here instead of first col |

### Embeddings (Symlinks)

Board items are **embeddings** (symlinks) to tasks. The `![[...]]` syntax creates an embed link.

| Operation Type | Target  | Rationale                                      |
| -------------- | ------- | ---------------------------------------------- |
| **Positional** | Symlink | Board organization is independent of task data |
| **Content**    | Target  | Task data has single source of truth           |

- **Moving** a card within the board moves the symlink
- **Status/priority changes** update the original task
- **Deleting** a card removes the symlink (task remains)
- **Display** always reads from the target task

---

## Standard GTD Boards

| Board      | Purpose           | Populated By                                             |
| ---------- | ----------------- | -------------------------------------------------------- |
| `@next`    | Next actions      | Inbox column (`km.add:: ./inbox/**(.)`), overdue/starting rules |
| `@someday` | Maybe/later       | Manual curation only                                     |

---

## GTD Workflow

### 1. Capture

```bash
km new "Call dentist"              # → inbox/
km new "Review budget @bjorn"      # → inbox/, with @bjorn reference
```

### 2. Clarify (Process Inbox)

```bash
km inbox process
```

For each item:

- `n` — Add to @next (do soon)
- `p` — Set project
- `s` — Move to @someday
- `d` — Mark done
- `D` — Delete

### 3. Organize

Tasks go to boards via references:

```markdown
- [ ] Call vendor +website # → +website board
- [ ] Discuss budget @bjorn # → @bjorn board
```

### 4. Review

**Daily:**

```bash
km @next                  # What to work on today
km @next/waiting          # What's blocked
```

**Weekly Review:**

```bash
km inbox                  # Process anything left
km @next                  # Is everything current?
km @someday               # Anything ready to activate?
km task status:todo       # Any orphaned tasks?
```

### 5. Do

```bash
km @next          # Open next actions board
# Work through tasks, mark done with 'x'
```

---

## GTD Mapping

| GTD Concept   | km Implementation                       |
| ------------- | --------------------------------------- |
| Inbox         | `inbox/` folder → `@next/inbox` column  |
| Next Actions  | `@next` board (curated)                 |
| Waiting For   | `@next/waiting` column (status=blocked) |
| Someday/Maybe | `@someday` board                        |
| Projects      | `+project` references                   |
| Contexts      | `@context` references                   |
| Reference     | Nodes without status                    |

**Key insight:** GTD "lists" are boards. Status indicates whether you can work on it.

---

## Recurrence

### Clone-on-Complete

When a recurring task is completed:

1. Current task marked `done`
2. New task cloned with next occurrence date
3. New task links back via `recur_prev`

```
Task A (recur:: FREQ=WEEKLY)
├── [x] done 2026-01-06
├── [x] done 2026-01-13
└── [ ] due 2026-01-20  ← current
```

### RRULE Format

All recurrence rules are RRULE strings. By default, the next due date is
calculated from the completion date (`FROM=COMPLETED`). Add `FROM=DUE` for
calendar-anchored patterns.

```
recur:: FREQ=DAILY;INTERVAL=14                  # every 14 days (from completion)
recur:: FREQ=WEEKLY;BYDAY=MO,WE,FR              # Mon/Wed/Fri (from completion)
recur:: FREQ=MONTHLY;BYMONTHDAY=1;FROM=DUE      # 1st of month (from due date)
recur:: FREQ=WEEKLY;INTERVAL=2                   # every 2 weeks (from completion)
```

Natural language:

```
recur:: every 2 weeks                  # FREQ=WEEKLY;INTERVAL=2
recur:: every weekday on schedule      # FREQ=WEEKLY;BYDAY=MO,..,FR;FROM=DUE
recur:: daily                          # FREQ=DAILY
```

See [docs/design/recurrence.md](../design/recurrence.md) for the full
recurrence design and cross-system comparison.

---

## Special Locations

### Inbox Folder

Items in `inbox/` are unprocessed. The `km.add:: ./inbox/**(.)` column rule on `@next/inbox` adds them automatically.

### Archive Folder

Completed items can be moved to `archive/` (manual or via automation).

---

## Examples

### Simple Task

```markdown
- [ ] Call dentist @phone
```

### Task with Metadata

```markdown
- [ ] Review Q1 budget @bjorn #finance +q1 due:: 2026-01-15 priority:: P1
```

### Blocked Task

```markdown
- [!] Get budget approval @sarah
```

On `@next/waiting` → status auto-set to `blocked`.

### Recurring Task

```markdown
- [ ] Weekly review recur:: FREQ=WEEKLY;BYDAY=MO
```

---

## Design Principles

**From Notational Velocity:**

- Unified search/create field — type to filter OR create
- Instant incremental filtering — no submit button
- Keyboard-first — vim keys, no mouse required

**From Simplenote:**

- Minimal UI — content over chrome
- Frictionless capture — thought to task in one step

**From km:**

- Markdown-native — files you own
- Boards over statuses — organization through lists, not state
- Column rules — behavior defined in board files, not config

---

## GTD Template

The built-in GTD template creates standard boards:

```bash
km init gtd                # Create GTD boards/folders
km init gtd --dry-run      # Preview what would be created
```

### What Gets Created

**Folders:** `inbox/`, `archive/`

**Boards:**

```markdown
# @next.md

## Overdue km.add:: due:past status:todo km.add:: due:past status:wip km.color:: red

## Today km.add:: due:today status:todo km.add:: start:past status:todo km.color:: yellow

## inbox km.add:: ./inbox/**(.)

## processing

## next

## doing

## waiting km.color:: yellow

## done km.collapse:: true km.color:: green

## removed km.collapse:: true km.removed:: true
```

```markdown
# @someday.md

## maybe

## review
```

`km init gtd` is idempotent — safe to run multiple times.

---

## See Also

- [ref/task-fields.md](../ref/task-fields.md) — Task fields, cross-system mapping
- [ref/query.md](../ref/query.md) — Query language
- [storage.md](../storage.md) — Node schema details
