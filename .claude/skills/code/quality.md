---
description: "Unified code quality — principles compliance, architecture, design, simplification. Replaces /code review + /code improve."
argument-hint: [file-or-directory] [--fix] [--dry-run]
---

## Usage

```bash
/code quality                           # Review recent work against principles.md
/code quality packages/km-storage       # Review directory
/code quality src/board/board-actions.ts # Review single file
/code quality --fix                     # Find AND implement improvements
/code quality --dry-run                 # Analyze only, don't implement (default)
```

**Arguments**: `[file-or-directory]` `[--fix]` `[--dry-run]` (defaults to recent commits, dry-run)

**Aliases**: `/code review`, `/code improve`, `/code clean` all route here.

---

# Code Quality — Does This Match the Principles?

**Read [docs/principles.md](../../../docs/principles.md) first.** Every finding should be checked against the principles. Extract the full checklist: `grep '- \[ \]' docs/principles.md`

Three phases: **Scan** (automated + manual), **Diagnose** (strategic questions), **Fix** (only with `--fix`).

## Target

$ARGUMENTS

If no target specified, review recent commits.

## Phase 1: Scan

### 1a. Principles Compliance

Check against all principles in [docs/principles.md](../../../docs/principles.md):

**Plain Domain Language + Domain Vocabulary:**
- Operations on namespaces (`ViewTree.nodes()`) / not bare functions (`dfsTraversal()`)
- Algorithms read like pseudocode / not implementation details at call sites
- Unified API shapes across layers (`KTree.nodes()` ↔ `ViewTree.nodes()`)
- Discoverability test: typing `X.` shows the operation needed
- Terminology matches [docs/glossary.md](../../../docs/glossary.md) — variable names, comments, docs, and tests use the same words for the same concepts (e.g., "operation" not "action" for TEA state changes, "domain interface" not "noun-singleton", "cursor" not "lead")

**Domain Object Inventory:**
- New operations go on existing namespaces (KTree, ViewTree, PaneUI, ActionType, Workspace, CursorDepth)
- If an operation doesn't exist in the inventory, it's probably missing — not a one-off helper

**Centralized Core Flows:**
- Types as blueprint — `types.ts` reads like a specification
- Factories as architecture — `createX()` reads like pseudocode composition
- Flows readable in one place — each major flow has a single entry point
- Domain vocabulary carries the "how", flow/factory carries the "what"

**Fail Loud + Quality Plateau:**
- Invariants throw (not log)
- One way to do things — no dual patterns coexisting
- Deprecated code deleted, not shimmed

**Inverted Pyramid (Public API First):**
- Is the main export in the first screenful? If a file is >200 lines and the factory/public API is below line 100, flag it.
- Every file's first 20 lines should answer: what is this, what's the main entry point?
- Public exports at top, internal helpers at bottom.

**Composable Domain Objects:**
- Factory functions with options, not classes
- Explicit deps via `options.inject`, no globals
- `using`/`await using` for cleanup
- ESM imports only, package names not relative paths

### 1b. Architecture & Layers

km layers: Domain (@km/core) → Operations (@km/tree, @km/board) → Application (@km/tui, @km/cli)

```
Application   @km/tui, @km/cli-app        UI, commands, state machines
                ↓ imports from
Operations    @km/tree, @km/board          tree mutations, visual state
                ↓ imports from
Infrastructure @km/storage                 SQLite, file watching, Repo
                ↓ imports from
Domain        @km/core, @km/markdown       pure types, parsing
```

Check: Is code in the right layer? UI logic in storage? Domain logic in UI?

Correct: `KNode.isOutline(node)` (namespace type guard)
Anti-pattern: `node.type === "h" && node.item` (inline domain logic in consumer)

### 1c. Automated Patterns

Run if reviewing a directory or `--all`:

```bash
bash scripts/review-code-patterns.sh 2>&1 | tee /tmp/review-patterns.txt
bun lint:unused 2>&1 | tee /tmp/knip-output.txt  # unused files/exports
```

### Finding Types

| Type               | Signal                                                                      |
| ------------------ | --------------------------------------------------------------------------- |
| **Principles**     |                                                                             |
| Bare helper fn     | Helper on domain object not on its namespace — fails discoverability test   |
| Scattered flow     | Core flow requires 4+ files to understand — should be one place             |
| Inline type check  | `node.type === "h"` instead of `KNode.isOutline()` — duplicates domain     |
| Missing from vocab | Operation not in domain namespace inventory                                 |
| Non-pseudocode     | Algorithm reads as implementation details, not domain operations            |
| Dual pattern       | Two ways to do the same thing — consolidate to one                          |
| Glossary drift     | Variable/comment/doc uses different word than glossary for same concept      |
| **Architecture**   |                                                                             |
| Layer violation    | Wrong layer import, raw field checks instead of namespace                   |
| Over-engineering   | 1-implementation interface, unused config, single-use generic               |
| Code smell         | Duplicated logic, dead export, 400+ line file                               |
| **Composition**    |                                                                             |
| Missing dispose    | Resource without `Symbol.dispose`                                           |
| Classes            | Should be factory function                                                  |
| Global/singleton   | Module-level state, `getX()` patterns                                       |
| Compat shim        | Backwards compat that never gets removed                                    |
| **Style**          |                                                                             |
| Inverted pyramid   | Helpers before main logic; file >200 lines with factory/public API below line 100 |
| Prop drilling      | Same props through 3+ layers                                                |
| Hardcoded color    | `color="red"` instead of `color="$error"`                                   |

## Phase 2: Diagnose

For each finding, ask the strategic questions:

**Abstraction quality:**
- What concept is this code modeling? Is it the RIGHT concept?
- Are there domain objects trying to emerge? (Repeated parameter groups, scattered operations)
- What would a domain expert call this?

**Abstraction reduction** (fewer concepts > fewer lines):
- How many types represent the same concept? Merge?
- How many places re-derive the same information? Compute once.
- Count the concepts a new developer must understand. Can you halve them?

**Simplicity:**
- What would this look like if it were easy?
- If you deleted this and rewrote in 30 minutes, what would you do differently?
- Where are 10 lines doing what should be 1-2?

**Interface design:**
- Do callers pass too many arguments? (Missing parameter object)
- Do callers always follow the same sequence? (Missing composed operation)

Score each finding: `NARROW` (this instance), `BROAD` (class of issues), `REFRAME` (makes problem impossible)

## Phase 3: Report

```markdown
## Code Quality: [scope]

### Principles Compliance
| Principle | Status | Notes |
|-----------|--------|-------|
| Domain vocabulary | PASS/FAIL | ... |
| Centralized flows | PASS/FAIL | ... |
| Discoverability | PASS/FAIL | ... |
| Layer compliance | PASS/FAIL | ... |
| Quality plateau | PASS/FAIL | ... |

### Findings
| # | Type | Location | Description | Score | Fix |
|---|------|----------|-------------|-------|-----|
| 1 | Bare helper | file:line | desc | BROAD | move to namespace |

### Verdict
**CLEAN** / **N findings (M fixable)**
```

## Phase 4: Fix (only with --fix)

For BROAD and REFRAME findings:
1. Implement the simplest fix that addresses the root cause
2. Run `bun fix` and tests after each change
3. Commit atomically — one finding per commit

**Good refactoring reduces or maintains line count while improving clarity.** If changes add significant lines, you're probably over-engineering.

### Simplification Patterns

| Pattern                | Replace With      |
| ---------------------- | ----------------- |
| Switch with shared patterns | Lookup object |
| Repeated regex matches | Extract helper    |
| High-complexity (>30)  | Orchestrator + helpers |
| Duplicated loop body   | Shared helper     |
| Redundant abstractions | Merge or delete   |
| Re-derivation          | Compute once      |
| Cross-cutting inline   | Middleware/plugin  |
