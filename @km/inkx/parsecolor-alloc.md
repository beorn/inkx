---
id: "@km/inkx/parsecolor-alloc"
aliases:
  - km-inkx.parsecolor-alloc
  - km-inkx-parsecolor-alloc
created_at: 2026-02-05T12:28:14Z
closed_at: 2026-02-05T12:31:23Z
---

# [x] perf(inkx): hoist namedColors out of parseColor() @km/inkx #task #P3 @claude:b53ef7e4

Code review I6: parseColor() allocates namedColors Record on every call. Move to module scope.