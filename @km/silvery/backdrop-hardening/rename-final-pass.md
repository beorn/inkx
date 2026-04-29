---
id: "@km/silvery/backdrop-hardening/rename-final-pass"
aliases:
  - km-silvery.backdrop-hardening.rename-final-pass
  - km-silvery-backdrop-hardening-rename-final-pass
created_by: claude:88c0e764
created_at: 2026-04-20T21:01:08Z
closed_at: 2026-04-20T21:49:14Z
close_reason: Renamed forEachFadeRegionCell → forEachBackdropCell (14 refs
  across 6 files via batch-refactor). Added naming policy block to index.ts.
  hasBackdropMarkers documented syntactic. Generalized mixed-amount warning.
  Softened 'capability-independent' wording. Simplified BackdropOptions union
  types. 100 backdrop tests pass; km-tui showcase 15/15 pass. Commit 8b5db390.
---

# [x] Final rename pass: hasBackdropMarkers, forEachFadeRegionCell, naming policy @km/silvery #task #P0 @claude:a1a0e667

blocks:: [[@km/silvery/backdrop-hardening]]

Pro review P2.5 + P3.1 + P3.3 + P3.4 + P3.5 + P3.7. One more tightening pass to settle naming:

- hasBackdropMarkers → hasBackdropAttrs (syntactic) OR add hasActiveBackdropMarkers (semantic)
- forEachFadeRegionCell → forEachBackdropCell (Fade is vestigial post-refactor)
- Naming policy: decide if public exports stay prefixed (BackdropOptions) or unprefixed (Plan). Make it explicit, not accidental
- Drop redundant TS unions: scrimColor?: HexColor | string | "auto" → HexColor | "auto"
- defaultBg?: HexColor | string → HexColor
- Soften "capability-independent" in docs where code isn't (after split-core-plan lands)
- Mixed-amount warning: generalize from Kitty-specific wording

## /complete criteria

- [ ] hasBackdropMarkers renamed OR semantic variant added
- [ ] forEachFadeRegionCell renamed
- [ ] Policy decision documented in pipeline/backdrop/CLAUDE.md (or index.ts jsdoc)
- [ ] Redundant string unions removed
- [ ] Mixed-amount warning: "plan amount collapsed to first-observed; visuals may differ from intent"

## Parent

@km/silvery/backdrop-hardening