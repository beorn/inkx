# Asana Replacement UI Spec

Minimum feature set to replace Asana with km, inspired by Notational Velocity and Simplenote.

---

## Design Principles

**From Notational Velocity:**
- Unified search/create field — type to filter OR create
- Instant incremental filtering — no submit button
- Keyboard-first — vim keys, no mouse required

**From Simplenote:**
- Minimal UI — content over chrome
- Frictionless capture — thought to task in one step
- Tags over folders — flexible categorization

**From km (leverage existing):**
- Collapsing ancestors — `Taxes / .md #` shows hierarchy compactly
- Unified node schema — tasks are nodes with `type`, `parent_id`, `task_status`
- Event log — full history, undo, sync
- Markdown-native — files you own, edit anywhere

---

## The Unified Interface

### Core Layout

```
┌────────────────────────────────────────────────────┐
│  [🔍 Type to search or create...              ⌘K] │
├────────────────────────────────────────────────────┤
│ Today (3)                              [1]        │
│ ─────────────────────────────────────────────────  │
│ ▸ [/] Review Q1 budget      Work / Finance  -2d  │
│   [ ] Call dentist          Personal        today │
│   [ ] Fix login bug         Work / Auth          │
├────────────────────────────────────────────────────┤
│                                                    │
│  Review Q1 budget                                  │
│  ───────────────────────────────────────────────── │
│  Status: in_progress    Due: Jan 10 (overdue)     │
│  Project: Work / Finance                          │
│                                                    │
│  Need to compare with [[Q4 Actuals]].             │
│                                                    │
│  ## Subtasks                                       │
│  [x] Pull last year data                          │
│  [ ] Compare forecasts                            │
│                                                    │
└────────────────────────────────────────────────────┘
```

### The Search/Create Field (NV Pattern)

Single input that does both:

1. **Type to search** — instant filter as you type
2. **Enter on match** — select that task
3. **Enter on no match** — create new task with that title

```
[review budget]           → filters to matching tasks
[call mom]                → no match, Enter creates "call mom"
[#work fix auth bug]      → creates task tagged #work
```

**Fuzzy matching on:**
- Task content (title)
- Collapsed ancestor path
- Tags in content
- Due date ("today", "overdue")

### List Display

Each row shows (leveraging existing km patterns):

```
[mark] Title                    Project / Path      Due
─────────────────────────────────────────────────────────
[/]    Review Q1 budget         Work / Finance      -2d
[ ]    Call dentist             Personal            today
[x]    Setup repo               Work / Auth         ✓
```

**Columns:**
| Column  | Source                        | Width |
|---------|-------------------------------|-------|
| Mark    | `task_mark` (`[ ]` `[x]` `[/]`) | 3   |
| Title   | `content` first line          | flex  |
| Project | Collapsed ancestors           | 20    |
| Due     | Relative `due_date`           | 8     |

**Uses existing:** `collapseAncestorsWithTypes()`, `getNodeDisplayName()`

### Detail Pane

Opens on `Enter` or `l`, closes on `Esc` or `h`.

Shows full task with:
- Editable fields (status, due, project)
- Markdown content with rendered [[wikilinks]]
- Subtasks (child tasks)
- Notes (child paragraphs with timestamps)
- Backlinks ("Linked from:")

---

## Views

Switch with number keys (Simplenote pattern):

| Key | View      | Filter                                    |
|-----|-----------|-------------------------------------------|
| `1` | Today     | `status IN (next, in_progress)` + overdue |
| `2` | Inbox     | `data.inbox = true` or no project         |
| `3` | All       | All open tasks                            |
| `4` | Projects  | Grouped by ancestor                       |
| `5` | Waiting   | `status = waiting`                        |
| `6` | Someday   | `data.someday = true`                     |

### Today View

Manually curated list for today's work.

**Contains:**
- Tasks with `status = next` (manually added)
- Tasks with `status = in_progress`
- Overdue tasks (auto-surfaced, highlighted red)

**Ordering:** Manual drag/reorder via `parent_idx`

### Inbox View

Unprocessed items awaiting triage (NV "unfiled" concept).

**Sources:**
- Quick capture (`km add "..."`)
- New items without project parent
- Watch mode discoveries

**Actions:**
- `t` — add to today (status → next)
- `p` — set project (re-parent)
- `s` — mark someday
- `x` — mark done
- `D` — delete

### Projects View

Tasks grouped by nearest project ancestor:

```
▼ Work / Finance / .md
    [ ] Review Q1 budget
    [ ] Send invoice

▼ Personal / Health
    [ ] Call dentist
    [ ] Schedule checkup
```

**Uses existing:** `getChildren()`, ancestor collapsing

---

## Task States

### Status Field

Extend existing with `next`:

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

### Maybe/Someday

Use `data.someday: true` flag (Simplenote "archive" concept):
- Filters out of normal views
- Separate "Someday" list for weekly review

### Due Date Behavior

| Condition     | Display        | Behavior                    |
|---------------|----------------|-----------------------------|
| Overdue       | Red, "-3d"     | Auto-surfaces in Today view |
| Due today     | Yellow, "today"| Highlighted                 |
| Due tomorrow  | Normal         | Normal                      |
| Due later     | Dim, "Jan 15"  | Normal                      |

---

## Keyboard Navigation (vim + NV)

### Global

| Key     | Action                    |
|---------|---------------------------|
| `⌘K`    | Focus search/create field |
| `1-6`   | Switch view               |
| `?`     | Help                      |
| `q`     | Quit                      |

### List Navigation

| Key     | Action                    |
|---------|---------------------------|
| `j/k`   | Move down/up              |
| `g/G`   | First/last item           |
| `Enter` | Open detail pane          |
| `/`     | Focus search field        |

### Task Actions

| Key     | Action                    |
|---------|---------------------------|
| `x`     | Toggle done               |
| `t`     | Add to today (→ next)     |
| `p`     | Change project            |
| `d`     | Set due date              |
| `s`     | Change status             |
| `e`     | Edit title inline         |
| `n`     | Add note                  |
| `a`     | Add subtask               |
| `D`     | Delete                    |

### Detail Pane

| Key     | Action                    |
|---------|---------------------------|
| `h/Esc` | Close pane                |
| `e`     | Edit content              |
| `Tab`   | Next field                |

---

## Re-parenting (Easy Project Change)

`p` opens fuzzy project picker:

```
Move to project:
────────────────────────────
▸ Work / Finance
  Work / Auth
  Personal / Health
  [Create new project...]
────────────────────────────
Type to filter...
```

- Fuzzy search on project names
- Recent projects at top
- `Enter` to move task
- Bulk move: select multiple with `v`, then `p`

---

## Linking (Wikilinks)

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

Detail pane shows "Linked from:" with incoming references.

### Quick Insert

`@` in edit mode opens node picker (NV-style search).

---

## Recurring Tasks

### Model

New field: `recurrence: string | null` — iCal RRULE

```
FREQ=DAILY
FREQ=WEEKLY;BYDAY=MO,WE,FR
FREQ=MONTHLY;BYMONTHDAY=1
```

### Behavior

When recurring task marked done:
1. Clone task with same content, recurrence, project
2. Set clone's `scheduled_date` to next occurrence
3. Original stays done (history preserved)

### Display

```
[x] ↻ Weekly review    (next: Mon Jan 20)
```

---

## Data Model Changes

### New Fields

```typescript
interface Node {
  // Existing (unchanged)
  task_status?: TaskStatus;  // Add 'next' to type

  // New
  recurrence?: string;       // iCal RRULE
  waiting_for?: string;      // Who/what blocked on
}
```

### Data Object Extensions

```typescript
data: {
  someday?: boolean;   // Maybe/someday flag
  inbox?: boolean;     // Unprocessed item
  tags?: string[];     // Extracted from content #tags
}
```

---

## TextBundle Support

Support [TextBundle](https://textbundle.org/) format for rich import/export with assets.

### What is TextBundle?

A package format that bundles markdown + assets (images, files) into one container:

```
document.textbundle/
├── info.json           # Metadata (version, type, app info)
├── text.md             # Markdown content
└── assets/             # Referenced images/files
    ├── image1.png
    └── attachment.pdf
```

Compressed variant: `.textpack` (zip archive)

### Why Support It?

- **Import from Bear, Ulysses, Craft** — 30+ apps support it
- **Export with assets** — Images bundled, no broken links
- **Sandboxing friendly** — Single file = single permission
- **Obsidian compatible** — Has TextBundle importer

### Implementation

**Import:**
```bash
km import notes.textbundle        # Import single bundle
km import export.textpack         # Import compressed
km import ~/Bear/                 # Batch import directory
```

- Extract `text.md` → parse to nodes
- Copy `assets/` → `.km/assets/` or alongside .md
- Preserve relative paths in content

**Export:**
```bash
km export <id> --textbundle       # Single node as bundle
km export --all --textpack        # Full vault as pack
```

- Gather node content + descendants
- Collect referenced assets
- Write `info.json` with km metadata

### info.json Schema

```json
{
  "version": 2,
  "type": "net.daringfireball.markdown",
  "transient": false,
  "creatorIdentifier": "io.km.app",
  "io.km.app": {
    "version": 1,
    "nodeId": "01HXYZ...",
    "exportedAt": "2025-01-12T10:00:00Z"
  }
}
```

### Asset Handling

In markdown content, assets referenced as:
```markdown
![image](assets/screenshot.png)
[doc](assets/report.pdf)
```

On import, km can either:
1. Keep assets in `.km/assets/` (CAS-style, deduplicated)
2. Copy alongside .md files (Obsidian-compatible)

---

## CLI Commands

### New

```bash
km today                  # Today view
km today add <id>         # Add to today
km inbox                  # Inbox view
km add "Task title"       # Quick capture
km add -t "Task"          # Add directly to today
km move <id> <parent>     # Re-parent task

# TextBundle import/export
km import file.textbundle # Import TextBundle
km import file.textpack   # Import compressed TextPack
km export <id> -o out.textbundle  # Export as TextBundle
km export --all -o backup.textpack  # Export all as TextPack
```

### Modified

```bash
km task --status next     # Filter by next
km task --overdue         # Overdue tasks
km task --someday         # Someday list
```

---

## Implementation Phases

### Phase 1: Core (Minimum Viable)

1. Add `next` status to TaskStatus type
2. Today view (`km today`)
3. Unified search in TUI (filter as you type)
4. Split-pane layout (list + detail)
5. Basic vim keybindings

### Phase 2: Workflow

1. Inbox view and processing
2. Project picker (`p` key)
3. Due date highlighting
4. Subtasks display

### Phase 3: Polish

1. Wikilinks + backlinks
2. Recurring tasks
3. Someday/maybe
4. Inline editing

---

## Leveraged km Patterns

| Feature              | Existing Code                    |
|----------------------|----------------------------------|
| Ancestor collapsing  | `collapseAncestorsWithTypes()`   |
| Display names        | `getNodeDisplayName()`           |
| Type indicators      | `getTypeIndicator()`             |
| Task filtering       | `getTasksByStatus()`             |
| Tree queries         | `getChildren()`, `getSubtree()`  |
| Event emission       | `emit()`, `emitNodeUpdated()`    |
| Board TUI            | `apps/km-cli/src/commands/board/`|

---

## See Also

- [UI Spec](km-ui.md) — Collapsing, display functions
- [Data Model](km-data-model.md) — Node schema
- [CLI Spec](km-cli.md) — Command reference
