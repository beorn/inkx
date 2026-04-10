---
description: Feature implementation workflow - assess, plan, test, implement
---

# Feature Implementation Workflow

Test-driven feature development following TDD principles.

## Contents

- [Common TDD Cycle](#common-tdd-cycle)
- [Step 1: Assess Complexity](#step-1-assess-complexity)
- [Step 2: If Planning Needed](#step-2-if-planning-needed)
- [Step 3: Write Acceptance Test](#step-3-write-acceptance-test)
- [Step 4: Implement Incrementally](#step-4-implement-incrementally)
- [Step 5: Verify & Close](#step-5-verify--close)
- [Feature Types](#feature-types)
- [Creating Epics](#creating-epics)
- [Sub-Agent Spawn](#sub-agent-spawn)
- [Anti-Patterns](#anti-patterns)
- [Quality Checklist](#quality-checklist)

---

## Common TDD Cycle

All features follow this pattern:

```
Write/verify test
  ↓
Implement incrementally
  ↓
bun run test:fast → GREEN
  ↓
Refine if needed
  ↓
Close bead with evidence
```

**Core commands:**

```bash
bun run test:fast    # Quick iteration (~8s)
bun fix              # Lint + format
bd close <id> --reason "<evidence>"
```

---

## Step 0: Staleness Check

If the bead is **older than 1 week**, re-verify requirements before starting:

1. Check if the codebase has changed in ways that affect this feature
2. Verify the described behavior/API still matches current architecture
3. If still relevant: `bd update <id> --notes "Verified YYYY-MM-DD: requirements current"`
4. If requirements drifted: update the description, then proceed
5. If no longer needed: close with reason

This doesn't apply to beads created in the current session or verified within the last week.

## Step 0.5: Search History

**Before planning or coding, search for prior context:**

```bash
bun recall "keywords from feature description"
bun recall --raw "affected module or function"
```

Prior sessions may have:
- Already discussed approaches or architecture for this feature
- Partially implemented it (check for abandoned branches or beads)
- Made design decisions that affect implementation
- Documented constraints or trade-offs

Skip only if recall auto-context (hook) already surfaced relevant results.

## Step 1: Assess Complexity

**Trivial** (implement inline):

- Single function, UI label, config change
- <10 lines

**Simple** (inline with tests):

- Single file, clear pattern
- 10-50 lines

**Moderate** (plan then implement):

- Multi-file, new component
- Touches 2-3 packages
- 50-200 lines

**Complex** (enter plan mode or use /max):

- Architecture change
- 3+ packages → consider `/max` for parallel implementation
- Epic scope
- > 200 lines

**Plan mode triggers:**

- "refactor", "redesign", "architecture"
- Cross-cutting concerns
- Multiple valid approaches
- User requests planning

## Step 2: If Planning Needed

For moderate/complex features:

**Read first** (before making any plans):
- [/docs/principles.md](/docs/principles.md) - Architecture patterns, composability, fast feedback
- [/docs/lessons/refactoring.md](/docs/lessons/refactoring.md) - If refactoring is involved

```typescript
EnterPlanMode()
```

After plan approval, continue to step 3.

## Step 3: Write Acceptance Test

**For TUI features** (`.spec.ts`):

```typescript
test("feature: <description>", () => {
  const { board } = createDriverTest(() => item("root", item("col1", item("item1"))))

  board.press("<key>")
  board.expect("#item1[data-state=selected]").toExist()
})
```

**For logic** (`.test.ts`):

```typescript
test("<feature>", () => {
  const result = newFeature(input)
  expect(result).toBe(expected)
})
```

Run `bun run test:fast` - should fail.

## Step 4: Implement Incrementally

```bash
bun run test:fast  # Tight iteration loop (~8s)
```

**Guidelines:**

- Start with happy path
- Follow existing patterns
- Keep it simple
- No premature optimization
- No extra features

## Step 5: Integrate User Feedback

Throughout implementation, the user may give feedback. **You MUST follow** the [user feedback protocol](../beads.md#user-feedback) — log feedback verbatim in notes, rewrite the bead description to reflect current understanding, and ask immediately if unclear.

## Step 6: Verify & Close

```bash
bun run test:fast  # All pass
bun fix            # Clean code
```

**Visual verification for TUI features**: **You MUST follow** the [three-layer verification protocol](../../tui/fix.md#three-layer-verification) — TUI regression test + GUI/TTY screenshot + user confirmation for anything visible on screen. Pure logic features need TUI tests only.

**Close:**

```bash
bd close <id> --reason "Implemented: <what, where>. Tests: <names>. Verified: TUI test + GUI/TTY / TUI tests only."
```

---

## Feature Types

**UI (TUI)** - [apps/km-tui/tests/board.spec.ts](../../../apps/km-tui/tests/board.spec.ts):

- Test keyboard interactions
- Verify visual state updates
- Check navigation behavior
- Validate layout

**Storage** - [@km/storage](../../../packages/km-storage/):

- Test bidirectional sync
- TUI changes → file updates
- File changes → TUI updates
- Concurrent changes handled

**Board** - [@km/board](../../../packages/km-board/):

- State transitions
- History tracking
- View modes

**Parser** - [@km/markdown](../../../packages/km-markdown/):

- Parse → format round-trip
- Syntax handling

---

## Creating Epics

For features needing 5+ subtasks:

```bash
bd create --id km-epic-<slug> --type epic --title "<name>"
bd create --id km-epic-<slug>.a --type task --title "<first>"
bd update km-epic-<slug>.a --parent km-epic-<slug>  # Set parent AFTER creation (--id and --parent conflict)
bd update km-epic-<slug>.a --claim
```

**Multi-package epics**: Use `/max` to parallelize subtasks across packages.

---

## Sub-Agent Spawn

For non-trivial implementation without planning:

```typescript
Task({
  description: "Implement <bead-id>",
  prompt: `
    Implement: <bead-id>

    ## Requirement
    <description>

    ## Approach
    <suggested approach>

    ## Instructions
    1. Write failing test
    2. Implement incrementally
    3. Run test:fast frequently
    4. Close bead when done

    ## Patterns to Follow
    <similar implementations>
  `,
  subagent_type: "general-purpose",
})
```

---

## Anti-Patterns

- ❌ Adding features beyond requirement
- ❌ Premature optimization
- ❌ Skipping tests
- ❌ Forgetting to create/update bead

---

## Quality Checklist

**Before closing:**

- [ ] Recall searched for prior context
- [ ] Acceptance test written BEFORE implementation (test-first)
- [ ] Tests pass (`bun run test:fast`)
- [ ] `bun fix` passes
- [ ] No console.log left
- [ ] **GUI/TTY visual verification for UI features** (AI screenshot proves it looks right)
- [ ] **User confirmed fixed** for UI features (user visually verified)
- [ ] Evidence in close reason (must state TUI-tests-only OR TUI-test+GUI/TTY+user)
- [ ] No scope creep
