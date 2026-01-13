# Tasks Use Cases

Test scenarios for task management workflows.

---

## Inbox Processing

### Single item triage

```
Given: inbox has "Buy milk"
When: press `n`
Then: task on @next/today, removed from @inbox
```

```
Given: inbox has "Fix login bug"
When: press `p`, type "web", select "+website"
Then: task on +website, removed from @inbox
```

```
Given: inbox has "Learn Rust"
When: press `s`
Then: task on @someday, removed from @inbox
```

```
Given: inbox has "Call dentist" (already done)
When: press `d`
Then: task status=done, removed from @inbox
```

```
Given: inbox has "asdfasdf"
When: press `D`
Then: task deleted
```

### Edit during triage

```
Given: inbox has "Call John about website"
When: press `e`, add "@john +website", press `n`
Then: task on @next, @john board, +website board
```

```
Given: inbox has "Review spreadsheet"
When: press `e`, add "@sarah", press `n`
Then: task on @next, owner=sarah, on @sarah board
```

### Batch processing

```
Given: inbox has 3 items selected
When: press `n`
Then: all 3 on @next, removed from @inbox
```

```
Given: inbox has 2 items selected
When: press `p`, select "+website"
Then: both on +website, removed from @inbox
```

### Skip and defer

```
Given: inbox has "Tax stuff", need to think
When: press `Space`
Then: task stays in @inbox, cursor moves to next
```

---

## Quick Capture

### Basic capture

```
When: `km new "Buy groceries"`
Then: task in inbox/, on @inbox board
```

```
When: `km new "Fix bug" -n`
Then: task on @next/today (skips inbox)
```

### Capture with metadata

```
When: `km new "Review budget @bjorn due:friday"`
Then: task in inbox/, owner=bjorn, due=friday, on @bjorn board
```

```
When: `km new "Call vendor +website"`
Then: task in inbox/, on +website board
```

### Capture from TUI

```
Given: TUI open, search field focused
When: type "new task title", press Enter (no match)
Then: task created in inbox/, on @inbox
```

---

## Board Navigation

### View boards

```
When: `km @next`
Then: show @next board with all columns
```

```
When: `km @next/waiting`
Then: show only waiting column
```

```
When: press `1` (favorite=@next)
Then: show @next board
```

### Column rules - add

```
Given: task with due:yesterday, status:open
When: automation runs
Then: task appears on @next/today (add="due:past status:open")
```

```
Given: task in inbox/ folder
When: automation runs
Then: task appears on @inbox (add="./inbox/**")
```

### Column rules - sync

```
Given: task on @next/this-week
When: drag to @next/waiting
Then: task status=blocked
```

```
Given: task status changes to blocked
When: automation runs
Then: task moves to @next/waiting (sync=status:blocked)
```

```
Given: task on @next/waiting
When: press `x` (mark done)
Then: task moves to @next/done, status=done
```

---

## Status Changes

### Toggle done

```
Given: task status=open
When: press `x`
Then: status=done
```

```
Given: task status=done
When: press `x`
Then: status=open
```

### Toggle blocked

```
Given: task status=open
When: press `b`
Then: status=blocked
```

```
Given: task status=blocked
When: press `b`
Then: status=open
```

### Status from column

```
Given: task on @next/today
When: move to @next/waiting (sync=status:blocked)
Then: status=blocked
```

```
Given: task on @next/waiting
When: move to @next/today
Then: status=open (exits blocked)
```

---

## Project Management

### Re-parent task

```
Given: task under "Personal"
When: press `p`, select "Work / Finance"
Then: task under "Work / Finance"
```

```
Given: 3 tasks selected
When: press `p`, select "+website"
Then: all 3 under +website
```

### Project board

```
Given: task has "+website" reference
When: view +website board
Then: task appears on board
```

```
Given: task "+website" marked done
When: view +website board
Then: task in done column (or hidden)
```

---

## Due Dates

### Set due date

```
Given: task with no due date
When: press `d`, enter "friday"
Then: due=next friday
```

```
Given: task with no due date
When: press `d`, enter "2025-02-15"
Then: due=2025-02-15
```

### Overdue surfacing

```
Given: task due:yesterday, status:open, not on @next
When: automation runs
Then: task on @next/today
```

### Due date display

```
Given: task due 3 days ago
Then: display "-3d" in red
```

```
Given: task due today
Then: display "today" in yellow
```

```
Given: task due in 5 days
Then: display "5d" or weekday name
```

---

## Recurring Tasks

### Complete recurring

```
Given: task "Weekly review" recur:FREQ=WEEKLY, due:monday
When: press `x`
Then: original status=done, new task due:next-monday
```

### Recurring chain

```
Given: recurring task completed 3 times
When: view history
Then: see chain: done → done → done → open
```

---

## Reference Boards

### Person board

```
Given: task "Discuss budget @bjorn"
When: view @bjorn board
Then: task appears
```

```
Given: task "@bjorn @sarah"
When: view @bjorn board
Then: task appears
When: view @sarah board
Then: task appears
```

### Project board

```
Given: task "+website +q1"
When: view +website board
Then: task appears
When: view +q1 board
Then: task appears
```

### Tag board

```
Given: task "#urgent"
When: view #urgent board
Then: task appears
```

---

## Search

### Filter tasks

```
When: type "budget" in search
Then: show tasks containing "budget"
```

```
When: type "@bjorn" in search
Then: show tasks with @bjorn reference
```

```
When: type "status:blocked" in search
Then: show blocked tasks only
```

### Search + create

```
Given: search "new unique task", no matches
When: press Enter
Then: create task "new unique task" in inbox
```

---

## CLI Operations

### Batch add to board

```
When: `km @next add status:open due:today`
Then: all open tasks due today on @next
```

```
When: `km @next add ./projects/urgent/**`
Then: all tasks under projects/urgent on @next
```

### Query tasks

```
When: `km task status:open @bjorn`
Then: list open tasks with @bjorn
```

```
When: `km task +website -status:done`
Then: list +website tasks not done
```

### Dry run

```
When: `km @next add due:week --dry-run`
Then: show what would be added, no changes
```

---

## Automation

### Setup

```
When: `km auto setup`
Then: create @inbox, @next, @someday boards, inbox/ folder
```

```
When: `km auto setup` (already exists)
Then: no changes (idempotent)
```

### Explain

```
When: `km auto explain <task-id>`
Then: show why task is on each board, which rules
```

### Manual override

```
Given: task with "auto:ignore"
When: automation runs
Then: task skipped by all rules
```

```
Given: task with "auto:ignore:inbox-capture"
When: automation runs
Then: task skipped by inbox-capture rule only
```

---

## See Also

- [km-tasks.md](km-tasks.md) — Overview
- [km-tasks-cli.md](km-tasks-cli.md) — CLI commands
- [km-tasks-tui.md](km-tasks-tui.md) — TUI spec
- [km-tasks-auto.md](km-tasks-auto.md) — Automation rules
