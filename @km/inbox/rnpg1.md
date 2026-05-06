---
mentions:
  - km
id: "@km/inbox/rnpg1"
aliases:
  - km-rnpg1
  - "@km/_orphan/rnpg1"
created_by: claude:73d7a332
created_at: 2026-03-11T18:44:56Z
closed_at: 2026-03-12T01:39:08Z
close_reason: "All 7 sub-beads closed. ink.ts: 2,252 → 1,572 lines (680 lines
  removed, 30% reduction). Moved to silvery core: useStderr, screen reader,
  colon SGR, kitty manager, ErrorBoundary (already done). Dead code removed.
  Static alignment investigated — correctly aligned, no change needed."
owner: bjorn@stabell.org
---

# [x] Ink compat: core alignment + thin the compat layer @km/_orphan #task #P2

Systematic improvements to silvery core that both improve silvery AND thin the ink compat layer. Refactorings from AUDIT.md analysis.

## Done

- useWindowSize hook (re-export replaces ~50 lines)
- Unexpected passes fixed (85.6% → 87.3%)
- usePaste + kitty wiring (12 tests fixed)

## In Progress (agents running)

- Key.eventType → string (eliminates useInput wrapper)
- FlexboxProps: overflowX/Y, columnGap/rowGap, position:static
- ANSI sanitization (17 text failures)

## Planned

- Delete dead code: convertColor, toChalkCompat, ansi256ToRgb (~55 lines)
- Move colon-format SGR tracking to @silvery/term (117 lines, round-trip ANSI fidelity)
- Move screen reader mode to @silvery/react (161 lines, native accessibility)
- Consolidate kitty protocol/auto-detection with @silvery/term (158 lines DRY violation)
- Extract stack parsing utils to shared location (60 lines)
- Add usePaste as standalone silvery hook (35 lines)
- Align Static component with scrollback promotion (silvery already has dynamic/static scrollback)

## Static Component Alignment

Ink's Static renders items above dynamic content — once rendered, never re-renders. This is exactly what silvery's ScrollbackList isFrozen does via scrollback promotion. The compat layer's 103-line Static reimplementation could potentially be replaced by wiring to silvery's native scrollback system.

## Target

2,252 → ~1,666 lines in ink.ts. 87.3% → 90%+ compat.

