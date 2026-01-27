---
description: Code review family - architecture, types, tests, beads
argument-hint: [code|types|tests|beads]
allowed-tools: Task, Read, Glob, Grep, Bash, TodoWrite, AskUserQuestion
---

# Code Review

**Keywords**: review, audit, code review, type safety, test audit, backlog

Systematic codebase review. All reviews share: Survey -> Filter -> Present -> (optionally) Create Beads.

## Which Review?

| Review  | Focus                              | Use When        |
| ------- | ---------------------------------- | --------------- |
| `code`  | Architecture, layers, organization | Before refactor |
| `types` | Type safety, patterns              | After changes   |
| `tests` | Test suite health, timing          | Quarterly       |
| `beads` | Backlog grooming                   | Sprint planning |

## Quick Commands

- `/review code` or `/review code layers` - Architecture review
- `/review types` - Type safety audit
- `/review tests` - Test suite health
- `/review beads` - Backlog grooming

## Common Output Format

```markdown
## Summary

X critical, Y high, Z medium, W low

## Critical (blocks correctness)

- [file.ts:42](path/file.ts#L42) - Issue

## High (causes bugs)

...

## Quick Wins

1. Fix X in [file](path)
```

## Sub-Skills

| File                 | Purpose                                     |
| -------------------- | ------------------------------------------- |
| [code.md](code.md)   | Layer violations, organization, code smells |
| [types.md](types.md) | Type safety patterns, ergonomics            |
| [tests.md](tests.md) | Test timing, coverage, duplication          |
| [beads.md](beads.md) | Backlog triage, stale issues                |
