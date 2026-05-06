---
mentions:
  - km
id: "@km/silvercode/live-tty-blank-screen"
aliases:
  - km-silvercode.live-tty-blank-screen
  - km-silvercode-live-tty-blank-screen
created_by: claude:cd034ca4
created_at: 2026-04-26T23:07:43Z
closed_at: 2026-04-26T23:09:43Z
close_reason: no longer reproduces after subsequent commits — cause unidentified
  (likely one of the silvery bumps post-d3b79c90e). Reopen if symptom recurs.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.live-tty-blank-screen
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-26T16:07:46Z
    created_by: claude:cd034ca4
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [x] [bug] silvercode shows blank screen on launch (live TTY only — harness passes) @km/silvercode #bug #P1

blocks:: [[@km/silvercode]]

User report: `bun silvercode` shows blank screen interactively. Existing process-harness test (apps/silvercode/tests/process/cursor-startup.test.tsx) PASSES — confirms welcome card 'Silver Code for Claude Code' + Commands list render in xterm.js harness.

## Gap

Process harness uses xterm.js + (likely) alt-screen mode. Live TTY (Ghostty etc.) uses inline mode and a real PTY. The blank-screen regression doesn't reproduce in the harness path → no test guards against it.

## Suspect commits (post-last-known-good)

- d3b79c90e silvery 'inline mode SILVERY_STRICT_TERMINAL coverage' — live-TTY path changes
- 8ce33dd0a silvery 'hybrid output emission phase 2' — new emission code (Phase 3 wiring not shipped, so should be dormant)
- 9c50f59ad silvercode UsageMeter+permission bridge
- 371c50cd9 silvercode SessionPromptComposer rename
- 2a7bf647f silvercode UsageMeter Box-in-Text fix (today)

## Repro request

- Terminal: which? (Ghostty / iTerm2 / Apple Terminal / etc.)
- TERM env value
- Any SILVERY_* / KM_* / DEBUG env vars
- Behavior: cursor flashing? typing produces output? Ctrl-C exits?
- bun silvercode 2>/tmp/sc.err; cat tail of sc.err

## Spec-level test plan (per user request)

We have:

- cursor-startup.test.tsx — process harness, xterm.js, alt-screen
- resume-blank-screen.test.ts — narrow (resume flow)

What's MISSING:

- Live-TTY assertion (inline mode, no alt-screen) — not just 'screen renders' but 'specific welcome content visible after first paint'
- Bisect harness: spawn silvercode under various TERM values (xterm-256color, ghostty, dumb) and assert content
- Hybrid output emission off/on smoke

Tests should be at apps/silvercode/tests/process/<x>.spec.ts using process-harness with explicit TTY/inline/alt-screen variants.

## Acceptance

- Repro reproduced, root cause identified
- Spec-level test added that would have caught this before user notice
- Test fails on broken commit, passes after fix

