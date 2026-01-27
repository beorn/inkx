---
description: Label taxonomy and conventions for bead metadata
---

# Label Conventions

Labels provide rich, queryable metadata for beads beyond what's encoded in IDs. Use labels to classify work by scope, domain, phase, and other dimensions.

## Philosophy

IDs provide grouping prefixes (km-storage-N), while labels provide multi-dimensional classification. A single bead can have multiple labels, enabling flexible queries.

**Example:**

```bash
bd create --id km-storage-15 \
  --type bug \
  --title "Race condition in file sync" \
  --priority 0 \
  --labels sync,watcher,phase:testing
```

Query by any dimension:

```bash
bd list --label sync              # All sync-related work
bd list --label phase:testing     # All testing phase work
bd list --label sync --label phase:testing  # Intersection
```

## Label Categories

### Scope Labels

Use when work spans multiple packages or when the ID prefix isn't specific enough.

| Label       | Meaning                     |
| ----------- | --------------------------- |
| `storage`   | @km/storage package         |
| `board`     | @km/board package           |
| `tree`      | @km/tree package            |
| `tui`       | apps/km-tui                 |
| `cli`       | apps/km-cli                 |
| `markdown`  | @km/markdown package        |
| `flexx`     | vendor/beorn-flexx          |
| `test`      | Test infrastructure         |
| `cross-pkg` | Spans multiple packages     |
| `vendor`    | Vendored dependencies       |
| `docs`      | Documentation               |
| `config`    | Configuration/build tooling |

**When to use**: Cross-package work, or to add secondary scope to a bead.

```bash
# Epic spanning storage + tui
bd create --id km-domain-refactor \
  --type epic \
  --labels storage,tui,cross-pkg
```

### Domain Labels

Classify by system or feature area within packages.

| Label      | Meaning                        |
| ---------- | ------------------------------ |
| `sync`     | Sync/reconciliation system     |
| `watcher`  | File watching/change detection |
| `parser`   | Markdown parsing               |
| `query`    | Query system/data access       |
| `commands` | Command/keybinding system      |
| `mouse`    | Mouse interaction              |
| `layout`   | Layout/rendering (Flexx)       |
| `nav`      | Navigation/cursor movement     |
| `undo`     | Undo/redo functionality        |
| `perf`     | Performance/optimization       |
| `security` | Security concerns              |
| `debt`     | Technical debt                 |
| `api`      | Public API surface             |
| `internal` | Internal implementation        |

**When to use**: Add domain context to help others find related work.

```bash
# Sync-related storage bug
bd create --id km-storage-16 \
  --type bug \
  --labels sync,watcher
```

### Phase Labels (For Epics)

Track progress through large initiatives.

| Label                  | Meaning                              |
| ---------------------- | ------------------------------------ |
| `phase:planning`       | Design/planning phase                |
| `phase:infrastructure` | Infrastructure/foundation work       |
| `phase:components`     | Core component implementation        |
| `phase:integration`    | Integration with existing systems    |
| `phase:testing`        | Test writing/coverage                |
| `phase:quality`        | Polish/refinement/bug fixing         |
| `phase:docs`           | Documentation                        |
| `phase:complete`       | Epic complete, monitoring for issues |

**When to use**: Large epics with multiple subtasks.

```bash
# Epic in testing phase
bd create --id km-storage-8 \
  --type epic \
  --title "Supertags: Typed Sigil Links" \
  --labels phase:testing

# Query all testing-phase work
bd list --label phase:testing
```

### Priority Labels (Alternative to Priority Field)

Use when you need more nuance than P0-P4.

| Label          | Meaning                |
| -------------- | ---------------------- |
| `urgent`       | Drop everything        |
| `blocker`      | Blocks other work      |
| `quick-win`    | Easy fix, high value   |
| `long-tail`    | Low priority, eventual |
| `nice-to-have` | Optional enhancement   |

**When to use**: Complement priority field for nuanced prioritization.

```bash
bd create --id km-storage-17 \
  --type bug \
  --priority 0 \
  --labels blocker,sync  # Blocks sync work
```

### Work Type Labels

Classify by nature of work.

| Label              | Meaning                         |
| ------------------ | ------------------------------- |
| `prototype`        | Experimental/proof-of-concept   |
| `spike`            | Investigation/research          |
| `refactor`         | Code refactoring                |
| `cleanup`          | Code cleanup/organization       |
| `migration`        | Data/code migration             |
| `breaking`         | Breaking API change             |
| `backwards-compat` | Backwards compatibility concern |

**When to use**: Signal approach or impact to others.

```bash
bd create --id km-storage-18 \
  --type task \
  --title "Prototype event sourcing for content" \
  --labels prototype,spike
```

## Best Practices

### Use Lowercase Kebab-Case

```bash
# Good
--labels sync,phase:testing,quick-win

# Bad
--labels Sync,Phase_Testing,QuickWin
```

### Namespace with `:` for Categories

Use colons to namespace hierarchical labels:

```bash
phase:planning
phase:testing
bug:sync        # Bug in sync system
feat:mouse      # Mouse feature
```

### Use `/` for Hierarchical Relationships

Use slashes for parent/child relationships:

```bash
sync/watcher    # Watcher within sync
tui/nav         # Navigation within TUI
```

### Don't Over-Label

3-5 labels per bead is usually sufficient. Labels should answer:

- What system/domain does this touch?
- What phase is this in (for epics)?
- What type of work is this?

```bash
# Good - focused
--labels sync,watcher,phase:testing

# Bad - too many
--labels sync,watcher,phase:testing,urgent,blocker,quick-win,bug,perf,api
```

### Keep Labels Consistent

Use existing labels when possible. Check before creating new ones:

```bash
# List all labels in use
sqlite3 .beads/beads.db "SELECT DISTINCT label FROM labels ORDER BY label"

# Count label usage
sqlite3 .beads/beads.db "SELECT label, COUNT(*) as count FROM labels GROUP BY label ORDER BY count DESC"
```

## Query Examples

### Basic Queries

```bash
# All sync work
bd list --label sync

# All testing phase work
bd list --label phase:testing

# Open bugs with sync label
bd list --type bug --status open --label sync
```

### Multiple Labels (AND)

```bash
# Sync work in testing phase
bd list --label sync --label phase:testing

# Storage bugs with high priority
bd list --label storage --type bug --priority-max 1
```

### Complex Queries (Direct SQL)

```bash
# Beads with ANY of these labels (OR)
sqlite3 .beads/beads.db "
  SELECT DISTINCT i.id, i.title
  FROM issues i
  JOIN labels l ON l.issue_id = i.id
  WHERE l.label IN ('sync', 'watcher', 'parser')
  AND i.status = 'open'
"

# Beads with 3+ labels (well-classified)
sqlite3 .beads/beads.db "
  SELECT i.id, i.title, COUNT(l.label) as label_count
  FROM issues i
  JOIN labels l ON l.issue_id = i.id
  WHERE i.status = 'open'
  GROUP BY i.id
  HAVING label_count >= 3
"
```

## Managing Labels

### Add Labels to Existing Bead

```bash
bd label add km-storage-15 sync watcher
```

### Remove Labels

```bash
bd label remove km-storage-15 watcher
```

### List Bead's Labels

```bash
bd label list km-storage-15
```

### Batch Add Labels (Script)

```bash
# Add sync label to all storage beads mentioning "sync" or "watcher"
for id in $(bd list --all --json | jq -r '.[] | select(.id | startswith("km-storage")) | select(.title | test("sync|watcher"; "i")) | .id'); do
  bd label add $id sync
done
```

## Label Recommendations by Issue Type

### Bugs

- Domain labels (sync, parser, watcher)
- Urgency labels (blocker, urgent) if needed
- Scope labels if cross-package

```bash
bd create --id km-storage-19 \
  --type bug \
  --title "Watcher misses rapid file changes" \
  --priority 0 \
  --labels sync,watcher,blocker
```

### Features

- Domain labels for feature area
- Phase labels for tracking progress
- Work type (prototype, breaking) if applicable

```bash
bd create --id km-tui-10 \
  --type feat \
  --title "Mouse click-to-select" \
  --priority 1 \
  --labels mouse,phase:components
```

### Epics

- All relevant scope labels
- Phase label for current stage
- Cross-pkg if spanning multiple packages

```bash
bd create --id km-domain \
  --type epic \
  --title "Domain object refactor" \
  --priority 1 \
  --labels storage,tree,board,cross-pkg,phase:infrastructure
```

### Tasks

- Domain labels for context
- Work type (refactor, cleanup, migration)
- Scope if multi-package

```bash
bd create --id km-storage-20 \
  --type task \
  --title "Split store.ts into modules" \
  --priority 2 \
  --labels refactor,cleanup
```

### Chores

- Scope label for affected area
- Work type (migration, cleanup)

```bash
bd create --id km-chore-2 \
  --type chore \
  --title "Migrate all tests to new fake-repo API" \
  --priority 3 \
  --labels test,storage,migration
```

## Migration Notes

As of 2026-01-27, labels are severely underutilized (1.4% of beads). Gradually add labels to:

1. **New beads**: Add 2-3 relevant labels at creation time
2. **Active work**: Add labels when working on a bead
3. **Batch operations**: Optionally run batch scripts to infer labels from titles/descriptions

**No retroactive mass-labeling required** - labels will accumulate naturally as beads are created and updated.

## Future Enhancements

Potential future label features:

- Label auto-suggestion based on title/description analysis
- Label templates by issue type
- Label usage metrics/dashboard
- Label aliases/synonyms
- Label hierarchies (auto-apply parent labels)

## Related

- [beads-ids.md](beads-ids.md) - ID conventions
- [beads.md](beads.md) - Full CLI reference
- [create.md](create.md) - Creating beads with labels
