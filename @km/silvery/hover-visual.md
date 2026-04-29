---
id: "@km/silvery/hover-visual"
aliases:
  - km-silvery.hover-visual
  - km-silvery-hover-visual
created_by: claude:c0da815b
created_at: 2026-03-23T14:36:58Z
---

# [ ] Hover visual system: alpha-blended bg tints for interactive elements @km/silvery #feature #P2

Hover visual system for interactive elements (cards, breadcrumbs, links). Compute alpha-blended bg tints at render time — silvery controls the pipeline and already tracks inherited bg via findInheritedBg. Take current bg, mix in a tint (e.g. $link blue) at 5-15% opacity, output as hex. Works on any background. Design options: (1) blend() utility, (2) slash notation like "$link/10", (3) Box hoverBg prop. Applies to cards, breadcrumbs, TreeNode items.