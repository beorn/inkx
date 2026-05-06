---
mentions:
  - km
  - claude
id: "@km/silvercode/cursor-startup-position"
aliases:
  - km-silvercode.cursor-startup-position
  - km-silvercode-cursor-startup-position
created_by: claude:2405c72e
created_at: 2026-04-25T05:06:47Z
closed_at: 2026-04-25T15:44:33Z
close_reason: >-
  Fixed by Phase 2 of `km-silvery.view-as-layout-output` (the parent bead
  remains open for Phases 3-6).


  Root cause: cursor was emitted via React-effect-chain (`useCursor` →
  `useScrollRect` → `useLayoutEffect` → `setCursorState`).
  First-frame-after-conditional-mount, effect chain hadn't completed — scheduler
  had no cursor state, hardware cursor stayed at last buffer-cell write
  (side-panel quota line).


  Fix: cursor declared as Box prop (`cursorOffset`). Layout phase resolves
  absolute coords synchronously via `computeCursorRect`. Scheduler + runtime
  read `findActiveCursorRect(root)`. First frame emits correct cursor ANSI.
  Bonus: createApp render path now emits cursor ANSI in fullscreen (previously
  didn't).


  Verification:

  - Failing baseline: `apps/silvercode/tests/process/cursor-startup.test.tsx`
  reported cursor at (120, 39).

  - Now passing: cursor lands in command region (col < 84, row >= 24).


  Commit: km@327b31880 (bumps silvery to bd6a94f8).

  New invariants: `vendor/silvery/tests/features/cursor-offset-prop.test.tsx`.
started_at: 2026-04-25T05:23:04Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.cursor-startup-position
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-24T22:07:12Z
    created_by: claude:2405c72e
    metadata: "{}"
  - issue_id: km-silvercode.cursor-startup-position
    depends_on_id: km-silvery.view-as-layout-output
    type: blocks
    created_at: 2026-04-24T23:08:12Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvercode
      - type: link
        target: km-silvery.view-as-layout-output
---

# [x] [bug] Cursor lands in side panel at startup; restored to command box only after first interaction @km/silvercode #bug #P1 @claude:2405c72e

blocks:: [[@km/silvercode]], [[@km/silvery/view-as-layout-output]]

## Symptom

At silvercode startup, the hardware cursor renders in the side panel (e.g. next to the quota progress bar at "10%") instead of the command region. After typing any character (or backspace), the cursor snaps to the correct position right after the "> " prompt and behaves correctly thereafter.

## Repro

1. `bun silvercode --bare` in a 120x40 terminal
2. Look at the cursor position before typing anything → cursor is in the side panel area
3. Type any character + backspace → cursor jumps to the command region

Verified via TTY MCP screenshots:

- Empty state SVG has cursor rect at col=106 row=33 ("  10%" line in the side panel)
- After type+backspace SVG has cursor rect at col=8 row=37 (right after "> " prompt)

## Hypothesis

silvery's TextArea calls `useCursor()` which schedules cursor positioning via `useScrollRect` (signal-based effect). On the first mount, the cursor positioning ANSI may not be emitted before the rest of the frame's cell writes complete. Result: xterm.js (and real terminals) park the cursor at the last-written cell — which happens to be the side panel quota line.

## Investigation pointers

- `vendor/silvery/packages/ag-react/src/hooks/useCursor.ts` (useScrollRect callback path)
- `vendor/silvery/packages/ag-term/src/scheduler.ts:564-576` (cursor suffix emission)
- `apps/silvercode/src/components/CommandBox.tsx:149-180` (command TextArea)

## Tests blocked

`apps/silvercode/tests/visual/queue-cursor.test.tsx` was originally written with cursor-position assertions; they were dropped because termless's emulator-backed run() resolves `nonTTYMode` to "line-by-line" (no cursor ANSI), so `term.getCursor()` reflects last-write position rather than silvery's intent. Real fix: process-harness test infra (see @km/silvercode/test-process-harness).

