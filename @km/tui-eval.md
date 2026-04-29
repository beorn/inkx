---
id: "@km/tui-eval"
aliases:
  - km-tui-eval
  - "@km/_orphan/tui-eval"
created_at: 2026-01-16T23:52:36Z
closed_at: 2026-01-17T00:03:36Z
---

# [x] Evaluate TUI1 vs TUI2 architecture @km/tui-eval #epic #P2

## Summary

Evaluate whether to continue with TUI1 (Ink) or TUI2 (OpenTUI) for the production TUI.

## Decision: Stay with TUI1 (Ink)

**Recommendation**: Abandon TUI2 migration, stay with TUI1, implement Constraint Components for layout improvement.

See [ADR 001: TUI Architecture](docs/adr/001-tui-architecture.md) for full rationale.

## Key Findings

### TUI1 (Ink) Pain Points - Manageable

| Pain Point | Severity | Solution | Effort |
|------------|----------|----------|--------|
| Manual width management | Annoying | Constraint Components | 2-3 days |
| Custom layout module | Acceptable | Keep as-is | 0 days |
| displayLength complexity | Annoying | Use string-width | 0.5 days |
| Board overflow handling | Annoying | ScrollableList component | 2-3 days |
| fullscreen-ink race | Acceptable | Keep workaround | 0 days |

**Total improvement effort**: 5-8 days

### TUI2 (OpenTUI) Bugs - Blocking

| Bug | Severity | Workaround | Self-Fix Effort |
|-----|----------|------------|-----------------|
| Color rendering (002) | BLOCKING | Partial only | 1-2 weeks |
| Bracket/space (003) | BLOCKING | Maybe | Unknown |
| borderStyle (001) | Low | Yes | N/A |

**Migration effort**: 4-8 weeks + bug fixes

## Analysis Documents

- [@km/tui-eval/1-analysis/md](.beads/@km/tui-eval/1-analysis/md) - TUI1 pain points (5 approaches each)
- [@km/tui-eval/2-analysis/md](.beads/@km/tui-eval/2-analysis/md) - OpenTUI bugs (5 approaches each)
- [@km/tui-eval/3-analysis/md](.beads/@km/tui-eval/3-analysis/md) - Abstraction prototypes (5 approaches)

## Action Items

1. [x] Analyze TUI1 layout pain points (@km/tui-eval/1-analyze-tui1-layout-pain-points)
2. [x] Assess OpenTUI bugs and upstream timeline (@km/tui-eval/2)
3. [x] Document TUI1 abstraction approaches (@km/tui-eval/3-prototype-tui1-layout-abstraction-layer)
4. [x] Write architecture decision record (@km/tui-eval/4-write-tui-architecture-decision-document)
5. [ ] Mark @km/tui2 as deferred
6. [ ] File OpenTUI bugs upstream
7. [ ] Create @km/_orphan/tui1-improve issue

## Conclusion

TUI1 works today with known, fixable pain points. TUI2 has blocking bugs with uncertain fix timelines. The safer path is to improve TUI1 incrementally while preserving TUI2 code for future re-evaluation when OpenTUI matures.