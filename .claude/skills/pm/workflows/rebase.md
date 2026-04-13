---
description: Reset session context - close completed work, organize backlog, plan next steps
argument-hint: [--skip-commit | --skip-close]
allowed-tools: Bash, Read, Glob, Grep, TodoWrite, AskUserQuestion, Task
---

# Rebase Workflow

Reset session context and plan next work. Aliases: `/pm replan`, `/pm regroup`

**Use when:**
- Starting a new session after a break
- Context is scattered across multiple beads
- Need to close out completed work and plan next steps

## Contents

- [Phase 1: Take Stock](#phase-1-take-stock)
- [Phase 2: Clean State](#phase-2-clean-state)
- [Phase 3: Survey Open Work](#phase-3-survey-open-work)
- [Phase 4: Group Related Work](#phase-4-group-related-work)
- [Phase 5: Groom Session Scope](#phase-5-groom-session-scope)
- [Phase 6: Propose Plan](#phase-6-propose-plan)
- [Phase 7: Reorganize](#phase-7-reorganize)
- [Phase 8: Output Start Command](#phase-8-output-start-command)

---

## Phase 1: Take Stock

Assess recent work by running these commands **in parallel**:

| Command | Purpose |
|---------|---------|
| `git log --oneline -20 --since="8 hours ago"` | Recent commits this session |
| `bd list --status in_progress --long` | Currently claimed beads |
| `bd list --assignee "$USER" --status closed --limit 10 --sort updated` | Recently closed by me |
| `git status --short` | Uncommitted changes |

Output summary table:

| Category | Count | Details |
|----------|-------|---------|
| Commits (8h) | N | Latest: "feat: ..." |
| In Progress | N | km-xxx, km-yyy |
| Recently Closed | N | km-aaa, km-bbb |
| Uncommitted | Y/N | M file.ts, ?? new.ts |

---

## Phase 2: Clean State

### 2a. Git State

If uncommitted changes exist:
- **Auto-commit** using `/commit` workflow (don't ask, just do it)
- If commit fails (e.g., lint errors), warn and continue

### 2b. In-Progress Beads

For each in_progress bead assigned to current actor:

1. Show bead: `bd show <id>`
2. Check for related commits: `git log --oneline --grep="<id>" --since="24 hours ago"`
3. **Auto-determine status:**
   - Has commits mentioning the bead ID → **Close as complete**
   - No commits but tests pass for that area → **Close as complete**
   - No activity at all → **Unclaim** (defer to backlog)

Only ask if genuinely ambiguous (e.g., partial commits, unclear if done).

After all beads processed, sync:
```bash
git add .beads && git commit -m "chore: sync beads (rebase)"
```

---

## Phase 3: Survey Open Work

Run these commands **in parallel**:

| Command | Purpose |
|---------|---------|
| `bd list --status open --limit 0 --long` | All open beads |
| `bd ready --limit 30` | Actionable (unblocked, unclaimed) |
| `bd list --type epic --status open --long` | Active epics |
| `bd blocked` | Blocked issues |
| `bd stale --days 7 --limit 20` | Recent but stale |

---

## Phase 4: Group Related Work

Analyze open beads and group by:

### 4a. Scope Clustering

Group by ID prefix (e.g., `km-storage-*`, `km-tui-*`):

```bash
bd list --status open --json | jq -r '.[] | .id' | sed 's/-[0-9]*$//' | sort | uniq -c | sort -rn
```

### 4b. Epic Membership

Identify beads that belong to epics:
- Hierarchical IDs (e.g., `km-test-4.1` under `km-test-4`)
- Explicit parent relationships

### 4c. Dependency Chains

Find chains where completing one unblocks others:
```bash
bd blocked --json | jq -r '.[] | "\(.id) blocked by \(.blocked_by)"'
```

### 4d. Thematic Grouping

Search for keyword overlaps in titles/descriptions:
- Performance: `bd list --status open --json | jq -r '.[] | select(.title | test("perf|slow|fast"; "i"))'`
- Refactoring: similar for "refactor|clean|simplify"
- Testing: similar for "test|spec|coverage"

Output grouping table:

| Group | Lead Bead | Related | Total |
|-------|-----------|---------|-------|
| Storage Links | km-storage-15 | km-storage-16, km-storage-17 | 3 |
| TUI Perf | km-tui-23 | km-tui-24 | 2 |
| Standalone | km-misc-5 | - | 1 |

---

## Phase 5: Groom Session Scope

Focused grooming of beads touched or planned in this session. Unlike `/pm review` (full backlog), this is quick and scoped.

### 5a. Define Session Scope

Collect beads relevant to this session:

```bash
# Beads mentioned in recent commits
git log --oneline --since="24 hours ago" | grep -oE 'km-[a-z]+-[0-9.]+' | sort -u

# Beads just processed (from Phase 2)
# + Related beads from grouping (from Phase 4)
```

Present the scope:

```markdown
## Session Scope (N beads)

| ID | Title | Status | Action? |
|----|-------|--------|---------|
| km-storage-15 | Link resolver core | closed | - |
| km-storage-16 | Folder link support | open | next |
| km-storage-17 | Update link tests | open | related |
| km-storage-18 | (new from commits) | - | create? |
```

### 5b. Interactive Groom

For each bead in scope, offer actions via AskUserQuestion:

**Merge** - Combine duplicates or overlapping beads:
```bash
# Keep target, close source with reference
bd close km-dupe --reason "Merged into km-target"
bd update km-target --notes "Absorbed km-dupe scope"
```

**Split** - Break large bead into smaller pieces:
```bash
# Create child beads, update parent to epic
bd update km-big --type epic
bd create --id km-big.1 --title "First part" --parent km-big
bd create --id km-big.2 --title "Second part" --parent km-big
```

**Delete** - Remove obsolete or invalid beads:
```bash
bd close km-obsolete --reason "No longer relevant after <context>"
```

**Create** - Capture new work that emerged:
```bash
# Work discovered during implementation
bd create --id km-new-thing --title "Handle edge case X" \
  --description "Discovered while working on km-original"
```

**Keep** - No changes needed (default, no action required)

### 5c. Quick Groom Prompts

Present compact options - don't enumerate every bead:

```markdown
## Groom Session Scope

**Beads in scope:** km-storage-15 (done), km-storage-16, km-storage-17

Any reorganization needed?
- Merge beads (combine duplicates)
- Split a bead (too large)
- Delete obsolete beads
- Create new beads (work emerged)
- Skip grooming (continue to plan)
```

If user selects an action, drill into specifics. Otherwise skip to Phase 6.

### 5d. Common Patterns

| Signal | Likely Action |
|--------|---------------|
| Two beads with similar titles | Merge |
| Bead took 3+ commits to close | Split retrospectively for tracking |
| Commit mentions work not in any bead | Create bead for attribution |
| Bead description no longer matches reality | Update or delete |
| Completed work unlocked new insights | Create follow-up beads |

---

## Phase 6: Propose Plan

### Single Workstream

If one clear priority emerges:

```markdown
## Proposed Plan

**Focus**: km-storage-15 "Implement link resolution"

Related work (will be addressed in order):
1. km-storage-15 - Link resolver core (start here)
2. km-storage-16 - Add folder link support
3. km-storage-17 - Update tests

**Start command:**
/pm do km-storage-15
```

### Multiple Workstreams

If multiple disconnected priorities exist:

**Auto-select based on priority:**
1. Highest priority (P0 > P1 > P2 > ...)
2. If tied, prefer epic with subtasks over standalone
3. If still tied, prefer most recently updated

Only use AskUserQuestion if there are 2+ options at the **same priority level** with no clear differentiator.

### No Clear Work

If backlog is empty:
- Output: "No actionable beads. Run `/pm create` to add work or `/pm review` to groom backlog."
- Don't ask - just inform and end.

---

## Phase 7: Reorganize

Based on plan selection and grooming decisions, reorganize beads:

### 7a. Close Obsolete

```bash
# For beads superseded by selected work
bd close <old-id> --reason "Superseded by <selected-id>"
```

### 7b. Create Epic (if grouping)

If user chose to group multiple beads:

```bash
# Find next ID
NEXT_ID=$(bd list --json | jq -r '[.[] | .id | select(startswith("km-epic-"))] | map(split("-")[2] | tonumber) | max + 1')

bd create --id "km-epic-$NEXT_ID" --type epic \
  --title "Sprint: <theme>" \
  --description "Umbrella for related work identified during rebase"

# Add children
bd update km-child-1 --parent km-epic-$NEXT_ID
bd update km-child-2 --parent km-epic-$NEXT_ID
```

### 7c. Update Dependencies

```bash
# If work has natural ordering
bd dep add km-second km-first  # second depends on first
```

### 7d. Sync Changes

```bash
git add .beads && git commit -m "chore: reorganize beads (rebase)"
```

---

## Phase 8: Output Start Command

**Always end with a ready-to-copy command block:**

```markdown
---

## Ready to Start

**Selected work:** km-storage-15 "Implement link resolution"

**Context:** This bead adds wiki-link resolution (`[[name]]` syntax) to the storage layer,
enabling folder transclusion and cross-file linking.

**To begin in this or a new session, run:**

/pm do km-storage-15

---
```

The `/pm do` command is the handoff point - it can be:
- Executed immediately in the current session
- Copied to a new Claude session to start fresh with full context
- Saved for later reference

---

## Anti-Patterns

- **Asking obvious questions** - Auto-commit, auto-close completed work, auto-select highest priority
- **Full backlog review** - Use `/pm review` for that; rebase grooms only session scope
- **Spending too long in survey** - Timebox to 5 minutes
- **Analysis paralysis on grouping** - Pick something and start
- **Skipping the close step** - Leaves stale in_progress beads
- **Not syncing beads to git** - Loses coordination state
- **Skipping groom when beads are messy** - Quick groom prevents accumulated debt

## When to Ask

Only use AskUserQuestion when:
- Multiple beads at **same priority** with no clear winner
- Bead status is **genuinely ambiguous** (partial work, unclear completion)
- User explicitly requested a choice earlier
- **Grooming**: Always ask before merge/split/delete/create (these change structure)

Do NOT ask for:
- Committing changes (just do it)
- Closing beads with commits (obviously done)
- Unclaiming beads with no activity (clearly abandoned)
- Selecting highest priority work (obvious choice)
- **Groom skip**: If user says "skip grooming", proceed directly to plan

---

## Quick Mode

For fast rebase (skip confirmations):

```bash
# Close all my in_progress as complete
bd list --status in_progress --assignee "$USER" --json | \
  jq -r '.[].id' | \
  xargs -I{} bd close {} --reason "Closed during quick rebase"

# Get top ready bead
TOP=$(bd ready --limit 1 --json | jq -r '.[0].id')
echo "Start: /pm do $TOP"
```

---

**Keywords**: rebase, replan, regroup, reset, context, session, start, plan, organize, groom, merge, split
