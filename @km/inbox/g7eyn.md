---
id: "@km/inbox/g7eyn"
aliases:
  - km-g7eyn
  - "@km/_orphan/g7eyn"
created_by: claude:e7c823b8
created_at: 2026-02-26T14:54:26Z
closed_at: 2026-03-03T10:20:26Z
owner: bjorn@stabell.org
---

# [x] Markdown roundtrip testing: comprehensive md ↔ node ↔ md verification @km/_orphan #task #P2

Need comprehensive roundtrip tests that verify: (1) md → nodes produces correct node structure, (2) nodes → md produces identical markdown. Current roundtrip.test.ts exists but doesn't catch heading depth >6, heading embed syntax, or empty-title headings with task markers.