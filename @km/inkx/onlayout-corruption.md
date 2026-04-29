---
id: "@km/inkx/onlayout-corruption"
aliases:
  - km-inkx.onlayout-corruption
  - km-inkx-onlayout-corruption
created_by: claude:a3625ec3
created_at: 2026-02-09T14:43:46Z
closed_at: 2026-02-11T18:08:37Z
---

# [x] onLayout callbacks cause rendering corruption when component is embedded @km/inkx #bug #P2 @claude:2f3fc9d8

When a component using onLayout callbacks is rendered inside another app (e.g., the examples viewer), the layout callbacks cause rendering artifacts: overlapping borders, garbled text, frame bleed-through. The onLayout callbacks likely trigger re-renders that conflict with the parent app's incremental renderer. Repro: render LayoutRefApp inside the viewer's Preview component.