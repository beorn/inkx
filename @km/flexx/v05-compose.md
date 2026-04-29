---
id: "@km/flexx/v05-compose"
aliases:
  - km-flexx.v05-compose
  - km-flexx-v05-compose
created_by: claude:9abd72d2
created_at: 2026-03-30T19:37:40Z
closed_at: 2026-03-30T19:57:03Z
close_reason: "Implemented composable layout engine: createFlexily,
  createBareFlexily, pipe, TextLayoutService with 3 backends, FlexilyNode mixin.
  31 tests, all 1561 Flexily tests pass, zero type errors."
owner: bjorn@stabell.org
assignee: claude:9abd72d2
---

# [x] v0.5: Composable layout engine @km/flexx #feature #P1 @claude:9abd72d2

Implemented composable layout engine for Flexily:
- createFlexily() batteries-included factory (monospace text measurement)
- createBareFlexily() minimal engine + pipe() for plugin composition
- TextLayoutService interface with pluggable backends
- MonospaceMeasurer (terminal: 1 char = 1 cell)
- DeterministicTestMeasurer (Latin 0.8, CJK 1.0, emoji 1.8)
- PretextMeasurer adapter (proportional fonts, peer dep)
- FlexilyNode = Node + text mixin (no wrapper overhead)
- 31 tests covering all APIs
- Flat file structure in src/ (no compose/ subdirectory)