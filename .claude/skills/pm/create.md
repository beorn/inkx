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

## Contents

- [Workflow Overview](#workflow-overview)
- [Phase 1: Context Understanding](#phase-1-context-understanding)
- [Phase 2: Bead Check (Duplicate Detection)](#phase-2-bead-check-duplicate-detection)
- [Phase 3: Bead Management](#phase-3-bead-management)
- [Phase 4: Action Decision](#phase-4-action-decision)
- [Phase 5: Implementation](#phase-5-implementation)
- [Phase 6: Work Completion](#phase-6-work-completion)
- [Error Handling](#error-handling)
- [Quality Gates](#quality-gates)

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
   ↓
Phase 6: Work Completion (record results, update related)
```

---

## Phase 1: Context Understanding

### Extract from $ARGUMENTS:

**Issue type** (from command context):

- `/pm bug` → type=bug
- `/pm feat` → type=feature
- `/pm task` → type=task

**Scope** (from keywords/files mentioned) — determines tracking epic. See [SKILL.md Scope Epics](../SKILL.md#scope-epics-backlogs) for scope-to-epic mapping.

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

### Run searches

```bash
# Text search in all beads (open + closed)
bd search "<key terms from description>" | head -20

# Semantic duplicate detection (slower but catches different wording)
bd find-duplicates --status open --threshold 0.4
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

### Pre-check for existing bead:

Before creating, verify the intended ID doesn't already exist:

```bash
bd show <intended-id> 2>/dev/null || echo "ID available"
```

This prevents accidental duplicates when sessions crash mid-creation or multiple agents work concurrently.

### Generate ID:

1. **Check database prefix first:**

   ```bash
   # See what prefix the database uses (CRITICAL - don't assume km-)
   bd list --limit 1
   # Or: sqlite3 .beads/beads.db "SELECT id FROM issues LIMIT 1"
   ```

   | Location | Prefix |
   |----------|--------|
   | km (main project) | `km-` |
   | vendor/silvery | `silvery-` |
   | vendor/silvery/packages/ansi | `silvery/packages/ansi-` |

2. **Find next sequence number:**

   ```bash
   # For <prefix><scope>-N pattern:
   bd list --all | grep "<prefix><scope>-"
   # Find highest N, use N+1
   ```

3. **Construct ID:**
   - `<prefix><scope>-<N+1>`
   - Example: `km-storage-15` or `km-silvery.bg-bleed`

**Note**: Type/priority/labels go in metadata fields, not the ID. See [beads-ids.md](beads-ids.md).

### Create bead:

**WARNING**: `--id` and `--parent` cannot be combined — see [SKILL.md Quick Reference](../SKILL.md#quick-reference-common-flag-mistakes).

**Include acceptance criteria** in the description — explicit "done when" conditions help future sessions know when the bead is truly complete. Anchor to design docs or skill files where relevant (e.g., "See docs/design/X.md for context").

```bash
# Step 1: Create (NO --parent flag here!)
bd create \
  --id <generated-id> \
  --type <type> \
  --title "<concise title from description>" \
  --description "<expanded description with context and acceptance criteria>" \
  --priority <inferred-priority>

# Step 2: Set parent AFTER creation
bd update <generated-id> --parent <tracking-epic-id>
```

**Error handling:**

- If ID conflict → increment sequence, retry (max 3 attempts)
- If create fails → report error with suggestion

**If replacing an existing bead**: Use `bd rename <old-id> <new-id>` — automatically updates all references.

### Assign to tracking epic (REQUIRED):

Every new bead **must** be a sub-bead of its tracking epic (see [SKILL.md Scope Epics](../SKILL.md#scope-epics-backlogs) for the full list). Use two-step create + parent:

```bash
# ID format: km-<scope>.<suffix>
# Example: km-silvery.bg-bleed, km-tui.emptybody, km-infra.ci-fuzz

# Step 1: Create
bd create --id km-tui.emptybody --type bug --title "Empty body rendering" --priority 2

# Step 2: Set parent (MUST be separate command)
bd update km-tui.emptybody --parent km-tui
```

If no tracking epic fits, the bead can be standalone (e.g., `km-<keyword>`).

### Link dependencies if identified:

```bash
# Add dependency (new-id is blocked by blocking-id)
bd dep add <new-id> <blocking-id>
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
bd update <id> --claim
```

(`--claim` atomically sets assignee + status=in_progress)

### Delegate by type

- **BUGS**: Load [workflows/bugs.md](workflows/bugs.md) - reproduce, write test, fix minimally
- **FEATURES**: Load [workflows/features.md](workflows/features.md) - assess complexity, plan if needed, TDD
- **TASKS**: Load [workflows/tasks.md](workflows/tasks.md) - determine test needs, refactor incrementally

### Use TodoWrite for progress tracking:

```javascript
TodoWrite([
  {
    content: "Reproduce bug",
    status: "in_progress",
    activeForm: "Reproducing bug",
  },
  { content: "Write test", status: "pending", activeForm: "Writing test" },
  {
    content: "Implement fix",
    status: "pending",
    activeForm: "Implementing fix",
  },
])
```

Update status as work progresses.

---

## Phase 6: Work Completion

### Record Results

When closing a bead, use `--reason` to capture structured results.

Use structured close reasons. For bugs, follow the Fixed/Test/Verified format in [bugs.md](workflows/bugs.md#close-reason-template). For features and performance work, include what was implemented, test evidence, and impact metrics.

```bash
bd close <id> --reason "Implemented: <what, where>. Tests: <names>. Impact: <metrics if applicable>."
```

### Update Related Beads

- Reference completed bead in dependent beads' notes
- Create follow-up beads for discovered issues
- Update parent epic with progress

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
- [ ] Performance: Benchmark before/after recorded (if perf work)
- [ ] Testing: Test count/pass rate documented
- [ ] Impact: Analysis captured in close reason
- [ ] Follow-up: Next steps beads created if needed
- [ ] Related beads updated

---

## Integration Points

- [beads.md](beads.md) - All bd CLI commands
- [beads-ids.md](beads-ids.md) - ID conventions and scope tokens
- [workflows/bugs.md](workflows/bugs.md), [workflows/features.md](workflows/features.md), [workflows/tasks.md](workflows/tasks.md) - Implementation workflows
