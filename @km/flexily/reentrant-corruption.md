---
id: "@km/flexily/reentrant-corruption"
aliases:
  - km-flexily.reentrant-corruption
  - km-flexily-reentrant-corruption
created_by: claude:c9beade3
created_at: 2026-03-13T15:10:22Z
closed_at: 2026-03-13T18:06:00Z
close_reason: Fixed with TDD tests, all passing (1215 fuzz + unit)
---

# [x] Re-entrant layout corrupts global zero-allocation scratch state @km/flexily #bug #P0 @claude:c9beade3

GPT 5.4 Pro re-review P0. If a measureFunc or baselineFunc synchronously calls calculateLayout() on another tree, the nested layout overwrites shared module-global arrays (_lineCrossSizes, _lineChildren, traversalStack, etc.) while outer layout is mid-pass. Causes arbitrary wrong layout. Fix: add re-entrancy guard or per-pass context object.