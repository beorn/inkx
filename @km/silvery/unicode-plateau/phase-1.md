---
mentions:
  - km
  - claude
id: "@km/silvery/unicode-plateau/phase-1"
aliases:
  - km-silvery.unicode-plateau.phase-1
  - km-silvery-unicode-plateau-phase-1
created_by: claude:c6244087
created_at: 2026-04-23T15:46:38Z
closed_at: 2026-04-23T16:00:55Z
close_reason: "Phase 1 shipped. detectUnicode and detectExtendedUnderline
  deleted; caps.unicode + caps.underlineStyles are canonical. Bug fix:
  caps.unicode was hardcoded true, now env-sensitive. Underline-ext.ts helpers
  take optional caps. /complete criteria met: 0 runtime references to deleted
  functions. 11 new regression tests. Silvery b716c500, km 908c5b790."
owner: bjorn@stabell.org
assignee: claude:c6244087
dependencies:
  - issue_id: km-silvery.unicode-plateau.phase-1
    depends_on_id: km-silvery.unicode-plateau
    type: parent-child
    created_at: 2026-04-23T08:46:38Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.unicode-plateau
---

# [x] Unicode plateau Phase 1: canonicalize unicode + underline detection in profile @km/silvery #task #P1 @claude:c6244087

blocks:: [[@km/silvery/unicode-plateau]]

Absorb detectUnicode() and detectExtendedUnderline() logic INTO detectTerminalCapsFromEnv (packages/ansi/src/profile.ts). Fix the hardcoded unicode:true at detectTerminalCapsFromEnv line 535.

Changes:
  packages/ansi/src/profile.ts — detectTerminalCapsFromEnv now computes real unicode + underlineStyles/underlineColor from env (same env signals detectUnicode/detectExtendedUnderline used, canonicalized with the existing caps semantics).
  packages/ansi/src/detection.ts — DELETE detectUnicode, detectExtendedUnderline, EXTENDED_UNDERLINE_TERMS, EXTENDED_UNDERLINE_PROGRAMS. detection.ts shrinks to just detectCursor/detectInput/TerminalCaps type/defaultCaps.
  packages/ansi/src/underline-ext.ts — underline()/curlyUnderline()/etc. take an optional caps argument; lazy-memoized createTerminalProfile() fallback when absent.
  packages/ag-term/src/ansi/term.ts — line 721 cachedUnicode uses options.unicode ?? profile.caps.unicode (profile was built earlier in the factory).
  packages/ansi/src/index.ts — remove detectUnicode/detectExtendedUnderline exports.
  packages/ag-term/src/ansi/detection.ts — remove re-exports (lines 11-12).
  packages/ag-term/src/ansi/index.ts — remove re-exports (lines 97-98).
  packages/ag-term/src/index.ts — remove re-exports (lines 543-544).
  packages/ag-term/src/ansi/storybook.ts — diagnostic script uses createTerminalProfile().caps.underlineStyles instead of detectExtendedUnderline().
  tests/profile.test.ts or new contract test — pin that caps.unicode is env-sensitive (regression: the hardcoded true bug).

Delete (in this phase, not deferred):
  detectUnicode export in packages/ansi/src/detection.ts
  detectExtendedUnderline export in packages/ansi/src/detection.ts
  EXTENDED_UNDERLINE_TERMS constant
  EXTENDED_UNDERLINE_PROGRAMS constant
  All re-exports downstream.

/complete criteria (exact greps that MUST return the expected count):
  rg -n 'detectUnicode' vendor/silvery/packages/ → 0 hits
  rg -n 'detectExtendedUnderline' vendor/silvery/packages/ → 0 hits
  rg -n 'EXTENDED_UNDERLINE_(TERMS|PROGRAMS)' vendor/silvery/ → 0 hits
  rg -n 'unicode: true,' vendor/silvery/packages/ansi/src/profile.ts → 0 hits (hardcoded bug gone)
  bun run lint + bun vitest run vendor/silvery/tests/ pass
  Contract test for caps.unicode env-sensitivity exists

