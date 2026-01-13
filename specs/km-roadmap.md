# km Roadmap

Comprehensive implementation plan with step-by-step phases and acceptance tests.

---

## Over-Engineering Warnings

**Watch out for these:**

| Feature | Risk | Simpler Alternative |
|---------|------|---------------------|
| Transclusions (![[path]]) | Complex embedding logic | Just use wikilinks + good nav |
| HTML comment attributes | Custom syntax, hard to debug | YAML frontmatter instead |
| Socket IPC for daemon | Complexity for little gain | Direct DB access like beads no-db mode |
| Query language parser | Full parser is overkill | Simple flag-based filters first |
| TUI drag-and-drop | Terminal support is flaky | Keyboard-based move commands |
| Column WIP limits | Nice-to-have, not core | Manual count in column header |
| Auto-start daemon | Magic behavior confuses | Explicit `km daemon start` |

**Recommended cuts:**
1. **Skip transclusions** (km-fat) — Not needed for MVP Asana replacement
2. **Skip HTML comment attrs** (km-5q8) — Use frontmatter or simpler syntax
3. **Skip daemon socket** — Direct file/DB access is simpler (beads pattern)
4. **Defer drag-and-drop** (km-jya, km-fno) — Keyboard-first is fine

**Keep simple:**
- Inline fields → extract to Node fields on parse (already done for due:)
- Tags → already extracted to data.tags
- Query → start with `--status`, `--due`, `--tag` flags, not full query language

**Existing code to simplify:**
- `apps/km-cli/src/commands/tasks.ts` (908 lines) — Heavy formatting logic, consider extracting to shared module
- `apps/km-cli/src/commands/board/state.ts` (500 lines) — Complex state machine, may be overbuilt for current needs

---

## Current State (Jan 2026)

**Implemented:**
- Core type system (Node, Event, TaskStatus)
- Event-sourced architecture (events.jsonl → state.db)
- Dual storage modes (disk/memory)
- Markdown parsing + serialization (GFM, task lists)
- Bidirectional links (wikilinks, backlinks)
- File system watching (chokidar)
- Full-text search (FTS5)
- CLI commands: list, tree, show, board, search, task, init, sync, watch, rebuild
- Kanban TUI (React/Ink, vim keys)
- 351 passing tests

**Not Yet Implemented:**
- Parser: inline fields, references, transclusions, HTML attributes
- Query: field:value syntax, date shortcuts
- TUI: detail pane, project picker, drag-and-drop
- CLI: quick capture, templates
- Daemon: background process, socket IPC
- Bidirectional sync: model→file writes

---

## Phase 1: Parser Enhancements

Complete markdown parsing for task management features.

### 1.1 Inline References (km-c9x)

Parse `@person`, `#tag`, `+project`, `[[wikilink]]` in task content.

**Acceptance Test:**
```bash
# Setup
mkdir -p /tmp/km-test && cd /tmp/km-test
cat > tasks.md << 'EOF'
# Tasks
- [ ] Review PR from @john #urgent
- [ ] Fix bug in +project-alpha
- [ ] Read [[meeting-notes]]
EOF

# Test
km init
km list --type task --show-id
# Expected: 3 tasks listed

km show <task-id>
# Expected output includes:
#   Refs: @john
#   Tags: #urgent
#   Links: [[meeting-notes]]
```

### 1.2 Inline Fields (km-1ar)

Parse `due:`, `p:`, `start:` annotations in task content.

**Acceptance Test:**
```bash
cat > tasks.md << 'EOF'
- [ ] Submit report due:2026-01-20 p:1
- [ ] Call client start:2026-01-15
EOF

km sync
km task --due today
# Expected: Lists tasks based on due dates

km show <task-id>
# Expected: due_date: 2026-01-20, priority: 1
```

### 1.3 HTML Comment Attributes (km-5q8)

Parse `<!-- add=, sync=, collapse=, limit= -->` in markdown.

**Acceptance Test:**
```bash
cat > board.md << 'EOF'
# My Board

## Todo
<!-- sync=task_status:open -->

## Done
<!-- sync=task_status:done -->
EOF

km sync
km board
# Expected: Board shows columns with sync rules applied
```

### 1.4 Section Tree from Headings (km-bjm)

Headings create nested section hierarchy, not flat list.

**Acceptance Test:**
```bash
cat > notes.md << 'EOF'
# Project
## Phase 1
### Task A
### Task B
## Phase 2
### Task C
EOF

km sync
km tree notes.md
# Expected:
# Project
# ├── Phase 1
# │   ├── Task A
# │   └── Task B
# └── Phase 2
#     └── Task C
```

### 1.5 Transclusions (km-fat)

Parse `![[path]]` for embedded content.

**Acceptance Test:**
```bash
cat > template.md << 'EOF'
## Standard Tasks
- [ ] Review code
- [ ] Update docs
EOF

cat > project.md << 'EOF'
# New Project
![[template]]
EOF

km sync
km tree project.md
# Expected: Shows embedded template content
```

---

## Phase 2: Query Language

Structured queries for filtering and searching.

### 2.1 Field:Value Syntax (km-qft)

`field:value`, `@ref`, `#tag`, `-negation` in queries.

**Acceptance Test:**
```bash
km list "type:task status:open"
# Expected: Only open tasks

km list "#urgent -#done"
# Expected: Tasks with #urgent but not #done

km list "@john"
# Expected: Tasks mentioning @john
```

### 2.2 Date Shortcuts (km-539)

`due:today`, `due:week`, `due:past` for date queries.

**Acceptance Test:**
```bash
km task --filter "due:today"
# Expected: Tasks due today

km task --filter "due:past"
# Expected: Overdue tasks

km task --filter "due:week"
# Expected: Tasks due within 7 days
```

### 2.3 Full-Text with Phrases (km-jow)

Quoted phrases and result highlighting.

**Acceptance Test:**
```bash
km search '"exact phrase"'
# Expected: Only matches containing exact phrase

km search "important meeting" --highlight
# Expected: Matches highlighted in output
```

---

## Phase 3: TUI Improvements

Enhanced terminal user interface.

### 3.1 Detail Pane (km-0ps)

Show all fields, refs, subtasks when item selected.

**Acceptance Test:**
```bash
km board
# Press Enter on task
# Expected: Right pane shows:
#   - Full content
#   - Status, priority, due date
#   - Subtasks list
#   - References (@, #, [[]])
#   - Backlinks
```

### 3.2 Project Picker (km-oox)

Fuzzy search to re-parent tasks with `p` key.

**Acceptance Test:**
```bash
km board
# Select task, press 'p'
# Expected: Fuzzy picker shows projects
# Type to filter, Enter to move task
# Task now has new parent
```

### 3.3 Column Display (km-uhy)

WIP limits and collapsed columns.

**Acceptance Test:**
```bash
# In board.md:
## In Progress
<!-- limit=3 -->

km board
# Expected: Column shows "In Progress (2/3)"
# If >3 items, shows warning
```

---

## Phase 4: CLI Quick Actions

Fast task management from command line.

### 4.1 Quick Capture (km-3lx)

`km new "Task title"` creates task instantly.

**Acceptance Test:**
```bash
km new "Call mom"
# Expected: Task created, ID printed

km new "Fix bug" --due tomorrow --tag urgent
# Expected: Task with due date and tag

km new "Review PR" --project work/alpha
# Expected: Task parented under work/alpha
```

### 4.2 Mark Done (km-sh9)

`km done <id>` marks task complete.

**Acceptance Test:**
```bash
km new "Test task"
# Returns: Created: km-abc123

km done km-abc
# Expected: Task marked done

km show km-abc
# Expected: status: done
```

### 4.3 GTD Bootstrap (km-zr8)

`km init gtd` creates GTD folder structure.

**Acceptance Test:**
```bash
mkdir -p /tmp/gtd-test && cd /tmp/gtd-test
km init gtd

ls -la
# Expected directories:
#   Inbox/
#   Projects/
#   Someday/
#   Reference/
#   Archive/

cat Inbox/README.md
# Expected: GTD inbox explanation
```

---

## Phase 5: Bidirectional Sync

Model changes write back to markdown files.

### 5.1 Task Status Writes (km-yh2)

Toggle task in TUI → updates markdown file.

**Acceptance Test:**
```bash
cat > tasks.md << 'EOF'
- [ ] Test task
EOF

km init
km board
# Select task, press 'x' to toggle

cat tasks.md
# Expected: - [x] Test task
```

### 5.2 Board Sync Rules (km-fru)

`add=` rule auto-populates column from query.

**Acceptance Test:**
```bash
cat > board.md << 'EOF'
## Urgent
<!-- add=tag:urgent -->
EOF

# Create task with #urgent tag elsewhere
km new "Fix critical bug #urgent"

km board board.md
# Expected: Task appears in Urgent column
```

### 5.3 Consolidate Watch (km-cf2)

`km watch` becomes `km sync --watch`.

**Acceptance Test:**
```bash
# Old command should warn
km watch
# Expected: "Deprecated. Use 'km sync --watch'"

# New command works
km sync --watch &
echo "- [ ] New task" >> tasks.md
sleep 6  # Wait for debounce
km list --type task
# Expected: New task appears
```

---

## Phase 6: Daemon

Background process for real-time sync and automation.

### 6.1 Daemon Lifecycle (km-bil)

Start/stop daemon, PID management.

**Acceptance Test:**
```bash
km daemon start
# Expected: "km daemon started (PID: 12345)"

km daemon status
# Expected: Status: running, PID: 12345, Uptime: 0s

km daemon stop
# Expected: "km daemon stopped"

km daemon status
# Expected: Status: stopped
```

### 6.2 Socket Communication

CLI↔daemon via Unix socket.

**Acceptance Test:**
```bash
km daemon start

# In another terminal
km daemon status
# Expected: Gets status from daemon via socket

km sync  # While daemon running
# Expected: Sends sync command to daemon
```

### 6.3 Auto-Start

Daemon auto-starts when needed.

**Acceptance Test:**
```bash
# No daemon running
km hub
# Expected: Daemon auto-starts, then TUI opens

km daemon status
# Expected: Status: running
```

---

## Phase 7: Automation

Rule-based task automation.

### 7.1 Board Sync Rules

Move tasks to columns based on status changes.

**Acceptance Test:**
```bash
cat > board.md << 'EOF'
## Todo
<!-- sync=task_status:open -->
- [ ] Task A

## Done
<!-- sync=task_status:done -->
EOF

km init
km daemon start

# Mark task done
km done <task-a-id>

cat board.md
# Expected: Task A moved to Done section
```

### 7.2 Recurring Tasks

Completed recurring tasks spawn next occurrence.

**Acceptance Test:**
```bash
cat > tasks.md << 'EOF'
- [ ] Weekly review due:2026-01-12 recur:weekly
EOF

km init
km daemon start

km done <task-id>

km list --type task
# Expected: Two tasks:
#   1. [x] Weekly review due:2026-01-12 (done)
#   2. [ ] Weekly review due:2026-01-19 (new)
```

---

## Phase 8: Polish & Testing

Refinement and edge cases.

### 8.1 Node Moving Bug (km-abc)

Verify node moving works on fresh repo.

**Acceptance Test:**
```bash
rm -rf /tmp/move-test && mkdir /tmp/move-test && cd /tmp/move-test
mkdir -p folder-a folder-b
echo "- [ ] Test task" > folder-a/tasks.md

km init
km list --type task --show-id
# Note task ID

km task move <task-id> --to folder-b/tasks.md
km tree
# Expected: Task now under folder-b
```

### 8.2 Test Coverage

All features have tests.

**Acceptance Test:**
```bash
bun test
# Expected: All tests pass

bun fix
# Expected: No errors
```

---

## Phase 9: Future (Deferred)

### 9.1 Connectors (km-xns)

CalDAV/CardDAV sync for calendar and contacts.

### 9.2 Drag-and-Drop (km-jya, km-fno)

TUI file drag-and-drop and multi-select.

### 9.3 Agent Integration

AI agent orchestration (Phase 2 of product roadmap).

---

## Dependency Graph

```
Phase 1: Parser
├── 1.1 Inline refs (km-c9x)
├── 1.2 Inline fields (km-1ar)
├── 1.3 HTML attrs (km-5q8)
├── 1.4 Section tree (km-bjm)
└── 1.5 Transclusions (km-fat)
         │
         ▼
Phase 2: Query
├── 2.1 Field:value (km-qft) ← depends on 1.1, 1.2
├── 2.2 Date shortcuts (km-539) ← depends on 1.2
└── 2.3 Full-text (km-jow)
         │
         ▼
Phase 3: TUI
├── 3.1 Detail pane (km-0ps) ← depends on 2.1
├── 3.2 Project picker (km-oox)
└── 3.3 Column display (km-uhy) ← depends on 1.3
         │
         ▼
Phase 4: CLI
├── 4.1 Quick capture (km-3lx)
├── 4.2 Mark done (km-sh9)
└── 4.3 GTD bootstrap (km-zr8)
         │
         ▼
Phase 5: Sync
├── 5.1 Status writes (km-yh2)
├── 5.2 Board rules (km-fru) ← depends on 1.3
└── 5.3 Watch consolidate (km-cf2)
         │
         ▼
Phase 6: Daemon
└── 6.1 Daemon lifecycle (km-bil) ← depends on 5.3
         │
         ▼
Phase 7: Automation
├── 7.1 Board sync ← depends on 6.1, 1.3
└── 7.2 Recurring ← depends on 6.1, 1.2
```

---

## Beads Summary

| Phase | Bead   | Title                                      | Priority |
|-------|--------|--------------------------------------------|----------|
| 1.1   | km-c9x | Inline references (@, #, +, [[]])          | P1       |
| 1.2   | km-1ar | Inline fields (due:, p:, start:)           | P1       |
| 1.3   | km-5q8 | HTML comment attributes                    | P1       |
| 1.4   | km-bjm | Section tree from headings                 | P1       |
| 1.5   | km-fat | Transclusions ![[path]]                    | P1       |
| 2.1   | km-qft | Query language field:value                 | P1       |
| 2.2   | km-539 | Date query shortcuts                       | P1       |
| 2.3   | km-jow | Full-text with phrases                     | P2       |
| 3.1   | km-0ps | TUI detail pane                            | P2       |
| 3.2   | km-oox | TUI project picker                         | P2       |
| 3.3   | km-uhy | TUI column display                         | P2       |
| 4.1   | km-3lx | km new quick capture                       | P1       |
| 4.2   | km-sh9 | km done mark complete                      | P1       |
| 4.3   | km-zr8 | km init gtd bootstrap                      | P1       |
| 5.1   | km-yh2 | Bidirectional sync                         | P1       |
| 5.2   | km-fru | Column add= rule                           | P1       |
| 5.3   | km-cf2 | Consolidate watch→sync --watch             | P2       |
| 6.1   | km-bil | Daemon implementation                      | P1       |
| 8.1   | km-abc | Node moving bug                            | P2       |
| 9.1   | km-xns | CalDAV/CardDAV connectors                  | P3       |
| 9.2   | km-fno | TUI drag-select                            | P4       |
| 9.3   | km-jya | TUI drag-and-drop                          | P4       |

---

## Getting Started

Pick work from `bd ready`:

```bash
bd ready              # Show unblocked work
bd show <id>          # View details
bd update <id> --status in_progress
# ... implement ...
bun test              # Verify
bd close <id>
bd sync && git push
```

Start with Phase 1 parser work — it unblocks everything else.
