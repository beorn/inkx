---
id: "@km/termless/record-ux"
aliases:
  - km-termless.record-ux
  - km-termless-record-ux
created_by: claude:4929065a
created_at: 2026-04-02T17:00:46Z
---

# [ ] Recording UX: separator lines, window title, post-session summary @km/termless #feature #P2

Improve the recording experience for longer sessions.

## Problem
In the current CLI output, it's hard to tell when recording started/ended. The pre-recording instructions and post-recording summary blend with the terminal session content.

## Design
1. Styled separator lines before/after recording (stderr):
   ──── 🔴 Recording: km view ─────────────────────
   [...actual terminal session...]
   ──── ✓ Done (22 keystrokes, 7.0s) ──────────────
   Saved: km2.gif (471KB)

2. Window title during recording (OSC 0):
   🔴 REC — km view
   Restored to original title after recording.

3. Post-session summary with:
   - Duration
   - Keystroke count + output event count
   - Frame count (if image output)
   - File sizes for each output
   - Preview command (open km2.gif)

4. NO alt screen — preserves scrollback, avoids nested alt screen issues with TUI apps

5. For very long sessions, consider a periodic status in the window title:
   🔴 REC 2:34 — km view