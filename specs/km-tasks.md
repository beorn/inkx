# Tasks

Task management in km, inspired by Notational Velocity and Simplenote.

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
- Pure automation — rules populate boards, no magic queries

---

## GTD Quick Start

### 1. Capture

```bash
km add "Call dentist"              # → @inbox
km add "Review budget @bjorn"      # → @inbox + @bjorn board
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
- [ ] Call vendor +website           # → +website board
- [ ] Discuss budget @bjorn          # → @bjorn board
```

Blocked tasks go to waiting column:

```bash
km @next/waiting add ./tasks/approval
```

### 4. Review

```bash
km @next                  # What to work on
km @next/waiting          # What's blocked
km @someday               # Weekly review
```

### 5. Do

```bash
km @next          # Open next actions board
# Work through tasks, mark done with 'x'
```

---

## Getting Set Up

### Initial Setup

```bash
km auto setup                      # Create GTD boards
```

This creates: `@inbox`, `@next`, `@someday`, and the `inbox/` folder.

### Importing Existing Tasks

If you have a hierarchy of tasks (e.g., imported from another system):

```bash
# Preview what would be added
km @next add status:open due:today --dry-run

# Add all tasks due today or overdue
km @next add status:open due:past
km @next add status:open due:today

# Add open tasks from a specific project
km @next add +website status:open

# Add by path/glob
km @next add ./projects/urgent/**
```

### Bulk Board Population

```bash
# Add everything due this week to @next
km @next/this-week add status:open due:week

# Add high-priority items
km @next/today add status:open p:1

# Re-run all automations
km auto --all
```

### Query Examples

```bash
# Find tasks not yet organized
km task status:open -@next -@someday

# Find project tasks not scheduled
km task +website status:open due:none

# Find blocked items
km task status:blocked
```

---

## Core Concepts

### Four Statuses

Tasks have exactly four statuses:

| Mark | Status | Meaning |
|------|--------|---------|
| `[ ]` | `open` | Available to work on |
| `[!]` | `blocked` | Can't work on it (waiting/blocked) |
| `[x]` | `done` | Completed |
| `[-]` | `dropped` | Cancelled |

Status answers: "Can I work on this?"

### Boards = Organization

Boards are markdown files with columns. They're populated by automations or manual curation:

```markdown
# @next.md

## today
- [[tasks/call-dentist]]

## this-week
- [[tasks/review-budget]]

## waiting status:blocked
- [[tasks/get-approval]]
```

| Board | Purpose | How Populated |
|-------|---------|---------------|
| `@inbox` | Unprocessed items | Auto: `inbox/` folder |
| `@next` | Next actions | Manual + auto (overdue) |
| `@someday` | Maybe/later | Manual only |
| `+project` | Project tasks | Auto: `+project` ref |
| `@person` | Person agenda | Auto: `@person` ref |

### Column-Status Automation

Columns can auto-set status when tasks are moved:

```markdown
## waiting status:blocked
```

Moving to `@next/waiting` sets `status=blocked`.

### Automations Move Tasks

Rules automatically populate boards:

```yaml
# .km/auto/gtd.yml
rules:
  - name: surface-overdue
    trigger: due.passed
    where: { status: open }
    actions:
      - board.add: "@next"
```

See [km-tasks-auto.md](km-tasks-auto.md) for details.

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

## Key Features

### Unified Search/Create

Single input field:
- Type to filter existing tasks
- Enter on no match creates new task
- References in input (`@`, `#`, `+`) create links

### Node Queries

Space-separated terms, AND-ed together:

```bash
km task @bjorn status:open         # Has @bjorn AND is open
km task ./inbox/** -status:done    # In inbox AND not done
km task "budget"                   # Full-text search
```

See [Node Queries](km-tasks-data.md#node-queries) for full syntax.

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

## Related Specs

- [km-tasks-data.md](km-tasks-data.md) — Data model, queries, schema
- [km-tasks-auto.md](km-tasks-auto.md) — Automation rules
- [km-tasks-tui.md](km-tasks-tui.md) — TUI layout, keybindings
- [km-tasks-cli.md](km-tasks-cli.md) — CLI commands
- [km-tasks-prior-art.md](km-tasks-prior-art.md) — Research
