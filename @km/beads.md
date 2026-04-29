---
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

### km bd migrate
Migrate from .beads/ to km format.

```bash
km bd migrate [--dry-run]
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
   - Convert dependencies to `blocks::` / `blocked-by::` properties
   - Store original beads ID in `data.beads_id`
3. Create @issues.md board if not exists
4. Move .beads/ to .beads.bak/

## Dependencies

- **Requires**: @km/props (for blocks::/blocked-by:: properties)
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