---
id: "@km/silvercode/pane-chord-fires"
aliases:
  - km-silvercode.pane-chord-fires
  - km-silvercode-pane-chord-fires
created_by: claude:cc081a9a
created_at: 2026-04-28T03:32:11Z
---

# [ ] [bug] Ctrl+G pane chord (v/s/x/z) doesn't fire from PTY input — 3 visual tests fail @km/silvercode #bug #P2

blocks:: [[@km/silvercode]]

## Symptom
Pane-management chord (Ctrl+G followed by v/s/x/z) does not fire when bytes
arrive via PTY input.

## Repro
1. `bun apps/silvercode/src/bootstrap.ts` (default agent)
2. Press Ctrl+G then v
3. Expected: vertical split (two panes side-by-side, with `│` divider)
4. Actual: nothing happens; the 'v' lands in the prompt buffer (`> v`)

## Test evidence
`apps/silvercode/tests/visual/pane-2d-layout.test.tsx` — 3 of 3 tests fail:
- `Ctrl+G s — horizontal split renders a row divider`
- `Ctrl+G v then Ctrl+G s — mixed split renders both dividers`
- `Ctrl+G z — zoom hides dividers across the 2D tree`

The tests use `feed(term, CTRL_G); await settle(20); feed(term, 's')` —
mirroring the real PTY arrival pattern. The 20ms gap is intentional so
React's chord setter has time to process.

## Hypothesis
Either (a) the chord recognizer's window is too short for byte-level
arrival timing, (b) the chord state isn't being set/read correctly across
the React render cycle, or (c) Ctrl+G is being routed somewhere else
(e.g. consumed by the TextInput before the chord handler sees it).

## Found during
Session @km/session/0427-silvercode (silvercode exploratory testing).