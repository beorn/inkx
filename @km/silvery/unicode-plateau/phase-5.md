---
mentions:
  - km
  - claude
id: "@km/silvery/unicode-plateau/phase-5"
aliases:
  - km-silvery.unicode-plateau.phase-5
  - km-silvery-unicode-plateau-phase-5
created_by: claude:c6244087
created_at: 2026-04-23T16:50:00Z
closed_at: 2026-04-23T16:56:13Z
close_reason: Phase 5 shipped per /pro (Gemini) review. underline-ext.ts helpers
  require explicit caps. _ambientCaps module state + _resetAmbientCapsForTesting
  hook deleted. NodeView.tsx threads caps via useTerm. storybook.ts uses ucaps
  fixture. 0 lint violations. Silvery 4e884258.
owner: bjorn@stabell.org
assignee: claude:c6244087
dependencies:
  - issue_id: km-silvery.unicode-plateau.phase-5
    depends_on_id: km-silvery.unicode-plateau
    type: parent-child
    created_at: 2026-04-23T09:50:19Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.unicode-plateau
---

# [x] Unicode plateau Phase 5: require caps in underline-ext (fix ambient-authority leak) @km/silvery #task #P1 @claude:c6244087

blocks:: [[@km/silvery/unicode-plateau]]

Per /pro (Gemini 3 Pro) review 2026-04-23: the optional-caps-with-ambient-fallback in packages/ansi/src/underline-ext.ts is a real plateau violation. The module state (_ambientCaps) and test hook (_resetAmbientCapsForTesting) are code smells. Callers should thread caps from their Term (term.caps) or createTerminalProfile explicitly. Gracefully degrade to standard underline when caps absent - don't secretly read env. Fix: make caps required, update NodeView.tsx (via useTerm hook) and storybook.ts call sites, delete the module state.

