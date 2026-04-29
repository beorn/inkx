---
id: "@km/inkx/input-isolation"
aliases:
  - km-inkx.input-isolation
  - km-inkx-input-isolation
created_by: claude:a3625ec3
created_at: 2026-02-09T14:44:01Z
closed_at: 2026-02-11T18:08:38Z
owner: bjorn@stabell.org
assignee: claude:2f3fc9d8
---

# [x] InputLayerProvider: isolate embedded component input from parent @km/inkx #feature #P3 @claude:2f3fc9d8

When embedding interactive components (e.g., in a storybook viewer), the embedded component's useInput handlers fire simultaneously with the parent's. j/k in the parent navigates AND triggers the embedded component. Need a way to isolate input: focus mode where only the embedded component receives input, with a parent-level intercept (e.g., Escape) to unfocus. InputLayerProvider could support this with a 'disabled' prop or input routing.