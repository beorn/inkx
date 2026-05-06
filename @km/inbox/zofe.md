---
mentions:
  - km
id: "@km/inbox/zofe"
aliases:
  - km-zofe
  - "@km/_orphan/zofe"
created_at: 2026-01-20T07:44:25Z
closed_at: 2026-01-20T11:52:12Z
---

# [x] InkX: Add layout engine equivalence tests @km/_orphan #task #P2

## Problem

Layout engine adapters (yoga-adapter.ts, flexx-adapter.ts) have no tests verifying that Yoga and Flexx produce equivalent output for the same input.

## Files

- `vendor/beorn-inkx/src/adapters/yoga-adapter.ts`
- `vendor/beorn-inkx/src/adapters/flexx-adapter.ts`

## Solution

Add comparison tests in `vendor/beorn-inkx/tests/layout-engines.test.ts`:

- For each test case, run with both Yoga and Flexx
- Assert computed layout matches between engines
- Document any known differences

