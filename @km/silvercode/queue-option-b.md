---
id: "@km/silvercode/queue-option-b"
aliases:
  - km-silvercode.queue-option-b
  - km-silvercode-queue-option-b
created_by: claude:0940ca20
created_at: 2026-04-24T23:16:25Z
closed_at: 2026-04-25T05:30:44Z
close_reason: "Both child beads (km-silvercode.queue-option-b-impl,
  km-silvery.textarea-edge-callback) closed. Tests added:
  apps/silvercode/tests/visual/queue-option-b.test.tsx (7 createRenderer tests)
  + apps/silvercode/tests/visual/queue-cursor.test.tsx (3 termless tests, this
  session). Architecture shipped, no regressions."
---

# [x] [epic] Queue UX redesign — two TextAreas with seamless cursor-boundary focus handoff @km/silvercode #feature #P1

blocks:: [[@km/silvercode]]

## Context

The queue editor has accumulated ~12 bugs in one day of iteration. Root cause (per /big analysis, captured in apps/silvercode/docs/queue-option-b-design.md): queue modeled as editable UI widget instead of what it actually is — a second editable REGION alongside the command input, with native textarea semantics on both.

## Design

**Full design doc: `apps/silvercode/docs/queue-option-b-design.md`.** TL;DR:

- TWO silvery `<TextArea>` widgets, BOTH always live (no 'enter queue editor' mode)
- Focus follows cursor via edge-boundary callback — Up at top of command → cursor jumps to end of last queue line; Down at bottom of queue → jumps to start of command
- Per-region coloring (white = focused, muted = unfocused) driven SOLELY by `focusedRegion: 'queue' | 'command'`
- No `queueFocused`, no `holdQueue`, no `isHeld`, no release ceremony — all deleted
- Enter in command sends; Enter in queue force-flushes; Shift+Enter is native newline
- Silvery owns cursor / selection / emacs / kill ring for each TextArea — no reimplementation

## Children (sequence)

1. **@km/silvery/textarea-edge-callback** (P1, new) — add `onEdge` callback to silvery TextArea. Fires when arrow key hits boundary; if handler returns true, silvery doesn't clamp. This is the load-bearing silvery API addition.

2. **@km/silvercode/queue-option-b-impl** (P1, new) — rewrite CommandBox to use two-TextArea pair, delete QueueEditor, delete queueFocused/holdQueue state in App.tsx, wire boundary handoff. Piecemeal fixes from this session (commits 49d4274aa, 6be6ef66e, 4b38bd604, b5289d672, 2e37edfe5, 923f2a4c8, 640022ad1, eb0e6a4d3) become obsolete — most will be deleted or radically simplified in this refactor.

3. **@km/silvercode/queue-option-b-tests** — visual regression scenarios covering: focus swap up + down, entry editing via cursor movement, Enter-in-queue force-flush, Enter-in-command normal send, empty-queue Up-arrow no-op, per-region coloring, edge-case when queue grows past 12 rows.

## Acceptance (full)

See design doc section 'Acceptance'.

## Supersedes

All the piecemeal fixes from session 2026-04-24 stabilize the CURRENT design on main for ship-ability. After this refactor lands, those specific bug fixes become irrelevant (the bugs can't re-occur because the architecture that enabled them is gone). Commits to mark as 'superseded by queue-option-b' in their bead close-reasons / CHANGELOG.

## Out of scope for this epic

- Multi-column queue display (future)
- Queue search / filter (future)
- Per-entry ✕ cancel button (future)
- Silvery TextArea `linePrefix` prop (v1 uses external gutter Box)