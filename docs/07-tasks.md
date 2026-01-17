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

All references create links to boards. The first `@` becomes the **owner** (assignee).

---

## Task Fields

| Field    | Syntax              | Purpose                      |
| -------- | ------------------- | ---------------------------- |
| `due:`   | `due:2025-01-15`    | When it's due                |
| `start:` | `start:2025-01-20`  | Don't show until this date   |
| `p:`     | `p:1`               | Priority (1-5, 1=highest)    |
| `recur:` | `recur:FREQ=WEEKLY` | Recurrence rule (iCal RRULE) |

### Schema

```typescript
interface Node {
  id: string;
  type: string;

  // Task fields (optional)
  status?: "todo" | "wip" | "blocked" | "done" | "dropped";
  owner?: string; // First @ reference (without sigil)
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

### Board File Example

```markdown
# @next.md

## today add="due:past status:todo" add="start:past status:todo"

- ![[tasks/review-budget]]

## this-week add="due:week status:todo -due:past"

- ![[tasks/send-invoice]]

## waiting sync=status:blocked

- ![[tasks/get-approval]]

## done sync=status:done collapse=true
```

### Column Rules

Columns can have rules that control task membership:

| Attribute | Syntax             | Effect                               |
| --------- | ------------------ | ------------------------------------ |
| `add`     | `add="query"`      | Pull in tasks matching query         |
| `sync`    | `sync=field:value` | Bidirectional: move here ↔ set field |

**`add="query"`** — Continuously pulls in matching tasks:

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

| Board      | Purpose           | Populated By                             |
| ---------- | ----------------- | ---------------------------------------- |
| `@inbox`   | Unprocessed items | Column rule: `add="./inbox/**"`          |
| `@next`    | Next actions      | Manual + column rules (overdue/starting) |
| `@someday` | Maybe/later       | Manual curation only                     |

---

## GTD Workflow

### 1. Capture

```bash
km new "Call dentist"              # → inbox/
km new "Review budget @bjorn"      # → inbox/, with @bjorn reference
```

### 2. Clarify (Process Inbox)

```bash
km @inbox process
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
km @inbox                 # Process anything left
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
| Inbox         | `inbox/` folder → `@inbox` board        |
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
# @inbox.md

## unprocessed add="./inbox/\*\*"
```

```markdown
# @next.md

## today add="due:past status:todo" add="start:past status:todo"

## this-week add="due:week status:todo -due:past"

## waiting sync=status:blocked

## done sync=status:done collapse=true
```

```markdown
# @someday.md

## maybe

## review
```

`km init gtd` is idempotent — safe to run multiple times.

---

## See Also

- [05-query.md](05-query.md) — Query language
- [03-storage.md](03-storage.md) — Node schema details
