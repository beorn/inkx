---
id: "@km/silvercode/ctrl-g-s-hsplit-broken"
aliases:
  - km-silvercode.ctrl-g-s-hsplit-broken
  - km-silvercode-ctrl-g-s-hsplit-broken
created_by: claude:87d20187
created_at: 2026-04-28T16:10:28Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.ctrl-g-s-hsplit-broken
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T09:10:45Z
    created_by: claude:87d20187
    metadata: "{}"
---

# [ ] Ctrl+G s (hsplit chord) doesn't produce horizontal divider in visual tests @km/silvercode #bug #P2

blocks:: [[@km/silvercode]]

3 tests in apps/silvercode/tests/visual/pane-2d-layout.test.tsx fail at the '─' assertion:

1. 'Ctrl+G s — horizontal split renders a row divider' (line 79)
2. 'Ctrl+G v then Ctrl+G s — mixed split renders both | and ─ dividers' (line 105) — vsplit | works, hsplit ─ does not
3. 'Ctrl+G z — zoom hides dividers' (line 136) — fails at the pre-zoom sanity check that ─ exists

Symptom: after Ctrl+G s, the rendered screen has no '─' character. Test debug output shows a literal '> s' echoing in the command prompt input — the 's' keystroke is being routed to the TextArea instead of being captured by the Ctrl+G chord handler.

Ctrl+G v (vsplit, produces '│') works correctly. Ctrl+G s (hsplit, expected to produce '─') fails. Same chord prefix, identical handler structure in App.tsx (lines 874-885), but only one fires.

Hypothesis avenues:
- Check if Ctrl+G chord state is set before 's' arrives (the timing comment on chordRef warns about React batching)
- Check if 's' has another useInput handler that consumes it before the chord branch
- Check if splitFocusedPane('column') actually mutates the tree (vs splitFocusedPane('row') which works)
- Check if PaneGrid's column-split rendering path is broken even when the tree is correct

Last-touched commits:
- Test added: 250eb5fd9 feat(silvercode): 2D pane layout (binary-split tree, horizontal splits)
- Last modified: 73bd49d68 refactor(silvercode): drop track= (1-line removal of track='claude' prop)

Acceptance:
- bun vitest run apps/silvercode/tests/visual/pane-2d-layout.test.tsx → 3/3 pass
- 'Ctrl+G s' from a single-pane state produces visible '─' on screen