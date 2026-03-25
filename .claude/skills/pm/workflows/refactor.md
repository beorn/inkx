# Refactoring Workflow — Phased Migration Planning

## Step 0: Read Refactoring Lessons (MANDATORY)

**Before doing ANYTHING else**, read [docs/lessons/refactoring.md](../../../docs/lessons/refactoring.md) IN FULL. Not skim — read every case study. The lessons are hard-won from failed refactors in this codebase.

Key takeaways to keep in mind throughout:
- Delete old code first, fix breaks second
- Phase order: Update → Absorb → Purge → Remove → Fix
- No backwards compat shims, re-exports, fallbacks, or `@deprecated`
- "Phase N will handle deletion" never happens
- Definition of Done includes code, tests, examples, README, API docs
- Every new package needs tests in the same commit (era2 lesson)
- Docstrings document reality, not plans (era2 lesson)
- Copy without delete = debt. Delete old copy or create tracking bead (era2 lesson)
- Write /complete criteria AFTER scoping, not before (era2 lesson)

## Step 1: Understand the Current State

Before planning, map what exists:

```bash
# What are we refactoring?
# Read the main files/types/APIs involved
# Understand all consumers — who calls what?

# Count the blast radius
grep -r "OldPattern" --include="*.ts" --include="*.tsx" | wc -l
grep -r "OldPattern" --include="*.md" | wc -l

# Check for existing beads
bd search "topic"
bun recall "topic"
```

**Produce**: A concise "current state" summary with:
- What exists (files, types, APIs, packages)
- Who consumes it (callers, importers, docs, tests)
- What's wrong (why refactor?)
- Blast radius (how many files/references)

## Step 2: Design the Target State

Write a design doc (or update an existing one) that describes:
- **Core objects/types** — what are the new abstractions?
- **Public API** — what do consumers use after the refactor?
- **Internal structure** — how does it work inside?
- **What's deleted** — what old APIs/types/files go away?

Use `/discuss` if you need to explore alternatives before committing.

Consider getting a `/pro-review` or `/deep` second opinion on the design — especially for architectural decisions that are hard to reverse.

**Key question at this stage**: Can you draw a clean line between what exists today and what should exist after? If the boundary is fuzzy, the refactor will fail.

## Step 3: Decompose into Phases

Split the refactor into sequential phases where **each phase is independently shippable** — the codebase is clean and complete after every phase.

### Rules for Phase Decomposition

1. **Each phase introduces ONE new concept** (type, API, abstraction)
2. **Each phase deletes the old equivalent** — same phase, not deferred
3. **Each phase has explicit /complete criteria** — grep patterns that must return 0 hits
4. **Phases are strictly sequential** — no starting Phase N+1 before Phase N is `/complete`d
5. **If a phase can't delete the old path, shrink its scope** until it can

### Phase Template

```
**Phase N: <Name>** (`<bead-id>`)
<One-line description of what changes>

- `path/to/file.ts` — what happens to it (NEW / rewrite / split / merge / delete)
- `path/to/other.ts` — what happens

**Delete**: <what old APIs/files/exports are removed in this phase>
**/complete**: `grep` for <old patterns> → 0 hits. <other criteria>.
```

### Anti-Patterns to Watch For

| Anti-Pattern | What to Do Instead |
|---|---|
| Phase adds new API alongside old one | Delete old in same phase |
| Phase says "tests will be updated later" | Include tests in this phase |
| Phase leaves `@deprecated` annotation | Delete the API entirely |
| Phase creates a compat shim / re-export | Fix all callers instead |
| Phase has no explicit deletion | Add a Delete section or question the phase |
| Phase depends on future phase for cleanup | Shrink scope until self-contained |

### Exception: Deferred Work

If work truly cannot be completed in the current phase (e.g., a dependency hasn't been extracted yet):
1. Create a bead with the same `/complete` criteria
2. Insert it into the plan at the correct point
3. Make it block subsequent phases
4. Never leave it as a TODO comment in code

## Step 4: Create Tracking Bead + Phase Beads

### Tracking Bead (the canonical status dashboard)

Every large refactor needs **one canonical tracking bead** (type=epic) that serves as the top-down status dashboard. Anyone should be able to `bd show <tracking-bead>` at any time and understand: what's done, what's in progress, what's blocked, what's next.

```bash
bd create --id km-<scope>.<refactor-name> --type epic --priority 1 \
  --title "[epic] <Refactor Name>" \
  --description "<Overview: what, why, target state, design doc link, phase summary>"
```

The tracking bead's **description** must be kept up-to-date as phases complete. It should contain:
- One-line summary of the refactor's goal
- Link to the design doc
- Current status: which phase is active, what's done, what's next
- Any blocking issues or risks

**Update the tracking bead every time**:
- A phase is completed or started
- The plan changes (phases added, split, or reordered)
- A blocker is discovered or resolved
- A design decision changes the approach

This is non-negotiable. Stale tracking beads cause future sessions to work from outdated context — the #1 cause of reverted refactors (see Lesson 1: Update Beads First).

### Phase Beads

For each phase, create a child bead:
- **Title**: `<Era/Scope> Phase N: <Name>`
- **Description**: What changes, what's deleted, /complete criteria
- **Dependencies**: Previous phase (sequential chain)
- **Parent**: The tracking bead
- **Notes**: `MANDATORY first step: Read docs/lessons/refactoring.md IN FULL before writing any code.`

```bash
bd create --id km-<scope>.phase-N-name --type task --priority 1 \
  --title "Phase N: <Name>" \
  --description "<paste phase template>"
bd update km-<scope>.phase-N-name --parent km-<scope>.<refactor-name>
bd dep add km-<scope>.phase-N-name km-<scope>.phase-N-1-name
bd update km-<scope>.phase-N-name --append-notes "MANDATORY first step: Read docs/lessons/refactoring.md IN FULL before writing any code."
```

## Step 5: Review the Plan

Before executing, review holistically:

### Self-Review Checklist

- [ ] Every phase has a **Delete** section — nothing deferred
- [ ] Every phase has a **/complete** section with grep criteria
- [ ] Phases are sequential — each depends on the previous
- [ ] No phase leaves dual paths (old + new both working)
- [ ] Design doc and beads are aligned (same phases, same scope)
- [ ] Blast radius is covered — docs, tests, examples, not just code
- [ ] Performance impact considered — any phase add non-trivial overhead?
- [ ] Focus/scope/headless classified correctly (which era/layer owns it?)

### External Review

For large refactors (10+ files, 3+ phases), get a `/pro-review`:

```bash
# Combine design doc + bead descriptions into context file
# Send for review
bun llm pro --context-file /tmp/refactor-plan.md -y "Review this refactoring plan..."
```

Ask specifically about:
- Docs ↔ beads alignment
- Missing phases or deferred work
- Sequencing conflicts (parallel work on shared packages)
- Spec bugs or underspecified contracts
- Strategic risks

## Step 6: Execute Phase by Phase

For each phase:

1. **Claim the bead**: `bd update <id> --claim`
2. **Read refactoring lessons**: `Read docs/lessons/refactoring.md` (yes, every time)
3. **Read the phase description** in the design doc
4. **Execute**: Update → Absorb → Purge → Remove → Fix
5. **Verify**: `grep` for old patterns → 0 hits
6. **Run tests**: `bun fix && bun run test:fast`
7. **Run /complete**: Full completeness audit
8. **Close the bead**: `bd close <id> --reason "..."`
9. **Commit and push**

### During Execution

- **No dual paths**: If you find yourself adding NewWay alongside OldWay "temporarily", stop. Delete OldWay first.
- **No compat shims**: If you're tempted to add `export { newThing as oldThing }`, don't. Fix callers.
- **No deferred deletion**: If you're writing a TODO comment about cleanup, do the cleanup now.
- **Track surprises**: If a phase reveals unexpected complexity, update the plan (add/split phases), don't push through.
- **Update tracking bead**: After completing each phase, update the tracking epic's description with current status.

## `/refactor plan` — Quick Start

When invoked with `/refactor plan <scope>`:

1. Read `docs/lessons/refactoring.md`
2. Map current state (Step 1)
3. Discuss target state with user (Step 2)
4. Propose phases (Step 3)
5. After user approval, create beads (Step 4)
6. Send for review if large (Step 5)

## `/refactor review` — Plan Review

When invoked with `/refactor review`:

1. Read the active refactoring plan/design doc
2. Read all associated beads
3. Run the self-review checklist (Step 5)
4. Report findings with specific bead IDs and doc sections
5. Optionally send for `/pro-review`

## `/refactor phase <N>` — Execute Phase

When invoked with `/refactor phase <N>`:

1. Read `docs/lessons/refactoring.md` (yes, every time)
2. Claim the bead
3. Read the phase description
4. Execute with zero-WIP discipline
5. Run `/complete`
6. Close the bead

## See Also

- [docs/lessons/refactoring.md](../../../docs/lessons/refactoring.md) — Case studies and core lessons
- [docs/principles.md](../../../docs/principles.md) — Quarantine and Delete, Legacy Code as Virus
- [/complete skill](../../complete/SKILL.md) — Completeness audit
- [/pm skill](../SKILL.md) — Bead management
