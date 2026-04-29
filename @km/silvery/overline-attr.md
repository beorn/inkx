---
id: "@km/silvery/overline-attr"
aliases:
  - km-silvery.overline-attr
  - km-silvery-overline-attr
created_by: claude:c56dc5d6
created_at: 2026-04-23T21:05:17Z
closed_at: 2026-04-23T21:42:33Z
close_reason: "cd6babada (km) + 5 silvery commits tip 8875ed00. Overline attr
  prop (SGR 53/55) on Box/Text/StyleProps; bit 23 packed; caps gated;
  nested-Text StyleContext; FrameCell.overline. 11+13+5 new tests pass,
  SILVERY_STRICT=2 clean, 2523 km-tui tests pass. ListView top indicator now
  uses overline (bottom stays underline); intent-based bump detection for
  keyboard nav. Deferred: overlineColor (km-silvery.overline-color), pulse/flash
  anim, wheel-handler edge-at-start (km-silvery.overscroll-bump-at-edge)."
---

# [x] Add overline attr prop (SGR 53/55) to Box/Text @km/silvery #feature #P2

blocks:: [[@km/silvery]]

Add overline support parallel to the underline attr-props work. Top overscroll indicator in ListView currently uses underline on the top row which renders visually wrong (line appears inside the content). overline (SGR 53) is the correct primitive for a line drawn ABOVE the character cell.

Scope:
- packages/ag/src/types.ts: add overline?: boolean to BoxAttrProps/TextAttrProps
- packages/ag-term/src/buffer.ts: ATTR_OVERLINE bit (bit 23, currently spare); pack/unpack; add to VISIBLE_SPACE_ATTR_MASK
- packages/ag-term/src/pipeline/output-phase.ts: SGR 53 set, SGR 55 reset; caps detection
- packages/ag-term/src/pipeline/render-phase.ts: Box overline propagates via mergeAttrsInRect like underline
- tests/contracts + tests/features: overline attr through SILVERY_STRICT=2 pipeline at realistic scale (50+ nodes)
- apps: ListView.tsx uses overline=single for top indicator instead of underline

Acceptance:
- grep "overline" vendor/silvery/packages/ → non-zero hits in types.ts + buffer.ts + output-phase.ts + tests
- top overscroll in cmux.app renders as line ABOVE text, not underline
- bun vitest run vendor/silvery/tests/ passes
- SILVERY_STRICT=2 on ListView overscroll test passes