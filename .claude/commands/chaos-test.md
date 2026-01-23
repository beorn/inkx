---
description: Chaos Test Command - Run chaos testing to discover sync bugs and recommend fixes
argument-hint: [5m | 1000 | quick | --analyze-only <seed>]
allowed-tools: Task, Read, Glob, Grep, Bash, TodoWrite, AskUserQuestion
---

# Chaos Test Command

Run chaos testing on km's filesystem sync system to discover bugs, analyze root causes, and recommend fixes.

**Mode**: $ARGUMENTS

- `quick` or empty → 100 iterations (~10s), just report pass/fail counts
- `<N>` (number) → N iterations with full analysis
- `<N>m` / `<N>s` / `<N>h` → Duration-based (~10 iter/sec)
- `--analyze-only <seed>` → Skip fuzzing, analyze existing failure

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

Convert duration to iterations:
- `5m` → 3000 iterations (~10/sec)
- `30s` → 300 iterations
- `1h` → 36000 iterations
- `1000` → 1000 iterations

```bash
bun run chaos:fuzz -n <iterations> -v 2>&1 | tee /tmp/chaos-output.txt
```

Show progress every 25%: "Progress: 25% (245 passed, 5 failed)"

### Phase 2: Collect & Deduplicate Failures

Extract failed seeds from output. **Group by invariant violated** before analyzing:

| Invariant | Seeds |
|-----------|-------|
| noDuplicateNodes | 12345, 67890 |
| noOrphanedNodes | 11111 |

Generate reports for **one seed per invariant group** (max 5 total):

```bash
# Run these in parallel
bun run chaos:report -s <seed1> -o /tmp/chaos-bug-<seed1>.md &
bun run chaos:report -s <seed2> -o /tmp/chaos-bug-<seed2>.md &
wait
```

### Phase 3: Root Cause Analysis

For each unique failure pattern, analyze:

1. **Invariant**: Which invariant failed
2. **Scenario**: What chaos conditions triggered it
3. **Event sequence**: What events led to failure
4. **Code path**: Which files/functions involved

Read the relevant code to identify root cause:

| Invariant | Primary File | Secondary |
|-----------|--------------|-----------|
| duplicateNodes | `reconcile.ts` | `sync.ts` |
| orphanedNodes | `reconcile.ts` | `emit.ts` |
| syncMismatch | `writequeue.ts` | `watcher.ts` |
| missingParents | `reconcile.ts:ensureFolderHierarchy` | - |

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

| # | Type | Priority | Description |
|---|------|----------|-------------|
| 1 | Bug | P2 | Add existence check before node creation in reconcile |
| 2 | Robustness | P3 | Add retry with dedup for queue overflow recovery |
| 3 | Observability | P4 | Add debug logging for duplicate detection |
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
bun run chaos:reproduce -s 12345

## Fix Approach
[Proposed fix]

## Regression Test
Add to REGRESSION_TESTS in regression.ts with seed 12345
EOF
)"
```

**One bead per unique root cause**, not per seed.

### Phase 6: Cleanup & Next Steps

```bash
rm /tmp/chaos-*.md /tmp/chaos-output.txt 2>/dev/null
```

Suggest next steps:
- `bun run chaos:reproduce -s <seed>` to debug specific failure
- Add regression test after fix: update `regression.ts` with the seed
- Re-run `/chaos-test quick` after fix to verify

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

## Phase 7: Retrospective (Optional)

After fixing bugs, consider improvements to the chaos testing system itself:

### Questions to Ask

1. **Why wasn't this caught sooner?** Was there a gap in test coverage, invariants, or scenarios?
2. **Could better tooling have helped?** Faster iteration, clearer output, better debugging?
3. **Is the root cause in production code or test infrastructure?** Be explicit about which.

### Improvement Categories

| Category | Examples |
|----------|----------|
| **Invariants** | Add new invariant checks (e.g., "all initial files synced") |
| **Scenarios** | Add chaos scenarios that would have caught this bug |
| **Observability** | Add debug logging, timing info, state dumps |
| **Tooling** | Improve CLI output, add bisect mode, parallel runs |
| **Documentation** | Update this command, add gotchas to CLAUDE.md |

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

**Keywords**: chaos, fuzz, fuzzer, stress, test, sync, watcher, robustness, invariant, bug, discover
