---
id: "@km/all/fix-sweep-card-borders"
aliases:
  - km-all.fix-sweep-card-borders
  - km-all-fix-sweep-card-borders
created_by: claude:cc081a9a
created_at: 2026-04-26T20:24:41Z
closed_at: 2026-04-26T20:48:31Z
close_reason: Closed
started_at: 2026-04-26T20:36:58Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-all.fix-sweep-card-borders
    depends_on_id: km-all.fix-sweep-0426
    type: parent-child
    created_at: 2026-04-26T13:25:02Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] Fix card border + date badge layout bugs (8 km-tui slow test failures) @km/all #bug #P1 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-0426]]

@km/tui card-rendering tests fail when cards have date badges. Right border missing because content/badge layout is squeezing the border off-screen.

## Failing tests (apps/@km/tui/tests/card-rendering.slow.test.ts)
- 'right border intact when card has date badge' (basic case)
- 'right border intact with long title and date badge at 30/35/40/45/50/60/80 cols' (parameterized)
- 'unselected body cards have dim gray border' (virtual body card, separate cluster)
- 'selected body card gets yellow border' (virtual body card)
- 'wide chars with extensive navigation' (emoji garble repro)

## Repro
bun vitest run --project=slow apps/@km/tui/tests/card-rendering.slow.test.ts

Sample failure: card.text wraps to 2 lines, right border (│) missing on
both rows where date badge ('Sep 30') is rendered to the right.

## Acceptance
- card-rendering.slow.test.ts passes (or remaining failures documented)
- Border bugs not regressed elsewhere
- Underlying root cause documented

Likely silvery pipeline territory — badge layout, border drawing, or
flexbox interaction. Use silvery agent + worktree.