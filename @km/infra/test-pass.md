---
id: "@km/infra/test-pass"
aliases:
  - km-infra.test-pass
  - km-infra-test-pass
created_at: 2026-02-05T01:31:37Z
closed_at: 2026-02-06T11:12:55Z
assignee: claude:10db6ea8
---

# [x] Make 'bun test:all' pass without lint errors @km/infra #task #P1 @claude:10db6ea8

## Problem
`bun test:all` (or `bun fix`) currently fails due to lint errors in:
- `apps/km-tui/src/hooks/use-line-edit.ts` - complexity/max-cyclomatic (37 > 30)
- Various typescript-eslint unsafe-* warnings in logger usage

## Goal
All tests pass cleanly with `bun fix && bun run test:all`

## Tasks
1. Fix complexity in use-line-edit.ts (refactor or suppress with reason)
2. Fix logger type issues (proper typing for createlogger)
3. Verify full test suite passes