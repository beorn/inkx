---
id: "@km/inkx/no-color"
aliases:
  - km-inkx.no-color
  - km-inkx-no-color
created_by: claude:ee8efc0f
created_at: 2026-02-23T01:22:56Z
closed_at: 2026-02-23T01:47:51Z
---

# [x] NO_COLOR env var support @km/inkx #feature #P4 @claude:ee8efc0f

Honor the NO_COLOR environment variable (https://no-color.org/) to disable all color and style output. Important for accessibility (screen readers, high-contrast modes) and CI environments where ANSI codes clutter logs. Should strip colors at the renderer level so components don't need to be NO_COLOR-aware.