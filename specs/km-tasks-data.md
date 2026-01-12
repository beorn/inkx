# Tasks Data Model

Data model extensions for task management.

---

## Unified Task Model

Any markdown element can become a task by adding a checkbox prefix. Tasks are nodes
in the unified km model — same schema, same queries, same event log.

### Three Representations

Tasks can be represented three ways in markdown. All become `type: task` nodes internally.

| Representation | Syntax | Interop | Best For |
|----------------|--------|---------|----------|
| **List tasks** | `- [ ] Call dentist` | ✅ Standard | Quick items, checklists |
| **Section tasks** | `## [ ] Q1 Review` | ⚠️ km-specific | Projects, multi-part work |
| **File tasks** | frontmatter `type: task` | ✅ Shared | Complex tasks, rich content |

**Interoperability notes:**
- **List tasks** — Standard GFM checkboxes. Works in GitHub, Obsidian, Bear, etc.
- **Section tasks** — km extension. Other tools see `## [ ] Title` as a heading.
- **File tasks** — Shared convention with TaskGenius, TaskNotes. Frontmatter-based.

All three unify in km's node model — same queries, same status tracking, same views.

### Task Sources

| Source | Markdown | Node Type |
|--------|----------|-----------|
| List item | `- [ ] Call dentist` | `task` |
| Heading | `## [ ] Q1 Review` | `task` (was `heading`) |
| File | frontmatter `type: task` | `task` |
| Folder | contains tasks | `project` (implicit) |

### List Item Tasks

Standard checkbox syntax with optional [line-based metadata](#line-based-metadata):

```markdown
- [ ] Call dentist
- [x] Send invoice @bjorn due:2025-01-15
```

### Section Tasks

Any heading can be a task by prefixing with checkbox. Uses [line-based metadata](#line-based-metadata):

```markdown
## [ ] Q1 Budget Review @bjorn due:2025-01-15 priority:1

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

## Line-Based Metadata

Metadata embedded in the same line as task content. Used by list tasks and section tasks.

### Prior Art

| System | Assignee | Due Date | Priority | Tags | ID/Permalink |
|--------|----------|----------|----------|------|--------------|
| **[todo.txt](https://github.com/todotxt/todo.txt)** | — | `due:YYYY-MM-DD` | `(A)`-`(Z)` | `@context` | — |
| **[TaskPaper](https://guide.taskpaper.com/)** | — | `@due(YYYY-MM-DD)` | `@priority(N)` | `@tag` | `@id(value)` |
| **[Todoist](https://todoist.com/)** | — | natural language | `!p1`-`!p4` | `@label` | internal |
| **[TODO.md](https://github.com/todomd/todo.md)** | `@name` | `YYYY-MM-DD` | — | `#tag` | — |
| **[Org-mode](https://orgmode.org/)** | — | `DEADLINE:` | `[#A]` | `:tag:` | `:ID:` property |
| **[Logseq](https://docs.logseq.com/)** | — | `deadline:: DATE` | — | `#tag` | `id:: UUID` |
| **[Obsidian Tasks](https://obsidian-tasks-group.github.io/obsidian-tasks/)** | — | `📅 YYYY-MM-DD` or `[due:: DATE]` | `⏫` or `[priority:: high]` | `#tag` | `^block-id` |
| **[Dataview](https://blacksmithgu.github.io/obsidian-dataview/)** | `[assigned:: name]` | `[due:: DATE]` | `[priority:: N]` | `#tag` | — |
| **[Task Genius](https://taskgenius.md/)** | — | `📅 YYYY-MM-DD` | `⏫` or `[#A]` or `[priority:: N]` | `#tag` | — |
| **[TaskForge](https://taskforge.md/)** | `👤 @user` | `📅 YYYY-MM-DD` | `⏫` emoji | `@context` | — |
| **[Tana](https://tana.inc/)** | field | field | field | `#supertag` | node ID |
| **[Linear](https://linear.app/)** | UI/API | UI/API | UI/API | labels | UUID |
| **[Pandoc](https://pandoc.org/MANUAL.html)** | — | — | — | `{.class}` | `{#id}` |
| **[GFM](https://github.github.com/gfm/)** | — | — | — | — | `#heading-slug` |

### Tana Supertags vs Plain Tags

Tana's `#supertag` is fundamentally different from plain hashtags:

| Aspect | Plain `#tag` | Tana `#supertag` |
|--------|--------------|------------------|
| Purpose | Classification/grouping | Type definition ("is-a") |
| Schema | None | Fields, defaults, views |
| Inheritance | No | Yes (`#author` extends `#person`) |
| Fields | No | Yes (due date, priority, etc.) |
| Behavior | Search/filter only | Auto-populates template |

**Supertags define what a node *is***, not just how to find it. `#task` in Tana means
"this node is a task" and brings fields (status, due, assignee), not just a search keyword.

Plain hashtags still work in Tana for simple categorization, but supertags enable
database-like behavior with typed fields and views.

**km approach:** Plain `#tags` for classification. Type is determined by checkbox prefix
(`- [ ]`) or frontmatter (`type: task`), not tag syntax.

### Metadata Syntax Families

Systems use different approaches for inline metadata:

| Family | Syntax | Placement | Examples |
|--------|--------|-----------|----------|
| **Key-colon-value** | `key:value` | same line | todo.txt, km |
| **Property syntax** | `key:: value` | line(s) below | Logseq, Dataview |
| **Function style** | `@key(value)` | same line | TaskPaper |
| **Emoji prefix** | `📅 value` | same line | Obsidian Tasks, TaskForge |
| **Brackets** | `[key:: value]` | inline | Dataview |
| **Curly brace attrs** | `{#id .class key=val}` | same line (end) | Pandoc, kramdown |
| **Typed tags** | `#supertag` | node-level | Tana |
| **Structured data** | fields/UI | separate | Linear, Notion |

### Placement Patterns

```markdown
# Same line (km, todo.txt, TaskPaper)
- [ ] Review budget @bjorn due:2025-01-15

# End of line (Pandoc)
## Review budget {#budget-review .task}

# Lines below (Logseq)
- Review budget
  due:: 2025-01-15
  assigned:: bjorn

# Fenced block (Pandoc divs)
::: {#budget-review .task due="2025-01-15"}
Review budget content here...
:::
```

**Tradeoffs:**
- **Same line** — compact, good for short metadata, can get cluttered
- **Lines below** — cleaner for many properties, but takes more space
- **Fenced blocks** — powerful for rich content, but verbose

**km choice:** Same-line for simplicity. Most tasks have 0-3 metadata fields.

### km Syntax

km uses `key:value` pairs (like todo.txt) with `@` for mentions and `#` for tags:

```markdown
- [ ] Review Q1 budget @bjorn due:2025-01-15 priority:1 #finance
```

| Field      | Syntax                 | Example                    |
|------------|------------------------|----------------------------|
| Assignee   | `@username`            | `@bjorn`                   |
| Due date   | `due:YYYY-MM-DD`       | `due:2025-01-15`           |
| Scheduled  | `scheduled:YYYY-MM-DD` | `scheduled:2025-01-10`     |
| Priority   | `priority:N`           | `priority:1`               |
| Tags       | `#tag`                 | `#work #urgent`            |
| Recurrence | `every:RRULE`          | `every:FREQ=WEEKLY`        |
| ID/Anchor  | `^id` or `id:ULID`     | `^budget-q1` or `id:01HXY...` |

**Design choices:**
- `key:value` — adopted from todo.txt, widely understood
- `@user` — universal mention syntax (GitHub, Slack, Todoist)
- `#tag` — universal tag syntax (Twitter, Obsidian, Bear)
- ISO dates — unambiguous, sortable, no locale issues

### Parsing Rules

1. Metadata tokens appear after task title, space-separated
2. `@word` → assignee (first match) or mention (subsequent)
3. `#word` → tag
4. `key:value` → field (no spaces around colon)
5. Unrecognized tokens remain in title

```
- [ ] Call @john about #budget review due:2025-01-15
      ↑────────────────────────────↑ ↑──────────────↑
              title content              metadata
```

---

## Task Marks

Checkbox variants indicating status:

| Mark  | Status        | Meaning            |
|-------|---------------|--------------------|
| `[ ]` | open/next     | Not started        |
| `[x]` | done          | Completed          |
| `[/]` | in_progress   | Currently working  |
| `[-]` | cancelled     | Dropped            |
| `[?]` | waiting       | Blocked/waiting    |
| `[>]` | scheduled     | Scheduled for later|

**Prior art:** Extended marks from [Obsidian Tasks](https://obsidian-tasks-group.github.io/obsidian-tasks/),
[Logseq](https://docs.logseq.com/), and [org-mode](https://orgmode.org/).

---

## Markdown Representation

Examples of tasks in markdown files. See [Line-Based Metadata](#line-based-metadata)
for syntax details and [Task Marks](#task-marks) for checkbox variants.

### Examples

```markdown
- [ ] Call dentist
- [ ] Review Q1 budget @bjorn due:2025-01-15 scheduled:2025-01-10
- [/] Fix login bug @alice priority:1
- [x] Setup repo due:2025-01-08
```

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

### Entity Model: Clone-on-Complete

Two approaches exist for recurring tasks:

| Approach | Description | Used By |
|----------|-------------|---------|
| **Template + Virtual** | Single entity, instances computed on-the-fly | Google Calendar, Outlook |
| **Clone-on-Complete** | New entity created when current completes | Todoist, Things, OmniFocus, km |

**km uses clone-on-complete** because:
- Each instance has its own history (notes, completion date, modifications)
- Skipping an instance doesn't break the chain
- Search and queries work naturally (each is a real node)
- Simpler mental model (what you see is what exists)

### How It Works

```
Original task (recurrence: FREQ=WEEKLY)
├── [x] done 2025-01-06 — instance 1 (completed)
├── [x] done 2025-01-13 — instance 2 (completed)
└── [ ] due 2025-01-20  — instance 3 (current, the "live" task)
```

When you complete instance 3:
1. Instance 3 marked `done`, completion timestamp recorded
2. Instance 4 created with `scheduled_date` = next occurrence
3. Instance 4 inherits: content, recurrence, project, tags

### Instance Linking

Instances share a `recurrence_id` linking them to the same series:

```typescript
interface Node {
  recurrence?: string;       // RRULE (only on current instance)
  recurrence_id?: string;    // Links all instances in series
  recurrence_parent?: string; // ID of original/template task
}
```

Query all instances: `WHERE recurrence_id = '...'`

### RRULE Format

iCal RRULE standard:

```
FREQ=DAILY                        # Every day
FREQ=WEEKLY;BYDAY=MO,WE,FR       # Mon/Wed/Fri
FREQ=MONTHLY;BYMONTHDAY=1        # 1st of month
FREQ=WEEKLY;INTERVAL=2           # Every 2 weeks
FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1  # Jan 1st
```

### Operations

| Action | Behavior |
|--------|----------|
| **Complete** | Mark done, clone next instance |
| **Skip** | Mark cancelled, clone next instance |
| **Edit this** | Modify current instance only |
| **Edit all future** | Modify recurrence template, affect future clones |
| **Stop recurring** | Remove `recurrence` from current instance |
| **Delete series** | Delete all instances with same `recurrence_id` |

### Defer vs Due

For recurring tasks, two date types matter:

| Field | Meaning | Example |
|-------|---------|---------|
| `scheduled_date` | When task appears/becomes available | Jan 20 (defer until) |
| `due_date` | When task must be completed | Jan 22 (deadline) |

Recurring tasks typically set `scheduled_date` from RRULE, not `due_date`.

### Display

```
[x] ↻ Weekly review    completed Jan 13
[ ] ↻ Weekly review    scheduled Jan 20
```

The ↻ indicator shows the task is part of a recurring series.

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

Reference a specific task from elsewhere using its anchor ID:

```markdown
# Meeting Notes

Discussed the [[#budget-q1]] task with Sarah.
Need to complete [[Review Q1 budget]] before EOD.

## Action Items
- See [[#01HXY...]] for details (by ULID)
```

### Link Resolution

| Syntax                  | Links to                    |
|-------------------------|-----------------------------|
| `[[Page Name]]`         | Node by title/content match |
| `[[#anchor-id]]`        | Node by `^id` anchor        |
| `[[#01HXY...]]`         | Node by ULID                |
| `[[file.md#Section]]`   | Section in specific file    |

### Task Anchors

Add `^id` to create a stable, human-readable link target:

```markdown
- [ ] Review Q1 budget @bjorn due:2025-01-15 ^budget-q1

  ...description...
```

Or use `id:ULID` for system-assigned IDs:

```markdown
- [ ] Review Q1 budget id:01HXYZ...
```

Anchors are:
- `^id` — user-defined, human-readable, unique within repo
- `id:ULID` — system-assigned, auto-generated on first reference

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
