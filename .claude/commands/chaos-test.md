---
description: Chaos Test Command - Run chaos testing to discover sync bugs and recommend fixes
argument-hint: [5m | 1000 | quick | --analyze-only <seed>]
allowed-tools: Task, Read, Glob, Grep, Bash, TodoWrite, AskUserQuestion
---

# Chaos Test Command

Run chaos testing on km's filesystem sync system to discover bugs, analyze root causes, and recommend fixes.

**Mode**: $ARGUMENTS

- `quick` or empty → 100 iterations (~1s), just report pass/fail counts
- `<N>` (number) → N iterations with full analysis
- `<N>m` / `<N>s` / `<N>h` → Duration-based (~1000 iter/sec with MockFS parallel)
- `--analyze-only <seed>` → Skip fuzzing, analyze existing failure

**Performance**: MockFS + parallel mode (default) runs ~1000 iterations/sec. Real FS mode (~2 iter/sec) is only needed when debugging specific FS interactions.

---

## Quick Mode

For `quick` or empty arguments:

```bash
bun run chaos:fuzz -n 100 2>&1
```

Report summary only:

```
Chaos Quick Check: 100/100 passed ✓
```

Or if failures:

```
Chaos Quick Check: 97/100 passed, 3 failed
Failed seeds: 12345, 67890, 11111
Run `/chaos-test 500` for full analysis or `/chaos-test --analyze-only 12345` for specific seed
```

---

## Full Analysis Mode

### Phase 1: Run Fuzzer

Convert duration to iterations (MockFS parallel mode @ ~1000 iter/sec):

- `5m` → 100000+ iterations
- `30s` → 30000 iterations
- `1h` → 1M+ iterations (practical limit ~100k)
- `1000` → 1000 iterations (~1s)

```bash
bun run chaos:fuzz -n <iterations> -v 2>&1 | tee /tmp/chaos-output.txt
```

**Flags:**

- Default: MockFS + parallel (fastest, ~1000 iter/sec)
- `-p/--parallel`: Force parallel mode
- `--sequential`: Disable parallel (for debugging)
- `-r/--real-fs`: Use real filesystem (slower, ~2 iter/sec)

Show progress every 25%: "Progress: 25% (245 passed, 5 failed)"

### Phase 2: Collect & Deduplicate Failures

Extract failed seeds from output. **Group by invariant violated** before analyzing:

| Invariant        | Seeds        |
| ---------------- | ------------ |
| noDuplicateNodes | 12345, 67890 |
| noOrphanedNodes  | 11111        |

Generate reports for **one seed per invariant group** (max 5 total):

```bash
# Generate reports in parallel (background jobs)
bun ./scripts/chaos.ts report -s <seed1> -o /tmp/chaos-bug-<seed1>.md &
bun ./scripts/chaos.ts report -s <seed2> -o /tmp/chaos-bug-<seed2>.md &
wait
```

### Phase 3: Root Cause Analysis

For each unique failure pattern, analyze:

1. **Invariant**: Which invariant failed
2. **Scenario**: What chaos conditions triggered it
3. **Event sequence**: What events led to failure
4. **Code path**: Which files/functions involved

Read the relevant code to identify root cause:

| Invariant      | Primary File                         | Secondary    |
| -------------- | ------------------------------------ | ------------ |
| duplicateNodes | `reconcile.ts`                       | `sync.ts`    |
| orphanedNodes  | `reconcile.ts`                       | `emit.ts`    |
| syncMismatch   | `writequeue.ts`                      | `watcher.ts` |
| missingParents | `reconcile.ts:ensureFolderHierarchy` | -            |

**Root cause categories**:

- **Race condition**: Events processed out of order
- **Missing check**: No guard for edge case
- **State leak**: Previous state not cleaned up
- **Timing issue**: Debounce/delay wrong

### Phase 4: Present Findings

```markdown
## Chaos Test Results

**Config**: N iterations in Xs
**Result**: X passed, Y failed

### Unique Failure Patterns (grouped)

#### Pattern 1: Duplicate nodes under queue overflow

- **Invariant**: noDuplicateNodes
- **Scenarios**: queue_overflow, event_storm
- **Seeds**: 12345, 67890, 33333 (3 occurrences)
- **Root Cause**: reconcileDirectory doesn't check for existing node before create
- **Evidence**: [quote relevant code]
- **Fix Type**: Bug fix (P2)

#### Pattern 2: ...

### Recommendations

| #   | Type          | Priority | Description                                           |
| --- | ------------- | -------- | ----------------------------------------------------- |
| 1   | Bug           | P2       | Add existence check before node creation in reconcile |
| 2   | Robustness    | P3       | Add retry with dedup for queue overflow recovery      |
| 3   | Observability | P4       | Add debug logging for duplicate detection             |
```

**STOP HERE** - Ask user which recommendations to proceed with.

### Phase 5: Create Beads (if approved)

Only after user approval, create beads:

```bash
bd create --type=bug --priority=2 --title="Sync: duplicate nodes under queue overflow" \
  --body="$(cat <<'EOF'
## Description
[Root cause analysis from Phase 3]

## Reproduction
bun ./scripts/chaos.ts reproduce -s 12345

## Fix Approach
[Proposed fix]

## Regression Test
After fixing, save the regression scenario:
bun ./scripts/chaos.ts save-regression -s 12345 -b <this-bead-id>

Test file: `packages/km-storage/tests/sync/chaos/regressions/<this-bead-id>.md`
EOF
)"

# IMPORTANT: Tag all chaos-discovered bugs with bug/sync label
bd update <id> --add-label "bug/sync"
```

**One bead per unique root cause**, not per seed.

**Labeling**: All bugs discovered by chaos testing MUST be tagged with `bug/sync` label:

```bash
bd update <id> --add-label "bug/sync"
```

To find all chaos-discovered bugs:

```bash
bd list --label "bug/sync"
```

### Phase 6: Save Regression Scenario

**IMPORTANT**: Save the full scenario (not just the seed) to make regression tests immune to fuzzer code changes.

```bash
# Save with descriptive text about what went wrong
bun ./scripts/chaos.ts save-regression -s 12345 -b km-xxxx \
  -d "Queue overflow causes duplicate nodes: reconcileDirectory creates node without checking existence"
```

The description should explain:

- **What invariant failed** (e.g., "duplicate nodes")
- **What triggered it** (e.g., "queue overflow scenario")
- **Root cause** (e.g., "reconcileDirectory creates node without checking existence")

This creates a markdown file at `packages/km-storage/tests/sync/chaos/regressions/<bead-id>.md` with:

- **YAML frontmatter**: beadId, createdAt, invariantsViolated, seed, setup, scenarios, events
- **Markdown body**: Human-readable description of the bug and root cause

**Why full scenarios?** Seeds depend on fuzzer generation code. If that code changes, the same seed produces different scenarios. Full scenario storage makes tests reproducible forever.

After saving:

1. **Edit the markdown** to add detailed description and root cause
2. **Update the bead** with link to regression file: `bd update <id> --body "... Regression: regressions/<id>.md"`
3. Fix the bug
4. Run regression tests: `bun test packages/km-storage/tests/sync/chaos/regression.test.ts`
5. Add `fixedIn` field to frontmatter
6. Commit both the fix and the regression file

### Phase 7: Cleanup & Next Steps

```bash
rm /tmp/chaos-*.md /tmp/chaos-output.txt 2>/dev/null
```

Suggest next steps:

- `bun ./scripts/chaos.ts reproduce -s <seed>` to debug specific failure
- Save regression: `bun ./scripts/chaos.ts save-regression -s <seed> -b <bead-id>`
- Re-run `/chaos-test quick` after fix to verify (~1s with parallel mode)
- Run `bun test packages/km-storage/tests/sync/chaos/regression.test.ts`

**Quick iteration cycle** (parallel mode makes this fast):

```bash
# 1000 iterations in ~1 second
bun ./scripts/chaos.ts fuzz -n 1000
```

---

## Quality Gates

Before presenting findings:

- [ ] Failures grouped by invariant (not reporting same bug 5x)
- [ ] Root cause identified with code evidence
- [ ] Each recommendation has clear fix type and priority
- [ ] Bead descriptions include reproduction steps

## Anti-Patterns

- Creating 5 beads for 5 seeds of the same bug
- Analyzing without reading the actual code
- Recommending fixes without understanding root cause
- Creating beads without user approval
- Ignoring the grouping step (leads to duplicate beads)

---

## Phase 8: Retrospective (Optional)

After fixing bugs, consider improvements to the chaos testing system itself:

### Questions to Ask

1. **Why wasn't this caught sooner?** Was there a gap in test coverage, invariants, or scenarios?
2. **Could better tooling have helped?** Faster iteration, clearer output, better debugging?
3. **Is the root cause in production code or test infrastructure?** Be explicit about which.

### Improvement Categories

| Category          | Examples                                                    |
| ----------------- | ----------------------------------------------------------- |
| **Invariants**    | Add new invariant checks (e.g., "all initial files synced") |
| **Scenarios**     | Add chaos scenarios that would have caught this bug         |
| **Observability** | Add debug logging, timing info, state dumps                 |
| **Tooling**       | Improve CLI output, add bisect mode, better error messages  |
| **Documentation** | Update this command, add gotchas to CLAUDE.md               |

### Template

```markdown
## Retrospective: [Bug Title]

**Root Cause Location**: [production code | test infrastructure | both]

### What Went Wrong

- [Description of the bug]

### Why It Wasn't Caught

- [Gap in coverage, missing invariant, etc.]

### Improvements Made

- [ ] Added invariant: [name]
- [ ] Added scenario: [name]
- [ ] Added logging: [location]
- [ ] Updated tooling: [description]
- [ ] Updated docs: [file]

### Future Prevention

- [What would catch similar bugs automatically]
```

---

## Finding Chaos Bugs

All bugs discovered through chaos testing are labeled `bug/sync`:

```bash
# List all chaos-discovered bugs
bd list --label "bug/sync"

# Find open chaos bugs
bd list --label "bug/sync" --status open
```

---

## Regression Files

Regression scenarios are stored in `packages/km-storage/tests/sync/chaos/regressions/`:

```
regressions/
├── README.md          # Format documentation
├── km-91vy.md         # Named by bead ID
├── km-7gno.md
└── ...
```

**File format (markdown with YAML frontmatter):**

```markdown
---
type: chaos-test
beadId: km-91vy
createdAt: 2024-01-22T12:00:00.000Z
fixedIn: abc1234
invariantsViolated:
  - noDuplicateNodes
seed: 987654321
index: 0
setup:
  - path: file1.md
    content: |
      # Title
      - [ ] Task 1
scenarios:
  - type: queue_overflow
    params:
      dropRate: 0.2
events:
  - type: add
    path: file1.md
    mtime: 1700000000000
---

# Queue overflow causes duplicate nodes

When queue overflow occurs and events are redelivered after recovery,
`reconcileDirectory` creates nodes without checking if they already exist.

## Root Cause

The `reconcileDirectory` function doesn't check for existing nodes
before creating new ones during overflow recovery.
```

**Bidirectional linking:**

- Regression file `beadId` links to the tracking bead
- Markdown body explains the bug (what/why/how)
- Bead body includes path to regression file

**Commands:**

```bash
# Save a failing scenario
bun ./scripts/chaos.ts save-regression -s <seed> -b <bead-id>

# Run all regression tests
bun test packages/km-storage/tests/sync/chaos/regression.test.ts

# Reproduce a specific seed (for debugging)
bun ./scripts/chaos.ts reproduce -s <seed> -v
```

---

**Keywords**: chaos, fuzz, fuzzer, stress, test, sync, watcher, robustness, invariant, bug, discover, bug/sync, regression, save-regression
