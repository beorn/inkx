---
description: Label taxonomy and conventions for bead metadata
---

# Label Conventions

Labels provide rich classification for beads beyond what's encoded in IDs. Use labels to mark scope, domain, phase, and other dimensions.

> **Cutover note (2026-04-29)**: `km bd create --label <name>...` is supported and persists labels to the bead's frontmatter. CLI **filtering** by label is currently weak — `km bd list --label X` doesn't exist, and `km bd query "label=X"` is fragile. Labels also surface as inline title sigils (`#bug`, `#P0`, `+project`, `@assignee`) which `km bd list <query>` can match by text. The Go-bd-era `bd label add/remove/list` and `bd count --by-label` are retired; manage labels via `km bd create --label` or by editing the markdown frontmatter directly. Treat the CLI examples in this doc as conventions for the *names*, not the exact filter flags.

## Philosophy

IDs provide grouping prefixes (km-storage-N), while labels provide multi-dimensional classification. A single bead can have multiple labels.

**Example:**

```bash
km bd create "Race condition in file sync" \
  --type bug \
  --priority P0 \
  --label sync watcher phase:testing \
  --id km-storage-15 --parent km-storage
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
| `flexily`  | vendor/flexily          |
| `test`      | Test infrastructure         |
| `cross-pkg` | Spans multiple packages     |
| `vendor`    | Vendored dependencies       |
| `docs`      | Documentation               |
| `config`    | Configuration/build tooling |

**When to use**: Cross-package work, or to add secondary scope to a bead.

```bash
# Epic spanning storage + tui
km bd create --id km-domain-refactor \
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
| `layout`   | Layout/rendering (Flexily)       |
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
km bd create --id km-storage-16 \
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
km bd create --id km-storage-8 \
  --type epic \
  --title "Supertags: Typed Sigil Links" \
  --labels phase:testing

# Query all testing-phase work
km bd list --label phase:testing
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
km bd create --id km-storage-17 \
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
km bd create --id km-storage-18 \
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

Use existing labels when possible. Check what's already in use:

```bash
km bd list --json | jq -r '.[].labels // [] | .[]' | sort | uniq -c | sort -rn | head -30
```

## Query Examples

Native CLI label filtering is sparse. The pragmatic options:

### Text-search on title (titles include sigils like `#bug #P0 +project`)

```bash
km bd list "sync"                          # FTS match on title/description for "sync"
km bd list "phase:testing"                 # Match the phase sigil
km bd list "sync" --type bug --status open # Combine with first-class filters
```

### JSON + jq (most reliable for label-precise queries)

```bash
# All beads with label "sync"
km bd list --json | jq '.[] | select(.labels // [] | contains(["sync"]))'

# Open bugs with label "sync"
km bd list --status open --type bug --json \
  | jq '.[] | select(.labels // [] | contains(["sync"]))'

# Any-of (OR)
km bd list --json | jq '.[] | select(.labels // [] | any(. as $l | ["sync","watcher","parser"] | index($l)))'

# Pattern (regex)
km bd list --json | jq '.[] | select(.labels // [] | any(test("^phase:")))'
```

### Label statistics

```bash
km bd list --json | jq -r '.[] | .labels // [] | .[]' | sort | uniq -c | sort -rn
```

## Managing labels

`km bd create --label <name>...` is the supported way to attach labels at creation time. To edit an existing bead's labels, edit the markdown frontmatter directly (the `labels:` array) and re-run `km bd doctor` to refresh the index. The Go-bd-era `bd label add/remove/list` commands are retired.

```bash
# Frontmatter form (in @km/<scope>/<slug>.md):
# ---
# id: km-storage-15
# labels: [sync, watcher, phase:testing]
# ---
```

## Label Recommendations by Issue Type

### Bugs

- Domain labels (sync, parser, watcher)
- Urgency labels (blocker, urgent) if needed
- Scope labels if cross-package

```bash
km bd create --id km-storage-19 \
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
km bd create --id km-tui-10 \
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
km bd create --id km-domain \
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
km bd create --id km-storage-20 \
  --type task \
  --title "Split store.ts into modules" \
  --priority 2 \
  --labels refactor,cleanup
```

### Chores

- Scope label for affected area
- Work type (migration, cleanup)

```bash
km bd create --id km-chore-2 \
  --type chore \
  --title "Migrate all tests to new fake-repo API" \
  --priority 3 \
  --labels test,storage,migration
```

## Related

- [beads-ids.md](beads-ids.md) - ID conventions
- [beads.md](beads.md) - Full CLI reference
- [create.md](create.md) - Creating beads with labels
