---
mentions:
  - km
  - claude
id: "@km/silvery/unicode-plateau"
aliases:
  - km-silvery.unicode-plateau
  - km-silvery-unicode-plateau
created_by: claude:c6244087
created_at: 2026-04-23T10:24:07Z
closed_at: 2026-04-23T16:14:27Z
close_reason: "All 3 phases shipped. Plateau complete: only
  createTerminalProfile reads terminal-signal env vars. 4 public exports deleted
  (detectUnicode, detectExtendedUnderline, detectCursor,
  isTextSizingLikelySupported). 2 constants deleted. 3 TerminalCaps fields added
  (version, cursor, env-sensitive unicode). 1 latent bug fixed (unicode was
  hardcoded true). lint-env-reads allowlist shrunk 6->4 files. 323 silvery tests
  pass (+74 new contract tests). km-tui 1813 tests pass. Silvery commits:
  b716c500 + 4b41d6a6 + e1980971. km commits: 908c5b790 + 556bd99ce +
  62f41bcc2."
owner: bjorn@stabell.org
assignee: claude:c6244087
dependencies:
  - issue_id: km-silvery.unicode-plateau
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T03:24:07Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] Unicode/text-sizing plateau — same shape as color-tier plateau @km/silvery #task #P1 @claude:c6244087

blocks:: [[@km/silvery]]

Per /pro review 2026-04-23. Mirrors the color-tier plateau just shipped (detectColor/detectTerminalCaps → createTerminalProfile). Unicode caps exist but are not env-sensitive (hardcoded true in detectTerminalCapsFromEnv) and standalone detectUnicode/detectExtendedUnderline bypass the profile. Ditto text-sizing.ts which re-reads TERM_PROGRAM/TERM_PROGRAM_VERSION.

Target: same plateau shape — createTerminalProfile is the sole env reader, every other consumer takes TerminalCaps/TerminalProfile.

Phases:

1. @km/silvery/unicode-plateau/phase-1 — Canonicalize unicode + extended-underline detection inside createTerminalProfile; delete detectUnicode + detectExtendedUnderline; consumers take caps.
2. @km/silvery/unicode-plateau/phase-2 — text-sizing.ts becomes caps-only (no env fallback); isTextSizingLikelySupported(caps) required; fingerprint caps-derived.
3. @km/silvery/unicode-plateau/phase-3 — Extend lint-env-reads.ts allowlist shrinks (detection.ts + text-sizing.ts removed); sync docs (ansi.md, README, terminal-matrix.md, text-sizing.md).

Design doc: inline in this bead + phase beads. No separate design doc — mechanical plateau refactor, same pattern as 2026-04-23 color plateau.

Complexity baseline (2026-04-23):
  detection.ts 250 LOC — exports detectCursor, detectInput, detectUnicode, detectExtendedUnderline, TerminalCaps, defaultCaps, EXTENDED_UNDERLINE_TERMS, EXTENDED_UNDERLINE_PROGRAMS
  profile.ts 577 LOC — detectTerminalCapsFromEnv hardcodes unicode:true (bug), underlineStyles from isModern||isAlacritty
  text-sizing.ts 214 LOC — isTextSizingLikelySupported(caps?) with env fallback, getTerminalFingerprint env-based
  1041 total LOC across the 3 files
  2 duplicated-logic sites: Kitty version parse (profile.ts + text-sizing.ts), extended-underline detection (detection.ts + profile.ts)

Target after 3 phases:
  detection.ts ~170 LOC (-80, removes 2 fns + 2 constants)
  profile.ts ~605 LOC (+28 absorbed logic) 
  text-sizing.ts ~170 LOC (-45, removes env fallback + version parse)
  Net LOC: -97, 4 fewer public abstractions, 0 duplicated logic sites, 0 ambient env reads outside profile.ts.

