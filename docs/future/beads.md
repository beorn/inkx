# Beads Integration

> **Status: Future** — Not yet implemented.

`km bd` reimplements the beads CLI API using km's native storage layer.

---

## Overview

km provides beads-compatible issue tracking by treating issues as **tasks with links**:

1. **Any task can be an issue** — Add `@issue` link to workflow it on `@issues` board
2. **`@issues.md` board** — Shows backlinks (tasks that reference `@issue`)
3. **`km bd`** — CLI with beads-compatible commands, backed by km storage
4. **TUI** — View and manage issues with `km view @issues`

### Why This Approach?

| Benefit | Description |
|---------|-------------|
| **No special storage** | Issues are regular km tasks with `@issue` link |
| **Backlink-based** | Board shows backlinks automatically, no `add=` rules needed |
| **Unified model** | Same fields: `task_status`, `priority`, `assigned_to` |
| **Flexible workflow** | Add `@issue` to any task to track it |
| **Links for deps** | Use existing link system for dependencies |

---

## Data Model

### km Already Supports Everything

| Beads Concept | km Field | Notes |
|---------------|----------|-------|
| status | `task_status` | todo, wip, blocked, done, dropped |
| priority | `#P0`-`#P4` tags | P0=critical, P1=high, P2=medium, P3=low, P4=backlog |
| assignee | `assigned_to` | Already exists |
| labels | `#tag` syntax | Parsed to `data.tags` |
| due date | `due_date` | Parsed from `📅 YYYY-MM-DD` or `due:` |
| issue type | `#bug` `#feature` `#epic` | Type tags |
| description | Task content | Markdown body |

### What Needs Extension

| Beads Concept | Solution | Notes |
|---------------|----------|-------|
| Dependencies | Inline properties | `blocks:: [[km-a1b2]]` (see km-props) |
| `blocked:true` query | Query extension | Check for unresolved blocking links |
| Short IDs | Configurable display | `km-a1b2` from ULID (prefix configurable) |

### Related Issues

- **km-props** (P1): Inline properties system - required for `blocks::` / `blocked-by::` syntax
- **km-supertags** (P4): Optional schema validation for @issue
- **km-beads** (P2): This implementation - the CLI commands
| Close reason | Event + node field | `data.close_reason` for quick access |

---

## How It Works

### Tagging Tasks as Issues

Any task becomes an issue by adding `@issue`:

```markdown
# Project Tasks

- [ ] Fix login bug @issue #bug #P1 @alice
- [ ] Add dark mode @issue #feature
- [ ] Regular task (not an issue)
```

The first two appear on `@issues` board via backlinks. The third doesn't.

### The `@issues` Board

Because tasks link to `@issue`, the board automatically shows them as backlinks:

```markdown
# @issues.md

The issue tracker board.

## Ready `sync=status:todo`
Issues ready to work on.

## In Progress `sync=status:wip` `limit=3`
Currently being worked on.

## Blocked `sync=status:blocked`
Waiting on dependencies.

## Done `sync=status:done` `collapse=true`
Recently completed.
```

**No `add=` rules needed** — backlinks handle aggregation.

### Issue Type Tags

| Tag | Meaning |
|-----|---------|
| `#bug` | Bug report |
| `#feature` | Feature request |
| `#epic` | Epic (parent issue) |
| `#task` | General task (default) |
| `#docs` | Documentation |

### Priority Tags

| Tag | Meaning | Beads equivalent |
|-----|---------|------------------|
| `#P0` | Critical / emergency | priority 0 |
| `#P1` | High priority | priority 1 |
| `#P2` | Medium priority | priority 2 |
| `#P3` | Low priority | priority 3 |
| `#P4` | Backlog / someday | priority 4 |

```markdown
- [ ] Critical bug @issue #bug #P0
- [ ] Important feature @issue #feature #P1
- [ ] Nice to have @issue #P3
```

**Note:** km currently has a `priority` field (1-3 with emoji ⏫🔼🔽), but `#P0`-`#P4` tags are preferred for beads compatibility and visibility.

### Dependencies via Inline Properties

Use Logseq-compatible `property:: value` syntax for dependencies:

```markdown
- [ ] Deploy to prod @issue blocks:: [[km-a1b2]]
- [ ] Fix auth bug @issue blocked-by:: [[km-a1b2]], [[km-c3d4]]
- [ ] Subtask @issue parent:: [[km-auth-epic]]
```

Relation types:
- `blocks::` - this issue blocks the target
- `blocked-by::` - this issue is blocked by target
- `parent::` - this issue is a child of target epic
- `related::` - general relationship
- `waits-for::` - waiting on external dependency

See **km-props** bead for full inline properties specification.

---

## Short IDs

### Default Behavior

By default, short IDs are derived from the ULID:

```
km-a1b2              # Last 4 chars of ULID
```

### Custom Short IDs

You can set a custom short ID when creating an issue:

```bash
km bd create "Auth system overhaul" --id auth-epic #epic
# Creates: km-auth-epic

km bd create "Fix login timeout" --parent km-auth-epic
# Creates: km-auth-epic.1

km bd create "Add OAuth support" --parent km-auth-epic
# Creates: km-auth-epic.2
```

### Epic Sub-IDs

Issues under an epic automatically get sequential sub-IDs:

```
km-auth-epic         # Epic
km-auth-epic.1       # First child issue
km-auth-epic.2       # Second child issue
km-auth-epic.3       # Third child issue
```

### Configuration

```typescript
// In .km/config.json or km.config.ts
{
  shortId: {
    prefix: "km",      // Default prefix
    separator: "-",    // Between prefix and custom part
    autoLength: 4      // Chars from ULID when auto-generating
  }
}
```

### Storage

Short IDs are stored in `data.short_id`:

```typescript
interface NodeData {
  short_id?: string;      // e.g., "auth-epic" or "auth-epic.1"
  // ... other fields
}
```

The full display ID is `{prefix}{separator}{short_id}`, e.g., `km-auth-epic`.

### Implementation

```typescript
function getDisplayId(node: KNode, config = defaultConfig): string {
  const { prefix, separator } = config.shortId;
  const shortId = node.data.short_id ?? node.id.slice(-config.shortId.autoLength).toLowerCase();
  return `${prefix}${separator}${shortId}`;
}

function resolveShortId(displayId: string): string | null {
  // Strip prefix
  const shortId = displayId.replace(/^[a-z]+-/, "");

  // Try exact match on data.short_id
  const exact = db.query(
    `SELECT id FROM nodes WHERE json_extract(data, '$.short_id') = ?`,
    [shortId]
  );
  if (exact) return exact;

  // Fall back to ULID suffix match
  return db.query(`SELECT id FROM nodes WHERE id LIKE ?`, [`%${shortId}`]);
}

function nextSubId(parentShortId: string): string {
  const existing = db.query(
    `SELECT json_extract(data, '$.short_id') as sid FROM nodes
     WHERE json_extract(data, '$.short_id') LIKE ?`,
    [`${parentShortId}.%`]
  );
  const maxN = existing.reduce((max, row) => {
    const n = parseInt(row.sid.split(".").pop(), 10);
    return n > max ? n : max;
  }, 0);
  return `${parentShortId}.${maxN + 1}`;
}
```

---

## Close Reason

When closing an issue, the reason is stored in two places:

1. **Event log** — `node_updated` event with `data.close_reason`
2. **Node field** — `data.close_reason` for quick queries

```typescript
// Closing an issue
emitNodeUpdated(id, {
  task_status: "done",
  data: { close_reason: "Fixed in commit abc123" }
});
```

This enables:
- Quick access: `node.data.close_reason`
- History: Query events for when/why it was closed
- Reopen: Clear `close_reason` when reopening

---

## CLI Commands

### Core Commands

```bash
km bd ready                              # Show ready issues
km bd show <id>                          # Display issue details
km bd list [filters]                     # List issues
km bd create "title" [options]           # Create new issue
km bd update <id> [options]              # Update issue
km bd close <id> [-r reason]             # Close issue
```

### `km bd ready`

Show issues ready to work on (todo, no blockers).

```bash
km bd ready [flags]

Flags:
  -a, --assignee string   Filter by assignee
  -t, --type string       Filter by type tag (#bug, #feature)
  -p, --priority int      Filter by priority (0-4, matches #P0-#P4)
  -n, --limit int         Maximum issues (default 10)
  -l, --label strings     Filter by labels
      --json              Output JSON
```

**Implementation**: Query `@issue status:todo -blocked:true` sorted by priority tag (#P0 first).

### `km bd create`

Create a new issue (task with `@issue` link).

```bash
km bd create "title" [flags]

Flags:
  -t, --type string         Type tag: bug|feature|epic|task (default "task")
  -p, --priority int        Priority: 0-4 (default 2, adds #P0-#P4 tag)
  -a, --assignee string     Assignee (@name)
  -l, --labels strings      Additional labels
  -d, --description string  Description body
      --id string           Custom short ID (e.g., "auth-epic")
      --parent string       Parent epic ID (auto-generates sub-ID like parent.1)
      --path string         Where to create (default: issues/ or current file)
      --json                Output JSON
```

**Implementation**:
1. Create task: `- [ ] title @issue #type #P2 @assignee`
2. Add priority tag based on `-p` flag
3. Set `data.short_id`:
   - If `--id`, use that value
   - If `--parent`, generate next sub-ID (e.g., `parent.3`)
   - Otherwise, derive from ULID
4. If `--parent`, add `[[parent-id|parent]]` link
5. Return display ID (e.g., `km-auth-epic` or `km-auth-epic.1`)

### `km bd update <id>`

Update issue properties.

```bash
km bd update <id> [flags]

Flags:
  -s, --status string       Status: todo|wip|blocked|done|dropped
  -p, --priority int        Priority: 0-4 (changes #P0-#P4 tag)
  -t, --type string         Type tag
  -a, --assignee string     Assignee
      --title string        New title
      --claim               Set assignee to self + status to wip
      --add-label strings   Add labels
      --remove-label strings Remove labels
      --json                Output JSON
```

### `km bd close <id>`

Close an issue.

```bash
km bd close <id> [flags]

Flags:
  -r, --reason string   Reason for closing
      --json            Output JSON
```

**Implementation**: Set `status:done` + store `data.close_reason`.

### `km bd list`

List issues with filters.

```bash
km bd list [flags]

Flags:
  -s, --status string       Filter: todo|wip|blocked|done
  -t, --type string         Filter by type tag
  -p, --priority int        Filter by priority
  -a, --assignee string     Filter by assignee
  -l, --label strings       Filter by labels
  -n, --limit int           Limit results (default 50)
      --all                 Include closed issues
      --stale int           Show issues not updated in N days
      --sort string         Sort: priority|created|updated
      --json                Output JSON
```

### Dependency Commands

```bash
km bd dep add <id> <depends-on>      # Add dependency link
km bd dep remove <id> <depends-on>   # Remove dependency
km bd dep list <id>                  # Show dependencies
km bd blocked                        # Show all blocked issues
```

### Utility Commands

```bash
km bd stale [--days N]               # Issues not updated in N days
km bd count [filters]                # Count matching issues
km bd sync                           # Commit and push changes
km bd migrate                        # Import from .beads/
```

---

## Query Extensions

| Query | Meaning |
|-------|---------|
| `@issue` | Has `@issue` link (is an issue) |
| `blocked:true` | Has unresolved `blocked-by` links |
| `blocked:false` | No blockers (ready) |
| `stale:14` | Not updated in 14 days |

---

## TUI Integration

### Viewing Issues

```bash
km view @issues              # Open issues board
```

### Keyboard Shortcuts

Standard km shortcuts work:

| Key | Action |
|-----|--------|
| `x` | Cycle status |
| `Enter` | Open detail |
| `e` | Edit in $EDITOR |
| `t` | Add/edit tags |

---

## Claude Code Integration

### `/pm` Skill Updates

The `/pm` skill changes from `bd` to `km bd`:

```diff
- bd list --status open
+ km bd list --status open

- bd ready --limit 15
+ km bd ready --limit 15

- bd close <id> --reason "..."
+ km bd close <id> -r "..."
```

---

## Migration from .beads/

```bash
km bd migrate [--dry-run]
```

**Process:**
1. Read `.beads/issues.jsonl`
2. For each issue:
   - Find or create task with matching content
   - Add `@issue` link + type tags
   - Set `priority`, `assigned_to`, `task_status`
   - Store beads ID in `data.beads_id` for reference
3. Convert dependencies to link syntax
4. Create `@issues.md` board if not exists
5. Archive `.beads/` to `.beads.bak/`

---

## Implementation Phases

### Phase 1: Core Commands

- `km bd create`, `show`, `list`, `update`, `close`
- `@issue` link convention
- `@issues.md` board (backlink-based)
- Configurable short ID display

### Phase 2: Dependencies

- Dependency link syntax (`[[id|blocks]]`)
- `blocked:true` query filter
- `km bd ready` excludes blocked
- `km bd dep` commands

### Phase 3: Migration

- `km bd migrate` from `.beads/`
- ID mapping preservation
- `km bd sync` wrapper

---

## See Also

- [../07-tasks.md](../07-tasks.md) — Task management
- [../08-cli.md](../08-cli.md) — CLI reference
- [../01-concepts.md](../01-concepts.md) — Links and references
