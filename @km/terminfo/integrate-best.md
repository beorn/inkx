---
mentions:
  - km
  - claude
id: "@km/terminfo/integrate-best"
aliases:
  - km-terminfo.integrate-best
  - km-terminfo-integrate-best
created_by: claude:4929065a
created_at: 2026-03-25T05:17:38Z
closed_at: 2026-03-25T23:14:13Z
close_reason: "All 6 children complete: DA1 sentinel pattern, Unicode width
  probes (ucs-detect), esctest2 edge cases (10 probes), iTerm2 feature reporting
  (XTVERSION, OSC 1337), probe methodology on feature pages, SVG badges. 145
  features total."
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Integrate best ideas from esctest2, ucs-detect, notcurses, and terminal-wg into terminfo.dev @km/terminfo #task #P1 @claude:4929065a

Make terminfo.dev the definitive terminal capability database by integrating the best approaches from existing projects.

## From esctest2 (Thomas Dickey / George Nachman)

- **Deep VT conformance**: esctest2 has ~200 tests for character values, cursor position, window attributes. Our 107 probes cover breadth; their tests go deeper on each feature (edge cases, parameter variants, error handling).
- **Known-bugs lists**: Per-terminal known-bug files. We should have similar — structured annotations with upstream issue links (partially done via annotations.json).
- **Action**: Adapt their cursor movement edge cases (CUP at boundaries, CUU past top, DECSTBM interaction with CUP), erase edge cases (EL with attributes, ED across scroll regions), and character set tests (G0-G3 switching, SI/SO).

## From ucs-detect (Jeff Quast)

- **Unicode width verification**: Tests 500+ languages using UDHR dataset. Measures actual rendered width via DSR cursor position vs expected wcwidth.
- **Comprehensive emoji testing**: ZWJ sequences, regional indicators, VS-15/VS-16 variation selectors.
- **Action**: Add Unicode probes: emoji ZWJ (👨‍👩‍👧‍👦), regional indicators (🇺🇸), variation selectors, combining characters, Tamil/Arabic/Devanagari wide chars.

## From notcurses (Nick Black)

- **XTGETTCAP**: Query terminal's terminfo capabilities via DCS + q. More reliable than env vars.
- **Sixel/Kitty/pixel detection**: Sophisticated multi-method graphics detection.
- **TERMINALS.md**: Curated per-terminal notes with quirks and workarounds.
- **Action**: Add XTGETTCAP probe, improve graphics detection, add terminal quirks/notes to feature pages.

## From terminal-colorsaurus

- **OSC 10/11 with DA1 sentinel**: Send OSC color query followed by DA1. If DA1 arrives without OSC response, terminal doesn't support color queries. More reliable than timeout-based detection.
- **Action**: Adopt sentinel pattern for all query-response probes (faster, more reliable than fixed timeouts).

## From iTerm2 Feature Reporting Spec

- **TERM_FEATURES env var**: Proposed standard for terminals to advertise capabilities.
- **OSC 1337 ; Capabilities**: Query sequence for terminal to report all capabilities at once.
- **Action**: Add probes for both. If adopted widely, this replaces per-feature probing.

## From termenv (Go / Charm)

- **Color profile auto-degradation**: TrueColor → 256 → 16 → ASCII based on terminal.
- **Action**: Add color depth detection probe — what's the highest color mode the terminal supports?

## UI/UX improvements

- **Per-terminal pages**: Show quirks, known bugs, and workarounds (like notcurses TERMINALS.md)
- **Probe methodology**: Show HOW each probe works (what sequence is sent, what response is expected)
- **Historical tracking**: Track results over terminal versions (like caniuse shows when features were added)
- **Badges**: Generate SVG badges for terminal READMEs (like "97% compatible" badges)

