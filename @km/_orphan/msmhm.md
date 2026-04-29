---
id: "@km/_orphan/msmhm"
aliases:
  - km-msmhm
created_by: claude:32d8f2d5
created_at: 2026-03-01T08:49:06Z
closed_at: 2026-03-01T10:08:46Z
---

# [x] Eliminate module-level mutable state across km-tui and inkx @km/_orphan #task #P2

Module-level mutable state causes test leaks (isolate:false) and violates no-globals. Two packages have significant concentrations:

## board-app.ts (10 module-level lets)

| Variable | Line | Category | TEA future |
|----------|------|----------|------------|
| lastKeyTime | 32 | event timing | → store state |
| cachedFocusManager | 38 | context cache | stays cache |
| cachedFocus | 39 | context cache | stays cache |
| layoutCache | 47 | perf cache | stays cache or selector |
| chordTimer | 152 | timer | → delay effect |
| pendingChordShownAt | 165 | event timing | → store state |
| chordDismissTimer | 167 | timer | → delay effect |
| chordTimeoutFiredAt | 174 | event timing | → store state |
| lastClick | 506 | input state | → store state |
| dragState | 511 | input state | → store state |

**Approach**: BoardAppLocals bag created inside createBoardApp(), threaded to handleKey/handleMouse/buildActionCtx. Eliminates resetBoardAppState(). Stepping stone to TEA (@km/_orphan/89pey).

## inkx module-level globals (5+ vars)

| Variable | File | Purpose |
|----------|------|---------|
| _caps | output-phase.ts | Terminal capabilities |
| _outputMeasurer | output-phase.ts | Text width measurement |
| _scopedMeasurer | unicode.ts | Scoped text measurer |
| _defaultMeasurer | unicode.ts | Default measurer singleton |
| displayWidthCache | unicode.ts | Width computation cache |
| textPresentationEmojiCache | unicode.ts | Emoji detection cache |

**Approach**: Pass config through create*/render factory options instead of module-level setters.

## Additional inkx globals (not blocking but noted)

- _activeTheme (theme-defs.ts), currentAdapter (render-adapter.ts), layoutEngine (layout-engine.ts) — inherently singleton but should flow through createApp options
- _globalCursorState (useCursor.ts), instances map (render.tsx), various counters/caches in output-phase.ts

## TEA alignment (@km/_orphan/89pey)

This refactor groups mutable state and fixes test isolation now. When zustand-tea lands:
- Timer locals → delay effects
- State locals → store state
- Cache locals → stay as locals or selectors
- inkx config → factory options (independent of TEA)