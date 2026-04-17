# ADR 001: TUI Architecture - Stay with Ink (TUI1)

**Status**: Accepted
**Date**: 2026-01-16
**Deciders**: Engineering team
**Tracking**: km-tui-eval

## Executive Summary

After comprehensive evaluation, we recommend **staying with TUI1 (Ink)** and abandoning TUI2 (OpenTUI) migration. OpenTUI has blocking rendering bugs with uncertain fix timelines, while TUI1's layout pain points are manageable and improvable.

## Context

### Why We Explored OpenTUI

TUI1 (Ink-based) has known layout pain points:

1. **Manual width management** - Components track width through props
2. **Custom layout module** - 4 files for text truncation/wrapping
3. **displayLength complexity** - ANSI-aware character counting
4. **Board overflow handling** - Complex scroll math
5. **fullscreen-ink race condition** - Startup delay workaround

OpenTUI promised better layout with:

- Flexbox-like declarative layout
- Native text measurement
- Built-in scroll handling

### What We Discovered

**OpenTUI has blocking bugs:**

| Bug                           | Severity | Workaround             |
| ----------------------------- | -------- | ---------------------- |
| Color rendering (002)         | BLOCKING | Partial (inverse only) |
| Bracket/space rendering (003) | BLOCKING | Maybe (untested)       |
| borderStyle segfault (001)    | Low      | Use valid values       |

**TUI1 pain points are manageable:**

| Pain Point               | Severity   | Improvement Path           |
| ------------------------ | ---------- | -------------------------- |
| Manual width management  | Annoying   | Constraint Components      |
| Custom layout module     | Acceptable | Keep or swap displayLength |
| displayLength complexity | Annoying   | Use string-width package   |
| Board overflow handling  | Annoying   | ScrollableList component   |
| fullscreen-ink race      | Acceptable | Keep workaround            |

## Options Considered

### Option 1: Complete TUI2 Migration

**Pros:**

- Better declarative layout
- Active upstream development
- Modern architecture

**Cons:**

- 2 blocking bugs with no reliable workaround
- 16 open issues in km-tui2 epic
- Uncertain fix timeline (weeks to months)
- Risk of discovering more bugs

**Effort**: 4-8 weeks (excluding bug fixes)

### Option 2: Stay with TUI1, Improve Layout

**Pros:**

- Working today
- Battle-tested (used by Claude Code, GitHub Copilot CLI)
- Known pain points have solutions
- Lower risk

**Cons:**

- Layout code remains verbose
- No declarative layout benefits

**Effort**: 5-8 days for key improvements

### Option 3: Wait for OpenTUI Fixes

**Pros:**

- Eventually get OpenTUI benefits

**Cons:**

- Uncertain timeline
- Blocks other TUI work
- May have more bugs

**Effort**: Unknown wait + 4-8 weeks migration

## Decision

**We will stay with TUI1 (Ink)** and:

1. **Abandon** km-tui2 migration (mark deferred)
2. **File** OpenTUI bugs upstream for future reference
3. **Implement** Constraint Components for layout improvement
4. **Preserve** TUI2 code as experimental for later evaluation

## Rationale

1. **TUI1 works today** - Production-ready with workarounds in place
2. **TUI2 doesn't work** - Blocking bugs affect core selection UX
3. **Improvement path exists** - Constraint Components address 60% of boilerplate
4. **Risk is lower** - Known problems vs unknown bugs
5. **Effort is comparable** - TUI1 improvements (5-8 days) vs TUI2 completion (4-8 weeks)

## Consequences

### Positive

- No blocked work waiting for upstream fixes
- Reduced risk of discovering more OpenTUI bugs
- Can improve TUI1 incrementally
- TUI2 code preserved for future re-evaluation

### Negative

- Miss out on OpenTUI's declarative layout benefits
- TUI1 layout code remains more verbose than ideal
- Some technical debt carried forward

### Neutral

- May revisit when OpenTUI matures (6-12 months)
- km-tui2 code becomes experimental reference

## Action Items

1. [ ] Mark km-tui2 epic as deferred
2. [ ] File OpenTUI bugs upstream (#002, #003)
3. [ ] Create km-tui1-improve issue for Constraint Components
4. [ ] Update CLAUDE.md with decision

## References

- [km-tui-eval.1 Analysis](../../../.beads/km-tui-eval.1-analysis.md) - TUI1 pain points
- [km-tui-eval.2 Analysis](../../../.beads/km-tui-eval.2-analysis.md) - OpenTUI bugs
- [km-tui-eval.3 Analysis](../../../.beads/km-tui-eval.3-analysis.md) - Abstraction approaches
- [docs/dev/ink-patterns.md](../../dev/ink-patterns.md) - Ink workarounds and patterns guide
