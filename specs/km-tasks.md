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

Tasks go to boards via references and fields:

```markdown
- [ ] Call vendor +website           # → +website board
- [ ] Discuss budget @bjorn          # → @bjorn board
- [ ] Await approval waiting:@sarah  # → @waiting/@sarah board
```

### 4. Review

```bash
km @next          # What to work on
km @waiting       # What's blocked on others
km @waiting/@sarah  # What's Sarah got?
km @someday       # Weekly review
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

This creates: `@inbox`, `@next`, `@waiting`, `@someday`, `@blocked`, and the `inbox/` folder.

### Importing Existing Tasks

If you have a hierarchy of tasks (e.g., imported from another system):

```bash
# Preview what would be added
km @next add --query "status:open due:today" --dry-run

# Add all tasks due today or overdue
km @next add --query "status:open due:past"
km @next add --query "status:open due:today"

# Add open tasks from a specific project
km @next add --query "ref:+website status:open"

# Add by path/glob
km @next add --path "projects/urgent/**"
```

### Bulk Board Population

```bash
# Add everything due this week to @next
km @next add --query "status:open due:week" --column this-week

# Add high-priority items
km @next add --query "status:open p:1"

# Set up waiting board from existing waiting: fields
km auto --all    # Re-run all automations
```

### Query Examples

```bash
# Find tasks not yet organized
km task status:open -@next -@someday

# Find project tasks not scheduled
km task +website status:open due:none

# Find blocked items
km task @blocked
```

---

## Core Concepts

### Three Statuses

Tasks have exactly three statuses:

| Mark | Status | Meaning |
|------|--------|---------|
| `[ ]` | `open` | Available to work on |
| `[x]` | `done` | Completed |
| `[-]` | `dropped` | Cancelled |

**That's it.** Status answers: "Can I work on this?"

Everything else — waiting, blocked, someday, in-progress — is a board or field.

### Boards = Organization

Boards are markdown files with columns. They're populated by automations or manual curation:

```markdown
# @next.md

## today
- [[tasks/call-dentist]]

## this-week
- [[tasks/review-budget]]
```

| Board | Purpose | How Populated |
|-------|---------|---------------|
| `@inbox` | Unprocessed items | Auto: `inbox/` folder |
| `@next` | Next actions | Manual + auto (overdue) |
| `@waiting` | Waiting on others | Auto: `waiting:` field |
| `@someday` | Maybe/later | Manual only |
| `@blocked` | Blocked by something | Auto: `blocked:` field |
| `+project` | Project tasks | Auto: `+project` ref |
| `@person` | Person agenda | Auto: `@person` ref |

### Fields for Context

| Field | Purpose | Creates Board Entry |
|-------|---------|---------------------|
| `waiting:@sarah` | Who you're waiting on | `@waiting/@sarah` |
| `blocked:"reason"` | What's blocking | `@blocked` |
| `due:2025-01-15` | When it's due | (triggers @next if overdue) |
| `start:2025-01-20` | Don't show until | (triggers @next when reached) |

### Automations Move Tasks

Rules automatically populate boards:

```yaml
# .km/auto/gtd.yml
rules:
  - name: waiting-board
    trigger: field.changed
    where: { has_field: waiting }
    actions:
      - board.add: "@waiting"
      - board.add: "@waiting/${waiting}"
```

See [km-tasks-auto.md](km-tasks-auto.md) for details.

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

---

## Key Features

### Unified Search/Create

Single input field:
- Type to filter existing tasks
- Enter on no match creates new task
- References in input (`@`, `#`, `+`) create links

### Query & Filter

Google-like search with filters:

```bash
km task status:open due:week           # Open + due this week
km task +website -@next                # Project tasks not on @next
km task @waiting owner:bjorn           # My waiting items
```

See [Query Syntax](km-tasks-data.md#queries) for full reference.

### Waiting Tracking

Track WHO you're waiting on:

```markdown
- [ ] Get sign-off waiting:@sarah
- [ ] Await API waiting:vendor
```

View by person:
```bash
km @waiting/@sarah    # Everything Sarah owes you
```

### Batch Operations

Add multiple tasks to boards:

```bash
km @next add --query "status:open due:today"
km @next add --query "projects/website/**"
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
