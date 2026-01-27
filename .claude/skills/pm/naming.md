---
description: Bead ID conventions and scope tokens
---

# Bead ID Naming Convention

This document defines the ID structure for beads in the km project. All skills that create beads should follow these conventions.

## ID Patterns

### Package-Specific Issues

```
km-<scope>.<type>-<N>-<slug>
```

| Component | Description                    | Example               |
| --------- | ------------------------------ | --------------------- |
| `km`      | Project prefix                 | `km`                  |
| `<scope>` | Package/area (see table below) | `storage`             |
| `<type>`  | Issue type                     | `bug`, `feat`, `task` |
| `<N>`     | Auto-incremented number        | `3`                   |
| `<slug>`  | Descriptive kebab-case         | `core-dump`           |

**Examples:**

- `km-storage.bug-3-core-dump`
- `km-tui.feat-1-vim-mode`
- `km-board.task-2-cleanup-reducer`

### Cross-Cutting Issues

For issues that span multiple packages or don't fit a single scope:

```
km-<type>-<slug>
```

**Examples:**

- `km-bug-watcher-race`
- `km-feat-dark-mode`
- `km-epic-domain-refactor`

## Scope Tokens

| Short      | Package/Location |
| ---------- | ---------------- |
| `storage`  | @km/storage      |
| `board`    | @km/board        |
| `tree`     | @km/tree         |
| `tui`      | apps/km-tui      |
| `cli`      | apps/km-cli      |
| `core`     | @km/core         |
| `markdown` | @km/markdown     |
| `beads`    | @km/beads        |
| `agent`    | @km/agent        |

## Type Tokens

| Type    | When to Use                       |
| ------- | --------------------------------- |
| `bug`   | Something is broken               |
| `feat`  | New functionality                 |
| `task`  | Work item (refactor, docs, chore) |
| `epic`  | Large initiative with subtasks    |
| `chore` | Maintenance, cleanup              |

## Subtasks (Dot Notation)

Use `.a`, `.b`, `.c` (letters) for subtasks under a parent:

```
km-storage.feat-1-file-watcher      # Parent
km-storage.feat-1-file-watcher.a    # Subtask: implement debouncing
km-storage.feat-1-file-watcher.b    # Subtask: add ignore patterns
km-storage.feat-1-file-watcher.c    # Subtask: write tests
```

**Rules:**

- Subtasks use the parent ID + `.` + letter
- Letters are sequential: a, b, c, ... z
- For 26+ subtasks, continue: aa, ab, ...
- All subtasks should have `--parent <parent-id>`

## Epic Children

**Small subtasks:** Use dot notation (`.a`, `.b`, `.c`)

- Quick wins, tightly coupled to parent
- Complete within same session

**Large subtasks:** Create as own beads

- Significant work (hours+)
- Could be worked independently
- Use `--deps blocks:<epic-id>` to link

```bash
# Epic
bd create --id km-epic-domain-refactor --type epic --title "Domain object refactor"

# Large child (own bead, blocked by epic planning)
bd create --id km-storage.feat-1-repo-object --type feat \
  --title "Create Repo domain object" \
  --deps "blocks:km-epic-domain-refactor"
```

## Auto-Increment Guidance

Before creating a bead, find the next number:

```bash
# Check existing beads for a scope
bd list --all | grep "km-storage"

# Example output:
# km-storage.bug-1  Fix watcher race
# km-storage.bug-2  Handle empty dirs
# → Next bug: km-storage.bug-3-<slug>
```

## Fields vs ID Encoding

Use ID encoding for primary classification; use fields for additional metadata.

| Aspect          | Encode in ID | Use Field                     |
| --------------- | ------------ | ----------------------------- |
| Scope/package   | Yes          | -                             |
| Type (bug/feat) | Yes          | Also set `--type`             |
| Sequence number | Yes          | -                             |
| Priority        | No           | `--priority P0-P4`            |
| Labels/tags     | No           | `--labels sync,phase:testing` |
| Assignee        | No           | `--assignee name`             |
| Parent          | No           | `--parent <id>`               |
| Dependencies    | No           | `--deps blocks:<id>`          |

## Complete Examples

### Bug in a Package

```bash
# 1. Find next number
bd list --all | grep "km-storage.bug"
# km-storage.bug-1, km-storage.bug-2 exist

# 2. Create with full ID
bd create --id km-storage.bug-3-sync-race \
  --type bug \
  --title "Race condition in file sync" \
  --description "Files occasionally not written when..." \
  --priority P0 \
  --labels sync
```

### Feature with Subtasks

```bash
# Parent feature
bd create --id km-tui.feat-1-vim-mode \
  --type feat \
  --title "Add vim keybindings"

# Subtasks
bd create --id km-tui.feat-1-vim-mode.a \
  --type task \
  --title "Normal mode navigation" \
  --parent km-tui.feat-1-vim-mode

bd create --id km-tui.feat-1-vim-mode.b \
  --type task \
  --title "Visual selection mode" \
  --parent km-tui.feat-1-vim-mode
```

### Cross-Cutting Epic

```bash
# Epic (no scope prefix)
bd create --id km-epic-dark-mode \
  --type epic \
  --title "Dark mode support"

# Related feature in specific package
bd create --id km-tui.feat-2-theme-toggle \
  --type feat \
  --title "Theme toggle component" \
  --deps "blocks:km-epic-dark-mode"
```

### Quick Bug Report (Minimal)

```bash
bd create --id km-cli.bug-1-help-crash \
  --type bug \
  --title "CLI crashes on --help" \
  --priority P0
```
