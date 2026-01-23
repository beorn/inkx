---
description: Code review - layer violations, over-engineering, code smells, test gaps
argument-hint: [focus] (layers|tests|org|docs|beads|all)
allowed-tools: Task, Read, Glob, Grep, Bash, TodoWrite, AskUserQuestion
---

# Code Review

Systematically review km codebase: Survey → Filter → Present → (optionally) Create Beads.

**Focus**: $ARGUMENTS → if empty, review all areas; otherwise limit to specified area

**Architecture**: See CLAUDE.md §1 "Clear Layering". Rules: layers call only below, UI never touches fs, parser is stateless.

## Finding Types

| Type             | Signal                                                                      |
| ---------------- | --------------------------------------------------------------------------- |
| Layer violation  | `km-cli` imports `fs`/`path`, parser has state, sync writes SQLite directly |
| Over-engineering | 1-implementation interface, unused config, single-use generic               |
| Code smell       | Duplicated logic, dead export, 400+ line file                               |
| Test gap         | Untested public API, `test1()` name, mock of internal                       |
| Doc drift        | Spec/code mismatch, stale CLAUDE.md                                         |

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

For each finding:

1. Read actual code (not just grep)
2. Pattern (3+ occurrences) or one-off?
3. Severity: Critical/High/Medium/Low
4. Already has a bead?

**Discard**: intentional design, already tracked, false positive
**Merge**: same root cause, same fix

**Test-specific severity guide:**

| Severity | Test Finding                                           |
| -------- | ------------------------------------------------------ |
| Critical | Tests fail (blocks CI), documented timing wrong by >3x |
| High     | Layer violation, tests test wrong layer                |
| Medium   | Duplicate helpers, missing coverage for used features  |
| Low      | Style issues, minor naming inconsistencies             |

## Iteration 3: Present

Output with VSCode links:

```markdown
## Summary

X critical, Y high, Z medium, W low

## Critical (blocks correctness)

- [file.ts:42](path/file.ts#L42) - Issue

## High (causes bugs)

- [file.ts:42](path/file.ts#L42) - Issue

## Medium (tech debt)

- [file.ts:42](path/file.ts#L42) - Issue

## Low (style/minor)

- [file.ts:42](path/file.ts#L42) - Issue

## Quick Wins

1. Fix X in [file](path)

## Larger Refactors

1. Refactor Y - estimated scope: N files

## Verification Plan

(For test reviews: how to verify fixes work)

1. Run `bun run test:fast` - should pass with no warnings
2. Run `bun run test:slow` - should pass
3. Verify CLAUDE.md timing is accurate
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

## Execute

Begin iteration 1. Launch survey agents in parallel (single message).
