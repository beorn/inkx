---
mentions:
  - km
  - claude
id: "@km/inbox/flexx-colrev"
aliases:
  - km-flexx-colrev
  - "@km/_orphan/flexx-colrev"
created_at: 2026-01-30T17:17:14Z
closed_at: 2026-01-30T18:40:26Z
assignee: claude:b8b4780b
---

# [x] Fix column-reverse layout causing negative array size @km/_orphan #bug #P2 @claude:b8b4780b

Pre-existing bug: flexDirection='column-reverse' causes RangeError in inkx tests.

Error: RangeError: Array length must be a positive integer of safe magnitude
  at new TerminalBuffer (buffer.ts:355)

Test: tests/compat/layout.test.tsx > 'accepts flexDirection=column-reverse'

Root cause: Flexx layout algorithm produces negative or NaN dimensions for column-reverse containers, which propagates to terminal buffer creation.

Reproduction:
<Box flexDirection='column-reverse' width={10}>
  <Text>A</Text>
  <Text>B</Text>
</Box>

