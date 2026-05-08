---
id: "@km/silvercode/agent-host-l5/04-chat-thread-projection/l5-visual-replay-pa\
  rity"
---

# [/] L5: visual replay parity against Claude Code screenshot sessions #P1 @agent/3

blocks:: [[@km/silvercode/agent-host-l5/08-provider-conformance/parity-claude]]

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

blocks:: [[@km/silvercode/parity-claude]]

