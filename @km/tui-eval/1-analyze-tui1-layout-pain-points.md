---
mentions:
  - km
id: "@km/tui-eval/1-analyze-tui1-layout-pain-points"
aliases:
  - km-tui-eval.1
  - km-tui-eval-1
  - "@km/tui-eval/1"
created_at: 2026-01-16T23:52:46Z
closed_at: 2026-01-17T00:00:16Z
---

# [x] Analyze TUI1 layout pain points @km/tui-eval #task #P2

## Summary

Deep dive into TUI1 (Ink) layout issues to understand if they can be addressed with better patterns or abstractions.

## Known Pain Points

1. **Manual width management** - Every component manually tracks available width
2. **Custom layout infrastructure** - Entire layout/ module (truncate, wrap, constrain, path)
3. **Display length complexity** - Must calculate visible chars excluding ANSI codes everywhere
4. **Board overflow handling** - Manual maxVisibleCards calculation with complex math
5. **fullscreen-ink race condition** (@km/_orphan/rqt6) - Startup requires polling and 50ms waits

## Investigation Tasks

- [ ] Review layout/ module - can it be simplified?
- [ ] Check if Ink has newer layout features we're not using
- [ ] Look for community solutions to Ink layout problems
- [ ] Evaluate if a thin abstraction layer could reduce boilerplate
- [ ] Assess fullscreen-ink race condition - is there a proper fix?

## Output

Document with:

1. Each pain point severity (blocking, annoying, acceptable)
2. Potential solutions for each
3. Estimated effort to implement solutions

