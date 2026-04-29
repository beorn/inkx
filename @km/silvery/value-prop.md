---
id: "@km/silvery/value-prop"
aliases:
  - km-silvery.value-prop
  - km-silvery-value-prop
created_by: claude:474834b0
created_at: 2026-03-10T00:01:18Z
closed_at: 2026-03-10T01:22:53Z
close_reason: Updated silvery-vs-ink.md, comparison.md, getting-started.md,
  why-silvery.md, README.md, CLAUDE.md with honest positioning. Corrected stale
  claims about ink's capabilities (React 19, incremental rendering, kitty
  keyboard, useBoxMetrics, focus management). Identified 14 genuine silvery
  differentiators.
owner: bjorn@stabell.org
assignee: claude:474834b0
---

# [x] Rethink silvery value prop vs ink based on compat audit learnings @km/silvery #task #P2 @claude:474834b0

Based on the ink compat audit findings:

**What we learned:**
- Ink now has useBoxMetrics, useWindowSize, useCursor — features we thought were silvery-only
- ANSI encoding differs fundamentally (silvery: 256-color + reset prefix, chalk: 4-bit basic)
- Ink tests require exact ANSI byte matching — compat layer can't bridge encoding differences
- Layout engine differences (flexily vs yoga) produce different padding/margin/border behavior
- Ink's render is sync (legacy React mode), silvery's is async (concurrent mode)
- Ink added renderToString, concurrent mode support, screen reader accessibility
- Real compat is ~50% — mostly layout + ANSI encoding differences, not missing features

**Questions to answer:**
1. What does silvery offer that ink genuinely doesn't? (not just 'we thought ink lacked X')
2. Is compat-layer parity the right goal, or should silvery differentiate?
3. Should we reposition silvery as 'ink++ with modern rendering' vs 'ink replacement'?
4. What are silvery's actual unique advantages? (incremental rendering, multi-target, layout feedback, flexily zero-alloc)
5. Should we drop the compat layer and focus on native silvery API excellence?

Rethink the silvery.dev messaging, README, and roadmap based on answers.