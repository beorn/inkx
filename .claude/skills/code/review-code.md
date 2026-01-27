---
description: Code review - layer violations, over-engineering, code smells, test gaps
argument-hint: [focus] (layers|tests|org|docs|beads|all)
allowed-tools: Task, Read, Glob, Grep, Bash, TodoWrite, AskUserQuestion
---

## Usage

```bash
/code review              # Review all areas (layers, tests, specs, beads, code smells)
/code review all          # Same as above (explicit)
/code review layers       # Architecture and layer violations only
/code review tests        # Test suite health only
/code review org          # File organization (large files, naming)
/code review specs        # Documentation drift (specs/*.md vs implementation)
/code review beads        # Bead health (.beads/*.md issues)
```

**Arguments**: `[focus]` - one of: `all`, `layers`, `tests`, `org`, `specs`, `beads` (defaults to `all`)

---

# Code Review

Systematically review km codebase: Survey → Filter → Present → (optionally) Create Beads.

**Focus**: $ARGUMENTS → if empty, review all areas; otherwise limit to specified area

**Architecture**: See CLAUDE.md §1 "Clear Layering". Rules: layers call only below, UI never touches fs, parser is stateless.

**Related**: `/review-types` (type safety), `/review-tests` (test suite)

## Contents

- [Finding Types](#finding-types)
- [Iteration 0.5: Pre-Survey Check](#iteration-05-pre-survey-check-project-wide-reviews-only)
- [Iteration 1: Survey](#iteration-1-survey)
- [Iteration 2: Filter](#iteration-2-filter)
- [Iteration 3: Present](#iteration-3-present)
- [Summary](#summary)

## Finding Types

| Type             | Signal                                                                      |
| ---------------- | --------------------------------------------------------------------------- |
| Layer violation  | `km-cli` imports `fs`/`path`, parser has state, sync writes SQLite directly |
| Over-engineering | 1-implementation interface, unused config, single-use generic               |
| Code smell       | Duplicated logic, dead export, 400+ line file, classes, singletons          |
| Test gap         | Untested public API, `test1()` name, mock of internal                       |
| Doc drift        | Spec/code mismatch, stale CLAUDE.md                                         |
| Unused code      | Files/exports/deps flagged by knip, dead code paths                         |
| Arch violation   | Classes (not factories), module-level state, global getters                 |
| Deprecated code  | Functions marked @deprecated, backwards compat shims                        |

## Iteration 0.5: Pre-Survey Check (project-wide reviews only)

**When**: Only run for `focus="all"` or empty focus. Skip for specific focus areas (tests, org, specs, beads).

**Exception**: For `focus="layers"`, run code smell checks (classes, singletons, global getters) but skip knip.

Run these checks **in parallel** (single message with multiple Bash calls):

### Knip Check (focus="all" or empty only)

```bash
bun lint:unused 2>&1 | tee /tmp/knip-output.txt
```

Parse output for:

- Unused files
- Unused exports
- Unused dependencies
- Duplicate exports

Ignore "Configuration hints" section (knip suggestions, not findings).

### Pattern Detection Script (focus="all", empty, or "layers")

Run pattern detection script that checks for 14 different code issues:

```bash
bash scripts/review-code-patterns.sh 2>&1 | tee /tmp/review-code-patterns.txt
```

The script detects:

**Code smells (6 patterns)**:

- Pattern 1: Classes (violates factory function principle)
- Pattern 2: Module-level state (singleton indicators)
- Pattern 3: Deprecated exports (should be deleted per "delete first" principle)
- Pattern 4: Global getters (singleton access patterns)
- Pattern 5: Backwards compat shims (never get removed)
- Pattern 6: Defensive fallbacks (masks programming errors)

**Performance issues (4 patterns)**:

- Pattern 7: Regex in loops (new RegExp inside for/while/forEach)
- Pattern 8: JSON in loops (JSON.parse/stringify in hot paths)
- Pattern 9: Sync file operations (readFileSync in watch/sync)
- Pattern 10: Multiple regex replacements (chained new RegExp calls)

**Composition issues (4 patterns)**:

- Pattern 11: Factory without options (can't inject dependencies)
- Pattern 12: Missing Symbol.dispose (resource leaks)
- Pattern 13: Missing closed checks (no fail-fast)
- Pattern 14: Calling singletons (getDb() instead of injection)

Output is structured with headers like `=== PATTERN 1: Classes ===` for easy parsing.

Store raw output for Filter iteration.

## Iteration 1: Survey

Launch parallel Explore agents (adjust based on focus arg):

| Agent  | Prompt                                                                          |
| ------ | ------------------------------------------------------------------------------- |
| Layers | "Check km packages for layer violations per architecture. Very thorough."       |
| Org    | "Review km file organization: >300 line files, naming issues. Very thorough."   |
| Specs  | "Compare specs/\*.md to implementation. Find drift. Very thorough."             |
| Tests  | See **Test Review Protocol** below                                              |
| Beads  | "Analyze .beads/\*.md: stale in_progress, circular deps, dupes. Very thorough." |

If focus is "all" or empty → launch all 5. Otherwise launch only matching agent(s).

### Test Review Protocol

When reviewing tests (focus=tests or focus=all), run these checks:

**1. Timing Verification**

```bash
# Measure actual test:fast timing
time bun run test:fast 2>&1 | tail -5
```

Compare to CLAUDE.md documented timing. Flag if >50% delta.

**2. Test Suite Health**

```bash
# Check if test:slow passes
bun run test:slow 2>&1 | tail -20

# Check for React act() warnings in output
bun run test:fast 2>&1 | grep -i "act()" | head -5
```

**3. Layer Violations in Tests**
Look for CLI tests that import storage layer directly:

- `apps/km-cli/tests/*.test.ts` importing from `@km/storage`
- Tests using raw SQL instead of storage layer APIs
- Tests that should live in a different layer's test directory

**4. Test Duplication**
Search for duplicate test helpers:

```bash
# Find createNode/createTask helper duplicates
grep -r "function create" packages/*/tests apps/*/tests --include="*.ts" | grep -v node_modules
```

**5. Missing Coverage**
For each public export in a package, verify test exists:

- Read package index.ts exports
- Check corresponding tests/\*.test.ts
- Flag untested public APIs

**6. Expectation Freshness**
Look for hardcoded strings that may drift:

- CLI output messages (e.g., "Initialized" vs "Initializing")
- Error messages that changed
- Format strings that evolved

## Iteration 2: Filter

For each finding (from Iteration 0.5 + Iteration 1):

1. Read actual code (not just grep)
2. Pattern (3+ occurrences) or one-off?
3. Severity: Critical/High/Medium/Low
4. Already has a bead?

**Discard**: intentional design, already tracked, false positive
**Merge**: same root cause, same fix

### Severity Classification

**Code smell and architecture findings:**

| Finding Type                    | Default Severity | Context Adjustments                                      |
| ------------------------------- | ---------------- | -------------------------------------------------------- |
| Classes                         | High             | Low if in tests/, Critical if @deprecated                |
| Singletons (module-level state) | Critical         | Especially db-instance.ts, emit.ts                       |
| Deprecated exports              | Medium           | Critical if in db-instance.ts/emit.ts (active migration) |
| Global getters                  | High             | Likely singleton access pattern                          |
| Backwards compat shims          | Medium           | Never get removed, tech debt                             |
| Defensive fallbacks             | Low              | High false positive rate, requires manual review         |

**Knip findings:**

| Finding Type        | Default Severity | Context Adjustments                    |
| ------------------- | ---------------- | -------------------------------------- |
| Unused files        | Medium           | Low if in vendor/, examples/, scripts/ |
| Unused exports      | Low-Medium       | Medium if also @deprecated             |
| Unused dependencies | Medium           | Security risk, slow installs           |
| Duplicate exports   | Low              | Usually intentional compat             |

**Performance findings:**

| Finding Type               | Default Severity | Context Adjustments                 |
| -------------------------- | ---------------- | ----------------------------------- |
| Regex in loops             | High             | Critical if in watch/sync hot paths |
| JSON in loops              | High             | Critical if in reconcile/sync       |
| Sync file ops in hot paths | Critical         | Low if in CLI commands (expected)   |
| Multiple regex chains      | Medium           | Could be pre-compiled               |

**Composition findings:**

| Finding Type            | Default Severity | Context Adjustments                 |
| ----------------------- | ---------------- | ----------------------------------- |
| Factory without options | Medium           | Low if no dependencies needed       |
| Missing Symbol.dispose  | High             | Critical if manages DB/files        |
| Missing closed checks   | Medium           | Fail-fast principle violation       |
| Calling singletons      | High             | Hidden dependencies, blocks testing |

**Test-specific severity guide:**

| Severity | Test Finding                                           |
| -------- | ------------------------------------------------------ |
| Critical | Tests fail (blocks CI), documented timing wrong by >3x |
| High     | Layer violation, tests test wrong layer                |
| Medium   | Duplicate helpers, missing coverage for used features  |
| Low      | Style issues, minor naming inconsistencies             |

### Filter Rules

**For code smell findings:**

- Discard: False positive fallbacks, intentional design patterns
- Merge: All deprecated exports in same file → single finding (e.g., "12 deprecated functions in db-instance.ts")
- Upgrade: Singletons in db-instance.ts/emit.ts → Critical (known active migration)
- Downgrade: Classes in test files → Low (test infrastructure exception)

**For knip findings:**

- Discard: Unused files in vendor/ (upstream code), Configuration hints (not findings)
- Downgrade: Unused files in examples/ or scripts/ → Low
- Merge: Group by type (e.g., "56 unused files - see list" rather than 56 separate findings)

## Iteration 3: Present

Output with VSCode links:

```markdown
## Summary

X critical, Y high, Z medium, W low

**Knip**: N unused files, M unused exports, P unused deps (if applicable)

## Critical (blocks correctness)

- [file.ts:42](path/file.ts#L42) - Singleton: `let dbInstance` at module scope (breaks test isolation)
- [file.ts:25](path/file.ts#L25) - Singleton: `let eventHub` (hidden dependency)

## High (causes bugs)

- [sync.ts:99](path/sync.ts#L99) - Class: `SyncManager` (violates factory function principle)
- [file.ts:51](path/file.ts#L51) - Global getter: `getDb()` (singleton access pattern)

## Medium (tech debt)

- [emit.ts:111](path/emit.ts#L111) - Deprecated export: `emit()` - 13 deprecated functions total in this file
- [knip] 56 unused files - mostly in vendor/, examples/, old test fixtures
- [file.ts:42](path/file.ts#L42) - Backwards compat shim: `export { old as new }`

## Low (style/minor)

- [knip] 143 unused exports - many are type definitions or internal APIs
- [Defensive fallbacks] 15 potential `?? default` patterns flagged - require manual review

## Quick Wins

1. **Delete deprecated exports** - Remove N deprecated functions from X files (already marked for removal)
2. **Delete unused files** - Remove N files flagged by knip (list major ones)
3. **Fix duplicate exports** - Resolve N duplicate export conflicts
4. **Remove unused deps** - Check package.json for N unused dependencies

## Larger Refactors

1. **Convert N classes to factory functions** - List major ones (estimated: N files, ~X lines)
2. **Remove module-level singletons** - List specific files (estimated: N files, requires DI migration)
3. **Audit backwards compat shims** - Review all alias exports (estimated: N files)

## Verification Plan

(How to verify fixes work)

1. Run `bun lint:unused` after cleanup - should have 0 unused files
2. Run `bun run test:fast` after each refactor - should pass with no warnings
3. Grep for `export class` in packages/ - should only find test infrastructure
4. Grep for `@deprecated` in packages/ - should find 0 results
5. (For test reviews) Verify CLAUDE.md timing is accurate
```

Then use AskUserQuestion: "Which findings should I create beads for?"

## Follow-up: Create Beads

If user selects findings, create grouped beads:

1. **Generate unique ID** with date suffix:
   - Format: `km-rev-<slug>-<MMDD>` (e.g., `km-rev-tests-0123` for Jan 23)
   - Focus → slug: `tests` → `tests`, `storage sync` → `sync`, `tui rendering` → `tui`
   - For broad reviews: use primary finding area (e.g., `docs`, `refactor`, `layers`)

2. **Write summary to /tmp/review.md** (the output from Iteration 3)

3. **Create parent + children**:

   ```bash
   # Get date suffix
   DATE_SUFFIX=$(date +%m%d)

   bd create --id "km-rev-<slug>-$DATE_SUFFIX" --type=epic --priority=2 \
     --title="Code review: <focus>" --body-file /tmp/review.md
   bd create --id "km-rev-<slug>-$DATE_SUFFIX.0" --title="<P1 finding>" --type=bug --priority=1
   bd create --id "km-rev-<slug>-$DATE_SUFFIX.1" --title="<P2 finding>" --type=task --priority=2
   ```

Order children by priority (P1 first). `bd show km-rev-<slug>-<MMDD>` shows full review with children.

## Retrospective: Process Improvement

After completing review (whether or not beads were created), reflect on patterns and improvements.

### 1. Pattern Analysis

Review findings as a whole to identify recurring themes:

**Key questions:**

- Which finding types were most common? (e.g., singletons, deprecated exports, layer violations)
- Were findings clustered in specific packages or areas?
- Did "quick wins" reveal symptoms of deeper architectural issues?
- Were multiple findings different symptoms of the same root cause?

### 2. Root Cause Identification

For each major pattern, determine why it occurred:

| Pattern Example              | Root Cause Hypothesis           | Evidence                                   |
| ---------------------------- | ------------------------------- | ------------------------------------------ |
| Multiple singletons          | Missing DI infrastructure       | All in db-instance.ts, emit.ts             |
| Many deprecated exports      | No deletion enforcement         | Some @deprecated for 6+ months             |
| Layer violations in CLI      | Unclear architecture boundaries | CLI importing storage internals            |
| 50+ unused exports           | No automated cleanup process    | Knip not in CI, no pre-commit hook         |
| Classes instead of factories | Pattern not well documented     | All in packages created before docs update |
| Defensive fallbacks          | Unclear error handling policy   | Mix of fail-fast and defensive code        |

### 3. Process Improvements

Propose concrete improvements based on root causes:

**Documentation updates:**

- Add missing examples to docs/principles.md
- Clarify architecture layer boundaries in CLAUDE.md
- Document DI patterns with before/after examples
- Add "Common Mistakes" table to relevant docs

**Tooling additions:**

- ESLint rules for architecture enforcement (e.g., `no-classes` rule outside tests/)
- Add `bun lint:unused` to pre-commit hooks
- CI check for @deprecated exports older than 90 days
- Automated layer violation detection

**Review criteria refinements:**

- Add newly discovered finding types to "Finding Types" table (lines 28-37)
- Adjust severity classifications based on actual impact (lines 186-216)
- Update filter rules to handle common false positives (lines 218-231)
- Improve grep patterns for better detection (lines 66-104)

### 4. Self-Assessment

Evaluate this review's effectiveness:

| Dimension  | Assessment                                          |
| ---------- | --------------------------------------------------- |
| Coverage   | Did we check all layers? Any blind spots?           |
| Accuracy   | False positive rate? Were findings actionable?      |
| Efficiency | Which checks could be automated? What took longest? |
| Impact     | Did changes measurably improve code health?         |

### 5. Create Process Improvement Beads (Optional)

For significant process gaps identified, create tracking beads:

```bash
DATE_SUFFIX=$(date +%m%d)

# Example: Add missing tooling
bd create --id "km-proc-eslint-$DATE_SUFFIX" --type=task --priority=3 \
  --title="Add ESLint rules for architecture patterns" \
  --body="Based on code review: add rules for no-classes, singleton detection, layer imports"

# Example: Documentation improvement
bd create --id "km-proc-di-docs-$DATE_SUFFIX" --type=task --priority=3 \
  --title="Document DI patterns with examples" \
  --body="Many singleton findings suggest DI patterns need better docs. Add before/after examples."

# Example: Workflow improvement
bd create --id "km-proc-review-$DATE_SUFFIX" --type=task --priority=4 \
  --title="Update review-code.md workflow" \
  --body="Add new pattern detection for X, improve Y grep pattern, adjust Z severity"
```

### 6. Update This Review Workflow

If this review revealed gaps in the review process itself, consider updating [review-code.md](review-code.md):

**New patterns to detect:**

- Example: "TODO comments older than 6 months"
- Example: "Circular dependencies between packages"

**Pattern refinements:**

- Example: "Pattern 6 (defensive fallbacks) had 80% false positives - add `|| []` to exclusions"
- Example: "Global getter pattern should exclude getNode, getTree, getChildren"

**Workflow improvements:**

- Example: "Layers agent should also check import paths, not just usage"
- Example: "Add timing check: if grep takes >5s, suggest using Task/Explore agent instead"

Make edits directly to this file or create a process improvement bead to track the changes.

**This creates a feedback loop for continuous improvement of the review skill itself.**

## Execute

Begin iteration 1. Launch survey agents in parallel (single message).
