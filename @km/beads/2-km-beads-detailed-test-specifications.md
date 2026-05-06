---
mentions:
  - km
id: "@km/beads/2-km-beads-detailed-test-specifications"
aliases:
  - km-beads.2
  - km-beads-2
  - "@km/beads/2"
created_at: 2026-01-21T10:31:17Z
closed_at: 2026-01-21T12:39:47Z
---

# [x] km-beads: Detailed Test Specifications @km/beads #task #P2

---

## Tests (Detailed)

### CLI Command Tests

**Location:** `apps/km-cli/tests/bd/`

#### ready.test.ts

```typescript
describe('km bd ready', () => {
  beforeEach(async () => {
    // Setup vault with test issues
    await createIssue({ title: 'Low priority', priority: 3, status: 'todo' });
    await createIssue({ title: 'High priority', priority: 1, status: 'todo' });
    await createIssue({ title: 'Blocked issue', priority: 0, status: 'todo', blockedBy: ['other'] });
    await createIssue({ title: 'Done issue', priority: 1, status: 'done' });
  });

  test('shows unblocked todo issues sorted by priority', async () => {
    const output = await runCommand('bd ready');
    const lines = output.split('\n').filter(l => l.includes('[P'));
    
    expect(lines[0]).toContain('High priority');  // P1 first
    expect(lines[1]).toContain('Low priority');   // P3 second
    expect(output).not.toContain('Blocked');      // Excluded
    expect(output).not.toContain('Done');         // Excluded
  });

  test('filters by assignee', async () => {
    await createIssue({ title: 'Alice task', assignee: 'alice', status: 'todo' });
    await createIssue({ title: 'Bob task', assignee: 'bob', status: 'todo' });
    
    const output = await runCommand('bd ready -a alice');
    expect(output).toContain('Alice task');
    expect(output).not.toContain('Bob task');
  });

  test('respects limit flag', async () => {
    const output = await runCommand('bd ready -n 1');
    const issueLines = output.split('\n').filter(l => l.includes('[P'));
    expect(issueLines.length).toBe(1);
  });

  test('outputs valid JSON with --json flag', async () => {
    const output = await runCommand('bd ready --json');
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toHaveProperty('id');
    expect(parsed[0]).toHaveProperty('title');
    expect(parsed[0]).toHaveProperty('priority');
  });
});
```

#### create.test.ts

```typescript
describe('km bd create', () => {
  test('creates issue with default values', async () => {
    const output = await runCommand('bd create "New bug"');
    expect(output).toContain('km-');  // Has short ID
    
    const issue = await getIssueByTitle('New bug');
    expect(issue.content).toContain('@issue');
    expect(issue.content).toContain('#P2');  // Default priority
  });

  test('creates issue with custom ID', async () => {
    const output = await runCommand('bd create "Auth epic" --id auth-epic -t epic -p 1');
    expect(output).toContain('km-auth-epic');
    
    const issue = await getIssue('km-auth-epic');
    expect(issue.content).toContain('@issue');
    expect(issue.content).toContain('#epic');
    expect(issue.content).toContain('#P1');
  });

  test('creates sub-ID under parent epic', async () => {
    await runCommand('bd create "Parent" --id my-epic');
    const output = await runCommand('bd create "Child task" --parent km-my-epic');
    expect(output).toContain('km-my-epic.1');
    
    // Second child gets .2
    const output2 = await runCommand('bd create "Second child" --parent km-my-epic');
    expect(output2).toContain('km-my-epic.2');
  });

  test('sets assignee with -a flag', async () => {
    await runCommand('bd create "Assigned task" -a alice');
    const issue = await getIssueByTitle('Assigned task');
    expect(issue.content).toContain('@alice');
  });

  test('adds type tag', async () => {
    await runCommand('bd create "Bug report" -t bug');
    const issue = await getIssueByTitle('Bug report');
    expect(issue.content).toContain('#bug');
  });

  test('outputs JSON with --json flag', async () => {
    const output = await runCommand('bd create "JSON test" --json');
    const parsed = JSON.parse(output);
    expect(parsed.id).toMatch(/^km-/);
    expect(parsed.title).toBe('JSON test');
  });
});
```

#### update.test.ts

```typescript
describe('km bd update', () => {
  let issueId: string;

  beforeEach(async () => {
    const output = await runCommand('bd create "Test issue" -p 2');
    issueId = extractId(output);
  });

  test('updates status', async () => {
    await runCommand(`bd update ${issueId} -s wip`);
    const issue = await getIssue(issueId);
    expect(issue.task_status).toBe('wip');
  });

  test('updates priority (changes #P tag)', async () => {
    await runCommand(`bd update ${issueId} -p 1`);
    const issue = await getIssue(issueId);
    expect(issue.content).toContain('#P1');
    expect(issue.content).not.toContain('#P2');
  });

  test('--claim sets assignee and status to wip', async () => {
    await runCommand(`bd update ${issueId} --claim`);
    const issue = await getIssue(issueId);
    expect(issue.task_status).toBe('wip');
    expect(issue.assigned_to).toBe('beorn');  // Current user
  });

  test('adds label with --add-label', async () => {
    await runCommand(`bd update ${issueId} --add-label urgent`);
    const issue = await getIssue(issueId);
    expect(issue.content).toContain('#urgent');
  });

  test('removes label with --remove-label', async () => {
    await runCommand('bd create "Labeled" -l urgent');
    const id = extractId(await runCommand('bd list --json | jq -r ".[0].id"'));
    
    await runCommand(`bd update ${id} --remove-label urgent`);
    const issue = await getIssue(id);
    expect(issue.content).not.toContain('#urgent');
  });
});
```

#### close.test.ts

```typescript
describe('km bd close', () => {
  test('closes issue with done status', async () => {
    const output = await runCommand('bd create "To close"');
    const id = extractId(output);
    
    await runCommand(`bd close ${id}`);
    const issue = await getIssue(id);
    expect(issue.task_status).toBe('done');
  });

  test('stores close reason', async () => {
    const output = await runCommand('bd create "With reason"');
    const id = extractId(output);
    
    await runCommand(`bd close ${id} -r "Fixed in commit abc123"`);
    const issue = await getIssue(id);
    expect(issue.data.close_reason).toBe('Fixed in commit abc123');
  });
});
```

#### dep.test.ts (requires @km/props)

```typescript
describe('km bd dep', () => {
  test('adds dependency with blocks:: property', async () => {
    const blocker = extractId(await runCommand('bd create "Blocker"'));
    const blocked = extractId(await runCommand('bd create "Blocked"'));
    
    await runCommand(`bd dep add ${blocked} ${blocker}`);
    
    const issue = await getIssue(blocked);
    expect(issue.data.props['blocked-by']).toContain(blocker);
  });

  test('removes dependency', async () => {
    const blocker = extractId(await runCommand('bd create "Blocker"'));
    const blocked = extractId(await runCommand('bd create "Blocked"'));
    await runCommand(`bd dep add ${blocked} ${blocker}`);
    
    await runCommand(`bd dep remove ${blocked} ${blocker}`);
    
    const issue = await getIssue(blocked);
    expect(issue.data.props['blocked-by'] || []).not.toContain(blocker);
  });

  test('bd blocked shows all blocked issues', async () => {
    const blocker = extractId(await runCommand('bd create "Blocker" -s todo'));
    const blocked = extractId(await runCommand('bd create "Blocked"'));
    await runCommand(`bd dep add ${blocked} ${blocker}`);
    
    const output = await runCommand('bd blocked');
    expect(output).toContain('Blocked');
    expect(output).not.toContain('Blocker');
  });
});
```

#### migrate.test.ts

```typescript
describe('km bd migrate', () => {
  beforeEach(async () => {
    // Setup .beads/ directory with test data
    await writeBeadsData([
      { id: 'abc123', title: 'Old issue', status: 'open', priority: 1, type: 'bug' },
      { id: 'def456', title: 'Done issue', status: 'closed', priority: 2, type: 'feature' },
    ]);
  });

  test('migrates issues to km format', async () => {
    await runCommand('bd migrate');
    
    // Verify issues created
    const output = await runCommand('bd list --all --json');
    const issues = JSON.parse(output);
    
    expect(issues.some(i => i.title === 'Old issue')).toBe(true);
    expect(issues.some(i => i.title === 'Done issue')).toBe(true);
  });

  test('preserves original beads ID in data', async () => {
    await runCommand('bd migrate');
    
    const issue = await getIssueByTitle('Old issue');
    expect(issue.data.beads_id).toBe('abc123');
  });

  test('maps status correctly', async () => {
    await runCommand('bd migrate');
    
    const open = await getIssueByTitle('Old issue');
    const closed = await getIssueByTitle('Done issue');
    
    expect(open.task_status).toBe('todo');
    expect(closed.task_status).toBe('done');
  });

  test('maps priority to #P tag', async () => {
    await runCommand('bd migrate');
    
    const issue = await getIssueByTitle('Old issue');
    expect(issue.content).toContain('#P1');
  });

  test('maps type to tag', async () => {
    await runCommand('bd migrate');
    
    const bug = await getIssueByTitle('Old issue');
    const feature = await getIssueByTitle('Done issue');
    
    expect(bug.content).toContain('#bug');
    expect(feature.content).toContain('#feature');
  });

  test('backs up .beads/ to .beads.bak/', async () => {
    await runCommand('bd migrate');
    
    expect(fs.existsSync('.beads.bak')).toBe(true);
    expect(fs.existsSync('.beads')).toBe(false);
  });

  test('--dry-run shows plan without executing', async () => {
    const output = await runCommand('bd migrate --dry-run');
    
    expect(output).toContain('Would migrate');
    expect(output).toContain('Old issue');
    expect(fs.existsSync('.beads')).toBe(true);  // Not moved
  });
});
```

### Short ID Tests

**Location:** `apps/km-cli/tests/bd/utils/short-id.test.ts`

```typescript
describe('Short ID utilities', () => {
  describe('generateShortId', () => {
    test('generates 4-char suffix from ULID', () => {
      const id = generateShortId();
      expect(id).toMatch(/^km-[a-z0-9]{4}$/);
    });

    test('uses custom prefix from config', () => {
      setConfig({ shortId: { prefix: 'proj' } });
      const id = generateShortId();
      expect(id).toMatch(/^proj-[a-z0-9]{4}$/);
    });
  });

  describe('resolveShortId', () => {
    beforeEach(async () => {
      await createIssue({ id: 'km-a1b2', title: 'Test' });
      await createIssue({ id: 'km-auth-epic', title: 'Epic' });
      await createIssue({ id: 'km-auth-epic.1', title: 'Sub 1' });
    });

    test('resolves exact match', async () => {
      const nodeId = await resolveShortId('km-a1b2');
      expect(nodeId).toBeDefined();
    });

    test('resolves without prefix', async () => {
      const nodeId = await resolveShortId('a1b2');
      expect(nodeId).toBeDefined();
    });

    test('resolves custom ID', async () => {
      const nodeId = await resolveShortId('km-auth-epic');
      expect(nodeId).toBeDefined();
    });

    test('resolves sub-ID', async () => {
      const nodeId = await resolveShortId('km-auth-epic.1');
      expect(nodeId).toBeDefined();
    });

    test('returns null for unknown ID', async () => {
      const nodeId = await resolveShortId('km-unknown');
      expect(nodeId).toBeNull();
    });
  });
});
```

---

## Acceptance Criteria (Updated)

### Core CLI

- [ ] `bd ready` shows unblocked todos sorted by priority
- [ ] `bd create` generates short IDs and creates issues
- [ ] `bd show` displays issue details
- [ ] `bd update` modifies status/priority/assignee
- [ ] `bd close` marks done with optional reason
- [ ] `bd list` filters and lists issues

### Short IDs

- [ ] Auto-generated 4-char suffix works
- [ ] Custom `--id` flag works
- [ ] Sub-IDs under parent (`--parent`) work
- [ ] ID resolution handles all formats

### Dependencies (requires @km/props)

- [ ] `bd dep add/remove` manages blocked-by::
- [ ] `bd blocked` shows blocked issues
- [ ] `bd ready` excludes blocked issues

### Migration

- [ ] Converts .beads/ issues to km format
- [ ] Preserves IDs, status, priority, type
- [ ] Backs up original .beads/
- [ ] --dry-run shows plan

### Quality

- [ ] `bun run test:fast` passes
- [ ] `bun run test:all` passes
- [ ] All commands have --json output option

