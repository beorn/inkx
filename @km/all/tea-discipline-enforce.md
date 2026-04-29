---
id: "@km/all/tea-discipline-enforce"
aliases:
  - km-all.tea-discipline-enforce
  - km-all-tea-discipline-enforce
created_by: claude:da9990c5
created_at: 2026-04-28T19:42:47Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-all.tea-discipline-enforce
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-28T12:42:49Z
    created_by: claude:da9990c5
    metadata: "{}"
---

# [ ] Enforce TEA discipline across all interactive subsystems (lint rule + migration plan) @km/all #epic #P2

blocks:: [[@km/all]]

From /big quality analysis 2026-04-28. Class-(A) effect-ordering bugs (recent: prompt-concat-into-reply-regression, column-resize-strict-mismatch, focused-card-overflow) all stem from imperative state mutation in switch-cases instead of pure (action, state) → [state, effects] reducers. CLAUDE.md State Machine Principle exists but is unenforced.

Plan:
1. Lint rule that flags closure-mutated state in apply()-shaped functions
2. Migrate session-store (in flight: @km/silvercode/session-store-tea-refactor)
3. Migrate other apply-shaped subsystems: silvery render-sink, @km/tui board state, command bus
4. Property tests covering inter-feature interactions
5. Update CLAUDE.md and docs/design/tea.md with enforcement section

Targets L4 for each interactive subsystem (architecture makes invalid state impossible). Multi-week effort; can be split per-subsystem and prioritized by recent bug density.

Parent: @km/all/tea-machines (epic). Sub-beads to file: per-subsystem migration tasks.