---
id: "@km/silvery/term-factory-dedup"
aliases:
  - km-silvery.term-factory-dedup
  - km-silvery-term-factory-dedup
created_by: Bjørn Stabell
created_at: 2026-04-01T07:30:49Z
closed_at: 2026-04-01T07:37:16Z
close_reason: Extracted 4 shared helpers (parseInputEvents, createEventQueue,
  createEmulatorStdout, finalizeTerm). 755→692 lines. All 3 factories now
  compose helpers.
owner: bjorn@stabell.org
---

# [x] Deduplicate 3 Term factories (real, headless, emulator) into composable builder @km/silvery #task #P3

createTerm, createHeadlessTerm, createBackendTerm share ~60 lines of identical boilerplate: disposed flag, AbortController, _frame, stripAnsi, events() generator, paint(), Symbol.dispose, createMixedStyle wrap, Object.defineProperty for frame.

Composable approach: one base builder with behavior injected via options (stdout strategy, paint strategy, input strategy). Would reduce ~250 lines to ~100.