---
description: Step back from recent work and find opportunities for dramatic simplification, missing abstractions, and structural improvements. Not about bugs or style — about whether the code could be fundamentally better.
argument-hint: [area or recent work to review]
allowed-tools: Read, Glob, Grep, Bash, Agent, Edit, Write, AskUserQuestion
---

# Improve — What Would This Look Like If It Were Easy?

**Keywords**: improve, simplify, streamline, rethink, step back, what if, dramatically better

Not a code review. Not a bug hunt. This is a **design review of the code you just wrote** — asking whether the abstractions are right, whether the architecture serves the use case, and what a 10x simpler version would look like.

## When to Use

After completing a feature, refactor, or bug fix. The code works and tests pass — now ask: is this the right shape?

## Process

### 1. Identify the Area

Read the recent commits, changed files, or user-specified area. Understand what was built and why.

### 2. Ask the Hard Questions

For each subsystem you touched, answer ALL of these:

**Abstraction quality:**
- What concept is this code modeling? Is it the RIGHT concept, or a workaround for a missing concept?
- Are there domain objects trying to emerge from the code? (Repeated parameter groups, shared validation, related operations scattered across files)
- What would a domain expert call this? Does the code use that name?

**Simplicity:**
- What would this look like if it were easy? (Not "how can I simplify" — "what if the problem were trivially simple?")
- Which lines exist because of accidental complexity vs essential complexity?
- If you deleted this code and rewrote it in 30 minutes, what would you do differently?
- Where are there 10 lines doing what should be 1-2 lines?

**Duplication & patterns:**
- What patterns repeat across handlers/functions/files? Each repetition is a missing abstraction.
- Are there functions that share 80% of their logic but diverge on one axis? That's a parameterizable pattern.
- Is branching logic (if/switch) doing what polymorphism or a lookup table could do?

**Interface design:**
- Do callers pass too many arguments? (Missing parameter object or context)
- Do callers immediately destructure results? (Wrong return type)
- Do callers always follow the same sequence of calls? (Missing composed operation)
- Is there a function that every caller wraps with the same guard/check? (Guard should be inside)

**Architecture:**
- Is the code in the right layer? (UI logic in storage? Storage logic in commands? Domain logic in UI?)
- What would break if you changed the underlying data structure? How many files?
- Could this be a pure function? If not, why not — and is that reason essential?

**Flexibility:**
- What new requirement would force a rewrite? (Fragility indicator)
- What's the next feature someone will want? Does the current design make it easy or hard?
- If this needed to work in both TUI and browser, what would need to change?

### 3. Synthesize

For each finding, classify:

| Category | Description | Action |
|----------|-------------|--------|
| **Missing abstraction** | A domain object or helper that would eliminate a class of boilerplate | Create bead, implement if small |
| **Wrong abstraction** | An abstraction that doesn't match the domain — forces callers to fight it | Create bead for redesign |
| **Misplaced code** | Code in the wrong layer — will cause coupling pain later | Move it or create bead |
| **Dramatic simplification** | A way to delete 50%+ of the code by changing the approach | Discuss with user, then implement |
| **Missing interface** | A method that should exist on a type/object but doesn't | Add it |
| **Unnecessary complexity** | Code that handles cases that can't happen, or defends against things the type system guarantees | Delete it |

### 4. Present

```markdown
## Improve: <area>

### What would this look like if it were easy?
<1-3 sentences painting the ideal>

### Findings
| # | Category | Finding | Impact | Effort |
|---|----------|---------|--------|--------|
| 1 | Missing abstraction | Selection type with batch ops | Eliminates 50+ lines of repeated gather/validate/execute | P2 |
| 2 | Dramatic simplification | repo.moveNode handles -1 natively | Eliminates toSortOrder adapter entirely | P3 |

### Quick wins (implement now)
<List of small improvements to make immediately>

### Beads created
<List of beads for larger work>
```

## Anti-Patterns

- Reviewing style/formatting — that's `/code clean`
- Hunting for bugs — that's `/troubleshoot`
- Checking for stale docs — that's `/complete`
- Suggesting changes without understanding WHY the code is shaped this way
- Proposing abstractions for one-off code (premature abstraction is worse than duplication)
- Ignoring the TEA/universal-editor vision when evaluating architecture

## Key Insight

The best improvements aren't "make this code better" — they're "realize this code shouldn't exist because the abstraction above it should handle this case." Every line of code is either essential complexity (inherent to the problem) or accidental complexity (artifact of the current design). This skill finds the accidental complexity.
