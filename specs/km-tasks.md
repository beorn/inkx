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
- Boards over statuses — organization through views, not state
- Pure automation — rules move tasks, no magic queries

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
km @waiting/@bjorn  # What's Bjorn got?
km @someday       # Weekly review
```

### 5. Do

```bash
km @next          # Open next actions board
# Work through tasks, mark done with 'x'
```

---

## Core Concepts

### Four Statuses

Tasks have exactly four statuses:

| Mark | Status | Meaning |
|------|--------|---------|
| `[ ]` | `open` | Available |
| `[.]` | `wip` | In progress |
| `[x]` | `done` | Completed |
| `[-]` | `dropped` | Cancelled |

**That's it.** Waiting, someday, blocked are boards, not statuses.

### Boards = Organization

Boards are markdown files with columns. Automations populate them:

```markdown
# @next.md

## today
- [[tasks/call-dentist]]

## this-week
- [[tasks/review-budget]]
```

| Board | Purpose |
|-------|---------|
| `@inbox` | Unprocessed items |
| `@next` | Next actions (curated) |
| `@waiting` | Waiting on others |
| `@waiting/@person` | Waiting on specific person |
| `@someday` | Maybe/later |
| `@blocked` | Blocked by something |
| `+project` | Project tasks |
| `@person` | Person agenda |

### Automations Move Tasks

Rules automatically add tasks to boards:

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

### Waiting Tracking

Track who you're waiting on:

```markdown
- [ ] Get sign-off waiting:@sarah
- [ ] Await API waiting:vendor
```

View by person:
```bash
km @waiting/@sarah    # Everything Sarah owes you
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

- [km-tasks-data.md](km-tasks-data.md) — Data model, schema
- [km-tasks-auto.md](km-tasks-auto.md) — Automation rules
- [km-tasks-tui.md](km-tasks-tui.md) — TUI layout, keybindings
- [km-tasks-cli.md](km-tasks-cli.md) — CLI commands
- [km-tasks-prior-art.md](km-tasks-prior-art.md) — Research
