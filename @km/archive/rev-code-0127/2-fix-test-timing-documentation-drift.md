---
mentions:
  - km
id: "@km/rev-code-0127/2-fix-test-timing-documentation-drift"
aliases:
  - km-rev-code-0127.2
  - km-rev-code-0127-2
  - "@km/rev-code-0127/2"
created_at: 2026-01-27T14:28:36Z
closed_at: 2026-01-27T14:32:15Z
---

# [x] Fix test timing documentation drift @km/rev-code-0127 #bug #P1

**Critical**: CLAUDE.md documents fast tests as <5s but actual is 10.55s (2.1x)

Current state:

- Documented: "Fast tests (<5s)"
- Actual: 10.55s
- Delta: 2.1x (>50% threshold)

Options:

1. Update CLAUDE.md to reflect actual timing (~10s)
2. Optimize test suite to meet <5s target

Impact: Developers expect fast iteration but actual is 2x slower

Location: CLAUDE.md line 8

