# Tasks

Task management in km, inspired by Notational Velocity and Simplenote.

> **Note:** This system is designed for tasks. Supporting other content types may require interface adjustments but hopefully not the data model.

---

## Core Concepts

### Four Statuses

Tasks have exactly four statuses:

| Mark  | Status    | Meaning              |
| ----- | --------- | -------------------- |
| `[ ]` | `open`    | Available to work on |
| `[!]` | `blocked` | Waiting on something |
| `[x]` | `done`    | Completed            |
| `[-]` | `dropped` | Cancelled            |

Status answers one question: **Can I work on this?**

### Boards = Organization

Boards are markdown files with H2 columns containing task transclusions:

```markdown
# @next

## today add="due:past status:open"

- ![[tasks/review-budget]]

## waiting sync=status:blocked

- ![[tasks/get-approval]]
```

**Column rules** control task membership:

- `add="query"` — Pull in matching tasks
- `sync=field:value` — Bidirectional: move here ↔ set field

### References

Sigils create links to nodes:

| Sigil | Convention       | Example               |
| ----- | ---------------- | --------------------- |
| `@`   | People, contexts | `@bjorn`, `@phone`    |
| `#`   | Tags             | `#finance`, `#urgent` |
| `+`   | Projects         | `+website`, `+q1`     |

Any reference can have a board — it's just a markdown file (`@bjorn.md`, `+website.md`).

### Node Queries

Space-separated terms, AND-ed together:

```bash
km task @bjorn status:open         # Has @bjorn AND is open
km task ./inbox/** -status:done    # In inbox AND not done
km task "budget"                   # Full-text search
```

See [km-query.md](km-query.md) for full syntax.

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

## GTD Quick Start

### Setup

```bash
km init gtd                        # Create GTD boards
```

This creates: `@inbox`, `@next`, `@someday`, and the `inbox/` folder.

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

Blocked tasks go to waiting column:

```bash
km @next/waiting add ./tasks/approval
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
km @next/waiting          # Follow up on blocked items
km @someday               # Anything ready to activate?
km task status:open       # Any orphaned tasks?
```

### 5. Do

```bash
km @next          # Open next actions board
# Work through tasks, mark done with 'x'
```

---

## Key Features

### Unified Search/Create

Single input field:

- Type to filter existing tasks
- Enter on no match creates new task
- References in input (`@`, `#`, `+`) create links

### Batch Operations

Add multiple tasks to boards:

```bash
km @next add status:open due:today
km @next/today add +website status:open
km @next add ./projects/website/**
```

### Easy Re-parenting

`p` key opens fuzzy project picker:

- Recent projects at top
- Type to filter
- Bulk move with visual selection

### Recurring Tasks

iCal RRULE format:

- When done, clone with next occurrence
- Original stays in history

---

## Favorites

Number keys `1-6` open favorite boards. Configure in `.km/config.yml`:

```yaml
favorites:
  1: "@next"
  2: "@inbox"
  3: "@someday"
  4: "+current-project"
  5: "@bjorn"
```

---

## Related Specs

- **[km-tasks-data.md](km-tasks-data.md)** — Data Model
  - Core Concepts — nodes, status, references
  - Status Model — four statuses, status flow
  - Fields — due, start, priority, recurrence
  - Board System — columns, rules, display attributes
- **[km-tasks-cli.md](km-tasks-cli.md)** — CLI Commands
  - `km task` — list, filter, query
  - `km @board` / `+board` / `#board` — view/manage boards
  - `km new` — quick capture
  - `km status` / `km move` — task operations
- **[km-tasks-tui.md](km-tasks-tui.md)** — Terminal UI
  - Layout — split pane, search field
  - List Pane — columns, sorting, selection
  - Detail Pane — fields, subtasks, notes
  - Keybindings — navigation, actions, modes
  - Project Picker — fuzzy search, re-parenting
- **[km-tasks-templates.md](km-tasks-templates.md)** — Templates
  - GTD Template — `km init gtd`
  - Board Templates — @inbox, @next, @someday
  - Manual Override — `auto:ignore`
- **[km-query.md](km-query.md)** — Query Language
  - Field queries — `status:open`, `due:week`
  - Reference queries — `@bjorn`, `+project`
  - Path queries — `./inbox/**`
  - Full-text search — `"budget"`
- **[km-tasks-use-cases.md](km-tasks-use-cases.md)** — Use Cases
  - Inbox Processing — triage workflows
  - Board Navigation — columns, bulk ops
  - Status Changes — blocking, completion
  - Recurring Tasks — clone-on-complete
- **[km-tasks-prior-art.md](km-tasks-prior-art.md)** — Research
  - Metadata Syntax Comparison — todo.txt, TaskPaper, Obsidian, etc.
  - Recurrence Models — clone vs template vs hybrid
  - km Design Choices — rationale for decisions
