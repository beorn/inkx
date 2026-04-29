---
id: "@km/silvery/backdrop-hardening/split-core-plan"
aliases:
  - km-silvery.backdrop-hardening.split-core-plan
  - km-silvery-backdrop-hardening-split-core-plan
created_by: claude:88c0e764
created_at: 2026-04-20T21:01:08Z
closed_at: 2026-04-20T21:35:34Z
close_reason: CorePlan + TerminalPlan types added; buildCorePlan strips
  kittyEnabled. Active plans frozen, PlanRect.rect cloned. 5 new tests (JSON
  round-trip, freeze, rect clone, type extension, parity). 95→100 backdrop tests
  pass. Commit 491a15de.
---

# [x] Split CorePlan from TerminalPlan (cross-platform forward-compat) @km/silvery #task #P0 @claude:a1a0e667

blocks:: [[@km/silvery/backdrop-hardening]]

Pro review P2.1 + P2.4. Current Plan type is described as immutable + capability-independent but:
- Contains kittyEnabled (terminal-specific)
- Active plans not frozen; includes/excludes arrays mutable; PlanRect.rect aliases node rects
- Single global amount justified by Kitty's one-image-one-alpha model

For silvery's web/canvas future (realize-dom.ts, realize-canvas.ts), core plan should not know about Kitty, and per-rect amounts are trivially realizable on DOM.

## Target shape

\`\`\`ts
type CorePlan = {
  active, amount, scrim, defaultBg, defaultFg,
  scrimTowardLight, includes, excludes, mixedAmounts
}
type TerminalPlan = CorePlan & {
  kittyEnabled, colorLevel?
}
\`\`\`

## /complete criteria

- [ ] CorePlan type + TerminalPlan extends CorePlan exported from plan.ts
- [ ] buildPlan(root, options) returns TerminalPlan (terminal context)
- [ ] buildCorePlan(root, options) exists for framework-agnostic use
- [ ] Test: CorePlan serializes clean JSON (no Kitty fields)
- [ ] Active plans frozen (or docs stop claiming immutability)
- [ ] includes/excludes frozen
- [ ] PlanRect.rect cloned (not aliased)

## Parent

@km/silvery/backdrop-hardening