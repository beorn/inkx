---
aliases:
  - @km/silvercode/parity-claude.l5-visual-replay-parity
  - @km/silvercode/parity-claude-l5-visual-replay-parity
created_at: 2026-05-07T01:20:12.416Z
type: task
priority: P1
status: open
parent: "@km/silvercode/parity-claude"
---

# L5: visual replay parity against Claude Code screenshot sessions #P1

blocks:: [[@km/silvercode/parity-claude]]

## Goal

Prove the projected ChatBlock transcript is same-or-better than Claude Code for real sessions, not only unit fixtures.

## Work

- Replay the screenshot sessions through the projected renderer.
- Capture normal-mode and Debug-mode frames.
- Compare against Claude Code screenshots for scanability: user/assistant separation, command/detail expansion, edit/diff readability, tables, recaps, notifications, and raw/debug noise.
- Add visual regression coverage for known failures: duplicate messages, empty expanded command groups, overly wide `Edited ...`, blank lines above assistant text, table wrapping, and raw debug blocks.

## Acceptance

- A reviewer can reconstruct task flow from the projected transcript without Debug.
- Debug reveals every raw/control detail in context.
- Projected output is at least as readable as Claude Code on the May 6 side-by-side sessions.
- Visual tests cover the cases named above.

## Verification

- visual replay command added by this bead.
- focused ChatBlock/render tests.
