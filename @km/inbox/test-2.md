---
id: "@km/inbox/test-2"
aliases:
  - km-test-2
  - "@km/_orphan/test-2"
created_at: 2026-01-25T01:31:02Z
closed_at: 2026-02-04T11:27:33Z
---

# [x] Investigate splitting query.test.ts (1635 lines) @km/_orphan #task #P3

## Context

Test quality review found query.test.ts is very large (1635 lines, 106 tests).

## Problem

Large test files are harder to:
- Navigate and understand
- Review in PRs
- Maintain over time

## Proposal

Investigate splitting into logical modules:
1. query-filters.test.ts - Filter parsing and execution
2. query-execution.test.ts - Query execution engine
3. query-syntax.test.ts - Query syntax parsing

## Acceptance Criteria

- [ ] Review file structure and identify natural split points
- [ ] Ensure no test duplication after split
- [ ] All tests still pass
- [ ] File sizes more balanced (<500 lines each)

## Reference

See docs/dev/test-quality-report.md for full review findings.