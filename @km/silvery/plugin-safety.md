---
mentions:
  - km
  - claude
id: "@km/silvery/plugin-safety"
aliases:
  - km-silvery.plugin-safety
  - km-silvery-plugin-safety
created_by: claude:e4e70c9a
created_at: 2026-03-11T07:32:36Z
closed_at: 2026-03-11T07:38:12Z
close_reason: "Plugin safety guidelines added to design doc: last-write-wins for
  spread, dev-mode collision warnings, plugin.command namespace convention,
  left-to-right ordering in pipe(), TypeScript intersection type enforcement."
owner: bjorn@stabell.org
assignee: claude:e4e70c9a
---

# [x] Plugin composition: collision detection and ordering guidelines @km/silvery #task #P3 @claude:e4e70c9a

As the plugin ecosystem grows, plugins may collide (same command name, both wrap view, etc.):

1. **Collision detection**: TypeScript helpers or dev-mode warnings when two plugins contribute conflicting keys
2. **Ordering guidelines**: Document when plugin order matters (e.g., withUndo before withVim?)
3. **Scoping**: Consider scoped plugin contributions to avoid namespace conflicts
4. **Debugging**: Dev mode to inspect the composed app object (what each plugin contributed)

Validated by deep research comparing Express middleware, Zustand middleware, ECS patterns.

