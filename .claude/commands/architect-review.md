---
description: Architecture review - layer violations, over-engineering, code smells, test gaps
argument-hint: [focus] (layers|tests|org|docs|beads|all)
allowed-tools: Task, Read, Glob, Grep, Bash, TodoWrite, AskUserQuestion
---

# Architecture Review

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

| Agent  | Prompt                                                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Layers | "Check km packages for layer violations per architecture: UI→Query→Model→Sync→Parser→FS. Find imports skipping layers. Very thorough." |
| Org    | "Review km file organization. Find: >300 line files, naming inconsistency, poor separation. Very thorough."                            |
| Specs  | "Compare specs/\*.md to implementation. Find: undocumented features, unimplemented specs. Very thorough."                              |
| Tests  | "Review \*/tests/. Find: untested public APIs, bad test names, over-mocking. Very thorough."                                           |
| Beads  | "Analyze .beads/\*.md files. Find: stale in_progress, circular deps, duplicate issues. Very thorough."                                 |

If focus is "all" or empty → launch all 5. Otherwise launch only matching agent(s).

## Iteration 2: Filter

For each finding:

1. Read actual code (not just grep)
2. Pattern (3+ occurrences) or one-off?
3. Severity: Critical/High/Medium/Low
4. Already has a bead?

**Discard**: intentional design, already tracked, false positive
**Merge**: same root cause, same fix

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
```

Then use AskUserQuestion: "Which findings should I create beads for?"

## Follow-up: Create Beads

If user selects findings, create grouped beads:

1. **Generate unique ID** with date suffix:
   - Format: `km-rev-<slug>-<MMDD>` (e.g., `km-rev-chaos-0123` for Jan 23)
   - Focus → slug: `chaos` → `chaos`, `storage sync` → `sync`, `tui rendering` → `tui`
   - For broad reviews: use primary finding area (e.g., `docs`, `refactor`, `tests`)

2. **Write summary to /tmp/review.md** (the output from Iteration 3)

3. **Create parent + children**:
   ```bash
   # Get date suffix
   DATE_SUFFIX=$(date +%m%d)

   bd create --id "km-rev-<slug>-$DATE_SUFFIX" --type=epic --priority=2 \
     --title="Architecture review: <focus>" --body-file /tmp/review.md
   bd create --id "km-rev-<slug>-$DATE_SUFFIX.0" --title="<P1 finding>" --type=bug --priority=1
   bd create --id "km-rev-<slug>-$DATE_SUFFIX.1" --title="<P2 finding>" --type=task --priority=2
   ```

Order children by priority (P1 first). `bd show km-rev-<slug>-<MMDD>` shows full review with children.

## Execute

Begin iteration 1. Launch survey agents in parallel (single message).
