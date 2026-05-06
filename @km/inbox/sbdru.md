---
mentions:
  - km
  - claude
id: "@km/inbox/sbdru"
aliases:
  - km-sbdru
  - "@km/_orphan/sbdru"
created_by: claude:af6eb626
created_at: 2026-03-04T15:05:44Z
closed_at: 2026-03-04T16:36:06Z
owner: bjorn@stabell.org
assignee: claude:3c1481f8
---

# [x] inkx: mouse SGR sequences leak into text on double-click @km/_orphan #bug #P0 @claude:3c1481f8

Double-clicking a card in km view causes ANSI mouse escape sequence fragments to appear in the rendered card text. Screenshot shows 'House8;58M64;118;58M' — fragments of SGR mouse sequences (\x1b[<button;x;yM).

Root cause: splitRawInput() in term-provider.ts assumes complete CSI sequences arrive within a single stdin chunk. When a mouse SGR sequence splits across two data events (e.g., '\x1b[<0;58;8' in one chunk, 'M' in the next), the incomplete fragment bypasses isMouseSequence() detection and falls through to parseKey(), which strips the escape prefix and feeds the remaining bytes (like '8;58M') as keyboard input into the active text editor.

Fix locations:

1. vendor/beorn-inkx/src/runtime/term-provider.ts:44-78 — splitRawInput() needs a cross-chunk accumulation buffer for incomplete CSI sequences
2. vendor/beorn-inkx/src/runtime/term-provider.ts:195-202 — onKey() should also guard against mouse-like fragments even when isMouseSequence() fails

Reproduction: double-click rapidly on a card in km view (especially over SSH or with high-latency terminal)

