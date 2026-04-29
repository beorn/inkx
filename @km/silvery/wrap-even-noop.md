---
id: "@km/silvery/wrap-even-noop"
aliases:
  - km-silvery.wrap-even-noop
  - km-silvery-wrap-even-noop
created_by: Bjørn Stabell
created_at: 2026-04-12T04:28:38Z
closed_at: 2026-04-12T04:38:52Z
close_reason: >-
  FALSE POSITIVE — not a bug. Investigation dated 2026-04-11:


  The wrap="even" code path IS correctly wired in render-text.ts:761-765. It
  calls buildTextAnalysis + optimalWrap from pipeline/pretext.ts.


  Original observation (demo paragraph + short test input rendering identically
  to greedy) was caused by a mathematical property of the specific test text —
  both inputs happened to have NO slack for Knuth-Plass to redistribute, so
  optimal = greedy for that input.


  Direct algorithm comparison (via bun -e snippet):

  - 'aaa bbb ccc ddd eee' at width 12: optimal = greedy (both produce ['aaa bbb
  ccc', 'ddd eee'])

  - The demo paragraph at width 50: optimal = greedy (both produce identical
  7-line output)

  - 'Four score and seven years ago...' at width 20: optimal ≠ greedy ✓


  Verified end-to-end with a passing regression test in
  vendor/silvery/tests/features/pretext-layout.test.tsx 'wrap="even" produces
  different line breaks than wrap="wrap" for raggable text'. Rendered rows
  differ as expected when the input has slack.


  Lesson: the original /explore 'byte-identical wrap modes' observation was real
  data but wrong conclusion. Always verify at the algorithm level (direct
  function call) before concluding that a rendering integration is broken.
---

# [x] wrap="even" renders identically to wrap="wrap" — Knuth-Plass not wired through @km/silvery #bug #P2 @Bjørn Stabell

blocks:: [[@km/silvery]]

The pure Knuth-Plass and balanced-width algorithms in packages/ag-term/src/pipeline/pretext.ts have passing unit tests, but <Text wrap="even"> produces byte-identical output to <Text wrap="wrap"> at the rendered-row level.

Regression test (test.fails): vendor/silvery/tests/features/pretext-layout.test.tsx "wrap=even produces different line breaks than wrap=wrap for raggable text"

Input: text "aaa bbb ccc ddd eee" in a Box width={12}
Expected (Knuth-Plass): ["aaa bbb     ", "ccc ddd eee "]  (or similar with lower raggedness)
Actual (both modes):    ["aaa bbb ccc ", "ddd eee     "]  (greedy)

Fix location: find the text wrapping call site in render-text.ts / prepared-text.ts / unicode.ts — currently wrap="even" appears to fall through to wrapText() (greedy) instead of calling optimalWrap() from pipeline/pretext.ts.