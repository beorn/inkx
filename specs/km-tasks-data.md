# Tasks Data Model

Data model extensions for task management.

---

## Markdown Representation

Tasks are stored in markdown files using standard checkbox syntax with optional metadata.

### Basic Task

```markdown
- [ ] Call dentist
```

### Task with Metadata

Inline metadata after task content:

```markdown
- [ ] Review Q1 budget @bjorn due:2025-01-15 scheduled:2025-01-10
- [/] Fix login bug @alice priority:1
- [x] Setup repo due:2025-01-08
```

### Task Marks

| Mark  | Status        | Meaning            |
|-------|---------------|--------------------|
| `[ ]` | open/next     | Not started        |
| `[x]` | done          | Completed          |
| `[/]` | in_progress   | Currently working  |
| `[-]` | cancelled     | Dropped            |
| `[?]` | waiting       | Blocked/waiting    |
| `[>]` | scheduled     | Scheduled for later|

### Inline Metadata Syntax

| Field     | Syntax              | Example                    |
|-----------|---------------------|----------------------------|
| Assignee  | `@username`         | `@bjorn`                   |
| Due date  | `due:YYYY-MM-DD`    | `due:2025-01-15`           |
| Scheduled | `scheduled:YYYY-MM-DD` | `scheduled:2025-01-10`  |
| Priority  | `priority:N`        | `priority:1`               |
| Tags      | `#tag`              | `#work #urgent`            |
| Recurrence| `every:RRULE`       | `every:FREQ=WEEKLY`        |

### Subtasks

Nested list items under a task:

```markdown
- [ ] Plan Q1 review
  - [ ] Gather metrics
  - [ ] Schedule meeting
  - [x] Draft agenda
```

### Task with Notes

Content after task becomes description/notes:

```markdown
- [ ] Review Q1 budget @bjorn due:2025-01-15

  Need to compare with Q4 actuals.
  See [[Finance/Q4-Report]] for details.

  2025-01-10: Called Sarah, waiting for numbers
  2025-01-08: Started initial analysis
```

### Frontmatter Alternative

For file-level tasks or complex metadata:

```yaml
---
type: task
status: in_progress
assigned_to: bjorn
due_date: 2025-01-15
priority: 1
tags: [work, q1, finance]
recurrence: FREQ=WEEKLY;BYDAY=MO
---

# Review Q1 Budget

Task description here...
```

---

## Task Status

Extend existing `TaskStatus` with `next`:

```typescript
type TaskStatus =
  | "open"        // Available, not scheduled
  | "next"        // Selected for today (NEW)
  | "in_progress" // Actively working
  | "done"        // Completed
  | "waiting"     // Blocked on external
  | "blocked"     // Blocked on internal
  | "scheduled"   // Has future scheduled_date
  | "cancelled";  // Dropped
```

### Status Flow

```
open ──→ next ──→ in_progress ──→ done
  │        │           │
  │        └───────────┴──→ waiting ──→ (back to open/next)
  │
  └──→ scheduled ──→ (auto to open when date arrives)
  │
  └──→ cancelled
```

### Status Meanings

| Status       | In View    | Meaning                          |
|--------------|------------|----------------------------------|
| `open`       | Inbox/All  | Available but not scheduled      |
| `next`       | Today      | Selected for today (manual)      |
| `in_progress`| Today      | Actively working on              |
| `waiting`    | Waiting    | Blocked on external dependency   |
| `blocked`    | Blocked    | Blocked on internal dependency   |
| `scheduled`  | Scheduled  | Has future `scheduled_date`      |
| `done`       | Archive    | Completed                        |
| `cancelled`  | Archive    | Dropped                          |

---

## New Fields

```typescript
interface Node {
  // Existing (add 'next' to task_status type)
  task_status?: TaskStatus;

  // New fields
  recurrence?: string;     // iCal RRULE format
  waiting_for?: string;    // Who/what blocked on
}
```

### Data Object Extensions

```typescript
data: {
  someday?: boolean;   // Maybe/someday flag
  inbox?: boolean;     // Unprocessed item flag
  tags?: string[];     // Extracted from content #tags
}
```

---

## Recurrence

### RRULE Format

iCal RRULE for recurring tasks:

```
FREQ=DAILY                        # Every day
FREQ=WEEKLY;BYDAY=MO,WE,FR       # Mon/Wed/Fri
FREQ=MONTHLY;BYMONTHDAY=1        # 1st of month
FREQ=WEEKLY;INTERVAL=2           # Every 2 weeks
FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1  # Jan 1st
```

### Recurrence Behavior

When recurring task marked done:
1. Clone task with same content, recurrence, project
2. Set clone's `scheduled_date` to next occurrence
3. Original stays done (audit trail preserved)

---

## Someday/Maybe

Flag for "someday" tasks:

```typescript
data: { someday: true }
```

- Filters out of normal views (Today, All, Projects)
- Appears in dedicated Someday view
- Weekly review: promote to open or archive

---

## Inbox Items

Flag for unprocessed items:

```typescript
data: { inbox: true }
```

Sources:
- Quick capture (`km add "..."`)
- New items without project parent
- Watch mode discoveries

Processing clears the flag and sets project.

---

## Due Date Behavior

| Condition     | Display        | Behavior                    |
|---------------|----------------|-----------------------------|
| Overdue       | Red, "-3d"     | Auto-surfaces in Today view |
| Due today     | Yellow, "today"| Highlighted                 |
| Due tomorrow  | Normal         | Normal display              |
| Due later     | Dim, "Jan 15"  | Normal display              |

Overdue = `due_date < today AND status NOT IN (done, cancelled)`

---

## Subtasks

Child nodes of type `task` under parent task.

```
Task (parent)
├── Subtask 1
├── Subtask 2
└── Subtask 3
```

- Each subtask has independent status
- Parent completion doesn't auto-complete subtasks
- Subtask can be promoted to top-level task

---

## Notes/Comments

Child nodes of type `paragraph` under task.

Auto-timestamp pattern:
```markdown
2025-01-12: Called vendor, waiting for reply
2025-01-10: Started research
```

---

## Wikilinks

### Syntax

```markdown
- [ ] Review [[Q1 Budget]] report
- [ ] Follow up with [[John]] about [[Project Alpha]]
```

### Resolution

| Syntax                  | Links to                    |
|-------------------------|-----------------------------|
| `[[Page Name]]`         | File/section by name        |
| `[[#task-id]]`          | Task by ID                  |
| `[[file.md#Section]]`   | Section in specific file    |

### Backlinks

Query: find all nodes containing `[[target]]` in content.

---

## TextBundle

### Import Schema

```
document.textbundle/
├── info.json
├── text.md
└── assets/
    └── image.png
```

Parse `text.md` to nodes, copy assets to `.km/assets/`.

### Export Schema

```json
{
  "version": 2,
  "type": "net.daringfireball.markdown",
  "creatorIdentifier": "io.km.app",
  "io.km.app": {
    "nodeId": "01HXYZ...",
    "exportedAt": "2025-01-12T10:00:00Z"
  }
}
```

---

## Database Schema

### New Columns

```sql
ALTER TABLE nodes ADD COLUMN recurrence TEXT;
ALTER TABLE nodes ADD COLUMN waiting_for TEXT;
```

### Indexes

```sql
CREATE INDEX idx_nodes_task_status ON nodes(task_status)
  WHERE type = 'task';
CREATE INDEX idx_nodes_due_date ON nodes(due_date)
  WHERE due_date IS NOT NULL;
CREATE INDEX idx_nodes_scheduled_date ON nodes(scheduled_date)
  WHERE scheduled_date IS NOT NULL;
```

---

## See Also

- [km-tasks.md](km-tasks.md) — Overview
- [km-tasks-tui.md](km-tasks-tui.md) — TUI spec
- [km-tasks-cli.md](km-tasks-cli.md) — CLI spec
- [km-data-model.md](km-data-model.md) — Full node schema
