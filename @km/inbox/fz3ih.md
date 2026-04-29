---
id: "@km/_orphan/fz3ih"
aliases:
  - km-fz3ih
created_by: claude:2405c72e
created_at: 2026-04-26T12:52:16Z
closed_at: 2026-04-28T02:29:34Z
close_reason: Already fixed in commit 0be048527 (chordRef ref-mirror in
  apps/silvercode/src/App.tsx:367-372). Verified at App.tsx:850 the chord
  handler reads chordRef.current synchronously, no longer state-stale.
owner: bjorn@stabell.org
---

# [x] Ctrl+G chord state-stale: chord set but follow-up key inserts as text @km/_orphan #bug #P1

Symptom: Press Ctrl+G then v (or s/x/z) in CommandBox. Expected: pane chord (vsplit/hsplit/close/zoom). Actual: 'v' inserted into input box, no chord action.

Repro:
1. bun apps/silvercode/src/bootstrap.ts --cwd /tmp/test
2. Press Ctrl+G
3. Press v
Expected: vsplit attempt
Actual: '> v' shows in input

Root cause: chord is React state (App.tsx:220 \`const [chord, setChord]\`). The closure for the next keystroke handler captures \`chord === null\` because setChord is async — by the time \`v\` is processed, React hasn't committed the state update from setChord('ctrl-g'). Ref-mirror needed for synchronous read.

Note: The bead @km/silvercode/ctrl-w-blocked-by-textarea was about TextArea consuming Ctrl+W. Rebinding to Ctrl+G fixed THAT issue (Ctrl+G fires App handler), but exposed a SECOND issue (state-stale chord check on follow-up).

Fix: mirror \`chord\` into a ref \`chordRef\`, read from ref in useInput handler.

File: apps/silvercode/src/App.tsx:220, 683