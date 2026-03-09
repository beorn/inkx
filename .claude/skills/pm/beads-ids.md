---
description: Bead ID conventions and scope tokens
---

# Bead ID Naming Convention

This document defines the ID structure for beads in the km project. All skills that create beads should follow these conventions.

## Check Database Prefix First

**CRITICAL**: Different projects/submodules have different ID prefixes. Before creating any bead:

```bash
# See what prefix the database uses
bd list --limit 1

# Or check directly
sqlite3 .beads/beads.db "SELECT id FROM issues LIMIT 1"
```

| Location | Prefix |
|----------|--------|
| km (main project) | `km-` |
| vendor/silvery | `silvery-` |
| vendor/silvery/packages/ansi | `silvery/packages/ansi-` |
| Other vendor packages | `beorn-<name>-` |

**Never assume `km-`** — always verify for the current working directory. The `bd` command will reject mismatched prefixes.

## Philosophy: Metadata First

Beads have rich metadata fields (`issue_type`, `labels`, `priority`, `assignee`, `dependencies`) that should carry classification details rather than encoding everything in IDs. IDs should be **short, memorable prefixes** for grouping related work.

## Contents

- [ID Patterns](#id-patterns)
- [Choosing an ID Pattern](#choosing-an-id-pattern)
- [Scope Tokens](#scope-tokens)
- [Subtasks (Dot Notation)](#subtasks-dot-notation)
- [Metadata Usage Guide](#metadata-usage-guide)
- [Auto-Increment Guidance](#auto-increment-guidance)
- [Complete Examples](#complete-examples)
- [Migration Strategy](#migration-strategy)

## ID Patterns

### Pattern 1: Project-Scoped Sequential (Recommended)

```
km-<scope>-<N>
```

**When to use**: Most work items scoped to a specific package or area.

**Examples:**

- `km-storage-15` - Storage package work #15
- `km-tui.persist-nav` - TUI board navigation persistence
- `km-silvery.bg-bleed` - silvery background color bleed bug

**Metadata carries classification:**

```bash
bd create --id km-storage-15 \
  --type bug \
  --title "Race condition in file sync" \
  --priority 0 \
  --labels sync,phase:testing
```

### Pattern 2: Hierarchical (For Epic Decomposition)

```
<prefix><scope>-<N>        # Parent
<prefix><scope>-<N>.<N>    # Subtask (numeric, not letters)
```

**When to use**: Breaking down epics or large features into subtasks.

**Examples:**

```
km-vitestx             # Test framework tracking epic
km-vitestx.mdtest      # mdtest vitest plugin subtask
km-infra.ci-fuzz       # CI fuzzing (cross-cutting infra)

km-silvery                # silvery tracking epic
km-silvery.stale-pixels   # Stale pixel bugs subtask
km-silvery.bg-bleed       # Background color bleed subtask
```

**Note**: Dot notation works with ANY prefix — not just `km-`. Always check the database prefix first.

**Rules:**

- Subtasks use parent ID + `.` + number
- Numbers are sequential: 1, 2, 3, ...
- See [SKILL.md Quick Reference](../SKILL.md#quick-reference-common-flag-mistakes) for the `--id`/`--parent` constraint.

### Pattern 3: Keyword-Based (For Named Initiatives)

```
km-<keyword>
km-<multi-word-keyword>
```

**When to use**: Named epics, cross-cutting concerns, memorable initiatives that span multiple packages.

**Examples:**

- `km-domain` - Domain objects epic
- `km-lint-cleanup` - Lint cleanup task
- `km-board-persist` - Board state persistence

### Pattern 4: Opaque Short IDs (Quick Capture)

```
km-<4-5 char random>
```

**When to use**: Quick capture, temporary tracking, scope unknown yet.

**Examples:**

- `km-5vsut` - Quick bug capture
- `km-2eh2` - Investigation task

**Note**: Most historical beads use this pattern. It's valid for quick capture but prefer Pattern 1 for organized work.

## Choosing an ID Pattern

| Scenario              | Pattern         | Example                                    | Notes                           |
| --------------------- | --------------- | ------------------------------------------ | ------------------------------- |
| Package-specific bug  | 1: Scoped       | `km-storage-15`, `silvery-render-3`     | Check prefix first, find next N |
| Feature in a package  | 1: Scoped       | `km-tui-8`, `silvery/packages/ansi-color-2`         | Clear scope                     |
| Epic with subtasks    | 2: Hierarchical | `km-storage-8.1`, `km-silvery.bg-bleed`       | Dot notation works with any prefix |
| Cross-package feature | 3: Keyword      | `km-dark-mode`                             | Memorable name                  |
| Quick bug capture     | 4: Opaque       | `km-5vsut`                                 | Auto-generated                  |
| Unknown scope yet     | 4: Opaque       | `km-a1b2c`                                 | Refine later                    |

**Remember**: Check `bd list --limit 1` to find the correct prefix before creating any bead.

## Scope Tokens

### Core Packages

| Scope      | Package/Location |
| ---------- | ---------------- |
| `storage`  | @km/storage      |
| `board`    | @km/board        |
| `tree`     | @km/tree         |
| `markdown` | @km/markdown     |

### Apps

| Scope | Package/Location |
| ----- | ---------------- |
| `tui` | apps/km-tui      |
| `cli` | apps/km-cli      |

### Vendor Packages

| Scope      | Covers                                           |
| ---------- | ------------------------------------------------ |
| `term`     | vendor/beorn-term, beorn-tui, silvery absorb |
| `termless` | vendor/termless (headless terminal testing) |
| `flexture`    | vendor/flexture                               |
| `logger`   | vendor/decant                              |

### Infrastructure & Cross-Cutting

| Scope      | Meaning                        |
| ---------- | ------------------------------ |
| `infra`    | Build, test, CI infrastructure |
| `test`     | Test infrastructure            |
| `sync`     | Sync/watcher system            |
| `commands` | Command system                 |
| `bench`    | Benchmarks                     |
| `chore`    | Maintenance                    |
| `misc`     | Miscellaneous                  |

### General Rule for New Scopes

When creating beads for a package/area not listed above:

1. **Use existing scope if related**: e.g., silvery work → `tui` (they're TUI ecosystem)
2. **Vendor packages**: Use package name without `beorn-` prefix
3. **Core packages**: Use package name without `@km/` prefix
4. **Keep it short**: Prefer 3-6 character scope tokens

## Subtasks (Dot Notation)

Use `.1`, `.2`, `.3` (numbers) for subtasks under a parent. **Works with any prefix**:

```
km-storage-8          # Parent epic
km-storage-8.1        # Subtask 1
km-storage-8.2        # Subtask 2

km-silvery               # Tracking epic
km-silvery.stale-pixels  # Named subtask
km-silvery.bg-bleed      # Named subtask
```

**Rules:**

- Subtasks use the parent ID + `.` + number
- Numbers are sequential: 1, 2, 3, ... (not letters)
- For 10+ subtasks, continue: 10, 11, 12, ...
- **Dot notation works with ANY prefix** — not just `km-`
- See [SKILL.md Quick Reference](../SKILL.md#quick-reference-common-flag-mistakes) for the `--id`/`--parent` constraint.

**Query subtasks:**

```bash
bd list | grep "km-storage-8"     # Prefix match
```

## Metadata Usage Guide

### What Goes Where

| Aspect          | ID           | Metadata Field | Query Method                     |
| --------------- | ------------ | -------------- | -------------------------------- |
| Project/Epic    | Prefix       | -              | `bd list \| grep "km-storage"`   |
| Sequence        | Number       | -              | Auto-increment                   |
| Hierarchy       | Dot notation | `dependencies` | `bd list \| grep "km-storage-8"` |
| Type (bug/feat) | **NO**       | `issue_type`   | `bd list --type bug`             |
| Scope detail    | **NO**       | `labels`       | `bd list --label storage,sync`   |
| Priority        | **NO**       | `priority`     | `bd list --priority-max 1`       |
| Phase/Status    | **NO**       | `labels`       | `bd list --label phase:testing`  |
| Owner           | **NO**       | `assignee`     | `bd list --assignee beorn`       |

### Recommended Label Conventions

**Scope labels** (when not in prefix):

```bash
--label storage     # Package scope
--label tui
--label cross-pkg   # Spans packages
```

**Domain labels**:

```bash
--label sync        # Sync system
--label parser      # Parser
--label watcher     # File watcher
--label flexture       # Layout engine
```

**Phase labels** (for epics):

```bash
--label phase:planning
--label phase:infrastructure
--label phase:testing
--label phase:quality
--label phase:components
```

## Auto-Increment Guidance

Before creating a bead, find the next number:

```bash
# Check existing beads for a scope
bd list --all | grep "km-storage"

# Example output:
# km-storage-1  Full event sourcing architecture
# km-storage-2  Remove singletons
# → Next: km-storage-3
```

**Efficient lookup** (direct database query):

```bash
sqlite3 .beads/beads.db "SELECT MAX(CAST(SUBSTR(id, LENGTH('km-storage-')+1) AS INTEGER)) FROM issues WHERE id LIKE 'km-storage-%'"
# Output: 9
# → Next: 10
```

## Complete Examples

### Bug in a Package

```bash
# 1. Find next number
bd list --all | grep "km-storage-"
# km-storage-1, km-storage-2 exist

# 2. Create with full ID
bd create --id km-storage-10 \
  --type bug \
  --title "Race condition in file sync" \
  --description "Files occasionally not written when..." \
  --priority 0 \
  --labels sync
```

### Feature with Subtasks

```bash
# Parent feature
bd create --id km-tui-8 \
  --type feat \
  --title "Add vim keybindings"

# Subtasks (NOTE: --id and --parent CANNOT be combined, use two steps)
bd create --id km-tui-8.1 --type task --title "Normal mode navigation"
bd update km-tui-8.1 --parent km-tui-8

bd create --id km-tui-8.2 --type task --title "Visual selection mode"
bd update km-tui-8.2 --parent km-tui-8
```

### Cross-Cutting Epic

```bash
# Epic (keyword-based, no scope number)
bd create --id km-dark-mode \
  --type epic \
  --title "Dark mode support"

# Related feature in specific package
bd create --id km-tui-9 \
  --type feat \
  --title "Theme toggle component" \
  --deps "blocks:km-dark-mode"
```

### Quick Bug Capture

```bash
# Let bd generate opaque ID
bd create --type bug \
  --title "CLI crashes on --help" \
  --priority 0
# → Creates km-xxxxx

# Or specify a keyword
bd create --id km-help-crash \
  --type bug \
  --title "CLI crashes on --help" \
  --priority 0
```

## Renaming IDs

Use `bd rename <old-id> <new-id>` to rename a bead. This automatically updates all references (deps, descriptions, titles, notes, labels, comments, events).

```bash
bd rename km-w382l km-tui.nav      # Rename opaque ID to descriptive
```

## Migration Strategy

**Active beads** (open + in_progress): All 49 active beads migrated to Pattern 1 (km-<scope>-N) on 2026-01-27.

**Closed beads**: Historical IDs (opaque, keyword, hierarchical) remain unchanged. References in comments/docs preserved for historical context.

**Going forward**: Prefer Pattern 1 (project-scoped) for most work. Use Pattern 2 (hierarchical) for epic decomposition, Pattern 3 (keyword) for memorable cross-cutting initiatives, and Pattern 4 (opaque) for quick capture only.
