# Tasks Use Cases

Test scenarios for task management workflows.

---

## Inbox Processing

- **Quick triage**: `n` on "Buy milk" → on @next, off @inbox
- **To project**: `p` → "+website" → on +website, off @inbox
- **Someday**: `s` on "Learn Rust" → on @someday, off @inbox
- **Already done**: `d` on "Call dentist" → status=done, off @inbox
- **Delete junk**: `D` on "asdfasdf" → deleted
- **Edit + triage**: `e` add "@john +website", `n` → on @next, @john, +website
- **Batch triage**: select 3, `n` → all 3 on @next
- **Skip for now**: `Space` → stays in @inbox, next item

---

## Quick Capture

- **Basic**: `km new "Buy groceries"` → in inbox/, on @inbox
- **Skip inbox**: `km new "Fix bug" -n` → on @next/today
- **With metadata**: `km new "Review @bjorn due:fri"` → owner=bjorn, due=friday
- **With project**: `km new "Call vendor +website"` → on +website board
- **TUI create**: type + Enter (no match) → in inbox/, on @inbox

---

## Board Navigation

- **View board**: `km @next` → show all columns
- **View column**: `km @next/waiting` → show waiting only
- **Favorite**: press `1` → show @next (if configured)

### Column Rules

- `add="due:past status:open"`: task overdue → appears on @next/today
- `add="./inbox/**"`: file in inbox/ → appears on @inbox
- `sync=status:blocked`: drag to waiting → status=blocked
- `sync=status:blocked`: status→blocked → moves to waiting
- `sync=status:done`: press `x` → moves to done column

---

## Status Changes

- **Complete**: `x` on open task → status=done
- **Reopen**: `x` on done task → status=open
- **Block**: `b` on open task → status=blocked
- **Unblock**: `b` on blocked task → status=open
- **Via column**: move to waiting → status=blocked
- **Via column**: move from waiting → status=open

---

## Project Management

- **Re-parent**: `p` → "Work / Finance" → task under new parent
- **Bulk re-parent**: select 3, `p` → "+website" → all 3 under +website
- **Project board**: task has "+website" → appears on +website board

---

## Due Dates

- **Set due**: `d` → "friday" → due=next friday
- **Set due exact**: `d` → "2025-02-15" → due=2025-02-15
- **Overdue surface**: due:yesterday + open → appears on @next/today
- **Display overdue**: due 3 days ago → "-3d" red
- **Display today**: due today → "today" yellow
- **Display future**: due in 5 days → "5d" dim

---

## Recurring Tasks

- **Complete recurring**: `x` on weekly task → original=done, clone due=next week
- **View chain**: 3 completions → done → done → done → open

---

## Reference Boards

- **Person**: task "@bjorn" → appears on @bjorn board
- **Multi-person**: task "@bjorn @sarah" → appears on @bjorn + @sarah boards
- **Project**: task "+website +q1" → appears on +website + +q1 boards
- **Tag**: task "#urgent" → appears on #urgent board

---

## Search

- **Text search**: "budget" → tasks containing "budget"
- **Reference**: "@bjorn" → tasks with @bjorn
- **Field**: "status:blocked" → blocked tasks
- **Create on miss**: "new task" + Enter → creates task in inbox

---

## CLI Operations

- **Batch add**: `km @next add status:open due:today` → matching tasks on @next
- **Add by path**: `km @next add ./projects/urgent/**` → path tasks on @next
- **Query**: `km task +website -status:done` → list matching tasks
- **Dry run**: `km @next add due:week --dry-run` → preview, no changes

---

## Automation

- **Setup**: `km auto setup` → create boards + folders
- **Setup idempotent**: `km auto setup` (exists) → no changes
- **Explain**: `km auto explain <id>` → show rules + boards
- **Ignore all**: task has `auto:ignore` → skipped by all rules
- **Ignore one**: task has `auto:ignore:inbox-capture` → skipped by that rule

---

## See Also

- [km-tasks.md](km-tasks.md) — Overview
- [km-tasks-cli.md](km-tasks-cli.md) — CLI commands
- [km-tasks-tui.md](km-tasks-tui.md) — TUI spec
- [km-tasks-auto.md](km-tasks-auto.md) — Automation rules
