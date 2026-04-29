---
id: "@km/termless/svg-snapshots"
aliases:
  - km-termless.svg-snapshots
  - km-termless-svg-snapshots
created_by: claude:8fc35754
created_at: 2026-03-03T00:34:54Z
closed_at: 2026-03-03T08:05:09Z
owner: bjorn@stabell.org
assignee: claude:8fc35754
---

# [x] SVG snapshot testing workflow @km/termless #feature #P2 @claude:8fc35754

viterm has a serializer but there's no snapshot workflow documented or tested end-to-end. Implement golden-file SVG snapshots for visual regression testing — a killer feature Playwright doesn't have for terminals. Should integrate with vitest's snapshot mechanism.