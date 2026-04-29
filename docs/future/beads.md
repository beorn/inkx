# Beads Integration

> Status: Implemented — Available in @km/beads package and km bd CLI.

`km bd` reimplements the beads CLI API using km's native storage layer.

---

## Quick Start

```bash
# List ready issues
km bd ready

# Create an issue
km bd create "Fix login bug" -t bug -p 1

# Claim and start work
km bd update km-a1b2 --claim

# Close with reason
km bd close km-a1b2 -r "Fixed in commit abc123"

# View in TUI
km view @issues
```

See `km bd --help` for full command reference.

---

## Overview

km provides beads-compatible issue tracking by treating issues as **tasks with links**:

1. **Any task can be an issue** — Add `@issue` link to workflow it on `@issues` board
2. **`@issues.md` board** — Shows backlinks (tasks that reference `@issue`)
3. **`km bd`** — CLI with beads-compatible commands, backed by km storage
4. **TUI** — View and manage issues with `km view @issues`

### Why This Approach?

| Benefit            | Description                                                   |
| ------------------ | ------------------------------------------------------------- |
| No special storage | Issues are regular km tasks with @issue link                  |
| Backlink-based     | Board shows backlinks automatically, no km.add:: rules needed |
| Unified model      | Same fields: task_status, priority, assigned_to               |
| Flexible workflow  | Add @issue to any task to track it                            |
| Links for deps     | Use existing link system for dependencies                     |

---

## Data Model

### km Already Supports Everything

| Beads Concept | km Field            | Notes                                               |
| ------------- | ------------------- | --------------------------------------------------- |
| status        | task_status         | todo, wip, blocked, done, dropped                   |
| priority      | #P0-#P4 tags        | P0=critical, P1=high, P2=medium, P3=low, P4=backlog |
| assignee      | assigned_to         | Already exists                                      |
| labels        | #tag syntax         | Parsed to data.tags                                 |
| due date      | due_date            | Parsed from 📅 YYYY-MM-DD or due:                   |
| issue type    | #bug #feature #epic | Type tags                                           |
| description   | Task content        | Markdown body                                       |

### What Needs Extension

| Beads Concept      | Solution             | Notes                                   |
| ------------------ | -------------------- | --------------------------------------- |
| Dependencies       | Inline properties    | blocks:: [[km-a1b2]] (see km-props)     |
| blocked:true query | Query extension      | Check for unresolved blocking links     |
| Short IDs          | Configurable display | km-a1b2 from ULID (prefix configurable) |

### Related Issues

- km-props (P1): Inline properties system - required for blocks:: / blocked-by:: syntax
- **km-storage-8** (P4): Optional schema validation for @issue
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

## Ready `km.sync:: status:todo`

Issues ready to work on.

## In Progress `km.sync:: status:wip` `km.limit:: 3`

Currently being worked on.

## Blocked `km.sync:: status:blocked`

Waiting on dependencies.

## Done `km.sync:: status:done` `km.collapse:: true`

Recently completed.
```

**No `km.add::` rules needed** — backlinks handle aggregation.

### Issue Type Tags

| Tag      | Meaning                |
| -------- | ---------------------- |
| #bug     | Bug report             |
| #feature | Feature request        |
| #epic    | Epic (parent issue)    |
| #task    | General task (default) |
| #docs    | Documentation          |

### Priority Tags

| Tag | Meaning              | Beads equivalent |
| --- | -------------------- | ---------------- |
| #P0 | Critical / emergency | priority 0       |
| #P1 | High priority        | priority 1       |
| #P2 | Medium priority      | priority 2       |
| #P3 | Low priority         | priority 3       |
| #P4 | Backlog / someday    | priority 4       |

```markdown
- [ ] Critical bug @issue #bug #P0
- [ ] Important feature @issue #feature #P1
- [ ] Nice to have @issue #P3
```

**Note:** km uses `priority:: VALUE` format (e.g., `priority:: P1`). The `#P0`-`#P4` tags are also used for beads compatibility and visibility.

### Dependencies via Inline Properties

Use Logseq-compatible `property:: value` syntax for dependencies:

```markdown
- [ ] Deploy to prod @issue blocks:: [[km-a1b2]]
- [ ] Fix auth bug @issue blocked-by:: [[km-a1b2]], [[km-c3d4]]
- [ ] Subtask @issue parent:: [[km-auth-epic]]
```

Relation types:

- blocks:: - this issue blocks the target
- blocked-by:: - this issue is blocked by target
- parent:: - this issue is a child of target epic
- related:: - general relationship
- waits-for:: - waiting on external dependency

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
# Creates: @km/auth-epic/1

km bd create "Add OAuth support" --parent km-auth-epic
# Creates: @km/auth-epic/2
```

### Epic Sub-IDs

Issues under an epic automatically get sequential sub-IDs:

```
km-auth-epic         # Epic
@km/auth-epic/1       # First child issue
@km/auth-epic/2       # Second child issue
@km/auth-epic/3       # Third child issue
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
  short_id?: string // e.g., "auth-epic" or "auth-epic.1"
  // ... other fields
}
```

The full display ID is `{prefix}{separator}{short_id}`, e.g., `km-auth-epic`.

### Implementation

```typescript
function getDisplayId(node: KNode, config = defaultConfig): string {
  const { prefix, separator } = config.shortId
  const shortId =
    node.data.short_id ??
    node.id.slice(-config.shortId.autoLength).toLowerCase()
  return `${prefix}${separator}${shortId}`
}

function resolveShortId(displayId: string): string | null {
  // Strip prefix
  const shortId = displayId.replace(/^[a-z]+-/, "")

  // Try exact match on data.short_id
  const exact = db.query(
    `SELECT id FROM nodes WHERE json_extract(data, '$.short_id') = ?`,
    [shortId],
  )
  if (exact) return exact

  // Fall back to ULID suffix match
  return db.query(`SELECT id FROM nodes WHERE id LIKE ?`, [`%${shortId}`])
}

function nextSubId(parentShortId: string): string {
  const existing = db.query(
    `SELECT json_extract(data, '$.short_id') as sid FROM nodes
     WHERE json_extract(data, '$.short_id') LIKE ?`,
    [`${parentShortId}.%`],
  )
  const maxN = existing.reduce((max, row) => {
    const n = parseInt(row.sid.split(".").pop(), 10)
    return n > max ? n : max
  }, 0)
  return `${parentShortId}.${maxN + 1}`
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
  data: { close_reason: "Fixed in commit abc123" },
})
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
5. Return display ID (e.g., `km-auth-epic` or `@km/auth-epic/1`)

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

| Query         | Meaning                         |
| ------------- | ------------------------------- |
| @issue        | Has @issue link (is an issue)   |
| blocked:true  | Has unresolved blocked-by links |
| blocked:false | No blockers (ready)             |
| stale:14      | Not updated in 14 days          |

---

## TUI Integration

### Viewing Issues

```bash
km view @issues              # Open issues board
```

### Keyboard Shortcuts

Standard km shortcuts work:

| Key   | Action          |
| ----- | --------------- |
| x     | Cycle status    |
| Enter | Open detail     |
| e     | Edit in $EDITOR |
| t     | Add/edit tags   |

---

## Claude Code Integration

### `/pm` Skill Updates

The `/pm` skill changes from `bd` to `km bd`:

```diff
- km bd list --status open
+ km bd list --status open

- km bd ready --limit 15
+ km bd ready --limit 15

- km bd close <id> --reason "..."
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

- [../guides/tasks.md](../guides/tasks.md) — Task management
- [../guides/cli.md](../guides/cli.md) — CLI reference
- [../concepts.md](../concepts.md) — Links and references

---

---

---

---

---

---

---

---

---

---

---

---

---

> Status: cutover in progress. Tracking bead @km/beads/cutover. Today: parser fixed (commit f7f3a9fcd), migration produces 479 valid markdown files. Remaining work tracked under @km/beads/*.

km replaces `bd` (the Go CLI) with `km bd`, a beads-compatible CLI built on km's own storage. The shape is "issues are markdown nodes" — same primitive as everything else km manages. This doc captures the target design; the shipped subset is noted inline.

---

## Identity

Issues are addressed by **`@<prefix>/<scope>/<slug>`**, where `<prefix>` is the bd issue prefix from `.km/config.yaml` (per-repo, never hardcoded).

- This repo: prefix = `km` → `@km/storage/lazy-hydration`
- Sister repo `~/Code/pim/cloudi/`: prefix = `cloudi` → `@cloudi/...`
- `~/Code/pim/pam/`: would be `@pam/...`
- Multi-repo aggregation distinguishes natively (`@km/...` alongside `@cloudi/...`)

**Inline wikilinks within content drop the `@`**: `[[@km/storage/lazy-hydration]]`. The `@` is a render-mode hint ("show this node as a board card / kanban view"), the path is the canonical name.

**Legacy bd-form ids** (`km-storage.lazy-hydration`, `km-storage-lazy-hydration`, `km-flexx-diag-passes`) keep working via two mechanisms:

1. **Per-issue `aliases:` frontmatter** (Obsidian-standard) — authoritative exact-match resolution for irregular cases. Generated automatically by `km bd migrate` for every imported issue.
2. **Import-time rewrite** — prose mentions of `<prefix>-<scope>.<slug>` become `@<prefix>/<scope>/<slug>` once at migration time (`rewriteLegacyIdMentions` in `migrate.ts`). No runtime regex scanning needed; aliases catch what slips through.

---

## Hierarchy

The filesystem path **is** the parent edge. There is no separate `parent_id` field; parent is derived from path.

```
issue/
└── silvercode/
    ├── acp.md                                ← the epic itself
    └── acp/                                  ← children live in the folder
        ├── rename.md                         ← @km/silvercode/acp/rename
        ├── session-prompt.md
        ├── session-update-list.md
        ├── tool-call.md
        └── usage-and-permission.md
```

Empirically (4642 live issues): 903 have a parent-child link, **0 have multiple parents**. The parent relation is already a strict tree, so path-as-parent is lossless.

**Why this works**:

- Tree-parent = path-parent = filesystem-parent. One source of truth.
- Moving an issue under a new parent is `git mv`. Rename re-resolution (already in klink) handles links.
- Scope queries become tree traversal: `@km/silvercode/...` = descendants of `silvercode/`.
- Scope epics like `silvercode` are folders that happen to have a sibling `.md` describing the initiative.

---

## Cross-graph relations

What can't fit in the name (because it's a graph, not a tree) lives as **multi-value inline-property wikilinks** on the source side:

```markdown
# silvercode component renames @issue #feature #P1

blocks:: [[../session-prompt]], [[../session-update-list]], [[../tool-call]], [[../usage-and-permission]]
```

Empirical fan-out (live data): 160 issues have any blocker, 26 have multiple, max is 10. Single-line wikilink syntax handles 1 to a dozen without ceremony.

Relation taxonomy (from the existing klink design):

- blocks:: / blocked-by:: — gating; one is auto-derived from the other via the links table reverse-lookup
- related:: — soft connection
- supersedes:: / superseded-by:: — replacement (3 issues use this in current data)
- parent:: — kept as escape hatch for the rare case where an issue legitimately wants a parent it doesn't live under (none in current data — most likely unused after migration)

---

## Frontmatter

```yaml
---
id: silvercode/acp/rename
aliases:
  - km-silvercode.acp-rename       # bd-flavor dotted
  - km-silvercode-acp-rename       # bd-flavor multi-dash (rare)
created_at: 2026-04-16T08:30:00Z
closed_at: 2026-04-22T14:12:00Z
---
```

- **`id:`** — Dendron-style stable identity. Path-shaped; survives content edits.
- **`aliases:`** — Obsidian-style list of alternate names. Resolver indexes alongside `id`. Catches: legacy bd-form ids during cutover, future renames.
- Together they cover everything bd's flat-string ids did, with no third standard field needed.

---

## Sigils

Per `klink.md`, sigils (`@`, `+`, `#`) are name-prefixes. The same primitive carries multiple "domains" of nodes, distinguished by sigil:

- **`@<prefix>/...`** — issues (`@km/storage/lazy-hydration`, `@cloudi/...`)
- **`@mem/<slug>`** — memories (replaces `km bd remember`); content is the insight, sectioned for paragraph-sized entries
- **`@<Person>`** — people (existing convention)
- **`#<tag>`** — tags (existing convention)
- **`+<project>`** — projects (existing convention)

The `@` sigil is a render-mode hint. When a wikilink resolves to a sigil-prefixed name, the renderer shows it as a card (board view) rather than as inline prose.

---

## Memories

Replace `km bd remember` with `@mem`-tagged sections in `mem/` (or `memory/`).

```markdown
## Dolt sync fix @memory
id:: @km/mem/dolt-sync-fix

After "cannot merge with uncommitted changes" errors:

  bd dolt stop && bd dolt start

If a conflict is detected, resolve via SQL: …

## Upstream workaround tracking @memory
id:: @km/mem/upstream-tracking

When our code gets a workaround for an upstream bug, file a bead under
`@km/all/upstream-waiting` …
```

`km bd prime` becomes "concatenate descendants of `mem/` matching `@memory`, format as sections, prepend to context" — same query primitive used everywhere.

Memories sit under their own root, *not* under `@<prefix>/`. They're not project-scoped issues — they're cross-cutting context.

---

## Status mapping

| bd status   | km task status  | marker |
| ----------- | --------------- | ------ |
| open        | todo            | [ ]    |
| in_progress | wip             | [/]    |
| closed      | done            | [x]    |
| blocked     | blocked         | [!]    |
| dropped     | dropped         | [-]    |
| deferred    | (no equivalent) | —      |

The `deferred` gap is small (18 issues in current data) and resolvable later — either add `deferred` as a km status or fold into `todo` with an inline `defer-until::` property.

---

## CLI

```bash
km bd ready                     # ready issues (todo, no unresolved blocked-by)
km bd list [filters]            # list with filters
km bd show <id>                 # detail view
km bd create "title" [opts]     # new issue
km bd update <id> [opts]        # update fields
km bd close <id> [-r reason]    # close
km bd drop <id> [-r reason]     # won't do
km bd dep add|remove|list       # dependency management
km bd blocked                   # all blocked issues
km bd stale [--days N]          # not-recently-updated
km bd remember "x" --key foo    # store memory at @mem/foo
km bd memories [search]         # list/search memories
km bd prime                     # emit memories + ready snapshot for hook injection
km bd migrate                   # one-shot import from .beads/issues.jsonl
```

Ids accept both canonical and legacy forms: `km bd show @km/storage/lazy-hydration` and `km bd show @km/storage/lazy-hydration` both resolve.

---

## Migration

`km bd migrate` reads `.beads/issues.jsonl` (refreshed via `km bd export`) and emits one .md file per issue under the configured `Parent:` directory.

Current state — structural cutover infrastructure shipped:

- **Parser** (`packages/km-beads/src/schema.ts`) handles bd v1.0 export shape: numeric priority, `dependencies` array, `_type: "memory"` records parsed into a typed stream. 4666/4666 issues + 3/3 memories parse, 0 errors.
- **Path-form filenames + aliases** (`bdIdToPathForm` / `bdIdToAliases`): `km-silvercode.acp-rename` → `silvercode/acp-rename.md` with frontmatter `id: silvercode/acp-rename` + `aliases: [km-silvercode.acp-rename, km-silvercode-acp-rename]`. Sub-issues with deeper dot-form (`km-silvery.backdrop-hardening.slim-barrel`) nest correctly. Auto-id beads (`km-q5hji`) park under `inbox/`.
- Cross-graph relations — bd v1.0 dependencies[] translates to blocks:: / blocked-by:: / related:: Logseq-style multi-value wikilink lines emitted at the top of the body. Targets are absolute path-form ([[silvery/backdrop-hardening]]) so they resolve regardless of host file location.
- **Memories** (`km bd remember`, `km bd memories`, `km bd prime`) write to `mem/<key>.md` with a single `## <Title> @memory` section. Migration writes the same shape, so memories survive the bd→km bd cutover round-trip.
- **Legacy autolinks** rewritten *at import* (`rewriteLegacyIdMentions`) — bd-form ids in prose become `@<prefix>/<path-form>` once at migration time, not at every render. Skips matches inside existing wikilinks or inline code.
- **Resolver** (`resolveShortId` in `short-ids.ts`) tries three forms in order: canonical path-form `data.id` → legacy `data.short_id` → frontmatter `aliases[]`. Sigil-prefixed input (`@km/silvercode/acp/rename`) is normalized to canonical path-form before lookup.
- **Configurable prefix** — runtime new beads pull `beads.prefix` from `.km/config.yaml`; migration pulls `issue-prefix` from the source vault's `.beads/config.yaml` (or `--source <dir>` override). No hardcoded `"km"` in source.

Remaining cutover work (last mile):

- **`@km/beads/pm-skill-rewrite`** — `.claude/skills/pm/` and CLAUDE.md examples switch from `bd` to `km bd`.
- **`@km/beads/hooks-rewrite`** — SessionStart hooks call `km bd prime` instead of `km bd prime`; `bd dolt pull` becomes `git pull` (markdown is the source of truth).
- **`@km/beads/dolt-archive`** — once both forms agree, archive `.beads/` to `.beads.bak/` and remove the brew dep.

Resolution priority (canonical, served by `resolveShortId`):

1. `data.id` — frontmatter canonical path-form (`silvercode/acp/rename`)
2. `data.short_id` — legacy bd-form set on nodes that ship neither frontmatter `id` nor `aliases`
3. `data.aliases[]` — explicit alternate names (`@km/silvercode/acp-rename`, `km-silvercode-acp-rename`)
4. Fallback: ULID-suffix match on the raw node id (`km-a1b2` → trailing 4 chars match)

Sigil-prefixed input (`@<prefix>/<path>`) is stripped to bare canonical path-form before lookup so `@km/silvercode/acp/rename` and `silvercode/acp/rename` both resolve to the same node.

---

## Discoverability — help docs are part of every change

Every `km bd` cutover bead includes a help-doc update. The mapping must be visible at the user's fingertips:

- `km bd --help` and every subcommand's `--help` text reflects the canonical id form (`@<prefix>/<scope>/<slug>`) in usage examples, with a one-line note that legacy `<prefix>-<scope>.<slug>` is accepted.
- `km bd info` calls out the active prefix (already does), the canonical and legacy id forms, and any auto-detected aliases.
- `km bd doctor` reports drift between filename, `id:` frontmatter, and `aliases:` entries.
- The CLI usage notes (currently emitted as the trailing "Note:" block by `km bd --help`) explicitly link to this design doc and the `aliases:` frontmatter convention.

A bead is not "done" until: code change ✓, test ✓, **AND** help text + relevant doc page reflect the new behavior. Aim is "user runs `km bd --help` once and sees the new mapping" — no oral-tradition knowledge.

Same applies to skill files (`.claude/skills/pm/SKILL.md`) and CLAUDE.md examples — they are docs the agent reads, so they're help docs by another name.

---

## Obsidian/Dendron compatibility

km is a strict superset of standard PKM-flavor markdown. An Obsidian or Dendron user opening the vault sees regular markdown with extra frontmatter; nothing is broken syntax to them.

Same:

- `/` path separator (Obsidian convention; Dendron's `.` is the outlier)
- `[[Note]]`, `[[Note|alias]]`, `![[Note]]`, `[[Note#Section]]`
- `aliases:` frontmatter (Obsidian)
- `id:` frontmatter (Dendron)

km-specific (additive, non-conflicting):

- `@<prefix>/...` sigil-board addressing (no conflict; Obsidian ignores unknown sigil patterns)
- Bidirectional blocked-by:: derived from blocks:: (Logseq-style inline-property semantics)
- Auto-derived board view of `@<prefix>/...` subtree

The bar: a vault written by km should open cleanly in Obsidian. If it doesn't, that's a bug in km, not a feature.

---

## See also

- `docs/design/model/klink.md` — link/sigil/anchor model (the substrate this builds on)
- `docs/design/model/kast.md` — markdown ↔ km-ast transforms
- `packages/km-beads/` — current implementation
- `.km/config.yaml` — per-repo prefix and board configuration

