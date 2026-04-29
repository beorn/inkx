---
id: "@km/all/test-system/p4-suites"
aliases:
  - km-all.test-system.p4-suites
  - km-all-test-system-p4-suites
created_by: Bjørn Stabell
created_at: 2026-04-10T08:22:59Z
closed_at: 2026-04-10T08:40:17Z
close_reason: "3 new test files: command-contracts (5 tests), round-trip-laws (8
  tests), failure artifacts (onTestFailed hook). Committed f2dffdddf."
owner: bjorn@stabell.org
---

# [x] Phase 4: New test suites — command contracts, round-trip laws, failure artifacts @km/all #task #P2

Create new test files:
1. Command registry contracts — every command callable, disabled = no crash
2. Round-trip persistence laws — load→save→reload preserves semantics  
3. Failure artifacts — vitest onTestFailed hook dumps action history + state + screen

New tests: 3 new test files
/complete: all 3 files exist and pass