---
mentions:
  - km
id: "@km/beads"
aliases:
  - km-beads
  - "@km/_orphan/beads"
created_at: 2026-01-21T12:00:00Z
closed_at: 2026-01-21T12:39:47Z
---

# [x] Beads Integration: km bd CLI for Issue Tracking @km/beads #epic #P2

## Overview

Implement `km bd` CLI that reimplements the beads CLI API using km's native storage. Issues are regular tasks with `@issue` tag, tracked on `@issues` board via backlinks.

See: [docs/future/beads.md](docs/future/beads.md)

- [x] Bead display name = sigil-rooted path; internal ULID never user-facing #feature #P1 @issue priority:: P1
  - Framing

  Beads have ONE user-facing identifier: the sigil-rooted path, e.g. @km/silvery/kitty-pixel-alignment. The internal storage primary key (currently a ULID) is not a bead id — it's a KNode pkey. Never shown.
  | Layer                 | What                              | Where it appears                                                              |
  | --------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
  | Storage pkey          | 01KQDF11D6AJVMZAVJXDZQYVJ7        | nodes.id only. Never CLI/UI output.                                           |
  | Bead name (canonical) | @km/silvery/kitty-pixel-alignment | Frontmatter id: (or matched by file path). Every CLI surface, every wikilink. |
  | Legacy bd-form        | km-silvery.kitty-pixel-alignment  | aliases: only. Resolves on input, never displayed.                            |
  - Current bug

  packages/km-beads/src/queries.ts displayId() falls through path → short_id → ULID. The ULID fallback is the source of every weird 01KQ... row in bd list. There are 2582 of them today (test fixtures + orphan beads).
  - Invariant

  A node WITHOUT a sigil-rooted path is NOT a bead. bd list / queryReady / bd show must never label a row by ULID. Two enforcements:
  1. **Read side** — `displayId()` returns the path *or fails* (the row shouldn't have been included).
  1. **Write side** — `bd create` always materializes to a path (auto-slug from title under `@km/inbox/<slug>` if no `--id`). No more index-only ghosts.
  - Supersedes / merges
  - `@km/beads/create-orphan-must-materialize` — same root cause (write side).
  - `km-beads.identity-by-structure` (P0) — same root cause (read side: `beads:[]` root scoping prevents test-fixture nodes from being returned at all).

  Both reframed as parts of a single change: bead identity = sigil-rooted path.
  - Acceptance
  - `displayId(issue)` is `(issue) => issue.path` — no fallback chain.
  - `bd list` never returns a row whose label is a 26-char ULID.
  - `bd create "title"` (no `--id`) writes a markdown file at `@km/inbox/<auto-slug>.md`.
  - `queryReady` / `bd list` walks only configured `beads:[]` roots.
  - 2582 ULID-only rows from test fixtures gone.
- [x] Bead domain interface — collapse Issue type + scattered functions into the @km/<scope>/<slug> Bead.* namespace #feature #P1 @issue priority:: P1
  - Goal

  Collapse the bead concern into a single domain interface following the km
  three-building-blocks pattern from CLAUDE.md ("domain types,
  domain interfaces, domain objects").
  - Today's surface (scattered)
  - type: \`Issue\` (types.ts)
  - functions: \`displayId\`, \`nodeToIssue\`, \`isBlocked\`, \`queryReady\`,
    \`queryIssues\`, \`getIssue\` (queries.ts)
  - mutations: \`createIssueNode\`, \`updateIssueFields\`, \`closeIssueFields\`,
    \`dropIssueFields\` (mutations.ts)
  - deps: \`addDependency\`, \`removeDependency\`, \`getDependencies\`,
    \`mergeDepProps\` (deps.ts)
  - structural: \`isBead\`, \`resolveBeadsRoots\` (queries.ts/paths.ts)
  - Target surface

  ```ts
  // type
  export type Bead = { id, title, status, priority, type?, ... }

  // interface (declaration-merged on the type name)
  export const Bead = {
  isBead: (node, roots, repo) => boolean,
  fromNode: (node, opts?) => Bead,                  // was nodeToIssue
  displayName: (bead) => string,                    // was displayId — returns sigil-rooted path
  isBlocked: (bead, opts?) => boolean,
  queryReady: (filter?, scope?, board?, opts?) => Bead[],
  query: (filter?, scope?, board?, opts?) => Bead[], // was queryIssues
  get: (idRef, opts?) => Bead | null,                // was getIssue
  create: (title, opts) => CreateResult,             // was createIssueNode
  update: (id, fields) => UpdateFields,              // was updateIssueFields
  close: (id, fields) => UpdateFields,
  drop: (id, fields) => UpdateFields,
  addDependency, removeDependency, getDependencies, mergeDepProps,
  }
  ```

  `Issue` is the legacy alias for the type (one-line re-export) for the
  duration of consumer migration; `displayId` likewise. Both removed once
  all callers move to `Bead.*`.
  - Approach

  Run as `/refactor migrate` in its own session — touches ~40-50 files
  across packages/km-beads, apps/km-cli, apps/km-tui, hub/, tests. Use
  `bun vendor/bearly/tools/refactor.ts` for mechanical renames; reserve
  agent judgment for the namespace authoring + edge cases.
  - Acceptance
  - packages/km-beads exports \`Bead\` (type + namespace) as canonical surface.
  - All in-tree consumers use \`Bead.fromNode\`, \`Bead.displayName\`, \`Bead.create\`, etc.
  - Old surface (\`Issue\`, \`displayId\`, \`nodeToIssue\`, ...) removed or one-line legacy re-exports only.
  - Tests reflect the new surface; behavior unchanged.
  - 0 net TS errors after the refactor.
  - Relates
  - Supersedes / unifies: km-path-is-the-name (P1), km-parent-id-leaf-materializes-inline (P2)
  - Both fixes ship in the CURRENT surface today; the refactor absorbs them cleanly.
  - A future \`createBead(repo, id) → BeadObject\` (domain object) is deferred
    until a reactive consumer asks for it (km-tui bead-board observation, etc).

## Core Concept

Any task becomes an issue by adding `@issue`:

```markdown
- [ ] Fix login bug @issue #bug #P1 @alice blocks:: [[km-auth]]
```

The `@issues` board shows all backlinks to `@issue` - no `add=` rules needed.

## CLI Commands

### km bd ready

Show issues ready to work on (todo, no blockers).

```bash
km bd ready [flags]
  -a, --assignee string   Filter by assignee
  -t, --type string       Filter by type tag
  -p, --priority int      Filter by priority (0-4)
  -n, --limit int         Max issues (default 10)
      --json              Output JSON
```

Implementation: Query `@issue status:todo blocked:false` sorted by #P0 first.

### km bd create

Create a new issue.

```bash
km bd create "title" [flags]
  -t, --type string       Type: bug|feature|epic|task
  -p, --priority int      Priority: 0-4 (default 2)
  -a, --assignee string   Assignee
  -l, --labels strings    Additional labels
      --id string         Custom short ID (e.g., "auth-epic")
      --parent string     Parent epic (auto-generates sub-ID)
      --path string       Where to create
      --json              Output JSON
```

Creates: `- [ ] title @issue #type #P2 @assignee`

### km bd show

Display issue details.

```bash
km bd show <id> [flags]
      --deps     Show dependency tree
      --json     Output JSON
```

### km bd update

Update issue properties.

```bash
km bd update <id> [flags]
  -s, --status string     Status: todo|wip|blocked|done|dropped
  -p, --priority int      Priority (changes #P tag)
  -a, --assignee string   Assignee
      --claim             Set assignee to self + wip
      --add-label         Add labels
      --remove-label      Remove labels
```

### km bd close

Close an issue.

```bash
km bd close <id> [flags]
  -r, --reason string   Reason for closing
```

Sets status:done + stores reason in data.close_reason.

### km bd list

List issues with filters.

```bash
km bd list [flags]
  -s, --status string     Filter status
  -t, --type string       Filter type
  -p, --priority int      Filter priority
  -a, --assignee string   Filter assignee
  -n, --limit int         Limit (default 50)
      --stale int         Not updated in N days
      --sort string       Sort: priority|created|updated
```

### km bd dep

Manage dependencies (requires @km/props).

```bash
km bd dep add <id> <depends-on>    # Add blocks:: property
km bd dep remove <id> <depends-on> # Remove from blocks::
km bd dep list <id>                # Show dependencies
km bd blocked                      # Show all blocked issues
```

### km bd sync

Commit and push changes.

```bash
km bd sync [-m message]
```

### km import bd

Migrate from .beads/ to km format. Use `--export` for the reverse direction.

```bash
km import bd [vault] [--dry-run]              # .beads/issues.jsonl → km vault
km import bd [vault] --export [--mode replace] # km vault → .beads/issues.jsonl
```

## Short IDs

### Default: ULID suffix

```
km-a1b2   # Last 4 chars of ULID
```

### Custom IDs

```bash
km bd create "Auth epic" --id auth-epic
# Creates: km-auth-epic

km bd create "Fix timeout" --parent km-auth-epic  
# Creates: km-auth-epic.1
```

### Configuration

```typescript
// .km/config.json
{
  shortId: {
    prefix: "km",
    separator: "-",
    autoLength: 4
  }
}
```

### Storage

Stored in `data.short_id`. Full display: `{prefix}{sep}{short_id}`.

## File Structure

```
apps/km-cli/src/commands/
├── bd/
│   ├── index.ts      # Command group setup
│   ├── ready.ts      # bd ready
│   ├── create.ts     # bd create
│   ├── show.ts       # bd show  
│   ├── update.ts     # bd update
│   ├── close.ts      # bd close
│   ├── list.ts       # bd list
│   ├── dep.ts        # bd dep add/remove/list
│   ├── sync.ts       # bd sync
│   ├── migrate.ts    # bd migrate
│   └── utils/
│       ├── short-id.ts    # ID generation/resolution
│       ├── formatter.ts   # Output formatting
│       └── queries.ts     # Common query builders
```

## Board Template

### @issues.md

```markdown
# Issues

The issue tracker board. Tasks with @issue appear here via backlinks.

## Ready `sync=status:todo`
Issues ready to work on.

## In Progress `sync=status:wip` `limit=3`
Currently being worked on.

## Blocked `sync=status:blocked`
Waiting on dependencies.

## Done `sync=status:done` `collapse=true`
Recently completed.
```

## Documentation

### docs/future/beads.md

Already exists - verify accuracy after implementation.

### docs/08-cli.md

Add `km bd` command reference.

### CLAUDE.md

Update beads section to reference `km bd` instead of standalone `bd`.

### .claude/commands/pm.md

Update from `bd` to `km bd` commands.

## Tests

### apps/@km/_orphan/cli/tests/bd/ready.test.ts

```typescript
describe('km bd ready', () => {
  test('shows unblocked todo issues sorted by priority', async () => {
    // Create test issues
    await createIssue({ title: 'Low', priority: 3 });
    await createIssue({ title: 'High', priority: 1 });
    await createIssue({ title: 'Blocked', priority: 0, blockedBy: 'other' });
    
    const output = await runCommand('bd ready');
    expect(output.lines[0]).toContain('High');  // P1 first
    expect(output.lines[1]).toContain('Low');   // P3 second
    expect(output).not.toContain('Blocked');    // Excluded
  });
});
```

### apps/@km/_orphan/cli/tests/bd/create.test.ts

```typescript
describe('km bd create', () => {
  test('creates issue with custom ID', async () => {
    const output = await runCommand(
      'bd create "Auth epic" --id auth-epic -t epic -p 1'
    );
    expect(output).toContain('km-auth-epic');
    
    const issue = await getIssue('km-auth-epic');
    expect(issue.content).toContain('@issue');
    expect(issue.content).toContain('#epic');
    expect(issue.content).toContain('#P1');
  });

  test('creates sub-ID under parent', async () => {
    await runCommand('bd create "Epic" --id my-epic');
    const output = await runCommand('bd create "Child" --parent km-my-epic');
    expect(output).toContain('km-my-epic.1');
  });
});
```

### apps/@km/_orphan/cli/tests/bd/migrate.test.ts

```typescript
describe('km bd migrate', () => {
  test('migrates .beads/issues.jsonl to km format', async () => {
    // Setup .beads/ with test data
    await writeBeadsData([...]);
    
    await runCommand('bd migrate');
    
    // Verify issues created
    const issues = await runCommand('bd list --all');
    expect(issues).toContain('km-abc123');
    
    // Verify .beads backed up
    expect(fs.existsSync('.beads.bak')).toBe(true);
  });
});
```

## Migration Logic

1. Read `.beads/issues.jsonl`
2. For each issue:
- Create task with `@issue` tag
- Map: status → task_status, priority → #P tag
- Add type tag (#bug, #feature, etc.)
- Set assignee, due_date
- Convert dependencies to blocks:: / blocked-by:: properties
- Store original beads ID in `data.beads_id`
11. Create @issues.md board if not exists
12. Move .beads/ to .beads.bak/

## Dependencies

- Requires: @km/props (for blocks::/blocked-by:: properties)
- **Optional**: @km/_orphan/supertags (for @issue schema validation)

## Phases

### Phase 1: Core CLI (P1)

- [ ] Command group structure
- [ ] km bd create (basic)
- [ ] km bd list
- [ ] km bd show
- [ ] km bd update
- [ ] km bd close
- [ ] Short ID utilities
- [ ] Unit tests

### Phase 2: Ready & Dependencies (P2)

- [ ] km bd ready (requires blocked: query)
- [ ] km bd dep commands
- [ ] Integration with @km/props

### Phase 3: Advanced Features (P2)

- [ ] Custom IDs (--id flag)
- [ ] Epic sub-IDs (--parent flag)
- [ ] km bd sync
- [ ] km bd stale

### Phase 4: Migration (P3)

- [ ] km bd migrate
- [ ] ID mapping preservation
- [ ] Dependency conversion

### Phase 5: Docs & Integration (P2)

- [ ] Update docs/08-cli.md
- [ ] Update CLAUDE.md
- [ ] Update .claude/commands/pm.md
- [ ] Create @issues.md template

## Acceptance Criteria

- [ ] All bd commands implemented and working
- [ ] Short IDs work (display and resolution)
- [ ] Custom IDs and sub-IDs work
- [ ] blocked:true query excludes blocked issues from ready
- [ ] Migration converts .beads/ successfully
- [ ] Docs updated
- [ ] Tests pass
- [ ] /pm skill works with km bd
- [x] km bd info: statistics counts off by 5x (1484 vs 8176 actual) #bug #P1 @issue priority:: P1

  km bd info reports Total=1484, Open=1454, InProgress=0, Closed=30, Dropped=0 but km bd list --status X shows Open=3498, InProgress=52, Closed=4626 (sum=8176). Either info reads stale cache or list double-counts via JOIN. Fix: identify the discrepancy source, make info match list, add a /complete grep that asserts they agree.
- [x] km bd ready: bare invocation silently empty; print helpful 'specify board' message #bug #P1 @issue priority:: P1

  km bd ready (no arg) silently returns 'No ready issues found' even though km bd ready @km returns 475 and km bd ready --all returns 3490. The default 'beads root[0]' resolves to nothing in this vault. Fix: when bare ready returns 0, print a tip explaining the default board is empty and suggesting 'km bd ready @km' or '--all' or 'how to configure beads.roots'. Apply the same pattern to other bd subcommands that need a board arg.
- [x] km bd list --json: malformed JSON output (unfinished string at EOF) #bug #P0 @issue priority:: P0

  km bd list --status X --json produces invalid JSON — jq errors with 'Unfinished string at EOF at line N, column M'. Likely missing escape on a body field or unclosed array bracket. Fix: identify the truncation point, ensure the serializer handles all body characters (newlines, quotes, backslashes), add a test that round-trips list --json through jq for the full corpus.
- [x] km bd query DSL: leaks raw SQLite errors instead of helpful column-name guidance #bug #P1 @issue priority:: P1

  km bd query 'scope=open' fails with 'SQLiteError: no such column: scope' — exposing raw db internals. Fix: validate the query DSL key against the known column allowlist; on unknown key, print 'unknown attribute: scope. Valid attributes: id, title, status, priority, type, parent, ...'. Also covers the broader pattern: bd commands that need an arg or board configuration should print helpful text explaining what to specify and how to configure it.
- [x] Canonical-ids switchover: bd-form km-scope.slug → path-form @km/scope/slug + fix hardcoded prefix #task #P2 @issue priority:: P2

  Adopt the @<prefix>/<scope>/<slug> form everywhere — prose, chat, commit messages, bead notes, wikilinks, frontmatter id (with bd-form aliases for legacy). Companion bug: packages/km-beads/src/short-ids.ts:4 hardcodes const PREFIX = 'km' instead of reading from .km/config.yaml — blocks @<other-prefix>/... working in non-km repos.
  - Conventions (verified with user 2026-04-29)
  - Conversation/prose/commits/notes: @km/beads/foo
  - Wikilinks: [[@km/beads/foo]] — the @ is part of the name, NOT a render-mode hint. Strip it and you point at a different node.
  - CLI: km bd show @km/beads/foo (or legacy km-beads.foo via aliases)
  - Memories: @mem/<key>
  - Scope
  - Skill files: .claude/skills/**/*.md (50+ files)
  - Project docs: docs/**/*.md, CLAUDE.md, AGENTS.md, README.md
  - Per-package READMEs
  - Out of scope
  - Existing bead frontmatter ids (left as bd-form, aliases handle resolution)
  - Old commit messages and PR descriptions (don't rewrite history)
  - Acceptance
  - short-ids.ts reads prefix from .km/config.yaml (test: pim-prefixed vault produces pim-q5hji not km-q5hji), consumed by km bd's short-id resolver in resolveBead
  - All in-tree skill/doc references to bd-form bead ids rewritten to @-path-form (verify: grep -rn 'km-[a-z][a-z0-9-]*\.[a-z]' .claude/skills/ docs/ CLAUDE.md AGENTS.md should return only legitimate package-name false-positives)
  - Wikilinks updated: [[@km/scope/slug]] (with @)

  In flight on slot wt6 in agent canonical-ids@km-beads-cli-fixes. Track here for closure.
- [x] km bd create (no --id/--parent): index-only ghost — must materialize at @km/inbox/<short-id>.md priority:: P0

  Repro:
  ```
  km bd create 'example title, delete'
  # Created issue: km-xvzm — succeeds (good, bd-compat)
  ```

  Then check: file does NOT exist on disk.
  ```
  find @km/ -name '*xvzm*'   # 0 results
  git status                 # clean — bead won't ride git transport
  ```

  The event-log entry has fs_path: null, fstype: null, parent_id: '.' (root).
  - Why this is a P0 integrity bug
  - The bead is **index-only**: lives in .km/state.db and .km/changes.jsonl, but has no markdown file.
  - It WON'T survive an index rebuild from disk (`km doctor rebuild` would lose it).
  - It WON'T ride normal git transport — peers / clones won't see it.
  - It violates the storage-model promise (CLAUDE.md vault structure: "every bead lives at @km/<scope>/<slug>.md").
  - Acceptance — keep bd-compat AND fix integrity
  - [ ] `km bd create 'title'` (no --id, no --parent) succeeds (bd-compat preserved)
  - [ ] The created bead has a real file at `@km/inbox/<short-id>.md` — "inbox" is the default scope for quick-capture/triage flow. NOT `@km/_orphan/` (which is reserved for migration provenance — Asana dumps, legacy bd imports).
  - [ ] Default scope is configurable: `beads.default_scope` in `.km/config.yaml` (default value: 'inbox'). Falls back to 'inbox' if config missing.
  - [ ] File frontmatter has `aliases: [<short-id>, km-<short-id>]` per the canonical-ids pattern. The path `@km/inbox/<short-id>` IS the canonical id; no separate `id:` line needed in frontmatter.
  - [ ] `git status` after a fresh create shows the new file as untracked
  - [ ] `@km/inbox/` is created if it doesn't exist (lazy init)
  - [ ] Optional UX hint to stderr: 'Note: no scope — landed at @km/inbox. Use --parent @km/<scope> to file directly under a scope.' (non-fatal, additive)
  - Related — pairs with these threads
  - `beads.roots` config should include `@km/inbox` by default so `km bd ready` (bare) surfaces inbox-pending work — see @km/beads/ready-helpful-empty-message
  - @km/beads/list-json-malformed — another integrity bug
  - @km/beads/canonical-ids-switchover — frontmatter `id:` is redundant when path matches; only `aliases:` need to be explicit

  Do NOT add a hard error / require --orphan flag — that diverges from bd compatibility (bd's design intent is quick-capture).

  Found 2026-04-29 by user testing in main session.

  2026-04-29 update: @km/_orphan/ is being collapsed into @km/inbox/ (see @km/beads/rename-orphan-to-inbox). This bead's acceptance now references @km/inbox/ only. There is no separate _orphan path.
- [x] km bd: ship sensible defaults so commands work zero-config (beads.default_scope='inbox', beads.roots=['@km']) #bug #P0 @issue priority:: P0

  Today's km bd commands silently no-op or produce ghosts when .km/config.yaml lacks beads.default_scope and beads.roots — see thread of bugs found 2026-04-29.
  - Required defaults (hard-coded in CLI)
  | Config key          | Default                            | Used by                                                                                           |
  | ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
  | beads.default_scope | inbox                              | km bd create when no --parent → file lands at @km/inbox/<short-id>.md                             |
  | beads.roots         | ['@km']                            | km bd ready (bare), km bd list (default scope filter), other board-aware commands                 |
  | beads.prefix        | (already from .km/config.yaml: km) | short-id generation; see project-km-bd-canonical-ids.md and km-beads.short-ids-prefix-from-config |
  - Why this is P0
  - Bare `km bd create 'title'` produces an index-only ghost (see @km/beads/create-orphan-must-materialize)
  - Bare `km bd ready` silently returns 0 results (see @km/beads/ready-helpful-empty-message)
  - New users / new repos / fresh clones hit broken behavior before they know to configure
  - Acceptance
  - [ ] CLI has hard-coded defaults for `beads.default_scope` ('inbox') and `beads.roots` (['@km']), used by km bd commands when config is silent on these keys
  - [ ] `.km/config.yaml` can override the defaults; fields are optional, not required
  - [ ] `km bd config get beads.default_scope` returns 'inbox' on a fresh repo with no config
  - [ ] `km bd config get beads.roots` returns ['@km'] on a fresh repo with no config
  - [ ] Test: fresh init repo (`mkdir x && cd x && git init && km bd init`) → `km bd create 'foo'` lands at @km/inbox/<short-id>.md AND `km bd ready` lists it
  - [ ] Test: same scenario with explicit override config → respects the override
  - Related
  - @km/beads/create-orphan-must-materialize (P0) — depends on default_scope being defined
  - @km/beads/ready-helpful-empty-message (P1) — depends on beads.roots being defined OR helpful error if not
  - @km/beads/canonical-ids-switchover — fixes the prefix hardcoding (related to the third config key)

  Found 2026-04-29 by user.

  2026-04-29 update: per user, @km/_orphan/ is being renamed to @km/inbox/ (see @km/beads/rename-orphan-to-inbox). After rename, @km/inbox/ is the SINGLE landing zone for scope-less beads — both fresh creates AND migration imports go there. No separate _orphan path.
- [x] Rename @km/_orphan/ → @km/inbox/ (collapse the two landing zones into one) #task #P1 @issue priority:: P1

  Currently @km/_orphan/ (1059 files, from migration imports) is conceptually separate from a hypothetical @km/inbox/ (where bare km bd create would land per @km/beads/create-orphan-must-materialize). Per user 2026-04-29: collapse into one landing zone. Pick 'inbox' (more meaningful name; conveys triage intent).
  - Acceptance
  - [ ] Rename `@km/_orphan/` → `@km/inbox/` (~1059 files; use git mv to preserve history)
  - [ ] Update migration code (packages/km-beads/src/migrate.ts) to land scope-less imports at `@km/inbox/<short-id>.md` instead of `@km/_orphan/<short-id>.md`
  - [ ] Update CLAUDE.md vault structure docs — currently say '`@km/_orphan/` for bd auto-ids without scope'; replace with '`@km/inbox/` for new quick-captures + scope-less migration imports'
  - [ ] Update memory file project-km-bd-canonical-ids.md if it references _orphan
  - [ ] Update bead frontmatter `id:` and `aliases:` for the 1059 renamed beads — `@km/_orphan/foo` becomes the alias, `@km/inbox/foo` becomes canonical
  - [ ] Wikilinks / cross-references throughout the vault updated: `[[@km/_orphan/foo]]` → `[[@km/inbox/foo]]` (batch refactor, manual review)
  - [ ] Acceptance grep: `grep -r '_orphan' @km/ docs/ CLAUDE.md packages/km-beads/` should return only the migration code's backwards-compat alias path
  - Pairs with
  - @km/beads/create-orphan-must-materialize — when this bead lands, materialize there
  - @km/beads/zero-config-defaults — `beads.default_scope='inbox'` becomes the only landing zone, no need for separate _orphan handling

  Order: file this rename FIRST (before zero-config-defaults / create-orphan land), so the new code only writes to one location.

  Found 2026-04-29 by user.
- [ ] vendor/bearly: merge feat/worktree-tool-claimer-status to bearly main + bump km pointer #task #P2 @issue priority:: P2

  wt8 agent committed worktree-tool enhancement to bearly's feat/worktree-tool-claimer-status branch (SHA 3d498f8044) but never merged to bearly main or pushed to origin. The km-side commit (5da164d24) bumped vendor/bearly pointer to 3d498f8044 — dangling reference on origin/bearly.
  - To finish
  1. cd vendor/bearly, switch to feat/worktree-tool-claimer-status, push to origin
  1. Merge feat/worktree-tool-claimer-status to bearly main (PR or direct)
  1. Push bearly main to origin
  1. cd back to km, bump vendor/bearly pointer to bearly main tip
  1. Commit km-side bump

  The actual work — vendor/bearly/tools/worktree.ts showing pool-slot claimer + agent status from km bd + tribe — is preserved on the bearly feature branch and exists in the wt8 worktree clone.
- [ ] km-beads: reconcile data-schema integration with deps-table approach #task #P2 @issue priority:: P2

  wt4 agent's commits 5e4509ccf (refactor: wire BeadData schema into read + write paths) and b982f72ce (integration test) reverted packages/km-beads/src/queries.ts to JSON-scan blocked-by edges, conflicting with the deps-table approach landed by deps-schema-plateau. Cherry-picks aborted on conflict; the Zod schema (commit 1, 12fcab99c) was kept since it's purely additive.
  - What needs reconciliation

  The wt4 refactor used parseBeadData(row.data) → extractBlockedByTargets(data.props) which assumes the OLD JSON-scan path. After deps-schema landed, blocked-by edges are queryable directly from the deps table — no JSON parse needed.
  - To finish
  1. Re-implement the data-schema wiring in mutations.ts + deps.ts (take wt4's Zod parse-on-write approach for data integrity)
  1. KEEP the deps-table reads in queries.ts (don't revert to JSON scan)
  1. Update the integration test (data-schema-integration.test.ts content from b982f72ce) to assert against the deps-table-shaped read path

  The wt4 commits live on the wt4 slot branch in case parts are useful as reference.
- Framing

Beads have ONE user-facing identifier: the sigil-rooted path, e.g. `@km/silvery/kitty-pixel-alignment`. The internal storage primary key (currently a ULID) is *not* a bead id — it's a KNode pkey. Never shown.

| Layer                 | What                              | Where it appears                                                              |
| --------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| Storage pkey          | 01KQDF11D6AJVMZAVJXDZQYVJ7        | nodes.id only. Never CLI/UI output.                                           |
| Bead name (canonical) | @km/silvery/kitty-pixel-alignment | Frontmatter id: (or matched by file path). Every CLI surface, every wikilink. |
| Legacy bd-form        | km-silvery.kitty-pixel-alignment  | aliases: only. Resolves on input, never displayed.                            |

- Current bug

`packages/km-beads/src/queries.ts displayId()` falls through `path → short_id → ULID`. The ULID fallback is the source of every weird `01KQ...` row in `bd list`. There are 2582 of them today (test fixtures + orphan beads).

- Invariant

A node WITHOUT a sigil-rooted path is NOT a bead. `bd list` / `queryReady` / `bd show` must never label a row by ULID. Two enforcements:

1. **Read side** — `displayId()` returns the path *or fails* (the row shouldn't have been included).
2. **Write side** — `bd create` always materializes to a path (auto-slug from title under `@km/inbox/<slug>` if no `--id`). No more index-only ghosts.
- Supersedes / merges
- `@km/beads/create-orphan-must-materialize` — same root cause (write side).
- `km-beads.identity-by-structure` (P0) — same root cause (read side: `beads:[]` root scoping prevents test-fixture nodes from being returned at all).

Both reframed as parts of a single change: bead identity = sigil-rooted path.

- Acceptance
- `displayId(issue)` is `(issue) => issue.path` — no fallback chain.
- `bd list` never returns a row whose label is a 26-char ULID.
- `bd create "title"` (no `--id`) writes a markdown file at `@km/inbox/<auto-slug>.md`.
- `queryReady` / `bd list` walks only configured `beads:[]` roots.
- 2582 ULID-only rows from test fixtures gone.
- Repro

km bd create "Title" --parent km-beads --id path-is-the-name

Expected: file at @km/beads/path-is-the-name.md, frontmatter id `@km/beads/path-is-the-name`.

Actual: child node *inside* @km/beads.md (the epic file itself), no separate file. Bead show:

Path: @km/beads.md
    Context: beads
    Display id: km-path-is-the-name (bd-form, not @km/...)

- Root cause hypothesis

`createIssueNode` + addNode pipeline treats `--parent <epic>` as "append child KNode to epic's body", not "use the epic as a scope and create a sibling file under its directory". The path-form `@km/<scope>/<slug>` semantics aren't wired into the file-materialization layer; the epic is found as a node, not as a directory anchor.

- Wanted behavior
- `--parent km-beads --id path-is-the-name` ⇒ writes `@km/beads/path-is-the-name.md`, frontmatter `id: @km/beads/path-is-the-name`, no `data.short_id` (or short_id mirrors the path).
- `--id @km/beads/path-is-the-name` (path-form, no `--parent`) ⇒ same result.
- Both forms are equivalent — `--parent X --id leaf` is just a split shortcut for `--id @km/X/leaf`.
- Acceptance
- Test: km bd create "T" --parent km-beads --id foo creates `@km/beads/foo.md` (file exists, frontmatter sane).
- Test: km bd create "T" --id @km/beads/foo creates the same.
- bd show foo, bd show @km/beads/foo, bd show km-beads.foo all resolve to that file.
- displayId returns `@km/beads/foo`, not `km-beads.foo`.
- Relates
- Parent of the same redesign: km-path-is-the-name (P1) — bead identity = sigil-rooted path.

Adopt the @<prefix>/<scope>/<slug> form everywhere — prose, chat, commit messages, bead notes, wikilinks, frontmatter id (with bd-form aliases for legacy). Companion bug: packages/km-beads/src/short-ids.ts:4 hardcodes const PREFIX = 'km' instead of reading from .km/config.yaml — blocks @<other-prefix>/... working in non-km repos.

- Conventions (verified with user 2026-04-29)
- Conversation/prose/commits/notes: @km/beads/foo
- Wikilinks: [[@km/beads/foo]] — the @ is part of the name, NOT a render-mode hint. Strip it and you point at a different node.
- CLI: km bd show @km/beads/foo (or legacy km-beads.foo via aliases)
- Memories: @mem/<key>
- Scope
- Skill files: .claude/skills/**/*.md (50+ files)
- Project docs: docs/**/*.md, CLAUDE.md, AGENTS.md, README.md
- Per-package READMEs
- Out of scope
- Existing bead frontmatter ids (left as bd-form, aliases handle resolution)
- Old commit messages and PR descriptions (don't rewrite history)
- Acceptance
- short-ids.ts reads prefix from .km/config.yaml (test: pim-prefixed vault produces pim-q5hji not km-q5hji), consumed by km bd's short-id resolver in resolveBead
- All in-tree skill/doc references to bd-form bead ids rewritten to @-path-form (verify: grep -rn 'km-[a-z][a-z0-9-]*\.[a-z]' .claude/skills/ docs/ CLAUDE.md AGENTS.md should return only legitimate package-name false-positives)
- Wikilinks updated: [[@km/scope/slug]] (with @)

In flight on slot wt6 in agent canonical-ids@km-beads-cli-fixes. Track here for closure.

Repro:

```
km bd create 'example title, delete'
# Created issue: km-xvzm — succeeds (good, bd-compat)
```

Then check: file does NOT exist on disk.

```
find @km/ -name '*xvzm*'   # 0 results
git status                 # clean — bead won't ride git transport
```

The event-log entry has `fs_path: null`, `fstype: null`, `parent_id: '.'` (root).

- Why this is a P0 integrity bug
- The bead is **index-only**: lives in .km/state.db and .km/changes.jsonl, but has no markdown file.
- It WON'T survive an index rebuild from disk (`km doctor rebuild` would lose it).
- It WON'T ride normal git transport — peers / clones won't see it.
- It violates the storage-model promise (CLAUDE.md vault structure: "every bead lives at @km/<scope>/<slug>.md").
- Acceptance — keep bd-compat AND fix integrity
- [ ] `km bd create 'title'` (no --id, no --parent) succeeds (bd-compat preserved)
- [ ] The created bead has a real file at `@km/inbox/<short-id>.md` — "inbox" is the default scope for quick-capture/triage flow. NOT `@km/_orphan/` (which is reserved for migration provenance — Asana dumps, legacy bd imports).
- [ ] Default scope is configurable: `beads.default_scope` in `.km/config.yaml` (default value: 'inbox'). Falls back to 'inbox' if config missing.
- [ ] File frontmatter has `aliases: [<short-id>, km-<short-id>]` per the canonical-ids pattern. The path `@km/inbox/<short-id>` IS the canonical id; no separate `id:` line needed in frontmatter.
- [ ] `git status` after a fresh create shows the new file as untracked
- [ ] `@km/inbox/` is created if it doesn't exist (lazy init)
- [ ] Optional UX hint to stderr: 'Note: no scope — landed at @km/inbox. Use --parent @km/<scope> to file directly under a scope.' (non-fatal, additive)
- Related — pairs with these threads
- `beads.roots` config should include `@km/inbox` by default so `km bd ready` (bare) surfaces inbox-pending work — see @km/beads/ready-helpful-empty-message
- @km/beads/list-json-malformed — another integrity bug
- @km/beads/canonical-ids-switchover — frontmatter `id:` is redundant when path matches; only `aliases:` need to be explicit

Do NOT add a hard error / require --orphan flag — that diverges from bd compatibility (bd's design intent is quick-capture).

Found 2026-04-29 by user testing in main session.

2026-04-29 update: `@km/_orphan/` is being collapsed into `@km/inbox/` (see @km/beads/rename-orphan-to-inbox). This bead's acceptance now references `@km/inbox/` only. There is no separate _orphan path.

Today's km bd commands silently no-op or produce ghosts when `.km/config.yaml` lacks `beads.default_scope` and `beads.roots` — see thread of bugs found 2026-04-29.

- Required defaults (hard-coded in CLI)

| Config key          | Default                            | Used by                                                                                           |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| beads.default_scope | inbox                              | km bd create when no --parent → file lands at @km/inbox/<short-id>.md                             |
| beads.roots         | ['@km']                            | km bd ready (bare), km bd list (default scope filter), other board-aware commands                 |
| beads.prefix        | (already from .km/config.yaml: km) | short-id generation; see project-km-bd-canonical-ids.md and km-beads.short-ids-prefix-from-config |

- Why this is P0
- Bare `km bd create 'title'` produces an index-only ghost (see @km/beads/create-orphan-must-materialize)
- Bare `km bd ready` silently returns 0 results (see @km/beads/ready-helpful-empty-message)
- New users / new repos / fresh clones hit broken behavior before they know to configure
- Acceptance
- [ ] CLI has hard-coded defaults for `beads.default_scope` ('inbox') and `beads.roots` (['@km']), used by km bd commands when config is silent on these keys
- [ ] `.km/config.yaml` can override the defaults; fields are optional, not required
- [ ] `km bd config get beads.default_scope` returns 'inbox' on a fresh repo with no config
- [ ] `km bd config get beads.roots` returns ['@km'] on a fresh repo with no config
- [ ] Test: fresh init repo (`mkdir x && cd x && git init && km bd init`) → `km bd create 'foo'` lands at @km/inbox/<short-id>.md AND `km bd ready` lists it
- [ ] Test: same scenario with explicit override config → respects the override
- Related
- @km/beads/create-orphan-must-materialize (P0) — depends on default_scope being defined
- @km/beads/ready-helpful-empty-message (P1) — depends on beads.roots being defined OR helpful error if not
- @km/beads/canonical-ids-switchover — fixes the prefix hardcoding (related to the third config key)

Found 2026-04-29 by user.

2026-04-29 update: per user, `@km/_orphan/` is being renamed to `@km/inbox/` (see @km/beads/rename-orphan-to-inbox). After rename, `@km/inbox/` is the SINGLE landing zone for scope-less beads — both fresh creates AND migration imports go there. No separate _orphan path.

Currently `@km/_orphan/` (1059 files, from migration imports) is conceptually separate from a hypothetical `@km/inbox/` (where bare `km bd create` would land per @km/beads/create-orphan-must-materialize). Per user 2026-04-29: collapse into one landing zone. Pick 'inbox' (more meaningful name; conveys triage intent).

- Acceptance
- [ ] Rename `@km/_orphan/` → `@km/inbox/` (~1059 files; use git mv to preserve history)
- [ ] Update migration code (packages/km-beads/src/migrate.ts) to land scope-less imports at `@km/inbox/<short-id>.md` instead of `@km/_orphan/<short-id>.md`
- [ ] Update CLAUDE.md vault structure docs — currently say '`@km/_orphan/` for bd auto-ids without scope'; replace with '`@km/inbox/` for new quick-captures + scope-less migration imports'
- [ ] Update memory file project-km-bd-canonical-ids.md if it references _orphan
- [ ] Update bead frontmatter `id:` and `aliases:` for the 1059 renamed beads — `@km/_orphan/foo` becomes the alias, `@km/inbox/foo` becomes canonical
- [ ] Wikilinks / cross-references throughout the vault updated: `[[@km/_orphan/foo]]` → `[[@km/inbox/foo]]` (batch refactor, manual review)
- [ ] Acceptance grep: `grep -r '_orphan' @km/ docs/ CLAUDE.md packages/km-beads/` should return only the migration code's backwards-compat alias path
- Pairs with
- @km/beads/create-orphan-must-materialize — when this bead lands, materialize there
- @km/beads/zero-config-defaults — `beads.default_scope='inbox'` becomes the only landing zone, no need for separate _orphan handling

Order: file this rename FIRST (before zero-config-defaults / create-orphan land), so the new code only writes to one location.

Found 2026-04-29 by user.

wt8 agent committed worktree-tool enhancement to bearly's feat/worktree-tool-claimer-status branch (SHA 3d498f8044) but never merged to bearly main or pushed to origin. The km-side commit (5da164d24) bumped vendor/bearly pointer to 3d498f8044 — dangling reference on origin/bearly.

- To finish
3. cd vendor/bearly, switch to feat/worktree-tool-claimer-status, push to origin
4. Merge feat/worktree-tool-claimer-status to bearly main (PR or direct)
5. Push bearly main to origin
6. cd back to km, bump vendor/bearly pointer to bearly main tip
7. Commit km-side bump

The actual work — vendor/bearly/tools/worktree.ts showing pool-slot claimer + agent status from km bd + tribe — is preserved on the bearly feature branch and exists in the wt8 worktree clone.

wt4 agent's commits 5e4509ccf (refactor: wire BeadData schema into read + write paths) and b982f72ce (integration test) reverted packages/km-beads/src/queries.ts to JSON-scan blocked-by edges, conflicting with the deps-table approach landed by deps-schema-plateau. Cherry-picks aborted on conflict; the Zod schema (commit 1, 12fcab99c) was kept since it's purely additive.

- What needs reconciliation

The wt4 refactor used `parseBeadData(row.data) → extractBlockedByTargets(data.props)` which assumes the OLD JSON-scan path. After deps-schema landed, blocked-by edges are queryable directly from the `deps` table — no JSON parse needed.

- To finish
3. Re-implement the data-schema wiring in mutations.ts + deps.ts (take wt4's Zod parse-on-write approach for data integrity)
4. KEEP the deps-table reads in queries.ts (don't revert to JSON scan)
5. Update the integration test (data-schema-integration.test.ts content from b982f72ce) to assert against the deps-table-shaped read path

The wt4 commits live on the wt4 slot branch in case parts are useful as reference.

- Framing

Beads have ONE user-facing identifier: the sigil-rooted path, e.g. `@km/silvery/kitty-pixel-alignment`. The internal storage primary key (currently a ULID) is *not* a bead id — it's a KNode pkey. Never shown.

| Layer                 | What                              | Where it appears                                                              |
| --------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| Storage pkey          | 01KQDF11D6AJVMZAVJXDZQYVJ7        | nodes.id only. Never CLI/UI output.                                           |
| Bead name (canonical) | @km/silvery/kitty-pixel-alignment | Frontmatter id: (or matched by file path). Every CLI surface, every wikilink. |
| Legacy bd-form        | km-silvery.kitty-pixel-alignment  | aliases: only. Resolves on input, never displayed.                            |

- Current bug

`packages/km-beads/src/queries.ts displayId()` falls through `path → short_id → ULID`. The ULID fallback is the source of every weird `01KQ...` row in `bd list`. There are 2582 of them today (test fixtures + orphan beads).

- Invariant

A node WITHOUT a sigil-rooted path is NOT a bead. `bd list` / `queryReady` / `bd show` must never label a row by ULID. Two enforcements:

1. **Read side** — `displayId()` returns the path *or fails* (the row shouldn't have been included).
2. **Write side** — `bd create` always materializes to a path (auto-slug from title under `@km/inbox/<slug>` if no `--id`). No more index-only ghosts.
- Supersedes / merges
- `@km/beads/create-orphan-must-materialize` — same root cause (write side).
- `km-beads.identity-by-structure` (P0) — same root cause (read side: `beads:[]` root scoping prevents test-fixture nodes from being returned at all).

Both reframed as parts of a single change: bead identity = sigil-rooted path.

- Acceptance
- `displayId(issue)` is `(issue) => issue.path` — no fallback chain.
- `bd list` never returns a row whose label is a 26-char ULID.
- `bd create "title"` (no `--id`) writes a markdown file at `@km/inbox/<auto-slug>.md`.
- `queryReady` / `bd list` walks only configured `beads:[]` roots.
- 2582 ULID-only rows from test fixtures gone.

Adopt the @<prefix>/<scope>/<slug> form everywhere — prose, chat, commit messages, bead notes, wikilinks, frontmatter id (with bd-form aliases for legacy). Companion bug: packages/km-beads/src/short-ids.ts:4 hardcodes const PREFIX = 'km' instead of reading from .km/config.yaml — blocks @<other-prefix>/... working in non-km repos.

- Conventions (verified with user 2026-04-29)
- Conversation/prose/commits/notes: @km/beads/foo
- Wikilinks: [[@km/beads/foo]] — the @ is part of the name, NOT a render-mode hint. Strip it and you point at a different node.
- CLI: km bd show @km/beads/foo (or legacy km-beads.foo via aliases)
- Memories: @mem/<key>
- Scope
- Skill files: .claude/skills/**/*.md (50+ files)
- Project docs: docs/**/*.md, CLAUDE.md, AGENTS.md, README.md
- Per-package READMEs
- Out of scope
- Existing bead frontmatter ids (left as bd-form, aliases handle resolution)
- Old commit messages and PR descriptions (don't rewrite history)
- Acceptance
- short-ids.ts reads prefix from .km/config.yaml (test: pim-prefixed vault produces pim-q5hji not km-q5hji), consumed by km bd's short-id resolver in resolveBead
- All in-tree skill/doc references to bd-form bead ids rewritten to @-path-form (verify: grep -rn 'km-[a-z][a-z0-9-]*\.[a-z]' .claude/skills/ docs/ CLAUDE.md AGENTS.md should return only legitimate package-name false-positives)
- Wikilinks updated: [[@km/scope/slug]] (with @)

In flight on slot wt6 in agent canonical-ids@km-beads-cli-fixes. Track here for closure.

Repro:

```
km bd create 'example title, delete'
# Created issue: km-xvzm — succeeds (good, bd-compat)
```

Then check: file does NOT exist on disk.

```
find @km/ -name '*xvzm*'   # 0 results
git status                 # clean — bead won't ride git transport
```

The event-log entry has `fs_path: null`, `fstype: null`, `parent_id: '.'` (root).

- Why this is a P0 integrity bug
- The bead is **index-only**: lives in .km/state.db and .km/changes.jsonl, but has no markdown file.
- It WON'T survive an index rebuild from disk (`km doctor rebuild` would lose it).
- It WON'T ride normal git transport — peers / clones won't see it.
- It violates the storage-model promise (CLAUDE.md vault structure: "every bead lives at @km/<scope>/<slug>.md").
- Acceptance — keep bd-compat AND fix integrity
- [ ] `km bd create 'title'` (no --id, no --parent) succeeds (bd-compat preserved)
- [ ] The created bead has a real file at `@km/inbox/<short-id>.md` — "inbox" is the default scope for quick-capture/triage flow. NOT `@km/_orphan/` (which is reserved for migration provenance — Asana dumps, legacy bd imports).
- [ ] Default scope is configurable: `beads.default_scope` in `.km/config.yaml` (default value: 'inbox'). Falls back to 'inbox' if config missing.
- [ ] File frontmatter has `aliases: [<short-id>, km-<short-id>]` per the canonical-ids pattern. The path `@km/inbox/<short-id>` IS the canonical id; no separate `id:` line needed in frontmatter.
- [ ] `git status` after a fresh create shows the new file as untracked
- [ ] `@km/inbox/` is created if it doesn't exist (lazy init)
- [ ] Optional UX hint to stderr: 'Note: no scope — landed at @km/inbox. Use --parent @km/<scope> to file directly under a scope.' (non-fatal, additive)
- Related — pairs with these threads
- `beads.roots` config should include `@km/inbox` by default so `km bd ready` (bare) surfaces inbox-pending work — see @km/beads/ready-helpful-empty-message
- @km/beads/list-json-malformed — another integrity bug
- @km/beads/canonical-ids-switchover — frontmatter `id:` is redundant when path matches; only `aliases:` need to be explicit

Do NOT add a hard error / require --orphan flag — that diverges from bd compatibility (bd's design intent is quick-capture).

Found 2026-04-29 by user testing in main session.

2026-04-29 update: `@km/_orphan/` is being collapsed into `@km/inbox/` (see @km/beads/rename-orphan-to-inbox). This bead's acceptance now references `@km/inbox/` only. There is no separate _orphan path.

Today's km bd commands silently no-op or produce ghosts when `.km/config.yaml` lacks `beads.default_scope` and `beads.roots` — see thread of bugs found 2026-04-29.

- Required defaults (hard-coded in CLI)

| Config key          | Default                            | Used by                                                                                           |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| beads.default_scope | inbox                              | km bd create when no --parent → file lands at @km/inbox/<short-id>.md                             |
| beads.roots         | ['@km']                            | km bd ready (bare), km bd list (default scope filter), other board-aware commands                 |
| beads.prefix        | (already from .km/config.yaml: km) | short-id generation; see project-km-bd-canonical-ids.md and km-beads.short-ids-prefix-from-config |

- Why this is P0
- Bare `km bd create 'title'` produces an index-only ghost (see @km/beads/create-orphan-must-materialize)
- Bare `km bd ready` silently returns 0 results (see @km/beads/ready-helpful-empty-message)
- New users / new repos / fresh clones hit broken behavior before they know to configure
- Acceptance
- [ ] CLI has hard-coded defaults for `beads.default_scope` ('inbox') and `beads.roots` (['@km']), used by km bd commands when config is silent on these keys
- [ ] `.km/config.yaml` can override the defaults; fields are optional, not required
- [ ] `km bd config get beads.default_scope` returns 'inbox' on a fresh repo with no config
- [ ] `km bd config get beads.roots` returns ['@km'] on a fresh repo with no config
- [ ] Test: fresh init repo (`mkdir x && cd x && git init && km bd init`) → `km bd create 'foo'` lands at @km/inbox/<short-id>.md AND `km bd ready` lists it
- [ ] Test: same scenario with explicit override config → respects the override
- Related
- @km/beads/create-orphan-must-materialize (P0) — depends on default_scope being defined
- @km/beads/ready-helpful-empty-message (P1) — depends on beads.roots being defined OR helpful error if not
- @km/beads/canonical-ids-switchover — fixes the prefix hardcoding (related to the third config key)

Found 2026-04-29 by user.

2026-04-29 update: per user, `@km/_orphan/` is being renamed to `@km/inbox/` (see @km/beads/rename-orphan-to-inbox). After rename, `@km/inbox/` is the SINGLE landing zone for scope-less beads — both fresh creates AND migration imports go there. No separate _orphan path.

Currently `@km/_orphan/` (1059 files, from migration imports) is conceptually separate from a hypothetical `@km/inbox/` (where bare `km bd create` would land per @km/beads/create-orphan-must-materialize). Per user 2026-04-29: collapse into one landing zone. Pick 'inbox' (more meaningful name; conveys triage intent).

- Acceptance
- [ ] Rename `@km/_orphan/` → `@km/inbox/` (~1059 files; use git mv to preserve history)
- [ ] Update migration code (packages/km-beads/src/migrate.ts) to land scope-less imports at `@km/inbox/<short-id>.md` instead of `@km/_orphan/<short-id>.md`
- [ ] Update CLAUDE.md vault structure docs — currently say '`@km/_orphan/` for bd auto-ids without scope'; replace with '`@km/inbox/` for new quick-captures + scope-less migration imports'
- [ ] Update memory file project-km-bd-canonical-ids.md if it references _orphan
- [ ] Update bead frontmatter `id:` and `aliases:` for the 1059 renamed beads — `@km/_orphan/foo` becomes the alias, `@km/inbox/foo` becomes canonical
- [ ] Wikilinks / cross-references throughout the vault updated: `[[@km/_orphan/foo]]` → `[[@km/inbox/foo]]` (batch refactor, manual review)
- [ ] Acceptance grep: `grep -r '_orphan' @km/ docs/ CLAUDE.md packages/km-beads/` should return only the migration code's backwards-compat alias path
- Pairs with
- @km/beads/create-orphan-must-materialize — when this bead lands, materialize there
- @km/beads/zero-config-defaults — `beads.default_scope='inbox'` becomes the only landing zone, no need for separate _orphan handling

Order: file this rename FIRST (before zero-config-defaults / create-orphan land), so the new code only writes to one location.

Found 2026-04-29 by user.

wt8 agent committed worktree-tool enhancement to bearly's feat/worktree-tool-claimer-status branch (SHA 3d498f8044) but never merged to bearly main or pushed to origin. The km-side commit (5da164d24) bumped vendor/bearly pointer to 3d498f8044 — dangling reference on origin/bearly.

- To finish
4. cd vendor/bearly, switch to feat/worktree-tool-claimer-status, push to origin
5. Merge feat/worktree-tool-claimer-status to bearly main (PR or direct)
6. Push bearly main to origin
7. cd back to km, bump vendor/bearly pointer to bearly main tip
8. Commit km-side bump

The actual work — vendor/bearly/tools/worktree.ts showing pool-slot claimer + agent status from km bd + tribe — is preserved on the bearly feature branch and exists in the wt8 worktree clone.

wt4 agent's commits 5e4509ccf (refactor: wire BeadData schema into read + write paths) and b982f72ce (integration test) reverted packages/km-beads/src/queries.ts to JSON-scan blocked-by edges, conflicting with the deps-table approach landed by deps-schema-plateau. Cherry-picks aborted on conflict; the Zod schema (commit 1, 12fcab99c) was kept since it's purely additive.

- What needs reconciliation

The wt4 refactor used `parseBeadData(row.data) → extractBlockedByTargets(data.props)` which assumes the OLD JSON-scan path. After deps-schema landed, blocked-by edges are queryable directly from the `deps` table — no JSON parse needed.

- To finish
4. Re-implement the data-schema wiring in mutations.ts + deps.ts (take wt4's Zod parse-on-write approach for data integrity)
5. KEEP the deps-table reads in queries.ts (don't revert to JSON scan)
6. Update the integration test (data-schema-integration.test.ts content from b982f72ce) to assert against the deps-table-shaped read path

The wt4 commits live on the wt4 slot branch in case parts are useful as reference.

Adopt the @<prefix>/<scope>/<slug> form everywhere — prose, chat, commit messages, bead notes, wikilinks, frontmatter id (with bd-form aliases for legacy). Companion bug: packages/km-beads/src/short-ids.ts:4 hardcodes const PREFIX = 'km' instead of reading from .km/config.yaml — blocks @<other-prefix>/... working in non-km repos.

- Conventions (verified with user 2026-04-29)
- Conversation/prose/commits/notes: @km/beads/foo
- Wikilinks: [[@km/beads/foo]] — the @ is part of the name, NOT a render-mode hint. Strip it and you point at a different node.
- CLI: km bd show @km/beads/foo (or legacy km-beads.foo via aliases)
- Memories: @mem/<key>
- Scope
- Skill files: .claude/skills/**/*.md (50+ files)
- Project docs: docs/**/*.md, CLAUDE.md, AGENTS.md, README.md
- Per-package READMEs
- Out of scope
- Existing bead frontmatter ids (left as bd-form, aliases handle resolution)
- Old commit messages and PR descriptions (don't rewrite history)
- Acceptance
- short-ids.ts reads prefix from .km/config.yaml (test: pim-prefixed vault produces pim-q5hji not km-q5hji), consumed by km bd's short-id resolver in resolveBead
- All in-tree skill/doc references to bd-form bead ids rewritten to @-path-form (verify: grep -rn 'km-[a-z][a-z0-9-]*\.[a-z]' .claude/skills/ docs/ CLAUDE.md AGENTS.md should return only legitimate package-name false-positives)
- Wikilinks updated: [[@km/scope/slug]] (with @)

In flight on slot wt6 in agent canonical-ids@km-beads-cli-fixes. Track here for closure.

Repro:

```
km bd create 'example title, delete'
# Created issue: km-xvzm — succeeds (good, bd-compat)
```

Then check: file does NOT exist on disk.

```
find @km/ -name '*xvzm*'   # 0 results
git status                 # clean — bead won't ride git transport
```

The event-log entry has `fs_path: null`, `fstype: null`, `parent_id: '.'` (root).

- Why this is a P0 integrity bug
- The bead is **index-only**: lives in .km/state.db and .km/changes.jsonl, but has no markdown file.
- It WON'T survive an index rebuild from disk (`km doctor rebuild` would lose it).
- It WON'T ride normal git transport — peers / clones won't see it.
- It violates the storage-model promise (CLAUDE.md vault structure: "every bead lives at @km/<scope>/<slug>.md").
- Acceptance — keep bd-compat AND fix integrity
- [ ] `km bd create 'title'` (no --id, no --parent) succeeds (bd-compat preserved)
- [ ] The created bead has a real file at `@km/inbox/<short-id>.md` — "inbox" is the default scope for quick-capture/triage flow. NOT `@km/_orphan/` (which is reserved for migration provenance — Asana dumps, legacy bd imports).
- [ ] Default scope is configurable: `beads.default_scope` in `.km/config.yaml` (default value: 'inbox'). Falls back to 'inbox' if config missing.
- [ ] File frontmatter has `aliases: [<short-id>, km-<short-id>]` per the canonical-ids pattern. The path `@km/inbox/<short-id>` IS the canonical id; no separate `id:` line needed in frontmatter.
- [ ] `git status` after a fresh create shows the new file as untracked
- [ ] `@km/inbox/` is created if it doesn't exist (lazy init)
- [ ] Optional UX hint to stderr: 'Note: no scope — landed at @km/inbox. Use --parent @km/<scope> to file directly under a scope.' (non-fatal, additive)
- Related — pairs with these threads
- `beads.roots` config should include `@km/inbox` by default so `km bd ready` (bare) surfaces inbox-pending work — see @km/beads/ready-helpful-empty-message
- @km/beads/list-json-malformed — another integrity bug
- @km/beads/canonical-ids-switchover — frontmatter `id:` is redundant when path matches; only `aliases:` need to be explicit

Do NOT add a hard error / require --orphan flag — that diverges from bd compatibility (bd's design intent is quick-capture).

Found 2026-04-29 by user testing in main session.

2026-04-29 update: `@km/_orphan/` is being collapsed into `@km/inbox/` (see @km/beads/rename-orphan-to-inbox). This bead's acceptance now references `@km/inbox/` only. There is no separate _orphan path.

Today's km bd commands silently no-op or produce ghosts when `.km/config.yaml` lacks `beads.default_scope` and `beads.roots` — see thread of bugs found 2026-04-29.

- Required defaults (hard-coded in CLI)

| Config key          | Default                            | Used by                                                                                           |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| beads.default_scope | inbox                              | km bd create when no --parent → file lands at @km/inbox/<short-id>.md                             |
| beads.roots         | ['@km']                            | km bd ready (bare), km bd list (default scope filter), other board-aware commands                 |
| beads.prefix        | (already from .km/config.yaml: km) | short-id generation; see project-km-bd-canonical-ids.md and km-beads.short-ids-prefix-from-config |

- Why this is P0
- Bare `km bd create 'title'` produces an index-only ghost (see @km/beads/create-orphan-must-materialize)
- Bare `km bd ready` silently returns 0 results (see @km/beads/ready-helpful-empty-message)
- New users / new repos / fresh clones hit broken behavior before they know to configure
- Acceptance
- [ ] CLI has hard-coded defaults for `beads.default_scope` ('inbox') and `beads.roots` (['@km']), used by km bd commands when config is silent on these keys
- [ ] `.km/config.yaml` can override the defaults; fields are optional, not required
- [ ] `km bd config get beads.default_scope` returns 'inbox' on a fresh repo with no config
- [ ] `km bd config get beads.roots` returns ['@km'] on a fresh repo with no config
- [ ] Test: fresh init repo (`mkdir x && cd x && git init && km bd init`) → `km bd create 'foo'` lands at @km/inbox/<short-id>.md AND `km bd ready` lists it
- [ ] Test: same scenario with explicit override config → respects the override
- Related
- @km/beads/create-orphan-must-materialize (P0) — depends on default_scope being defined
- @km/beads/ready-helpful-empty-message (P1) — depends on beads.roots being defined OR helpful error if not
- @km/beads/canonical-ids-switchover — fixes the prefix hardcoding (related to the third config key)

Found 2026-04-29 by user.

2026-04-29 update: per user, `@km/_orphan/` is being renamed to `@km/inbox/` (see @km/beads/rename-orphan-to-inbox). After rename, `@km/inbox/` is the SINGLE landing zone for scope-less beads — both fresh creates AND migration imports go there. No separate _orphan path.

Currently `@km/_orphan/` (1059 files, from migration imports) is conceptually separate from a hypothetical `@km/inbox/` (where bare `km bd create` would land per @km/beads/create-orphan-must-materialize). Per user 2026-04-29: collapse into one landing zone. Pick 'inbox' (more meaningful name; conveys triage intent).

- Acceptance
- [ ] Rename `@km/_orphan/` → `@km/inbox/` (~1059 files; use git mv to preserve history)
- [ ] Update migration code (packages/km-beads/src/migrate.ts) to land scope-less imports at `@km/inbox/<short-id>.md` instead of `@km/_orphan/<short-id>.md`
- [ ] Update CLAUDE.md vault structure docs — currently say '`@km/_orphan/` for bd auto-ids without scope'; replace with '`@km/inbox/` for new quick-captures + scope-less migration imports'
- [ ] Update memory file project-km-bd-canonical-ids.md if it references _orphan
- [ ] Update bead frontmatter `id:` and `aliases:` for the 1059 renamed beads — `@km/_orphan/foo` becomes the alias, `@km/inbox/foo` becomes canonical
- [ ] Wikilinks / cross-references throughout the vault updated: `[[@km/_orphan/foo]]` → `[[@km/inbox/foo]]` (batch refactor, manual review)
- [ ] Acceptance grep: `grep -r '_orphan' @km/ docs/ CLAUDE.md packages/km-beads/` should return only the migration code's backwards-compat alias path
- Pairs with
- @km/beads/create-orphan-must-materialize — when this bead lands, materialize there
- @km/beads/zero-config-defaults — `beads.default_scope='inbox'` becomes the only landing zone, no need for separate _orphan handling

Order: file this rename FIRST (before zero-config-defaults / create-orphan land), so the new code only writes to one location.

Found 2026-04-29 by user.

wt8 agent committed worktree-tool enhancement to bearly's feat/worktree-tool-claimer-status branch (SHA 3d498f8044) but never merged to bearly main or pushed to origin. The km-side commit (5da164d24) bumped vendor/bearly pointer to 3d498f8044 — dangling reference on origin/bearly.

- To finish
5. cd vendor/bearly, switch to feat/worktree-tool-claimer-status, push to origin
6. Merge feat/worktree-tool-claimer-status to bearly main (PR or direct)
7. Push bearly main to origin
8. cd back to km, bump vendor/bearly pointer to bearly main tip
9. Commit km-side bump

The actual work — vendor/bearly/tools/worktree.ts showing pool-slot claimer + agent status from km bd + tribe — is preserved on the bearly feature branch and exists in the wt8 worktree clone.

wt4 agent's commits 5e4509ccf (refactor: wire BeadData schema into read + write paths) and b982f72ce (integration test) reverted packages/km-beads/src/queries.ts to JSON-scan blocked-by edges, conflicting with the deps-table approach landed by deps-schema-plateau. Cherry-picks aborted on conflict; the Zod schema (commit 1, 12fcab99c) was kept since it's purely additive.

- What needs reconciliation

The wt4 refactor used `parseBeadData(row.data) → extractBlockedByTargets(data.props)` which assumes the OLD JSON-scan path. After deps-schema landed, blocked-by edges are queryable directly from the `deps` table — no JSON parse needed.

- To finish
5. Re-implement the data-schema wiring in mutations.ts + deps.ts (take wt4's Zod parse-on-write approach for data integrity)
6. KEEP the deps-table reads in queries.ts (don't revert to JSON scan)
7. Update the integration test (data-schema-integration.test.ts content from b982f72ce) to assert against the deps-table-shaped read path

The wt4 commits live on the wt4 slot branch in case parts are useful as reference.

Adopt the @<prefix>/<scope>/<slug> form everywhere — prose, chat, commit messages, bead notes, wikilinks, frontmatter id (with bd-form aliases for legacy). Companion bug: packages/km-beads/src/short-ids.ts:4 hardcodes const PREFIX = 'km' instead of reading from .km/config.yaml — blocks @<other-prefix>/... working in non-km repos.

- Conventions (verified with user 2026-04-29)
- Conversation/prose/commits/notes: @km/beads/foo
- Wikilinks: [[@km/beads/foo]] — the @ is part of the name, NOT a render-mode hint. Strip it and you point at a different node.
- CLI: km bd show @km/beads/foo (or legacy km-beads.foo via aliases)
- Memories: @mem/<key>
- Scope
- Skill files: .claude/skills/**/*.md (50+ files)
- Project docs: docs/**/*.md, CLAUDE.md, AGENTS.md, README.md
- Per-package READMEs
- Out of scope
- Existing bead frontmatter ids (left as bd-form, aliases handle resolution)
- Old commit messages and PR descriptions (don't rewrite history)
- Acceptance
- short-ids.ts reads prefix from .km/config.yaml (test: pim-prefixed vault produces pim-q5hji not km-q5hji), consumed by km bd's short-id resolver in resolveBead
- All in-tree skill/doc references to bd-form bead ids rewritten to @-path-form (verify: grep -rn 'km-[a-z][a-z0-9-]*\.[a-z]' .claude/skills/ docs/ CLAUDE.md AGENTS.md should return only legitimate package-name false-positives)
- Wikilinks updated: [[@km/scope/slug]] (with @)

In flight on slot wt6 in agent canonical-ids@km-beads-cli-fixes. Track here for closure.

Repro:

```
km bd create 'example title, delete'
# Created issue: km-xvzm — succeeds (good, bd-compat)
```

Then check: file does NOT exist on disk.

```
find @km/ -name '*xvzm*'   # 0 results
git status                 # clean — bead won't ride git transport
```

The event-log entry has `fs_path: null`, `fstype: null`, `parent_id: '.'` (root).

- Why this is a P0 integrity bug
- The bead is **index-only**: lives in .km/state.db and .km/changes.jsonl, but has no markdown file.
- It WON'T survive an index rebuild from disk (`km doctor rebuild` would lose it).
- It WON'T ride normal git transport — peers / clones won't see it.
- It violates the storage-model promise (CLAUDE.md vault structure: "every bead lives at @km/<scope>/<slug>.md").
- Acceptance — keep bd-compat AND fix integrity
- [ ] `km bd create 'title'` (no --id, no --parent) succeeds (bd-compat preserved)
- [ ] The created bead has a real file at `@km/inbox/<short-id>.md` — "inbox" is the default scope for quick-capture/triage flow. NOT `@km/_orphan/` (which is reserved for migration provenance — Asana dumps, legacy bd imports).
- [ ] Default scope is configurable: `beads.default_scope` in `.km/config.yaml` (default value: 'inbox'). Falls back to 'inbox' if config missing.
- [ ] File frontmatter has `aliases: [<short-id>, km-<short-id>]` per the canonical-ids pattern. The path `@km/inbox/<short-id>` IS the canonical id; no separate `id:` line needed in frontmatter.
- [ ] `git status` after a fresh create shows the new file as untracked
- [ ] `@km/inbox/` is created if it doesn't exist (lazy init)
- [ ] Optional UX hint to stderr: 'Note: no scope — landed at @km/inbox. Use --parent @km/<scope> to file directly under a scope.' (non-fatal, additive)
- Related — pairs with these threads
- `beads.roots` config should include `@km/inbox` by default so `km bd ready` (bare) surfaces inbox-pending work — see @km/beads/ready-helpful-empty-message
- @km/beads/list-json-malformed — another integrity bug
- @km/beads/canonical-ids-switchover — frontmatter `id:` is redundant when path matches; only `aliases:` need to be explicit

Do NOT add a hard error / require --orphan flag — that diverges from bd compatibility (bd's design intent is quick-capture).

Found 2026-04-29 by user testing in main session.

2026-04-29 update: `@km/_orphan/` is being collapsed into `@km/inbox/` (see @km/beads/rename-orphan-to-inbox). This bead's acceptance now references `@km/inbox/` only. There is no separate _orphan path.

Today's km bd commands silently no-op or produce ghosts when `.km/config.yaml` lacks `beads.default_scope` and `beads.roots` — see thread of bugs found 2026-04-29.

- Required defaults (hard-coded in CLI)

| Config key          | Default                            | Used by                                                                                           |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| beads.default_scope | inbox                              | km bd create when no --parent → file lands at @km/inbox/<short-id>.md                             |
| beads.roots         | ['@km']                            | km bd ready (bare), km bd list (default scope filter), other board-aware commands                 |
| beads.prefix        | (already from .km/config.yaml: km) | short-id generation; see project-km-bd-canonical-ids.md and km-beads.short-ids-prefix-from-config |

- Why this is P0
- Bare `km bd create 'title'` produces an index-only ghost (see @km/beads/create-orphan-must-materialize)
- Bare `km bd ready` silently returns 0 results (see @km/beads/ready-helpful-empty-message)
- New users / new repos / fresh clones hit broken behavior before they know to configure
- Acceptance
- [ ] CLI has hard-coded defaults for `beads.default_scope` ('inbox') and `beads.roots` (['@km']), used by km bd commands when config is silent on these keys
- [ ] `.km/config.yaml` can override the defaults; fields are optional, not required
- [ ] `km bd config get beads.default_scope` returns 'inbox' on a fresh repo with no config
- [ ] `km bd config get beads.roots` returns ['@km'] on a fresh repo with no config
- [ ] Test: fresh init repo (`mkdir x && cd x && git init && km bd init`) → `km bd create 'foo'` lands at @km/inbox/<short-id>.md AND `km bd ready` lists it
- [ ] Test: same scenario with explicit override config → respects the override
- Related
- @km/beads/create-orphan-must-materialize (P0) — depends on default_scope being defined
- @km/beads/ready-helpful-empty-message (P1) — depends on beads.roots being defined OR helpful error if not
- @km/beads/canonical-ids-switchover — fixes the prefix hardcoding (related to the third config key)

Found 2026-04-29 by user.

2026-04-29 update: per user, `@km/_orphan/` is being renamed to `@km/inbox/` (see @km/beads/rename-orphan-to-inbox). After rename, `@km/inbox/` is the SINGLE landing zone for scope-less beads — both fresh creates AND migration imports go there. No separate _orphan path.

Currently `@km/_orphan/` (1059 files, from migration imports) is conceptually separate from a hypothetical `@km/inbox/` (where bare `km bd create` would land per @km/beads/create-orphan-must-materialize). Per user 2026-04-29: collapse into one landing zone. Pick 'inbox' (more meaningful name; conveys triage intent).

- Acceptance
- [ ] Rename `@km/_orphan/` → `@km/inbox/` (~1059 files; use git mv to preserve history)
- [ ] Update migration code (packages/km-beads/src/migrate.ts) to land scope-less imports at `@km/inbox/<short-id>.md` instead of `@km/_orphan/<short-id>.md`
- [ ] Update CLAUDE.md vault structure docs — currently say '`@km/_orphan/` for bd auto-ids without scope'; replace with '`@km/inbox/` for new quick-captures + scope-less migration imports'
- [ ] Update memory file project-km-bd-canonical-ids.md if it references _orphan
- [ ] Update bead frontmatter `id:` and `aliases:` for the 1059 renamed beads — `@km/_orphan/foo` becomes the alias, `@km/inbox/foo` becomes canonical
- [ ] Wikilinks / cross-references throughout the vault updated: `[[@km/_orphan/foo]]` → `[[@km/inbox/foo]]` (batch refactor, manual review)
- [ ] Acceptance grep: `grep -r '_orphan' @km/ docs/ CLAUDE.md packages/km-beads/` should return only the migration code's backwards-compat alias path
- Pairs with
- @km/beads/create-orphan-must-materialize — when this bead lands, materialize there
- @km/beads/zero-config-defaults — `beads.default_scope='inbox'` becomes the only landing zone, no need for separate _orphan handling

Order: file this rename FIRST (before zero-config-defaults / create-orphan land), so the new code only writes to one location.

Found 2026-04-29 by user.

wt8 agent committed worktree-tool enhancement to bearly's feat/worktree-tool-claimer-status branch (SHA 3d498f8044) but never merged to bearly main or pushed to origin. The km-side commit (5da164d24) bumped vendor/bearly pointer to 3d498f8044 — dangling reference on origin/bearly.

- To finish
6. cd vendor/bearly, switch to feat/worktree-tool-claimer-status, push to origin
7. Merge feat/worktree-tool-claimer-status to bearly main (PR or direct)
8. Push bearly main to origin
9. cd back to km, bump vendor/bearly pointer to bearly main tip
10. Commit km-side bump

The actual work — vendor/bearly/tools/worktree.ts showing pool-slot claimer + agent status from km bd + tribe — is preserved on the bearly feature branch and exists in the wt8 worktree clone.

wt4 agent's commits 5e4509ccf (refactor: wire BeadData schema into read + write paths) and b982f72ce (integration test) reverted packages/km-beads/src/queries.ts to JSON-scan blocked-by edges, conflicting with the deps-table approach landed by deps-schema-plateau. Cherry-picks aborted on conflict; the Zod schema (commit 1, 12fcab99c) was kept since it's purely additive.

- What needs reconciliation

The wt4 refactor used `parseBeadData(row.data) → extractBlockedByTargets(data.props)` which assumes the OLD JSON-scan path. After deps-schema landed, blocked-by edges are queryable directly from the `deps` table — no JSON parse needed.

- To finish
6. Re-implement the data-schema wiring in mutations.ts + deps.ts (take wt4's Zod parse-on-write approach for data integrity)
7. KEEP the deps-table reads in queries.ts (don't revert to JSON scan)
8. Update the integration test (data-schema-integration.test.ts content from b982f72ce) to assert against the deps-table-shaped read path

The wt4 commits live on the wt4 slot branch in case parts are useful as reference.

Adopt the @<prefix>/<scope>/<slug> form everywhere — prose, chat, commit messages, bead notes, wikilinks, frontmatter id (with bd-form aliases for legacy). Companion bug: packages/km-beads/src/short-ids.ts:4 hardcodes const PREFIX = 'km' instead of reading from .km/config.yaml — blocks @<other-prefix>/... working in non-km repos.

- Conventions (verified with user 2026-04-29)
- Conversation/prose/commits/notes: @km/beads/foo
- Wikilinks: [[@km/beads/foo]] — the @ is part of the name, NOT a render-mode hint. Strip it and you point at a different node.
- CLI: km bd show @km/beads/foo (or legacy km-beads.foo via aliases)
- Memories: @mem/<key>
- Scope
- Skill files: .claude/skills/**/*.md (50+ files)
- Project docs: docs/**/*.md, CLAUDE.md, AGENTS.md, README.md
- Per-package READMEs
- Out of scope
- Existing bead frontmatter ids (left as bd-form, aliases handle resolution)
- Old commit messages and PR descriptions (don't rewrite history)
- Acceptance
- short-ids.ts reads prefix from .km/config.yaml (test: pim-prefixed vault produces pim-q5hji not km-q5hji), consumed by km bd's short-id resolver in resolveBead
- All in-tree skill/doc references to bd-form bead ids rewritten to @-path-form (verify: grep -rn 'km-[a-z][a-z0-9-]*\.[a-z]' .claude/skills/ docs/ CLAUDE.md AGENTS.md should return only legitimate package-name false-positives)
- Wikilinks updated: [[@km/scope/slug]] (with @)

In flight on slot wt6 in agent canonical-ids@km-beads-cli-fixes. Track here for closure.

Repro:

```
km bd create 'example title, delete'
# Created issue: km-xvzm — succeeds (good, bd-compat)
```

Then check: file does NOT exist on disk.

```
find @km/ -name '*xvzm*'   # 0 results
git status                 # clean — bead won't ride git transport
```

The event-log entry has `fs_path: null`, `fstype: null`, `parent_id: '.'` (root).

- Why this is a P0 integrity bug
- The bead is **index-only**: lives in .km/state.db and .km/changes.jsonl, but has no markdown file.
- It WON'T survive an index rebuild from disk (`km doctor rebuild` would lose it).
- It WON'T ride normal git transport — peers / clones won't see it.
- It violates the storage-model promise (CLAUDE.md vault structure: "every bead lives at @km/<scope>/<slug>.md").
- Acceptance — keep bd-compat AND fix integrity
- [ ] `km bd create 'title'` (no --id, no --parent) succeeds (bd-compat preserved)
- [ ] The created bead has a real file at `@km/inbox/<short-id>.md` — "inbox" is the default scope for quick-capture/triage flow. NOT `@km/_orphan/` (which is reserved for migration provenance — Asana dumps, legacy bd imports).
- [ ] Default scope is configurable: `beads.default_scope` in `.km/config.yaml` (default value: 'inbox'). Falls back to 'inbox' if config missing.
- [ ] File frontmatter has `aliases: [<short-id>, km-<short-id>]` per the canonical-ids pattern. The path `@km/inbox/<short-id>` IS the canonical id; no separate `id:` line needed in frontmatter.
- [ ] `git status` after a fresh create shows the new file as untracked
- [ ] `@km/inbox/` is created if it doesn't exist (lazy init)
- [ ] Optional UX hint to stderr: 'Note: no scope — landed at @km/inbox. Use --parent @km/<scope> to file directly under a scope.' (non-fatal, additive)
- Related — pairs with these threads
- `beads.roots` config should include `@km/inbox` by default so `km bd ready` (bare) surfaces inbox-pending work — see @km/beads/ready-helpful-empty-message
- @km/beads/list-json-malformed — another integrity bug
- @km/beads/canonical-ids-switchover — frontmatter `id:` is redundant when path matches; only `aliases:` need to be explicit

Do NOT add a hard error / require --orphan flag — that diverges from bd compatibility (bd's design intent is quick-capture).

Found 2026-04-29 by user testing in main session.

2026-04-29 update: `@km/_orphan/` is being collapsed into `@km/inbox/` (see @km/beads/rename-orphan-to-inbox). This bead's acceptance now references `@km/inbox/` only. There is no separate _orphan path.

Today's km bd commands silently no-op or produce ghosts when `.km/config.yaml` lacks `beads.default_scope` and `beads.roots` — see thread of bugs found 2026-04-29.

- Required defaults (hard-coded in CLI)

| Config key          | Default                            | Used by                                                                                           |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| beads.default_scope | inbox                              | km bd create when no --parent → file lands at @km/inbox/<short-id>.md                             |
| beads.roots         | ['@km']                            | km bd ready (bare), km bd list (default scope filter), other board-aware commands                 |
| beads.prefix        | (already from .km/config.yaml: km) | short-id generation; see project-km-bd-canonical-ids.md and km-beads.short-ids-prefix-from-config |

- Why this is P0
- Bare `km bd create 'title'` produces an index-only ghost (see @km/beads/create-orphan-must-materialize)
- Bare `km bd ready` silently returns 0 results (see @km/beads/ready-helpful-empty-message)
- New users / new repos / fresh clones hit broken behavior before they know to configure
- Acceptance
- [ ] CLI has hard-coded defaults for `beads.default_scope` ('inbox') and `beads.roots` (['@km']), used by km bd commands when config is silent on these keys
- [ ] `.km/config.yaml` can override the defaults; fields are optional, not required
- [ ] `km bd config get beads.default_scope` returns 'inbox' on a fresh repo with no config
- [ ] `km bd config get beads.roots` returns ['@km'] on a fresh repo with no config
- [ ] Test: fresh init repo (`mkdir x && cd x && git init && km bd init`) → `km bd create 'foo'` lands at @km/inbox/<short-id>.md AND `km bd ready` lists it
- [ ] Test: same scenario with explicit override config → respects the override
- Related
- @km/beads/create-orphan-must-materialize (P0) — depends on default_scope being defined
- @km/beads/ready-helpful-empty-message (P1) — depends on beads.roots being defined OR helpful error if not
- @km/beads/canonical-ids-switchover — fixes the prefix hardcoding (related to the third config key)

Found 2026-04-29 by user.

2026-04-29 update: per user, `@km/_orphan/` is being renamed to `@km/inbox/` (see @km/beads/rename-orphan-to-inbox). After rename, `@km/inbox/` is the SINGLE landing zone for scope-less beads — both fresh creates AND migration imports go there. No separate _orphan path.

Currently `@km/_orphan/` (1059 files, from migration imports) is conceptually separate from a hypothetical `@km/inbox/` (where bare `km bd create` would land per @km/beads/create-orphan-must-materialize). Per user 2026-04-29: collapse into one landing zone. Pick 'inbox' (more meaningful name; conveys triage intent).

- Acceptance
- [ ] Rename `@km/_orphan/` → `@km/inbox/` (~1059 files; use git mv to preserve history)
- [ ] Update migration code (packages/km-beads/src/migrate.ts) to land scope-less imports at `@km/inbox/<short-id>.md` instead of `@km/_orphan/<short-id>.md`
- [ ] Update CLAUDE.md vault structure docs — currently say '`@km/_orphan/` for bd auto-ids without scope'; replace with '`@km/inbox/` for new quick-captures + scope-less migration imports'
- [ ] Update memory file project-km-bd-canonical-ids.md if it references _orphan
- [ ] Update bead frontmatter `id:` and `aliases:` for the 1059 renamed beads — `@km/_orphan/foo` becomes the alias, `@km/inbox/foo` becomes canonical
- [ ] Wikilinks / cross-references throughout the vault updated: `[[@km/_orphan/foo]]` → `[[@km/inbox/foo]]` (batch refactor, manual review)
- [ ] Acceptance grep: `grep -r '_orphan' @km/ docs/ CLAUDE.md packages/km-beads/` should return only the migration code's backwards-compat alias path
- Pairs with
- @km/beads/create-orphan-must-materialize — when this bead lands, materialize there
- @km/beads/zero-config-defaults — `beads.default_scope='inbox'` becomes the only landing zone, no need for separate _orphan handling

Order: file this rename FIRST (before zero-config-defaults / create-orphan land), so the new code only writes to one location.

Found 2026-04-29 by user.

wt8 agent committed worktree-tool enhancement to bearly's feat/worktree-tool-claimer-status branch (SHA 3d498f8044) but never merged to bearly main or pushed to origin. The km-side commit (5da164d24) bumped vendor/bearly pointer to 3d498f8044 — dangling reference on origin/bearly.

- To finish
7. cd vendor/bearly, switch to feat/worktree-tool-claimer-status, push to origin
8. Merge feat/worktree-tool-claimer-status to bearly main (PR or direct)
9. Push bearly main to origin
10. cd back to km, bump vendor/bearly pointer to bearly main tip
11. Commit km-side bump

The actual work — vendor/bearly/tools/worktree.ts showing pool-slot claimer + agent status from km bd + tribe — is preserved on the bearly feature branch and exists in the wt8 worktree clone.

Adopt the @<prefix>/<scope>/<slug> form everywhere — prose, chat, commit messages, bead notes, wikilinks, frontmatter id (with bd-form aliases for legacy). Companion bug: packages/km-beads/src/short-ids.ts:4 hardcodes const PREFIX = 'km' instead of reading from .km/config.yaml — blocks @<other-prefix>/... working in non-km repos.

- Conventions (verified with user 2026-04-29)
- Conversation/prose/commits/notes: @km/beads/foo
- Wikilinks: [[@km/beads/foo]] — the @ is part of the name, NOT a render-mode hint. Strip it and you point at a different node.
- CLI: km bd show @km/beads/foo (or legacy km-beads.foo via aliases)
- Memories: @mem/<key>
- Scope
- Skill files: .claude/skills/**/*.md (50+ files)
- Project docs: docs/**/*.md, CLAUDE.md, AGENTS.md, README.md
- Per-package READMEs
- Out of scope
- Existing bead frontmatter ids (left as bd-form, aliases handle resolution)
- Old commit messages and PR descriptions (don't rewrite history)
- Acceptance
- short-ids.ts reads prefix from .km/config.yaml (test: pim-prefixed vault produces pim-q5hji not km-q5hji), consumed by km bd's short-id resolver in resolveBead
- All in-tree skill/doc references to bd-form bead ids rewritten to @-path-form (verify: grep -rn 'km-[a-z][a-z0-9-]*\.[a-z]' .claude/skills/ docs/ CLAUDE.md AGENTS.md should return only legitimate package-name false-positives)
- Wikilinks updated: [[@km/scope/slug]] (with @)

In flight on slot wt6 in agent canonical-ids@km-beads-cli-fixes. Track here for closure.

Repro:

```
km bd create 'example title, delete'
# Created issue: km-xvzm — succeeds (good, bd-compat)
```

Then check: file does NOT exist on disk.

```
find @km/ -name '*xvzm*'   # 0 results
git status                 # clean — bead won't ride git transport
```

The event-log entry has `fs_path: null`, `fstype: null`, `parent_id: '.'` (root).

- Why this is a P0 integrity bug
- The bead is **index-only**: lives in .km/state.db and .km/changes.jsonl, but has no markdown file.
- It WON'T survive an index rebuild from disk (`km doctor rebuild` would lose it).
- It WON'T ride normal git transport — peers / clones won't see it.
- It violates the storage-model promise (CLAUDE.md vault structure: "every bead lives at @km/<scope>/<slug>.md").
- Acceptance — keep bd-compat AND fix integrity
- [ ] `km bd create 'title'` (no --id, no --parent) succeeds (bd-compat preserved)
- [ ] The created bead has a real file at `@km/inbox/<short-id>.md` — "inbox" is the default scope for quick-capture/triage flow. NOT `@km/_orphan/` (which is reserved for migration provenance — Asana dumps, legacy bd imports).
- [ ] Default scope is configurable: `beads.default_scope` in `.km/config.yaml` (default value: 'inbox'). Falls back to 'inbox' if config missing.
- [ ] File frontmatter has `aliases: [<short-id>, km-<short-id>]` per the canonical-ids pattern. The path `@km/inbox/<short-id>` IS the canonical id; no separate `id:` line needed in frontmatter.
- [ ] `git status` after a fresh create shows the new file as untracked
- [ ] `@km/inbox/` is created if it doesn't exist (lazy init)
- [ ] Optional UX hint to stderr: 'Note: no scope — landed at @km/inbox. Use --parent @km/<scope> to file directly under a scope.' (non-fatal, additive)
- Related — pairs with these threads
- `beads.roots` config should include `@km/inbox` by default so `km bd ready` (bare) surfaces inbox-pending work — see @km/beads/ready-helpful-empty-message
- @km/beads/list-json-malformed — another integrity bug
- @km/beads/canonical-ids-switchover — frontmatter `id:` is redundant when path matches; only `aliases:` need to be explicit

Do NOT add a hard error / require --orphan flag — that diverges from bd compatibility (bd's design intent is quick-capture).

Found 2026-04-29 by user testing in main session.

2026-04-29 update: `@km/_orphan/` is being collapsed into `@km/inbox/` (see @km/beads/rename-orphan-to-inbox). This bead's acceptance now references `@km/inbox/` only. There is no separate _orphan path.

Today's km bd commands silently no-op or produce ghosts when `.km/config.yaml` lacks `beads.default_scope` and `beads.roots` — see thread of bugs found 2026-04-29.

- Required defaults (hard-coded in CLI)

| Config key          | Default                            | Used by                                                                                           |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| beads.default_scope | inbox                              | km bd create when no --parent → file lands at @km/inbox/<short-id>.md                             |
| beads.roots         | ['@km']                            | km bd ready (bare), km bd list (default scope filter), other board-aware commands                 |
| beads.prefix        | (already from .km/config.yaml: km) | short-id generation; see project-km-bd-canonical-ids.md and km-beads.short-ids-prefix-from-config |

- Why this is P0
- Bare `km bd create 'title'` produces an index-only ghost (see @km/beads/create-orphan-must-materialize)
- Bare `km bd ready` silently returns 0 results (see @km/beads/ready-helpful-empty-message)
- New users / new repos / fresh clones hit broken behavior before they know to configure
- Acceptance
- [ ] CLI has hard-coded defaults for `beads.default_scope` ('inbox') and `beads.roots` (['@km']), used by km bd commands when config is silent on these keys
- [ ] `.km/config.yaml` can override the defaults; fields are optional, not required
- [ ] `km bd config get beads.default_scope` returns 'inbox' on a fresh repo with no config
- [ ] `km bd config get beads.roots` returns ['@km'] on a fresh repo with no config
- [ ] Test: fresh init repo (`mkdir x && cd x && git init && km bd init`) → `km bd create 'foo'` lands at @km/inbox/<short-id>.md AND `km bd ready` lists it
- [ ] Test: same scenario with explicit override config → respects the override
- Related
- @km/beads/create-orphan-must-materialize (P0) — depends on default_scope being defined
- @km/beads/ready-helpful-empty-message (P1) — depends on beads.roots being defined OR helpful error if not
- @km/beads/canonical-ids-switchover — fixes the prefix hardcoding (related to the third config key)

Found 2026-04-29 by user.

2026-04-29 update: per user, `@km/_orphan/` is being renamed to `@km/inbox/` (see @km/beads/rename-orphan-to-inbox). After rename, `@km/inbox/` is the SINGLE landing zone for scope-less beads — both fresh creates AND migration imports go there. No separate _orphan path.

Currently `@km/_orphan/` (1059 files, from migration imports) is conceptually separate from a hypothetical `@km/inbox/` (where bare `km bd create` would land per @km/beads/create-orphan-must-materialize). Per user 2026-04-29: collapse into one landing zone. Pick 'inbox' (more meaningful name; conveys triage intent).

- Acceptance
- [ ] Rename `@km/_orphan/` → `@km/inbox/` (~1059 files; use git mv to preserve history)
- [ ] Update migration code (packages/km-beads/src/migrate.ts) to land scope-less imports at `@km/inbox/<short-id>.md` instead of `@km/_orphan/<short-id>.md`
- [ ] Update CLAUDE.md vault structure docs — currently say '`@km/_orphan/` for bd auto-ids without scope'; replace with '`@km/inbox/` for new quick-captures + scope-less migration imports'
- [ ] Update memory file project-km-bd-canonical-ids.md if it references _orphan
- [ ] Update bead frontmatter `id:` and `aliases:` for the 1059 renamed beads — `@km/_orphan/foo` becomes the alias, `@km/inbox/foo` becomes canonical
- [ ] Wikilinks / cross-references throughout the vault updated: `[[@km/_orphan/foo]]` → `[[@km/inbox/foo]]` (batch refactor, manual review)
- [ ] Acceptance grep: `grep -r '_orphan' @km/ docs/ CLAUDE.md packages/km-beads/` should return only the migration code's backwards-compat alias path
- Pairs with
- @km/beads/create-orphan-must-materialize — when this bead lands, materialize there
- @km/beads/zero-config-defaults — `beads.default_scope='inbox'` becomes the only landing zone, no need for separate _orphan handling

Order: file this rename FIRST (before zero-config-defaults / create-orphan land), so the new code only writes to one location.

Found 2026-04-29 by user.

wt8 agent committed worktree-tool enhancement to bearly's feat/worktree-tool-claimer-status branch (SHA 3d498f8044) but never merged to bearly main or pushed to origin. The km-side commit (5da164d24) bumped vendor/bearly pointer to 3d498f8044 — dangling reference on origin/bearly.

- To finish
8. cd vendor/bearly, switch to feat/worktree-tool-claimer-status, push to origin
9. Merge feat/worktree-tool-claimer-status to bearly main (PR or direct)
10. Push bearly main to origin
11. cd back to km, bump vendor/bearly pointer to bearly main tip
12. Commit km-side bump

The actual work — vendor/bearly/tools/worktree.ts showing pool-slot claimer + agent status from km bd + tribe — is preserved on the bearly feature branch and exists in the wt8 worktree clone.

Adopt the @<prefix>/<scope>/<slug> form everywhere — prose, chat, commit messages, bead notes, wikilinks, frontmatter id (with bd-form aliases for legacy). Companion bug: packages/km-beads/src/short-ids.ts:4 hardcodes const PREFIX = 'km' instead of reading from .km/config.yaml — blocks @<other-prefix>/... working in non-km repos.

- Conventions (verified with user 2026-04-29)
- Conversation/prose/commits/notes: @km/beads/foo
- Wikilinks: [[@km/beads/foo]] — the @ is part of the name, NOT a render-mode hint. Strip it and you point at a different node.
- CLI: km bd show @km/beads/foo (or legacy km-beads.foo via aliases)
- Memories: @mem/<key>
- Scope
- Skill files: .claude/skills/**/*.md (50+ files)
- Project docs: docs/**/*.md, CLAUDE.md, AGENTS.md, README.md
- Per-package READMEs
- Out of scope
- Existing bead frontmatter ids (left as bd-form, aliases handle resolution)
- Old commit messages and PR descriptions (don't rewrite history)
- Acceptance
- short-ids.ts reads prefix from .km/config.yaml (test: pim-prefixed vault produces pim-q5hji not km-q5hji), consumed by km bd's short-id resolver in resolveBead
- All in-tree skill/doc references to bd-form bead ids rewritten to @-path-form (verify: grep -rn 'km-[a-z][a-z0-9-]*\.[a-z]' .claude/skills/ docs/ CLAUDE.md AGENTS.md should return only legitimate package-name false-positives)
- Wikilinks updated: [[@km/scope/slug]] (with @)

In flight on slot wt6 in agent canonical-ids@km-beads-cli-fixes. Track here for closure.

Repro:

```
km bd create 'example title, delete'
# Created issue: km-xvzm — succeeds (good, bd-compat)
```

Then check: file does NOT exist on disk.

```
find @km/ -name '*xvzm*'   # 0 results
git status                 # clean — bead won't ride git transport
```

The event-log entry has `fs_path: null`, `fstype: null`, `parent_id: '.'` (root).

- Why this is a P0 integrity bug
- The bead is **index-only**: lives in .km/state.db and .km/changes.jsonl, but has no markdown file.
- It WON'T survive an index rebuild from disk (`km doctor rebuild` would lose it).
- It WON'T ride normal git transport — peers / clones won't see it.
- It violates the storage-model promise (CLAUDE.md vault structure: "every bead lives at @km/<scope>/<slug>.md").
- Acceptance — keep bd-compat AND fix integrity
- [ ] `km bd create 'title'` (no --id, no --parent) succeeds (bd-compat preserved)
- [ ] The created bead has a real file at `@km/inbox/<short-id>.md` — "inbox" is the default scope for quick-capture/triage flow. NOT `@km/_orphan/` (which is reserved for migration provenance — Asana dumps, legacy bd imports).
- [ ] Default scope is configurable: `beads.default_scope` in `.km/config.yaml` (default value: 'inbox'). Falls back to 'inbox' if config missing.
- [ ] File frontmatter has `aliases: [<short-id>, km-<short-id>]` per the canonical-ids pattern. The path `@km/inbox/<short-id>` IS the canonical id; no separate `id:` line needed in frontmatter.
- [ ] `git status` after a fresh create shows the new file as untracked
- [ ] `@km/inbox/` is created if it doesn't exist (lazy init)
- [ ] Optional UX hint to stderr: 'Note: no scope — landed at @km/inbox. Use --parent @km/<scope> to file directly under a scope.' (non-fatal, additive)
- Related — pairs with these threads
- `beads.roots` config should include `@km/inbox` by default so `km bd ready` (bare) surfaces inbox-pending work — see @km/beads/ready-helpful-empty-message
- @km/beads/list-json-malformed — another integrity bug
- @km/beads/canonical-ids-switchover — frontmatter `id:` is redundant when path matches; only `aliases:` need to be explicit

Do NOT add a hard error / require --orphan flag — that diverges from bd compatibility (bd's design intent is quick-capture).

Found 2026-04-29 by user testing in main session.

Today's km bd commands silently no-op or produce ghosts when `.km/config.yaml` lacks `beads.default_scope` and `beads.roots` — see thread of bugs found 2026-04-29.

- Required defaults (hard-coded in CLI)

| Config key          | Default                            | Used by                                                                                           |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| beads.default_scope | inbox                              | km bd create when no --parent → file lands at @km/inbox/<short-id>.md                             |
| beads.roots         | ['@km']                            | km bd ready (bare), km bd list (default scope filter), other board-aware commands                 |
| beads.prefix        | (already from .km/config.yaml: km) | short-id generation; see project-km-bd-canonical-ids.md and km-beads.short-ids-prefix-from-config |

- Why this is P0
- Bare `km bd create 'title'` produces an index-only ghost (see @km/beads/create-orphan-must-materialize)
- Bare `km bd ready` silently returns 0 results (see @km/beads/ready-helpful-empty-message)
- New users / new repos / fresh clones hit broken behavior before they know to configure
- Acceptance
- [ ] CLI has hard-coded defaults for `beads.default_scope` ('inbox') and `beads.roots` (['@km']), used by km bd commands when config is silent on these keys
- [ ] `.km/config.yaml` can override the defaults; fields are optional, not required
- [ ] `km bd config get beads.default_scope` returns 'inbox' on a fresh repo with no config
- [ ] `km bd config get beads.roots` returns ['@km'] on a fresh repo with no config
- [ ] Test: fresh init repo (`mkdir x && cd x && git init && km bd init`) → `km bd create 'foo'` lands at @km/inbox/<short-id>.md AND `km bd ready` lists it
- [ ] Test: same scenario with explicit override config → respects the override
- Related
- @km/beads/create-orphan-must-materialize (P0) — depends on default_scope being defined
- @km/beads/ready-helpful-empty-message (P1) — depends on beads.roots being defined OR helpful error if not
- @km/beads/canonical-ids-switchover — fixes the prefix hardcoding (related to the third config key)

Found 2026-04-29 by user.

2026-04-29 update: per user, `@km/_orphan/` is being renamed to `@km/inbox/` (see @km/beads/rename-orphan-to-inbox). After rename, `@km/inbox/` is the SINGLE landing zone for scope-less beads — both fresh creates AND migration imports go there. No separate _orphan path.

Currently `@km/_orphan/` (1059 files, from migration imports) is conceptually separate from a hypothetical `@km/inbox/` (where bare `km bd create` would land per @km/beads/create-orphan-must-materialize). Per user 2026-04-29: collapse into one landing zone. Pick 'inbox' (more meaningful name; conveys triage intent).

- Acceptance
- [ ] Rename `@km/_orphan/` → `@km/inbox/` (~1059 files; use git mv to preserve history)
- [ ] Update migration code (packages/km-beads/src/migrate.ts) to land scope-less imports at `@km/inbox/<short-id>.md` instead of `@km/_orphan/<short-id>.md`
- [ ] Update CLAUDE.md vault structure docs — currently say '`@km/_orphan/` for bd auto-ids without scope'; replace with '`@km/inbox/` for new quick-captures + scope-less migration imports'
- [ ] Update memory file project-km-bd-canonical-ids.md if it references _orphan
- [ ] Update bead frontmatter `id:` and `aliases:` for the 1059 renamed beads — `@km/_orphan/foo` becomes the alias, `@km/inbox/foo` becomes canonical
- [ ] Wikilinks / cross-references throughout the vault updated: `[[@km/_orphan/foo]]` → `[[@km/inbox/foo]]` (batch refactor, manual review)
- [ ] Acceptance grep: `grep -r '_orphan' @km/ docs/ CLAUDE.md packages/km-beads/` should return only the migration code's backwards-compat alias path
- Pairs with
- @km/beads/create-orphan-must-materialize — when this bead lands, materialize there
- @km/beads/zero-config-defaults — `beads.default_scope='inbox'` becomes the only landing zone, no need for separate _orphan handling

Order: file this rename FIRST (before zero-config-defaults / create-orphan land), so the new code only writes to one location.

Found 2026-04-29 by user.

Adopt the @<prefix>/<scope>/<slug> form everywhere — prose, chat, commit messages, bead notes, wikilinks, frontmatter id (with bd-form aliases for legacy). Companion bug: packages/km-beads/src/short-ids.ts:4 hardcodes const PREFIX = 'km' instead of reading from .km/config.yaml — blocks @<other-prefix>/... working in non-km repos.

- Conventions (verified with user 2026-04-29)
- Conversation/prose/commits/notes: @km/beads/foo
- Wikilinks: [[@km/beads/foo]] — the @ is part of the name, NOT a render-mode hint. Strip it and you point at a different node.
- CLI: km bd show @km/beads/foo (or legacy km-beads.foo via aliases)
- Memories: @mem/<key>
- Scope
- Skill files: .claude/skills/**/*.md (50+ files)
- Project docs: docs/**/*.md, CLAUDE.md, AGENTS.md, README.md
- Per-package READMEs
- Out of scope
- Existing bead frontmatter ids (left as bd-form, aliases handle resolution)
- Old commit messages and PR descriptions (don't rewrite history)
- Acceptance
- short-ids.ts reads prefix from .km/config.yaml (test: pim-prefixed vault produces pim-q5hji not km-q5hji), consumed by km bd's short-id resolver in resolveBead
- All in-tree skill/doc references to bd-form bead ids rewritten to @-path-form (verify: grep -rn 'km-[a-z][a-z0-9-]*\.[a-z]' .claude/skills/ docs/ CLAUDE.md AGENTS.md should return only legitimate package-name false-positives)
- Wikilinks updated: [[@km/scope/slug]] (with @)

In flight on slot wt6 in agent canonical-ids@km-beads-cli-fixes. Track here for closure.

Repro:

```
km bd create 'example title, delete'
# Created issue: km-xvzm — succeeds (good, bd-compat)
```

Then check: file does NOT exist on disk.

```
find @km/ -name '*xvzm*'   # 0 results
git status                 # clean — bead won't ride git transport
```

The event-log entry has `fs_path: null`, `fstype: null`, `parent_id: '.'` (root).

- Why this is a P0 integrity bug
- The bead is **index-only**: lives in .km/state.db and .km/changes.jsonl, but has no markdown file.
- It WON'T survive an index rebuild from disk (`km doctor rebuild` would lose it).
- It WON'T ride normal git transport — peers / clones won't see it.
- It violates the storage-model promise (CLAUDE.md vault structure: "every bead lives at @km/<scope>/<slug>.md").
- Acceptance — keep bd-compat AND fix integrity
- [ ] `km bd create 'title'` (no --id, no --parent) succeeds (bd-compat preserved)
- [ ] The created bead has a real file at `@km/inbox/<short-id>.md` — "inbox" is the default scope for quick-capture/triage flow. NOT `@km/_orphan/` (which is reserved for migration provenance — Asana dumps, legacy bd imports).
- [ ] Default scope is configurable: `beads.default_scope` in `.km/config.yaml` (default value: 'inbox'). Falls back to 'inbox' if config missing.
- [ ] File frontmatter has `aliases: [<short-id>, km-<short-id>]` per the canonical-ids pattern. The path `@km/inbox/<short-id>` IS the canonical id; no separate `id:` line needed in frontmatter.
- [ ] `git status` after a fresh create shows the new file as untracked
- [ ] `@km/inbox/` is created if it doesn't exist (lazy init)
- [ ] Optional UX hint to stderr: 'Note: no scope — landed at @km/inbox. Use --parent @km/<scope> to file directly under a scope.' (non-fatal, additive)
- Related — pairs with these threads
- `beads.roots` config should include `@km/inbox` by default so `km bd ready` (bare) surfaces inbox-pending work — see @km/beads/ready-helpful-empty-message
- @km/beads/list-json-malformed — another integrity bug
- @km/beads/canonical-ids-switchover — frontmatter `id:` is redundant when path matches; only `aliases:` need to be explicit

Do NOT add a hard error / require --orphan flag — that diverges from bd compatibility (bd's design intent is quick-capture).

Found 2026-04-29 by user testing in main session.

Adopt the @<prefix>/<scope>/<slug> form everywhere — prose, chat, commit messages, bead notes, wikilinks, frontmatter id (with bd-form aliases for legacy). Companion bug: packages/km-beads/src/short-ids.ts:4 hardcodes const PREFIX = 'km' instead of reading from .km/config.yaml — blocks @<other-prefix>/... working in non-km repos.

- Conventions (verified with user 2026-04-29)
- Conversation/prose/commits/notes: @km/beads/foo
- Wikilinks: [[@km/beads/foo]] — the @ is part of the name, NOT a render-mode hint. Strip it and you point at a different node.
- CLI: km bd show @km/beads/foo (or legacy km-beads.foo via aliases)
- Memories: @mem/<key>
- Scope
- Skill files: .claude/skills/**/*.md (50+ files)
- Project docs: docs/**/*.md, CLAUDE.md, AGENTS.md, README.md
- Per-package READMEs
- Out of scope
- Existing bead frontmatter ids (left as bd-form, aliases handle resolution)
- Old commit messages and PR descriptions (don't rewrite history)
- Acceptance
- short-ids.ts reads prefix from .km/config.yaml (test: pim-prefixed vault produces pim-q5hji not km-q5hji), consumed by km bd's short-id resolver in resolveBead
- All in-tree skill/doc references to bd-form bead ids rewritten to @-path-form (verify: grep -rn 'km-[a-z][a-z0-9-]*\.[a-z]' .claude/skills/ docs/ CLAUDE.md AGENTS.md should return only legitimate package-name false-positives)
- Wikilinks updated: [[@km/scope/slug]] (with @)

In flight on slot wt6 in agent canonical-ids@km-beads-cli-fixes. Track here for closure.

Repro:

```
km bd create 'example title, delete'
# Created issue: km-xvzm — succeeds (good, bd-compat)
```

Then check: file does NOT exist on disk.

```
find @km/ -name '*xvzm*'   # 0 results
git status                 # clean — bead won't ride git transport
```

The event-log entry has `fs_path: null`, `fstype: null`, `parent_id: '.'` (root).

- Why this is a P0 integrity bug
- The bead is **index-only**: lives in .km/state.db and .km/changes.jsonl, but has no markdown file.
- It WON'T survive an index rebuild from disk (`km doctor rebuild` would lose it).
- It WON'T ride normal git transport — peers / clones won't see it.
- It violates the storage-model promise (CLAUDE.md vault structure: "every bead lives at @km/<scope>/<slug>.md or @km/_orphan/<id>.md").
- Acceptance — keep bd-compat AND fix integrity
- [ ] `km bd create 'title'` (no --id, no --parent) succeeds (bd-compat preserved)
- [ ] The created bead has a real file at `@km/_orphan/<short-id>.md` (matches migration convention used by 100s of existing orphan beads — see ls @km/_orphan/)
- [ ] File frontmatter has `id: '@km/_orphan/<short-id>'` and `aliases: [<short-id>, km-<short-id>]` per the canonical-ids pattern
- [ ] `git status` after a fresh create shows the new file as untracked
- [ ] Optional UX hint to stderr: 'Note: no scope — landed at @km/_orphan/. Use --parent @km/<scope> for scoped beads.' (non-fatal, additive)

Do NOT add a hard error / require --orphan flag — that diverges from bd compatibility (bd's design intent is quick-capture).

- Related
- @km/beads/ready-helpful-empty-message — same theme of bd commands needing helpful UX without diverging from bd
- @km/beads/list-json-malformed — another integrity bug in km bd output

Found 2026-04-29 by user testing in main session.

