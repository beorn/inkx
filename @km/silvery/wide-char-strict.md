---
id: "@km/silvery/wide-char-strict"
aliases:
  - km-silvery.wide-char-strict
  - km-silvery-wide-char-strict
created_by: Bjørn Stabell
created_at: 2026-04-10T18:53:57Z
closed_at: 2026-04-10T19:12:06Z
close_reason: "Fixed in eaeff0e5. Root cause: STRICT verifier VT parser
  (output-verify.ts) lacked wide char awareness and grapheme cluster handling.
  Added graphemeWidth-based processing for surrogates, ZWJ, variation selectors,
  combining marks. Buffer rendering was correct — only the verification parser
  was wrong."
---

# [x] Wide character (CJK/emoji) STRICT mismatch — continuation cells not cleared @km/silvery #bug #P2

Pre-existing STRICT mismatch: when wide characters (CJK, emoji) replace narrow
ASCII text at the same buffer position, the continuation cell retains the old
narrow character instead of being cleared.

## Repro
Tests: ai-chat.test.tsx, inline-scrollback-promotion.test.tsx, scrollback-promotion.test.tsx
Example: 日本語 (3 wide chars) replaces "I'll check" — continuation cells show stale 'l', '─' chars.

## Root cause
renderGraphemes writes the wide character's main cell correctly but doesn't
clear the continuation cell when the previous buffer had a narrow char there.
The incremental rendering clones the previous buffer, so stale narrow chars
survive in continuation cell positions.

## Fix
In renderGraphemes, when writing a wide character at column C:
- Set cell C: char='日', wide=true
- Set cell C+1: char='', continuation=true ← must overwrite any existing char

## Affected tests (5 files, 7 tests — all STRICT_OUTPUT)
- vendor/silvery/tests/examples/ai-chat.test.tsx
- vendor/silvery/tests/features/inline-scrollback-promotion.test.tsx (2 tests)
- vendor/silvery/tests/features/scrollback-promotion.test.tsx
- apps/@km/tui/tests/driver.test.tsx:719 (emoji rendering)