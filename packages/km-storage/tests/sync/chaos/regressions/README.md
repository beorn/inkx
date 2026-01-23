# Chaos Regression Scenarios

This directory contains regression test scenarios discovered by chaos testing.

## File Format

Each file is a markdown file named `<bead-id>.md` with YAML frontmatter:

```markdown
---
type: chaos-test
beadId: km-xxxx
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

## Trigger Conditions

- Chaos scenarios: queue_overflow
- Files: 1
- Events: 1

## Root Cause

The `reconcileDirectory` function in `reconcile.ts` doesn't check for
existing nodes before creating new ones during overflow recovery.
```

## Description

The markdown body (after frontmatter) should explain:

- **Title (H1)**: Brief summary of the bug
- **Prose**: Detailed explanation of what went wrong
- **Trigger Conditions**: What chaos scenarios triggered it
- **Root Cause**: Why the bug occurred (code-level explanation)

## Bidirectional Linking

Regression files and beads should reference each other:

1. **Regression → Bead**: The `beadId` field links to the tracking bead
2. **Bead → Regression**: The bead body should include path to regression file

This enables traceability: from a failing test you can find the bead, from a bead you can find the test.

## Adding a New Regression

After discovering a bug with chaos testing:

```bash
# 1. Create the bead
bd create --type=bug --add-label bug/sync --title="..."

# 2. Save the scenario with descriptive text
bun ./scripts/chaos.ts save-regression -s <seed> -b <bead-id> \
  -d "What failed: root cause explanation"

# 3. Edit the generated markdown file to add detailed description

# 4. Update bead to reference regression file
bd update <bead-id> --body "... Regression: regressions/<bead-id>.md"

# 5. Fix the bug

# 6. Run regression tests to verify
bun test packages/km-storage/tests/sync/chaos/regression.test.ts

# 7. Add fixedIn field to the frontmatter
```

## Why Full Scenarios?

We store complete scenarios (not just seeds) because:

1. **Immune to code changes** - If the fuzzer's generation logic changes, stored scenarios still replay exactly
2. **Self-documenting** - Can inspect exactly what setup/events caused the bug
3. **Debuggable** - Can manually trace through the event sequence
4. **Human-readable** - Markdown format with prose description

## Running Regressions

```bash
# Run all regression tests
bun test packages/km-storage/tests/sync/chaos/regression.test.ts

# This is also included in test:fast
bun run test:fast
```
