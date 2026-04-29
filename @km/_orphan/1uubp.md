---
id: "@km/_orphan/1uubp"
aliases:
  - km-1uubp
created_by: claude:c9beade3
created_at: 2026-03-13T23:21:15Z
closed_at: 2026-03-13T23:45:56Z
close_reason: Closed
---

# [x] termless: encodeKeyToAnsi diverges from keyToAnsi, press() uses incomplete encoder @km/_orphan #bug #P1 @claude:c9beade3

Found by GPT 5.4 Pro review (2026-03-13).

Files: src/key-encoding.ts:78-116, src/terminal.ts:115-127
Classification: P1

encodeKeyToAnsi() not behaviorally aligned with keyToAnsi(). Shift+Tab becomes plain tab instead of reverse-tab (CSI Z). Ctrl+Enter, super/meta, other cases also diverge. press() always prefers the incomplete encoder.

Suggested fix: Make one encoder the single source of truth. Reuse from both press() and backend wrappers. Add exhaustive tests for Playwright-style key names/modifiers.