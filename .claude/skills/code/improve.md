---
description: "Design review + code simplification. Finds missing abstractions, wrong abstractions, verbose patterns, and unnecessary complexity. Combines strategic ('is this the right design?') with tactical ('can these 10 lines be 2?')."
argument-hint: [file-or-directory] [--dry-run]
---

## Usage

```bash
/code improve                              # Review recent work — what could be dramatically better?
/code improve packages/km-storage          # Review all files in directory
/code improve src/board/board-actions.ts   # Review single file
/code improve --dry-run                    # Analyze only, don't implement
```

**Arguments**: `[file-or-directory]` `[--dry-run]` (optional, defaults to recent commits)

---

# Improve — What Would This Look Like If It Were Easy?

**Read [docs/principles.md](../../../docs/principles.md) before improving.** Every improvement should align with the principles — they define what "better" means. Extract the full checklist with: `grep '- \[ \]' docs/principles.md`

Design review + systematic simplification. Not a bug hunt, not a style check. Asks whether the abstractions are right AND whether the code is as concise as it should be.

**Good refactoring reduces or maintains line count while improving clarity.** If changes add significant lines, you're probably over-engineering.

## Target

$ARGUMENTS

If no target specified, review recent commits or prompt for scope.

## Phase 1: Strategic Questions

For each subsystem touched, answer ALL of these:

**Abstraction quality:**
- What concept is this code modeling? Is it the RIGHT concept, or a workaround for a missing concept?
- Are there domain objects trying to emerge? (Repeated parameter groups, shared validation, related operations scattered across files)
- What would a domain expert call this? Does the code use that name?

**Abstraction reduction** (the biggest wins are fewer concepts, not fewer lines):
- How many types represent the same concept? Can they be merged? (e.g., 4 "node" types → 2)
- How many places re-derive the same information? Compute once, pass through. (e.g., extractBody 16x → ViewNode.isBody)
- Are there dual representations that can diverge? Single source of truth. (e.g., repo + cache → derived view only)
- How many special-case branches exist for one concern? Make it a first-class variant. (e.g., isBody 60 refs → role="body-column")
- Could cross-cutting logic be middleware instead of inline? (e.g., undo in 43 places → plugin)
- What would a new developer need to understand? Count the concepts. Can you halve them?

**Domain vocabulary** (see [docs/lessons/discoverable-interfaces.md](../../../docs/lessons/discoverable-interfaces.md)):
- Are there bare helper functions that operate on core domain objects? They belong on the object's namespace (`ViewTree.nodes()`, not standalone `dfsTraversal()`)
- Does the code read like pseudocode — intent in domain language? Or like implementation details you have to trace?
- Is the core algorithm/flow expressed in one place using composed domain operations? Or scattered across files as reimplemented primitives?
- Do parallel layers use the same API shape? (`KTree.nodes()` and `ViewTree.nodes()` should have matching predicates)
- Would a new developer typing `ViewTree.` discover the operation they need, or would they grep and write their own?

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

## Phase 2: Tactical Patterns

Use the Agent tool with subagent_type=Explore to analyze files in parallel when reviewing a directory.

Catalog opportunities in these categories:

### Simplification Patterns

| Pattern                | Replace With      | Example                                                             |
| ---------------------- | ----------------- | ------------------------------------------------------------------- |
| Switch with shared patterns | Lookup object + factories | `switch(x){case 'a': return 1}` → `{a:1}[x] ?? default` (exception: exhaustive switches validated by TS) |
| Multi-condition if     | Set.has()         | `if(x==='a'\|\|x==='b')` → `new Set(['a','b']).has(x)`              |
| IIFE for derivation    | Direct expression | `const x = (() => {...})()` → ternary chain or named helper         |
| Repeated regex matches | Extract helper    | 4x identical `while(match.exec())` → `extractMatches(str, pattern)` |
| Verbose conditionals   | Early returns     | Nested if/else → guard clauses at top                               |
| High-complexity function (>30) | <15-line orchestrator + helpers | 200-line function with 5 phases → orchestrator + 5 focused helpers |
| Duplicated loop body   | Shared helper called N times | 3 identical viewport-fill loops → `fillViewport()` called 3x |
| Sequential if/else type dispatch | Classifier chain or lookup | Token type chain → `classifiers.find(c => c(token))` |
| Redundant abstractions | Merge or delete | 3 cursor systems → 1 ViewNode.role lookup |
| Dual representations | Single source of truth | repo + cache → derived view only |
| Re-derivation | Compute once, pass through | extractBody 16x → ViewNode.isBody |
| Special-case sprawl | First-class variant | isBody 60 refs → role="body-column" |
| Cross-cutting inline | Middleware/plugin | undo in 43 places → plugin pipeline |

### Alignment Patterns (from docs/principles.md)

| Pattern                | Replace With           | Example                                                          |
| ---------------------- | ---------------------- | ---------------------------------------------------------------- |
| `let` with mutation    | `const` with transform | `let x; x = f(x)` → `const x = f(initial)`                       |
| Manual field copying   | Spread                 | `{a: o.a, b: o.b}` → `{...defaults, ...overrides}`               |
| Mutating wrapper       | Composing wrapper      | `addHooks(obj)` mutates → `withHooks(obj)` returns new           |
| Misaligned names       | Aligned names          | `const rootPath` → `const path` (enables `{path}` shorthand)     |
| Mixed visual weight    | Uniform weight         | 20-line method + one-liners → extract all to same level          |
| `ensure*` checks       | Delete                 | `ensureOpen()` → let lower layer throw naturally                 |
| Pure delegators        | Direct call            | `f(x) { return g(x) }` → call `g(x)` directly                    |

### Narrative Flow (Inverse Pyramid)

**Don't bury the lead.** Main export → major sub-components → minor sub-components → helpers → constants/types. A reader scanning top-down should get the big picture before any details.

- **Core logic <15 lines** (from principles.md). Main function reads as a summary. Helpers go after return (hoisted `function` declarations).
- **React/view files**: Top-level component first. Sub-components follow in descending importance. Utilities last.

### Silvery & Vendor Philosophy

**Silvery should be the most ergonomic TUI framework out there.** If a consumer has to do something complicated that the framework could handle, that's a framework bug — fix it in silvery. **km is silvery's perfect showcase.** Never work around vendor bugs; fix them at the source.

#### Theme & Token Patterns

| Anti-Pattern | Correct Pattern | Why |
|---|---|---|
| `color="red"` | `color="$error"` | Theme portability |
| `backgroundColor="black"` | `backgroundColor="$surface-bg"` | Semantic token |
| `"#5599dd"` (hex literal) | `"$primary"` | Breaks on non-truecolor |
| `kitty: true` (hardcoded) | `kitty: caps.kittyKeyboard` | Use `detectTerminalCaps()` |
| `.padEnd(n)` in TSX | `<Box width={n}>` | Layout is silvery's job |

### Logging Standards

| Pattern | Replace With | Exception |
|---------|--------------|-----------|
| `console.log/debug/info/warn` | `@beorn/logger` | CLI user output in `apps/km-cli/src/commands/*` |
| `log.method(...)` without `?.` | `log.method?.(...)` | None — always use `?.` |

### Process Lifecycle

| Pattern | Replace With | Exception |
|---------|--------------|-----------|
| `process.exit(0)` | Let event loop drain naturally | CLI tools that must exit after one-shot command |
| `process.exit(1)` | `throw` or let error propagate | Startup validation (before event loop starts) |
| Intervals/sockets keeping process alive | `AbortController` signal + cleanup in effects | — |
| Manual `term[Symbol.dispose]()` + `process.exit()` | `using term` + `await waitUntilExit()` | — |

`process.exit()` bypasses `using`/`await using` cleanup, skips `finally` blocks, and prevents proper terminal restore. Use `AbortController` to signal all intervals/handlers, then let the event loop drain.

### Fail Loudly (No Silent Fallbacks)

**Programming errors must throw, never return defaults.** If a code path should be unreachable, throw. Silent fallbacks turn immediate crashes into mysterious downstream failures.

**When fallbacks ARE appropriate:** User input, optional config with documented defaults, graceful degradation for external systems.

## Phase 3: Synthesize

For each finding, classify:

| Category | Description | Action |
|----------|-------------|--------|
| **Missing abstraction** | A domain object or helper that would eliminate a class of boilerplate | Create bead, implement if small |
| **Wrong abstraction** | An abstraction that doesn't match the domain — forces callers to fight it | Create bead for redesign |
| **Dramatic simplification** | A way to delete 50%+ of the code by changing the approach | Discuss with user, then implement |
| **Verbose pattern** | 10 lines that should be 2 — known simplification pattern applies | Fix it |
| **Misplaced code** | Code in the wrong layer — will cause coupling pain later | Move it or create bead |
| **Unnecessary complexity** | Code that handles cases that can't happen or defends against things the type system guarantees | Delete it |

### Present

```markdown
## Improve: <area>

### What would this look like if it were easy?
<1-3 sentences painting the ideal>

### Findings
| # | Category | Finding | Impact | Effort |
|---|----------|---------|--------|--------|
| 1 | Missing abstraction | Selection type with batch ops | Eliminates 50+ lines | P2 |
| 2 | Verbose pattern | Manual sibling iteration | 10 lines → moveTo() | Fix now |

### Quick wins (implement now)
<List of small improvements to make immediately>

### Beads created
<List of beads for larger work>
```

**Stop here if `--dry-run`**. Otherwise, ask for confirmation before Phase 4.

## Phase 4: Implementation

1. Apply one logical change at a time
2. After each file: verify no type errors
3. Run targeted tests on changed files
4. `bun fix && bun run test:fast`

## When NOT to Refactor

| Pattern | Why it's fine |
|---------|---------------|
| React components with many conditionals | JSX conditionals inflate scores but structure is readable |
| Exhaustive `switch` validated by TypeScript | Lookup table **loses** compile-time completeness checking |
| Test setup helpers | Tests are consumers — setup complexity is fine |
| CLI action handlers (<45 complexity) | Sequential parse→resolve→execute is mostly irreducible |

**Threshold**: >50 always refactor. 30-50 usually suppress. <30 skip.

## Anti-Patterns

- Hunting for bugs — that's `/troubleshoot`
- Checking for stale docs — that's `/complete`
- Suggesting changes without understanding WHY the code is shaped this way
- Proposing abstractions for one-off code (premature abstraction is worse than duplication)
- Creating abstractions "for future flexibility" — solve today's problem only
- Adding lines to reduce complexity scores — if refactoring adds 50+ lines, stop
- Ignoring the TEA/universal-editor vision when evaluating architecture

## Key Insight

The best improvements aren't "make this code better" — they're "realize this code shouldn't exist because the abstraction above it should handle this case." Every line of code is either essential complexity (inherent to the problem) or accidental complexity (artifact of the current design). This skill finds the accidental complexity.
