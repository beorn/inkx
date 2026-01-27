---
description: Create and optionally implement bugs/features/tasks
argument-hint: <description>
allowed-tools: Bash, Read, AskUserQuestion, TodoWrite, Task, EnterPlanMode
---

# Issue Creation & Implementation Workflow

Intelligent issue creation with duplicate detection, proper ID generation, and optional immediate implementation.

**Usage:**

- `/pm bug <description>` - Report and optionally fix a bug
- `/pm feat <description>` - Request and optionally implement a feature
- `/pm task <description>` - Create and optionally complete a task

**Keywords**: create issue, report bug, request feature, new task

---

## Workflow Overview

```
Phase 1: Context Understanding (parse description, infer metadata)
   ↓
Phase 2: Bead Check (search for duplicates, suggest merge/reopen)
   ↓
Phase 3: Bead Management (generate ID, create bead, link dependencies)
   ↓
Phase 4: Action Decision (ask: work now or just track?)
   ↓
Phase 5: Implementation (if "work now" chosen)
```

---

## Phase 1: Context Understanding

### Extract from $ARGUMENTS:

**Issue type** (from command context):

- `/pm bug` → type=bug
- `/pm feat` → type=feature
- `/pm task` → type=task

**Scope** (from keywords/files mentioned):

- storage, board, tui, cli, tree, markdown → `km-<scope>`
- No clear scope → `km-` (cross-cutting)

**Priority** (from language):

- P0: "crash", "data loss", "security", "can't use"
- P1: "blocks", "prevents", "can't work"
- P2: "annoying", "workaround", "inconvenient" (DEFAULT)
- P3: "minor", "polish", "nice to have"

**Complexity** (for features):

- Trivial: <10 lines, config change
- Simple: Single file, clear pattern
- Moderate: Multi-file, 2-3 packages
- Complex: Architecture, 3+ packages, epic scope

### Ask clarifications ONLY if:

- Description too vague (<5 words, no clear action)
- Multiple scopes with no clear primary
- Conflicting information

---

## Phase 2: Bead Check (Duplicate Detection)

### Run searches in parallel:

```bash
# Search 1: Keyword search
bd search "<key terms from description>" | head -20

# Search 2: Open beads in scope
bd list --status open --json | jq -r '.[] | select(.id | test("km-<scope>"))' | head -20

# Search 3: User's claimed beads
bd list --assignee $(bd whoami) --json
```

### Analyze results:

**Exact title match?**

- Likely duplicate → suggest update/reopen

**Similar + recent (<14 days)?**

- Show side-by-side comparison
- Ask user if same issue

**Similar + stale (>14 days)?**

- Suggest: reopen vs create new

**Closed but related?**

- Reference in new bead description

### Decision tree:

```
Exact match (open)?
├─ Yes → Suggest update existing
└─ No
   └─ Similar found (<14 days)?
      ├─ Yes → Show comparison, ask user
      └─ No → Create new bead
```

---

## Phase 3: Bead Management

### Generate ID:

1. **Find next sequence number:**

   ```bash
   # For km-storage.bug-N-slug pattern:
   bd list --all | grep "km-<scope>.<type>" | tail -1
   # Extract N, use N+1
   ```

2. **Generate slug:**
   - Take first 3-4 keywords from description
   - Convert to kebab-case
   - Example: "Fix sync race condition" → "fix-sync-race"

3. **Construct ID:**
   - `km-<scope>.<type>-<N+1>-<slug>`
   - Example: `km-storage.bug-3-sync-race`

### Create bead:

```bash
bd create \
  --id <generated-id> \
  --type <type> \
  --title "<concise title from description>" \
  --description "<expanded description with context>" \
  --priority <inferred-priority>
```

**Error handling:**

- If ID conflict → increment sequence, retry (max 3 attempts)
- If create fails → report error with suggestion

### Update related beads if dependencies identified:

```bash
# Add dependency
bd dep add <new-id> <blocking-id>

# Link to parent epic
bd update <new-id> --parent <epic-id>
```

---

## Phase 4: Action Decision

Present to user:

```
Created: <bead-id>
Title: <title>
Priority: <priority> (<rationale>)
Status: open

Should I:
1. Work on it now (claim + implement)
2. Just track it (keep as open, no claim)
```

Use AskUserQuestion with two options.

**If "Work on it now"** → Phase 5
**If "Just track"** → Done, suggest `bd ready` to see in backlog

---

## Phase 5: Implementation

### Claim the bead:

```bash
bd update <id> --claim --status in_progress
```

### Branch by type and complexity:

#### For BUGS:

Load [workflows/bugs.md](workflows/bugs.md).

**Summary:**

1. Verify reproduction steps (ask if unclear)
2. Reproduce bug (headless capture for TUI, test for logic)
3. Write failing test
4. Implement minimal fix
5. Verify with test:fast
6. Close with evidence

**If can't reproduce:** Update bead with notes, ask user for more info, STOP.

#### For FEATURES:

Load [workflows/features.md](workflows/features.md).

**Assess complexity:**

- **Trivial/Simple** → Implement inline
- **Moderate/Complex** → EnterPlanMode first

**Summary:**

1. Assess complexity
2. If complex → EnterPlanMode (full planning session)
3. Write acceptance test (.spec.ts for TUI, .test.ts for logic)
4. Implement incrementally with test:fast
5. Verify & close

#### For TASKS:

Load [workflows/tasks.md](workflows/tasks.md).

**Determine if tests needed:**

- Refactoring/move/rename → Yes (preserve behavior)
- Docs/cleanup → No
- Dependency update → Maybe (run test:fast to verify)

**Summary:**

1. Determine test needs
2. If tests → refactor incrementally, keep test:fast green
3. If no tests → implement, run bun fix
4. Close

### Sub-Agent Spawn (for non-trivial work):

If implementation is non-trivial but doesn't need full planning:

```typescript
Task({
  description: "Implement <bead-id>",
  prompt: `
    Implement bead: <bead-id>
    Type: <bug|feature|task>

    ## Requirement
    <full description from bead>

    ## Approach
    <suggested approach based on type>

    ## Instructions
    Follow workflows/bugs.md, workflows/features.md, or workflows/tasks.md for <type> workflow:
    1. <type-specific steps>
    2. Run test:fast frequently
    3. Close bead when complete: bd close <id> --reason "<evidence>"
    4. Report: summary + test results

    ## Context
    <relevant files, patterns to follow>
  `,
  subagent_type: "general-purpose",
})
```

### Use TodoWrite for progress tracking:

```javascript
TodoWrite([
  {
    content: "<phase 1>",
    status: "in_progress",
    activeForm: "<doing phase 1>",
  },
  { content: "<phase 2>", status: "pending", activeForm: "<doing phase 2>" },
  // ...
])
```

Update status as work progresses.

---

## Error Handling

| Scenario               | Action                                  |
| ---------------------- | --------------------------------------- |
| ID conflict            | Auto-increment sequence, retry (max 3)  |
| Can't reproduce bug    | Update bead, ask user, STOP             |
| Implementation blocked | `bd update <id> --status blocked`       |
| Scope expands          | Create separate beads                   |
| Tests fail             | DO NOT close bead, update with progress |

---

## Quality Gates

**Before creating bead:**

- [ ] ID follows [beads-ids.md](beads-ids.md) conventions
- [ ] Sequence number correct
- [ ] Priority has rationale
- [ ] Description actionable

**Before claiming:**

- [ ] Searched for duplicates
- [ ] User confirmed if similar found
- [ ] Dependencies identified

**Before closing:**

- [ ] test:fast passes (if code changed)
- [ ] Evidence in close reason
- [ ] Related beads updated

---

## Example Flow

```
User: /pm bug the progress reporting is slow in km-view

Phase 1:
- Type: bug
- Scope: tui (km-view is TUI)
- Priority: P2 (annoying but not blocking)
- Description: "Progress reporting slow in km-view"

Phase 2:
[3 parallel searches]
- No exact matches
- km-tui.bug-1-render-perf (closed 20 days ago) - related?
- Decision: Create new (different issue)

Phase 3:
- Next number for km-tui.bug: 2
- Slug: "progress-slow"
- ID: km-tui.bug-2-progress-slow
bd create --id km-tui.bug-2-progress-slow \
  --type bug \
  --title "Progress reporting slow in km-view" \
  --priority 2

Phase 4:
User chooses: "Work on it now"

Phase 5:
bd update km-tui.bug-2-progress-slow --claim --status in_progress

TodoWrite([
  "Reproduce slowness",
  "Profile to find bottleneck",
  "Write test for performance",
  "Optimize",
  "Verify improved"
])

[Follow bug workflow from implementation.md]
[Fix implemented, test passes]

bd close km-tui.bug-2-progress-slow \
  --reason "Fixed render throttling. Test: 'progress updates < 100ms' passes."

Total: ~18 minutes
```

---

## Integration Points

**References:**

- [beads.md](beads.md) - All bd CLI commands
- [beads-ids.md](beads-ids.md) - ID conventions and scope tokens
- [workflows/bugs.md](workflows/bugs.md) - Bug fix workflow
- [workflows/features.md](workflows/features.md) - Feature implementation workflow
- [workflows/tasks.md](workflows/tasks.md) - Task completion workflow
- [workflows/review.md](workflows/review.md) - Backlog grooming if cleanup needed

**Tools:**

- Bash for bd commands
- Read for checking existing beads
- AskUserQuestion for user decisions
- TodoWrite for progress tracking
- Task for spawning sub-agents
- EnterPlanMode for complex features

---

## Tips

**For users:**

- No quotes needed: `/pm bug the sync crashes` works
- Be specific: Include scope hints (storage, tui) for better ID generation
- Mention files: "in reconcile.ts" helps with scoping

**For Claude:**

- Default to creating new bead if unsure (better than missing issues)
- Always verify reproduction for bugs before fixing
- Use test:fast for tight iteration
- Keep implementation minimal and focused
- Update bead with progress if session ends mid-work
