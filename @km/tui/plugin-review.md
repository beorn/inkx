---
id: "@km/tui/plugin-review"
aliases:
  - km-tui.plugin-review
  - km-tui-plugin-review
created_by: Bjørn Stabell
created_at: 2026-04-01T19:30:27Z
closed_at: 2026-04-01T19:42:47Z
close_reason: "Audit complete. See notes for findings. Key gap: no domain-level
  .apply() pattern yet — withOutliner needs reshaping, createApp needs pipe()
  migration."
---

# [x] Review current with* composition — map against era2 TEA vision @km/tui #task #P2 @Bjørn Stabell

Audit: what with* plugins exist today (withApp, withOutliner, etc.)? How do they compose? What's the plugin stack order? How does this map to the era2 TEA state machine vision (docs/design/tea-state-machines.md)?

Questions:
- What's the current composition: tree → outliner → board → cursor → render?
- How do commands flow through the plugin stack?
- How does undo compose with plugins?
- What does era2 say about plugin architecture?
- What's missing to make withValidation + withOutliner + withCursor work together?