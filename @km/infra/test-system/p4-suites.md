---
mentions:
  - km
---

# [x] Phase 4: New test suites — command contracts, round-trip laws, failure artifacts @km/all #task #P2

Create new test files:

1. Command registry contracts — every command callable, disabled = no crash
2. Round-trip persistence laws — load→save→reload preserves semantics
3. Failure artifacts — vitest onTestFailed hook dumps action history + state + screen

New tests: 3 new test files
/complete: all 3 files exist and pass

