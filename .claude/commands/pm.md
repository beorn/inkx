---
description: Project management - backlog grooming, task triage, issue tracking, beads management
argument-hint: [groom | status | ready | --dry-run]
allowed-tools: Task, Read, Glob, Grep, Bash, TodoWrite, AskUserQuestion
---

# Project Management

Manage the project backlog using beads issue tracking. Activated by requests about:
- Backlog grooming, triage, cleanup
- Task/issue management
- Finding work to do
- Priority management
- Stale/duplicate detection

**Mode**: $ARGUMENTS
- `groom` or `--dry-run` → Full backlog review (survey → analyze → act)
- `status` → Quick health summary
- `ready` → Show actionable work
- (empty) → Infer from context, default to `ready`

---

## Quick Modes

### `status` - Health Summary

```bash
bd list --status open --limit 0 --long   # Count and scan for issues
bd list --status in_progress --limit 0 --long
bd stale --days 14 --limit 0
```

Output summary table with counts by priority/status, flag any concerns.

### `ready` - Actionable Work

```bash
bd ready --limit 15
```

Output the ready list. That's it - quick and focused.

---

## Full Groom Mode

For `groom` or `--dry-run`: Systematically review through 3 phases: survey → analyze → act.

### Phase 1: Survey

Run these bash commands **in parallel** (single message, multiple Bash tool calls):

| Command | Purpose |
|---------|---------|
| `bd list --status open --limit 0 --long` | Full backlog with descriptions |
| `bd list --status in_progress --limit 0 --long` | Work claimed but possibly stalled |
| `bd stale --days 14 --limit 0` | Issues needing attention |
| `bd --no-daemon duplicates --dry-run` | Exact content matches |
| `bd list --type epic --status open --long` | Epic health |
| `bd blocked` | Blocked issues and blockers |
| `bd ready --limit 20` | Currently actionable work |

Then run:
```bash
bd list --status closed --limit 20 --sort updated  # Recent completions for context
```

### Phase 2: Analyze & Categorize

Review survey data. For each open issue, assign to exactly one category:

#### A. Close (no longer relevant)
| Signal | Example |
|--------|---------|
| **Superseded** | km-old describes same work as km-new which has more detail |
| **Done differently** | Feature shipped via a different implementation path |
| **Stale P4** | Untouched 60+ days at lowest priority, no blockers |
| **Vague orphan** | No description, no activity, unclear purpose |
| **Abandoned in_progress** | Claimed 30+ days ago, no commits, assignee moved on |

**Requirement**: Every close needs specific evidence.

#### B. Merge (duplicates)
| Signal | Action |
|--------|--------|
| Exact duplicate | `bd duplicates` found it |
| Same root cause | 3 bugs fixed by one refactor → keep one |
| Overlapping scope | One subsumes another |

**Keep the canonical**: More context, more discussion, clearer scope.

#### C. Reprioritize
| Change | When |
|--------|------|
| Promote P3→P1 | Blocks high-priority work, or user pain increased |
| Demote P1→P3 | Nice-to-have, workaround exists, scope creep |
| Fix P0/P1 pile-up | >5 items at P0-P1 means priority inflation |

**Priority criteria** (higher wins):
1. User-facing bug > internal cleanup
2. Blocking others > standalone
3. Reproducible > intermittent
4. Clear fix > needs investigation

#### D. Restructure
| Issue | Fix |
|-------|-----|
| Missing dependency | A must complete before B, but no link |
| Orphaned subtask | Related work should be under an epic |
| Wrong parent | Issue miscategorized |

#### E. Clarify (ask user)
- Description too vague to act on
- Acceptance criteria unclear
- Might be duplicate but need confirmation
- Scope seems wrong

### Phase 3: Present Plan

Output structured report:

```markdown
## Backlog Health: YYYY-MM-DD

| Metric | Count |
|--------|-------|
| Open issues | N |
| In progress | N |
| Stale (14+ days) | N |
| P0 | N |
| P1 | N |
| P2 | N |
| P3 | N |
| P4 | N |

---

### A. Close (N issues)

| ID | Title | Reason |
|----|-------|--------|
| km-xxxx | Actual issue title | Superseded by km-yyyy: Other title |

### B. Merge (N pairs)

| Close | Into | Reason |
|-------|------|--------|
| km-aaaa: Title A | km-bbbb: Title B | Same root cause |

### C. Reprioritize (N issues)

| ID | Title | From | To | Reason |
|----|-------|------|----|--------|
| km-xxxx | Issue title | P3 | P1 | Blocks km-yyyy: Other title |

### D. Restructure (N changes)

| ID | Title | Change | Reason |
|----|-------|--------|--------|
| km-xxxx | Issue title | Add parent km-epic | Related to epic theme |
| km-yyyy | Other title | Depends on km-zzzz | Must complete zzzz first |

### E. Clarify (N issues)

| ID | Title | Question for user |
|----|-------|-------------------|
| km-xxxx | Issue title | What exactly should change? Scope unclear. |

---

## Ready to Work (from `bd ready`)

[Output of bd ready --limit 10]
```

**Stop here if `--dry-run`**. Otherwise, use AskUserQuestion with options for which categories to execute.

### Phase 4: Execute

After user confirms, execute changes in this order:

1. **Closes and merges first** (reduces noise)
2. **Restructure** (dependencies, parents)
3. **Reprioritize** (now that structure is clean)

### Commands

```bash
# Close with reason
bd close <id> --reason "Grooming: <reason>"

# Mark as duplicate (auto-closes source)
bd duplicate <source-id> --of <canonical-id>

# Update priority
bd update <id> --priority <N>

# Add dependency (issue depends-on blocker)
bd dep add <issue-id> <depends-on-id>

# Set parent (for epic membership)
bd update <id> --parent <epic-id>

# Remove from wrong parent
bd update <id> --parent ""
```

### Verify

After execution:
```bash
bd list --status open --limit 0 | wc -l   # Should decrease
bd stale --days 14 --limit 0 | wc -l      # Should decrease
bd ready --limit 10                        # Should look actionable
```

## Quality Gates

Before presenting plan, self-check:
- [ ] Every "close" has evidence (not just "seems stale")
- [ ] Every "merge" specifies which survives and why
- [ ] Priority changes use the criteria above
- [ ] No circular dependencies introduced
- [ ] Clarify items have specific questions

## Anti-Patterns

- Creating new issues during grooming (that's planning, not grooming)
- Closing issues without evidence
- Bulk priority changes without cascade analysis
- Adding deps for org-chart aesthetics
- Spending time on P4 items when P1s exist

**Keywords**: pm, groom, backlog, triage, cleanup, organize, stale, duplicates, priorities, hygiene, beads, issues, tasks, work, ready, sprint
