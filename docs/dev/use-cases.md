# Use Cases

Test scenarios for task management workflows.

---

## Inbox Processing

| Action        | Key | Result                     |
| ------------- | --- | -------------------------- |
| To @next      | `n` | on @next, off @inbox       |
| To project    | `p` | on +project, off @inbox    |
| To someday    | `s` | on @someday, off @inbox    |
| Mark done     | `d` | status=done, off @inbox    |
| Delete        | `D` | deleted                    |
| Edit + triage | `e` | add refs, then triage      |
| Batch triage  | sel | select multiple, then `n`  |
| Skip          | `␣` | stays in @inbox, next item |

---

## Quick Capture

```bash
km new "Buy groceries"              # → inbox/, on @inbox
km new "Fix bug" -n                 # → on @next/today
km new "Review @bjorn due:fri"      # → assigned_to=bjorn, due=friday
km new "Call vendor +website"       # → on +website board
```

---

## Board Navigation

```bash
km @next                    # show all columns
km @next/waiting            # show waiting only
1                           # favorite (if configured)
```

### Column Rules

| Rule                         | Trigger         | Result                 |
| ---------------------------- | --------------- | ---------------------- |
| `add="due:past status:todo"` | task overdue    | appears on @next/today |
| `add="./inbox/**"`           | file in inbox/  | appears on @inbox      |
| `sync=status:blocked`        | drag to waiting | status=blocked         |
| `sync=status:blocked`        | status→blocked  | moves to waiting       |
| `sync=status:done`           | press `x`       | moves to done column   |

---

## Status Changes

| Action     | Key | Result                  |
| ---------- | --- | ----------------------- |
| Complete   | `x` | status=done             |
| Reopen     | `x` | status=open             |
| Block      | `b` | status=blocked          |
| Unblock    | `b` | status=open             |
| Via column | mv  | move to waiting=blocked |

---

## Due Dates

| Input        | Result          | Display        |
| ------------ | --------------- | -------------- |
| `friday`     | due=next friday | "5d"           |
| `2025-02-15` | due=2025-02-15  | "Feb 15"       |
| (3 days ago) | overdue         | "-3d" red      |
| (today)      | due today       | "today" yellow |
| (in 5 days)  | future          | "5d" dim       |

---

## Recurring Tasks

- Complete recurring: `x` → original=done, clone due=next occurrence
- View chain: done → done → done → open (current)

---

## Reference Boards

| Task refs       | Appears on             |
| --------------- | ---------------------- |
| `@bjorn`        | @bjorn board           |
| `@bjorn @sarah` | @bjorn + @sarah boards |
| `+website +q1`  | +website + +q1 boards  |
| `#urgent`       | #urgent board          |

---

## CLI Operations

```bash
km @next add status:todo due:today      # batch add matching tasks
km @next add ./projects/urgent/**       # add by path
km task +website -status:done           # query matching tasks
km @next add due:week --dry-run         # preview without changes
```

---

## See Also

- [../07-tasks.md](../07-tasks.md) — Task management
- [../08-cli.md](../08-cli.md) — CLI commands
