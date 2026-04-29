---
id: "@km/tui2"
aliases:
  - km-tui2
  - "@km/_orphan/tui2"
created_at: 2026-01-16T22:07:31Z
closed_at: 2026-01-17T00:07:21Z
---

# [x] TUI2 Migration: Complete Feature Parity with TUI1 @km/tui2 #epic #P1

## Summary

TUI2 migration to OpenTUI - DEFERRED per @km/tui-eval decision.

## Status: Deferred

**Reason**: OpenTUI has blocking bugs that prevent production use:
- **002**: Text color ignored when backgroundColor set
- **003**: Bracket/space rendering drops characters

See [ADR 001: TUI Architecture](docs/adr/001-tui-architecture.md) for full rationale.

## Re-evaluation Criteria

Consider resuming when:
1. OpenTUI fixes color rendering bug (#002)
2. OpenTUI fixes bracket/space bug (#003)
3. OpenTUI has stable release (>= 1.0)

## Preserved Work

- TUI2 code preserved in `apps/km-tui/packages/km-opentui/`
- OpenTUI issues documented in `vendor/opentui/issues/`
- Rich text module created: `src/text/rich.tsx`

## Original Scope

Migration to OpenTUI for better layout control. 16 sub-tasks were identified for feature parity with TUI1.