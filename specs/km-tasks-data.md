# Tasks Data Model

Data model extensions for task management.

---

## Unified Task Model

Any markdown element can become a task by adding a checkbox prefix. Tasks are nodes
in the unified km model — same schema, same queries, same event log.

### Task Sources

| Source | Markdown | Node Type |
|--------|----------|-----------|
| List item | `- [ ] Call dentist` | `task` |
| Heading | `## [ ] Q1 Review` | `task` (was `heading`) |
| File | frontmatter `type: task` | `task` |
| Folder | contains tasks | `project` (implicit) |

### List Item Tasks

Standard checkbox syntax:

```markdown
- [ ] Call dentist
- [x] Send invoice
```

### Section Tasks

Any heading can be a task by prefixing with checkbox:

```markdown
## [ ] Q1 Budget Review @bjorn due:2025-01-15

Need to analyze spending across all departments.

### Subtasks
- [ ] Pull finance data
- [ ] Meet with department heads
- [x] Draft template

### Notes
2025-01-10: Kicked off analysis
```

The heading becomes a task node; content below (until next same-level heading)
becomes the task description. Child headings and lists become subtasks.

### File-Level Tasks

A file with `type: task` in frontmatter is a task:

```yaml
---
type: task
status: in_progress
assigned_to: bjorn
due_date: 2025-01-15
priority: 1
tags: [work, q1]
---

# Review Q1 Budget

Full task description with rich content...

## Subtasks
- [ ] Pull data
- [ ] Analyze trends
```

**Frontmatter → Node mapping:**

| Frontmatter | Node Field |
|-------------|------------|
| `type: task` | `type = 'task'` |
| `status` | `task_status` |
| `assigned_to` | `assigned_to` |
| `due_date` | `due_date` |
| `scheduled_date` | `scheduled_date` |
| `priority` | `priority` |
| `tags` | `data.tags` |
| `recurrence` | `recurrence` |

### Folder as Project

A folder containing tasks implicitly becomes a project:

```
Work/
├── Q1-Planning/
│   ├── budget-review.md      # type: task
│   └── headcount.md          # type: task
└── tasks.md                  # contains - [ ] items
```

Query `Work/Q1-Planning/` to get all tasks in that project.

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
| Slug      | `slug:identifier`   | `slug:budget-review`       |

### Subtasks

Nested list items under a task:

```markdown
- [ ] Plan Q1 review
  - [ ] Gather metrics
  - [ ] Schedule meeting
  - [x] Draft agenda
```

### Task with Description

Content indented under task becomes the description. The description can include
multiple paragraphs, lists, code blocks, and embedded content:

```markdown
- [ ] Review Q1 budget @bjorn due:2025-01-15

  Need to compare with Q4 actuals.
  See [[Finance/Q4-Report]] for details.

  Key areas to review:
  - Revenue projections
  - Cost overruns
  - Headcount changes

  ```sql
  SELECT * FROM budget WHERE quarter = 'Q1'
  ```
```

### Task with Activity Log

Timestamped entries track progress and communication:

```markdown
- [ ] Review Q1 budget @bjorn due:2025-01-15

  Need to compare with Q4 actuals.

  ---
  2025-01-10: Called Sarah, waiting for numbers
  2025-01-08: Started initial analysis
```

The `---` separator distinguishes description from activity log (optional convention).

### Task with Attachments

Attachments use standard markdown image/link syntax with `assets/` path:

```markdown
- [ ] Review Q1 budget @bjorn due:2025-01-15

  See attached spreadsheet and screenshot.

  ![Budget Screenshot](assets/budget-q1-screenshot.png)
  [Q1 Budget.xlsx](assets/q1-budget-2025.xlsx)
```

**Asset storage:**
- Files stored in `.km/assets/` (CAS-style, content-addressed)
- Or alongside .md files in `assets/` subdirectory (Obsidian-compatible)
- Drag-and-drop in TUI copies file and inserts reference

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
  tags?: string[];     // Extracted from content #tags
}
```

Note: Inbox status is determined by location (`inbox/` folder), not a flag.

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

## Inbox

The `inbox/` folder is the capture location for unprocessed items.

### Folder = Inbox

Items in the `inbox/` folder automatically have inbox status:

```
inbox/
├── call-from-john.md
├── idea-refactor-auth.md
└── meeting-notes-jan10.md
```

**No separate flag needed** — location determines inbox status.

### Inbox Behavior

| Action | Result |
|--------|--------|
| `km add "..."` | Creates file in `inbox/` |
| File dropped in `inbox/` | Appears in inbox view |
| Move to project | Removes from inbox (location change) |
| `km inbox process` | Interactive triage |

### Processing

Processing an inbox item = moving it to a project:

```bash
km move inbox/call-from-john.md "Personal/Health"
```

The item leaves inbox when it leaves the `inbox/` folder.

### Quick Capture

```bash
km add "Call dentist"           # → inbox/call-dentist.md
km add -t "Review PR"           # → inbox/review-pr.md + status=next
km add -p "Work" "Fix bug"      # → Work/fix-bug.md (skips inbox)
```

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

### Linking FROM Tasks

Reference other content from within a task:

```markdown
- [ ] Review [[Q1 Budget]] report
- [ ] Follow up with [[John]] about [[Project Alpha]]
```

### Linking TO Tasks

Reference a specific task from elsewhere:

```markdown
# Meeting Notes

Discussed the [[#01HXY...]] task with Sarah.
Need to complete [[Review Q1 budget]] before EOD.

## Action Items
- See [[#budget-review]] for details
```

### Link Resolution

| Syntax                  | Links to                    |
|-------------------------|-----------------------------|
| `[[Page Name]]`         | Node by title/content match |
| `[[#01HXY...]]`         | Node by ID (ULID)           |
| `[[#slug]]`             | Node by slug (if defined)   |
| `[[file.md#Section]]`   | Section in specific file    |

### Task Slugs

Optional human-readable identifier for stable linking:

```markdown
- [ ] Review Q1 budget @bjorn due:2025-01-15 slug:budget-review

  ...description...
```

Slugs are:
- Unique within repository
- Stable across renames
- User-defined or auto-generated from title

### Backlinks

Detail pane shows "Linked from:" section with all incoming references.

Query: find all nodes containing `[[target]]` or `[[#id]]` in content.

### Embed vs Link

| Syntax                  | Behavior                    |
|-------------------------|-----------------------------|
| `[[Page Name]]`         | Clickable link              |
| `![[Page Name]]`        | Embed content inline        |
| `![[image.png]]`        | Embed image                 |

---

## Attachments

### Attachment Syntax

Standard markdown for images and files:

```markdown
![Screenshot](assets/screenshot-2025-01-12.png)
[Report PDF](assets/q1-report.pdf)
[Spreadsheet](assets/budget.xlsx)
```

### Storage Models

**CAS (Content-Addressed Storage):**
```
.km/
├── assets/
│   ├── abc123...def  # SHA-256 of content
│   └── xyz789...ghi
└── db/
```
- Files named by content hash
- Automatic deduplication
- Path mapping in node metadata

**Alongside (Obsidian-compatible):**
```
project/
├── task-notes.md
└── assets/
    ├── screenshot.png
    └── report.pdf
```
- Human-readable filenames
- Files grouped with related content
- Portable folder structure

### Inline vs Referenced

| Type       | Syntax                           | Display               |
|------------|----------------------------------|-----------------------|
| Inline img | `![alt](assets/img.png)`         | Rendered in content   |
| Link       | `[Report](assets/report.pdf)`    | Clickable download    |
| Embed      | `![[assets/doc.md]]`             | Content embedded      |

### Attachment Metadata

Optional frontmatter for file-level tasks with attachments:

```yaml
---
type: task
attachments:
  - path: assets/screenshot.png
    type: image/png
    size: 245000
    added: 2025-01-12T10:00:00Z
  - path: assets/report.pdf
    type: application/pdf
    size: 1024000
---
```

### TUI Attachment Actions

| Key     | Action                    |
|---------|---------------------------|
| `A`     | Add attachment (picker)   |
| `Enter` | Open attachment           |
| `y`     | Copy attachment path      |
| `D`     | Remove attachment         |

Drag-and-drop: File dropped on task copies to assets and inserts reference.

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
