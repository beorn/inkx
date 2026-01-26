# Report and Fix Issue Skill

When you discover a bug or issue during development, use this workflow to properly track and fix it.

## When to Use

- You encounter a test failure caused by a pre-existing bug (not your changes)
- You discover TypeScript errors in existing code
- You find incomplete/broken functionality
- You notice technical debt that blocks your work

## Workflow

### Phase 1: Check for Existing Issue

```bash
# Search for related issues
bd list --all | grep -i "<keyword>"
```

If found:
```bash
bd update <id> --priority P0
bd update <id> --status ready  # Unclaim if someone else had it
bd show <id>
```

### Phase 2: Create Issue if Not Found

```bash
bd create --type=bug --title="<Clear title describing the bug>" --body="<Description with:
- What's broken
- Where (file paths, line numbers)
- How to reproduce (commands to run)
- Expected vs actual behavior>"

bd update <new-id> --priority P0
```

### Phase 3: Claim and Fix

```bash
bd work <id>  # Claims the issue for your session
```

Then fix the bug:
1. Read the relevant files to understand the issue
2. Make the minimal fix needed
3. Run tests to verify: `bun test <specific-test-file>`
4. Run typecheck if relevant: `bun typecheck 2>&1 | grep "<package>"`

### Phase 4: Close When Fixed

```bash
bd close <id>
```

## Priority Guidelines

| Priority | When to Use |
|----------|-------------|
| P0 | Blocks current work, breaks tests/build |
| P1 | Important but has workaround |
| P2 | Nice to fix, not urgent |

## Example: TypeScript Error

```bash
# 1. Check existing
bd list --all | grep -i "typescript"

# 2. Create if needed
bd create --type=bug --title="TypeScript errors in km-storage tests" \
  --body="bun typecheck shows errors in:
- fake-repo.ts:10 - LoadError not exported
- fuzzer.ts:490 - Wrong argument count

Run: bun typecheck 2>&1 | grep km-storage"

bd update km-xxxx --priority P0

# 3. Claim and fix
bd work km-xxxx
# ... make fixes ...
bun typecheck 2>&1 | grep km-storage | wc -l  # Should be 0

# 4. Close
bd close km-xxxx
```

## Spawning Sub-Agents

When you have multiple independent issues, spawn parallel agents:

```typescript
// In your prompt to the Task tool:
Task({
  description: "Fix <issue> (report+fix)",
  prompt: `Fix <description>.

## PHASE 1: Report
1. bd list --all | grep -i "<keyword>"
2. If found: bd update <id> --priority P0
3. If not: bd create --type=bug --title="..." --body="..."
4. bd work <id>

## PHASE 2: Fix
<specific fix instructions>

## PHASE 3: Close
bd close <id>`,
  subagent_type: "general-purpose",
  run_in_background: true
})
```
