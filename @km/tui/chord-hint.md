---
mentions:
  - km
  - claude
id: "@km/tui/chord-hint"
aliases:
  - km-tui.chord-hint
  - km-tui-chord-hint
created_by: claude:28b14b32
created_at: 2026-02-23T10:56:10Z
closed_at: 2026-02-23T14:44:27Z
owner: bjorn@stabell.org
assignee: claude:28b14b32
---

# [x] Chord hint: show '?' prompt instead of full help popup on chord press @km/tui #feature #P2 @claude:28b14b32

Two UX changes to chord help:

1. **Small hint on chord press**: Instead of showing the full help popup when chords are pressed, show a small hint popup next to the command line (perhaps to the side) saying 'press ? to see all chords'. The WhichKeyPopup currently shows available suffixes — this would add a subtle reminder about the ? key.
2. **Anchor chord help above command box**: Make chord help pop up from the command box so it's vertically aligned with the command line — like the help dialog but anchored above the command line/command box, not centered on screen.

