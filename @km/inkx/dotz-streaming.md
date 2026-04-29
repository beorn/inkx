---
id: "@km/inkx/dotz-streaming"
aliases:
  - km-inkx.dotz-streaming
  - km-inkx-dotz-streaming
created_at: 2026-02-04T11:23:57Z
closed_at: 2026-02-04T11:27:40Z
assignee: claude:374dab1f
---

# [x] Move vitest-dotz to vitestx package and fix streaming mode @km/inkx #task #P2 @claude:374dab1f

vitest-dotz reporter (currently in infra/vitest-dotz/) should be moved to the @beorn/vitestx package.

Known issue: dots don't render in interactive/streaming mode (only the summary appears).
The inkx TUI reporter startStreaming() path needs debugging — dots should appear incrementally
as tests complete, not just in the final static summary.

Steps:
1. Move infra/vitest-dotz/ → vendor/beorn-vitestx/src/dotz/
2. Fix streaming mode so dots render incrementally
3. Export from @beorn/vitestx package
4. Update package.json test:fast2 to use the new path