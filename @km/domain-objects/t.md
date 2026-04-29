---
id: "@km/domain-objects/t"
aliases:
  - km-domain-objects.t
  - km-domain-objects-t
created_at: 2026-01-23T10:25:45Z
closed_at: 2026-01-23T12:55:08Z
---

# [x] Map out test suite reorganization around domain objects @km/domain-objects #task #P3

# Test Suite Reorganization

Investigate how tests should be restructured around domain objects.

## Questions to answer
1. Current test organization - how are tests structured now?
2. Which tests are testing singletons vs domain logic?
3. Can we simplify tests by using domain objects with DI?
4. Should test files mirror domain object structure?

## Potential benefits
- Tests for Vault, Board, Watcher as units
- DI makes mocking trivial
- No singleton cleanup between tests
- Clearer test boundaries

## Deliverable
- Analysis of current test structure
- Proposed new test organization
- Estimate of refactoring effort
- Priority ordering for test migration