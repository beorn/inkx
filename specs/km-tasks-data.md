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
## [ ] Q1 Budget Review @bjorn due:2025-01-15 p:1

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
owner: bjorn
due: 2025-01-15
p: 1
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
| `type` | `type` |
| `status` | `status` |
| `owner` | `owner` |
| `due` | `due` |
| `start` | `start` |
| `p` | `p` |
| `tags` | `tags` |
| `recur` | `recur` |

### Projects

Projects are **containers for related tasks**. Three ways to define them:

**1. Folder containment** (implicit):
```
Work/
├── Q1-Planning/           # ← project (folder)
│   ├── budget-review.md   # task
│   └── headcount.md       # task
└── tasks.md               # contains - [ ] items
```

**2. File with child tasks** (explicit):
```markdown
---
type: project
---
# Q1 Planning

Project description...

## Tasks
- [ ] Review budget
- [ ] Plan headcount
```

**3. Tags and links** (virtual):
```markdown
- [ ] Review budget #q1-planning
- [ ] Plan headcount #q1-planning [[Q1 Planning]]
```

| Method | Best For | Query |
|--------|----------|-------|
| Folder | Dedicated projects with many tasks | `path LIKE 'Q1-Planning/%'` |
| File | Projects with description/notes | `parent_id = <project-id>` |
| Tag | Cross-cutting concerns | `tags CONTAINS 'q1-planning'` |
| Link | Loose association | backlinks to project |

**Combining methods:** A project folder can have a `README.md` or `_index.md` with project metadata, and tasks can use tags for cross-project membership.

---

## Line-Based Metadata

Metadata embedded in the same line as task content. Used by list tasks and section tasks.

See [Prior Art](km-tasks-prior-art.md) for comparison with todo.txt, TaskPaper, Obsidian Tasks, Tana, and others.

### km Syntax

km uses `key:value` pairs (like todo.txt) with `@` for mentions and `#` for tags:

```markdown
- [ ] Review Q1 budget @bjorn due:2025-01-15 p:1 #finance
```

| Field      | Inline | Frontmatter | Node Field | Example |
|------------|--------|-------------|------------|---------|
| Owner      | `@user` | `owner` | `owner` | `@bjorn` |
| Due        | `due:DATE` | `due` | `due` | `due:2025-01-15` |
| Scheduled  | `start:DATE` | `start` | `start` | `start:2025-01-10` |
| Priority   | `p:N` | `p` | `p` | `p:1` |
| Tags       | `#tag` | `tags` | `tags` | `#work #urgent` |
| Recurrence | `recur:RRULE` | `recur` | `recur` | `recur:FREQ=WEEKLY` |
| ID/Anchor  | `^id` | — | `id` | `^budget-q1` |

**Naming principles:**
- Short field names minimize clutter (`p` not `priority`, `recur` not `recurrence`)
- `@user` for owner (not assignee) — matches common usage
- `start` for scheduled date — when task becomes available (like OmniFocus "defer")
- `due` for deadline — when task must be done
- Same names in inline, frontmatter, and node fields for consistency

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
- [ ] Review Q1 budget @bjorn due:2025-01-15 start:2025-01-10
- [/] Fix login bug @alice p:1
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
owner: bjorn
due: 2025-01-15
p: 1
tags: [work, q1, finance]
recur: FREQ=WEEKLY;BYDAY=MO
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
  | "scheduled"   // Has future start date
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
| `scheduled`  | Scheduled  | Has future `start` date          |
| `done`       | Archive    | Completed                        |
| `cancelled`  | Archive    | Dropped                          |

---

## Node Fields

```typescript
interface Node {
  // Task fields
  status?: TaskStatus;
  owner?: string;        // @user
  due?: string;          // YYYY-MM-DD deadline
  start?: string;        // YYYY-MM-DD defer/scheduled
  p?: number;            // 1-5 priority
  tags?: string[];       // from #tags
  recur?: string;        // iCal RRULE
  recur_prev?: string;   // ID of predecessor (for recurring)
  waiting_for?: string;  // who/what blocked on
}
```

Note: Inbox, archive, and someday are determined by **folder location**, not flags.

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
Original task (recur: FREQ=WEEKLY)
├── [x] done 2025-01-06 — instance 1 (completed)
├── [x] done 2025-01-13 — instance 2 (completed)
└── [ ] due 2025-01-20  — instance 3 (current, the "live" task)
```

When you complete instance 3:
1. Instance 3 marked `done`, completion timestamp recorded
2. Instance 4 created with `start` = next occurrence
3. Instance 4 inherits: content, recur, project, tags

### Instance Linking

Each instance points back to the original task:

```typescript
interface Node {
  recur?: string;      // RRULE (on current active instance)
  recur_prev?: string; // ID of task this was cloned from
}
```

- Original task has `recur` but no `recur_prev`
- Each clone points to its predecessor (linked list)
- Traverse chain to find history: E → D → C → B → A
- Find original: follow `recur_prev` until null

### Clone Behavior

**Shallow clone:** Only the parent task is cloned, not subtasks.

Rationale: Subtasks in recurring tasks typically represent the *same* checklist each time
(e.g., "Weekly review" with subtasks "Check inbox", "Review projects"). These reset rather
than accumulate. For persistent subtasks across recurrences, use a project structure instead.

**Where clones are created:** New instances are created in the **same location** as the
completed task (same parent folder/project).

**When clones are created:** On completion only. No pre-generation of future instances.
The next instance is created immediately when the current one is marked done.

**Search filtering:** Completed instances excluded from search by default (`status != done`).
Use `--all` or explicit filters to include history.

### Large Task Warning

⚠️ **Avoid recurrence on complex tasks with extensive content.**

If a task has significant description, attachments, or accumulated notes, recurring it
wastes storage and makes instances harder to manage. Instead:

1. **Make a recurring subtask:**
   ```markdown
   # Project Alpha (persistent)

   Project overview and accumulated notes...

   ## Tasks
   - [ ] ↻ Weekly check-in  recur:FREQ=WEEKLY  ← only this recurs
   - [ ] Other tasks...
   ```

2. **Use project + recurring task:**
   ```
   project-alpha/
   ├── README.md            # Project info (persistent)
   └── weekly-review.md     # type: task, recur: FREQ=WEEKLY
   ```

The recurring task stays small; the project holds accumulated context.

### Pattern Changes

When the recurrence pattern changes (e.g., weekly → biweekly), update `recur` on
the current instance. The linked list preserves history:

```
Original A (recur: WEEKLY)
└── [x] Instance B (recur_prev: A)
    └── [x] Instance C (recur_prev: B)
        └── [ ] Instance D (recur_prev: C, recur: BIWEEKLY)  ← pattern changed
            └── [ ] Instance E (recur_prev: D)
```

- Linked list captures full history and order
- Pattern change visible in chain (D has different `recur` than A)
- Traverse: E → D → C → B → A to see evolution

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
| **Complete** | Mark done, shallow clone next instance |
| **Skip** | Mark cancelled, shallow clone next instance |
| **Edit this** | Modify current instance only |
| **Edit all future** | Modify original task, affect future clones |
| **Change pattern** | Update `recur` on current instance |
| **Stop recurring** | Remove `recur` from current instance |
| **Delete series** | Traverse chain, delete all linked instances |

### Start vs Due

For recurring tasks, two date types matter:

| Field | Meaning | Example |
|-------|---------|---------|
| `start` | When task appears/becomes available | Jan 20 (defer until) |
| `due` | When task must be completed | Jan 22 (deadline) |

Recurring tasks typically set `start` from RRULE, not `due`.

### Display

```
[x] ↻ Weekly review    completed Jan 13
[ ] ↻ Weekly review    scheduled Jan 20
```

The ↻ indicator shows the task is part of a recurring series.

---

## Someday/Maybe

Someday items are **plain list items** (no checkbox), not tasks:

```markdown
## Ideas

- Learn Rust
- Trip to Japan
- Refactor auth system
```

**Why plain list items?**
- No checkbox = no commitment
- Clear distinction: `[ ]` means "I will do this", `-` means "maybe"
- Can live in any file, any folder
- Becomes a task when you add the checkbox

**Conversion:**

| Direction | Action | Result |
|-----------|--------|--------|
| Task → Someday | `S` key or `km someday <id>` | Remove checkbox: `- [ ] X` → `- X` |
| Someday → Task | `T` key or `km task promote <id>` | Add checkbox: `- X` → `- [ ] X` |

```bash
km someday 01HXY...              # Convert task to list item
km task promote 01HXY...         # Convert list item to task
km task promote 01HXY... -t      # Convert and add to today
km task promote 01HXY... -p Work # Convert and move to project
```

**Someday view** shows all plain list items (type `list_item`, no checkbox).

---

## Archive

Completed and cancelled tasks move to `archive/` folder:

```
archive/
├── 2025/
│   ├── 01/
│   │   ├── call-dentist.md      # done 2025-01-10
│   │   └── fix-login-bug.md     # done 2025-01-12
│   └── 02/
└── cancelled/
    └── old-project.md
```

**Why folder-based?**
- Physical separation from active work
- Easy to browse by date
- Can exclude from search/sync
- Standard file system semantics

**Archiving:**
```bash
km done 01HXY...      # Moves to archive/YYYY/MM/
km archive 01HXY...   # Explicit archive without status change
```

Tasks in `archive/` excluded from normal views/search.

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

Overdue = `due < today AND status NOT IN (done, cancelled)`

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
ALTER TABLE nodes ADD COLUMN owner TEXT;
ALTER TABLE nodes ADD COLUMN due TEXT;
ALTER TABLE nodes ADD COLUMN start TEXT;
ALTER TABLE nodes ADD COLUMN p INTEGER;
ALTER TABLE nodes ADD COLUMN recur TEXT;
ALTER TABLE nodes ADD COLUMN recur_prev TEXT;
ALTER TABLE nodes ADD COLUMN waiting_for TEXT;
```

### Indexes

```sql
CREATE INDEX idx_nodes_status ON nodes(status)
  WHERE type = 'task';
CREATE INDEX idx_nodes_due ON nodes(due)
  WHERE due IS NOT NULL;
CREATE INDEX idx_nodes_start ON nodes(start)
  WHERE start IS NOT NULL;
CREATE INDEX idx_nodes_owner ON nodes(owner)
  WHERE owner IS NOT NULL;
CREATE INDEX idx_nodes_recur_prev ON nodes(recur_prev)
  WHERE recur_prev IS NOT NULL;
```

---

## See Also

- [km-tasks.md](km-tasks.md) — Overview
- [km-tasks-tui.md](km-tasks-tui.md) — TUI spec
- [km-tasks-cli.md](km-tasks-cli.md) — CLI spec
- [km-tasks-prior-art.md](km-tasks-prior-art.md) — Prior art research
- [km-data-model.md](km-data-model.md) — Full node schema
