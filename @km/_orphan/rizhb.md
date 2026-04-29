---
id: "@km/_orphan/rizhb"
aliases:
  - km-rizhb
created_by: claude:c9beade3
created_at: 2026-03-13T23:20:39Z
closed_at: 2026-03-13T23:40:48Z
close_reason: Fixed toMatchTerminalSnapshot and toMatchSvgSnapshot to delegate
  to Vitest's built-in expect().toMatchSnapshot(). Snapshots are now created and
  mismatches properly detected.
---

# [x] termless: snapshot matchers don't actually snapshot @km/_orphan #bug #P0 @claude:c9beade3

Found by GPT 5.4 Pro review (2026-03-13).

File: packages/viterm/src/matchers.ts:214-286
Classification: P0

toMatchTerminalSnapshot() and toMatchSvgSnapshot() return { pass, actual, expected } but never invoke Vitest snapshot comparison/update machinery. Tests can pass without comparing anything.

Suggested fix: Wire into Vitest's internal snapshot matcher correctly, or use expect(terminalSnapshot(term)).toMatchSnapshot(name).