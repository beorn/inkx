---
mentions:
  - km
id: "@km/silvery/ghostty-case-sensitivity"
aliases:
  - km-silvery.ghostty-case-sensitivity
  - km-silvery-ghostty-case-sensitivity
created_by: claude:c6244087
created_at: 2026-04-23T09:25:21Z
closed_at: 2026-04-23T09:49:40Z
close_reason: >-
  Fixed in /big review of terminal-profile-plateau (2026-04-23).


  Root cause: profile.ts:295 `isGhostty = program === 'ghostty'` (lowercase) but
  env value is 'Ghostty' (capitalized). Every one of Ghostty's cap flags
  (kittyKeyboard, kittyGraphics, osc52, hyperlinks, syncOutput, underlineStyles,
  underlineColor, nerdfont) was therefore false on real Ghostty machines.


  Fix: profile.ts:295 → `program === 'Ghostty'` (matches detectColorFromEnv and
  every other silvery comparison site).


  Regression tests (vendor/silvery/packages/ansi/tests/profile.test.ts):

  - Ghostty matrix test pins all 10 cap flags for TERM_PROGRAM=Ghostty.

  - Full terminal matrix
  (Ghostty/Kitty/WezTerm/foot/iTerm.app/Apple_Terminal/Alacritty/unknown) added
  so a future case-sensitivity slip can't pass tests silently.


  Verification: vendor/silvery/packages/ansi tests: 209 → 218 passed. Contracts:
  36 → 37 passed.


  The underlying class-of-bug (consumers re-deriving from env instead of
  consuming caps) remains — see km-05lmx for the lint-rule hardening follow-up.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.ghostty-case-sensitivity
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T02:25:36Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] detectTerminalCapsFromEnv: TERM_PROGRAM=Ghostty never matches modern terminal (lowercase compare) @km/silvery #bug #P2

blocks:: [[@km/silvery]]

Surfaced during Plateau Phase 3 (profile.ts). In detectTerminalCapsFromEnv, `isGhostty = program === 'ghostty'` (lowercase) but the env value is `'Ghostty'` (capitalized). Effect: Ghostty never detected as modern terminal.

Fix: lowercase the comparison, or compare case-insensitively.

File: vendor/silvery/packages/ansi/src/profile.ts (and its upstream from detection.ts). Pre-existing, not introduced by Phase 3.

