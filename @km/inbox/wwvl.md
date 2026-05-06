---
mentions:
  - km
id: "@km/inbox/wwvl"
aliases:
  - km-wwvl
  - "@km/_orphan/wwvl"
created_at: 2026-01-16T23:47:22Z
closed_at: 2026-01-16T23:52:26Z
---

# [x] Evaluate TUI1 vs TUI2 architecture @km/_orphan #epic #P2

## Summary

Evaluate whether to continue with TUI1 (Ink) or TUI2 (OpenTUI) for the production TUI.

## Context

TUI2 exploration discovered blocking OpenTUI bugs:

- **002**: Text color ignored when backgroundColor set (blocking)
- **003**: Bracket/space rendering drops characters (blocking)

Meanwhile, TUI1 has known layout pain points that motivated the exploration.

## Decision Criteria

1. **TUI1 improvements**: Can Ink layout issues be addressed with better patterns?
2. **TUI2 viability**: Are OpenTUI bugs fixable upstream? Timeline?
3. **Migration cost**: What's the cost to complete @km/tui2 if we proceed?

## Outcome

Clear recommendation with rationale for which TUI to invest in.

