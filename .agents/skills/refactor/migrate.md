# /refactor migrate — Mechanical Migration Workflow

**Use for**: Type restructurings, field renames, interface changes, API migrations touching 50+ files.

**Key insight**: For mechanical migrations, the agent's value is in **understanding the pattern**, not **applying it 189 times**. Agents hallucinate completion on repetitive transforms. Use batch-refactor for the mechanical 80%, agents for the judgment 20%.

## When to Use This (vs /refactor plan)

| Situation | Tool |
|-----------|------|
| New abstraction, phased decomposition, architectural change | `/refactor plan` |
| Rename a field across 100+ files | `/refactor migrate` |
| Change a type from A to B across all consumers | `/refactor migrate` |
| Move fields between types (e.g., flat → nested) | `/refactor migrate` |
| Any change where 80%+ of edits follow a mechanical pattern | `/refactor migrate` |

## Step 1: Define the Transform

Write the before/after pattern clearly. This becomes the spec for batch-refactor commands.

```markdown
### Transform: <name>

**Before**:
```typescript
// The old pattern
{ item: true, task_marker: "[ ]", task_status: "todo", list_marker: "-" }
node.task_status
```

**After**:
```typescript
// The new pattern
{ item: { list: "-", task: { marker: "[ ]", status: "todo" } } }
node.item?.task?.status
```

**Patterns** (each becomes a batch-refactor command):
1. `item: true` → `item: {}`
2. `task_marker: X, task_status: Y` → inside `item: { task: { marker: X, status: Y } }`
3. `node.task_status` → `node.item?.task?.status`
```

## Step 2: Analyze Blast Radius

```bash
# Count occurrences per package
grep -r "old_pattern" --include="*.ts" | cut -d: -f1 | cut -d/ -f1-3 | sort | uniq -c | sort -rn

# Count total
grep -r "old_pattern" --include="*.ts" | wc -l
```

Classify files:
- **Core definition** (1-3 files) — change manually, commit first
- **Mechanical consumers** (80% of files) — batch-refactor
- **Judgment-required** (10-20% of files) — agent handles after batch
- **DB/SQL layer** — may need different handling (flat columns vs nested types)
- **Test fixtures** — usually mechanical, but check assertion patterns too

## Step 3: Change the Definition FIRST

Manually change the core type/interface. This is 1-5 lines of code. Commit it.

```bash
# Edit the interface
# Then immediately verify the blast radius
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v vendor/ | wc -l
# → Expected: ~N errors (matches blast radius analysis)
```

**Commit the definition change before touching consumers.** This is the anchor — if anything goes wrong, consumers can be re-derived from the definition change + tsc errors.

## Step 4: Batch-Refactor the Mechanical 80%

Use `bun vendor/bearly/tools/refactor.ts` for mechanical patterns:

```bash
# Simple find-replace (ripgrep backend — fast, exact)
bun vendor/bearly/tools/refactor.ts pattern.replace \
  --pattern "\.item === true" --replace ".item != null" \
  --glob "**/*.ts" --backend ripgrep \
  --output /tmp/migrate-1.json

# Preview
bun vendor/bearly/tools/refactor.ts editset.apply /tmp/migrate-1.json --dry-run

# Apply
bun vendor/bearly/tools/refactor.ts editset.apply /tmp/migrate-1.json

# Verify error count decreased
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v vendor/ | wc -l
```

For complex patterns (context-dependent transforms):
```bash
# LLM-powered pattern migration
bun vendor/bearly/tools/refactor.ts pattern.migrate \
  --patterns "task_marker" \
  --prompt "Change node.task_marker to node.item?.task?.marker, ..." \
  --glob "**/*.ts" \
  --output /tmp/migrate-2.json
```

**After EACH batch-refactor command, check tsc error count.** It should decrease monotonically.

## Step 5: Fix Edge Cases (the 20%)

After batch-refactor, run tsc to find remaining errors:

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v vendor/ | head -30
```

These are the files that need judgment — conditional logic, partial updates, DB mapping layers, complex test fixtures. Fix these manually or with a targeted agent.

## Step 6: Verify

```bash
# Type check: 0 non-vendor errors
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v vendor/ | wc -l
# → 0

# Tests: all pass
bun run test:fast

# Completeness: no old pattern remains in source
grep -r "old_pattern" --include="*.ts" packages/ apps/ | grep -v vendor/ | wc -l
# → 0 (or only legitimate uses like DB column names)
```

## Step 7: Commit and Clean Up

```bash
git add -A && git commit -m "refactor(scope): migration-name

BREAKING: describe the interface change
- old pattern → new pattern
- N files changed, M tests pass
- DB schema unchanged (if applicable)

Resolves: km-scope.migration-bead"
```

## Anti-Patterns

| Don't | Do Instead |
|-------|-----------|
| Assign an agent to manually edit 189 files | Use batch-refactor for mechanical patterns |
| Put the transform spec in a 3,000-word prompt | Write batch-refactor commands (executable, testable) |
| Use a worktree for cross-cutting migrations | Work on main — agent needs to see the full state |
| Skip tsc verification between batch steps | Check error count after EVERY batch-refactor apply |
| Commit everything at the end | Commit the definition change first, then consumers |
| Trust an agent's "0 errors" claim | Run tsc yourself and check the actual count |

## Example: item-as-object (from session 0401b)

What should have been done:

```bash
# Step 3: Change the definition (manual, 10 lines)
vim packages/km-core/src/types.ts  # Add ItemData, change item?: boolean → item?: ItemData
git add packages/km-core && git commit -m "refactor(core): ItemData type definition"

# Step 4: Batch-refactor the 80%
bun vendor/bearly/tools/refactor.ts pattern.replace \
  --pattern "item: true" --replace "item: {}" \
  --glob "**/*.ts" --backend ripgrep --output /tmp/m1.json
bun vendor/bearly/tools/refactor.ts editset.apply /tmp/m1.json

bun vendor/bearly/tools/refactor.ts pattern.replace \
  --pattern "\.item === true" --replace ".item != null" \
  --glob "**/*.ts" --backend ripgrep --output /tmp/m2.json
bun vendor/bearly/tools/refactor.ts editset.apply /tmp/m2.json

# tsc: 443 → ~50 errors (batch handled the mechanical cases)
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v vendor/ | wc -l

# Step 5: Agent fixes the 50 edge cases (DB mapping, complex fixtures)
# This is where agent judgment matters — not the other 140 files
```

**Result**: ~30 min instead of ~2 hours, no hallucinated completion, no worktree confusion.
