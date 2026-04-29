---
id: "@km/_orphan/7tgjc"
aliases:
  - km-7tgjc
created_by: claude:2ce3230f
created_at: 2026-03-10T06:25:22Z
closed_at: 2026-03-10T22:57:52Z
close_reason: Work completed and committed as 73de145 in silvery submodule.
  Closing during grooming.
---

# [x] Phase 7: README rewrite — lead with unique value, add alpha badge @km/_orphan #task #P2

Rewrite README.md opening to lead with unique value, not generic description.

## Opening paragraph
Current: "Silvery gives you the full React component model -- JSX, hooks, reconciliation -- with a rendering architecture designed for interactive terminal UIs."

Rewrite to lead with the differentiator:
"Silvery is a React framework for terminal applications where components know their own dimensions during render. This single architectural change unlocks responsive layouts without prop drilling, native scrollable containers, and automatic text truncation — things that weren't possible in existing React terminal frameworks.

It ships 30+ built-in components, a command/keybinding system, mouse support, a theme engine with 45 palettes, and three composable state architectures. Pure TypeScript, zero native dependencies."

## Add alpha badge
After install block: "**Status:** Alpha — APIs may change. Early adopters welcome."

## Performance section
- Keep the benchmark table
- Soften the "100x faster" framing: explain the methodology inline
- Add: "Interactive update = single state change in a 1000-node app. Silvery updates only the affected nodes; Ink reconciles the full tree."
- Acknowledge the trade-off more explicitly: "Silvery is slower for full-tree rerenders (Ink's string concatenation is hard to beat), but this scenario rarely occurs in interactive apps."

## Add roadmap link
After Ecosystem table: "See the [roadmap](docs/roadmap.md) for what's coming."

## Add "When to use" brief
After Ink Compatibility: "Silvery is designed for complex interactive TUIs (dashboards, editors, kanban boards). For simple one-shot CLI prompts, Ink's mature ecosystem may be a better fit."