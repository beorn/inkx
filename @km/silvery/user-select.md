---
id: "@km/silvery/user-select"
aliases:
  - km-silvery.user-select
  - km-silvery-user-select
created_by: Bjørn Stabell
created_at: 2026-04-06T03:23:56Z
---

# [ ] userSelect prop + text selection for silvery @km/silvery #feature #P2

Phase 1 of pointer interaction model (tracking: @km/silvery/pointer-interaction). Selection mask + visual selection + correct text extraction + contain boundaries + explicit copy.

REVIEWED by GPT 5.4 Pro: corrections incorporated into design.
DESIGN DOC: vendor/internal/silvery/design/v10-terminal/text-selection-and-clipboard.md

## Key design decisions (post-review)

1. Selection mask via bit 31 (0x80000000 >>> 0) — abstract as mask concept
2. Style composition — selection is cell-style transform, not ANSI overlay (SGR 7m)
3. Selection hitTest separate from pointer hitTest — pointerEvents and userSelect orthogonal
4. Row metadata (softWrapped, lastContentCol) for correct text extraction
5. Configurable copy trigger (copyOnSelect option, default: explicit y/Ctrl+C)
6. Drag threshold before selection starts (so clicks still work)
7. Clear selection on resize/reflow (v1 policy)

## Implementation steps

1. Add userSelect to BoxProps in ag/src/types.ts
2. Add SELECTABLE_FLAG (0x80000000 >>> 0) to buffer.ts
3. Add RowMetadata (softWrapped, lastContentCol) to buffer
4. Stamp flag during render based on resolved userSelect
5. resolveUserSelect(): ancestor walk with per-node cache
6. selectionHitTest(): separate from pointer hitTest (ignores pointerEvents, respects userSelect)
7. Expand TerminalSelectionState: source, mode, granularity, scope
8. Mouse flow: mousedown -> selectionHitTest -> resolve contain scope -> text-pointing
9. Drag threshold: distance + time before entering selection
10. Contain boundary: clamp to nearest contain ancestors screenRect
11. Style composition: compose selection fg/bg on affected cells before diff/output
12. Theme tokens: use selection/selectionbg when available, swap fg/bg as fallback
13. Correct extractText(): respect softWrapped, lastContentCol, wide chars, blank lines
14. Copy command: explicit y/Ctrl+C (copyOnSelect configurable)
15. Alt+drag override: configurable modifier, hint when blocked
16. Clear selection on resize/reflow
17. Drag threshold so clicks work normally

## Feeds into

- Phase 2: word/line selection, find, copy-mode
- Phase 3: semantic providers, clipboard backends, paste
- Phase 5: demos, km integration, silvery.dev docs